/**
 * ayn-unified — v3.7.0 "AYN chat becomes a job search copilot"
 *
 * WHAT THIS REPLACES: the previous version of this function was ~1500 lines of
 * market intelligence. It scanned crypto pairs, pulled commodity prices, built
 * country profiles, ran an autonomous paper trading loop, and branched into a
 * structural engineering assistant. None of that had anything to do with the
 * product, and it is why a job seeker asking "what should I do next" got told
 * about gold and oil. All of it is deleted, along with the engineering intent,
 * EngineeringContext, calculatorType and buildingCode branches.
 *
 * WHAT IT IS NOW: one streaming chat endpoint for a job search copilot,
 * grounded in the signed-in person's own profile, resume, saved jobs, match
 * scores, discovery status and pending proposals. All grounding is read server
 * side in jobContext.ts from the user's own rows. The client sends messages,
 * nothing more.
 *
 * PII BOUNDARY: buildJobSearchContext never loads email, phone or address into
 * the prompt. The copilot does not need contact details to give advice.
 *
 * The wire contract with the client is unchanged: POST { messages, intent,
 * context, stream, sessionId }, SSE out with OpenAI-shaped deltas, 429 for
 * both the per-chat cap and the plan limit, 401 for a bad token.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.56.0";
import { corsHeaders as getCorsHeaders } from "../_shared/cors.ts";
import { detectLanguage, detectResponseEmotion, detectUserEmotion } from "./emotionDetector.ts";
import { callWithFallback, needsDeepReasoning } from "./llmGateway.ts";
import { extractAndSaveMemories, stripMemoryTags } from "./memoryHandler.ts";
import { detectInjectionAttempt, sanitizeUserPrompt, INJECTION_GUARD } from "../_shared/sanitizePrompt.ts";
import { buildJobSearchContext } from "./jobContext.ts";
import { buildCopilotSystemPrompt } from "./systemPrompts.ts";

const MAX_MESSAGES_PER_CHAT = 100;
const MAX_CONTEXT_MESSAGES = 15;
const MAX_CHARS_PER_MESSAGE = 8000;

// Deno type checking across two supabase-js entry points is noisy and adds no
// safety here, so the client is loosely typed at the boundary.
// deno-lint-ignore no-explicit-any
type AnyClient = any;

/** Plan limit. Fails open: our bug must never block a paying user. */
async function checkUserLimit(supabase: AnyClient, userId: string): Promise<{ allowed: boolean; reason?: string }> {
  try {
    const { data, error } = await supabase.rpc("check_user_ai_limit", { _user_id: userId, _intent_type: "chat" });
    if (error) return { allowed: true };
    if (!(data as { allowed?: boolean } | null)?.allowed) {
      return { allowed: false, reason: (data as { error?: string } | null)?.error || "Limit reached" };
    }
    return { allowed: true };
  } catch {
    return { allowed: true };
  }
}

/** Images and PDFs are inlined so the model can actually read them. */
async function buildFilePart(file: { name?: string; type?: string; url?: string }): Promise<unknown | null> {
  if (!file?.url || !file?.type) return null;
  const inlineable = file.type.startsWith("image/") || file.type === "application/pdf";
  if (!inlineable) return null;
  try {
    const res = await fetch(file.url);
    if (!res.ok) return null;
    const buf = new Uint8Array(await res.arrayBuffer());
    if (buf.byteLength > 8 * 1024 * 1024) return null;
    let bin = "";
    for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
    return { type: "image_url", image_url: { url: `data:${file.type};base64,${btoa(bin)}` } };
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase: AnyClient = createClient(supabaseUrl, supabaseServiceKey);

    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader.startsWith("Bearer ")) return json({ error: "Missing authorization" }, 401);
    const token = authHeader.replace("Bearer ", "");

    let userId: string;
    let isInternalCall = false;
    if (token === supabaseServiceKey) {
      userId = "internal-evaluator";
      isInternalCall = true;
    } else {
      const authClient = createClient(supabaseUrl, supabaseAnonKey, { global: { headers: { Authorization: authHeader } } });
      const { data, error } = await authClient.auth.getClaims(token);
      if (error || !data?.claims?.sub) return json({ error: "Invalid token" }, 401);
      userId = data.claims.sub as string;
    }

    let body: Record<string, unknown> = {};
    try { body = await req.json(); } catch { body = {}; }
    const { messages: rawMessages, context = {}, stream = true, sessionId, _internal_warm } = body as {
      messages?: Array<{ role: string; content: unknown }>;
      context?: Record<string, unknown>;
      stream?: boolean;
      sessionId?: string;
      _internal_warm?: boolean;
    };

    if (_internal_warm) return json({ status: "warm", ts: Date.now() });
    if (!rawMessages || !Array.isArray(rawMessages)) return json({ error: "Messages array required" }, 400);

    // Trim history. 15 turns is enough for a coaching conversation, and the
    // grounding block below carries the facts that actually matter.
    const history = rawMessages
      .filter((m) => m.role !== "system")
      .slice(-MAX_CONTEXT_MESSAGES)
      .map((m) => ({
        role: m.role,
        content: typeof m.content === "string" && m.content.length > MAX_CHARS_PER_MESSAGE
          ? m.content.slice(0, MAX_CHARS_PER_MESSAGE) + "\n[...truncated]"
          : m.content,
      }));

    const lastMessage = typeof history[history.length - 1]?.content === "string"
      ? (history[history.length - 1].content as string)
      : "";

    if (detectInjectionAttempt(lastMessage)) {
      supabase.from("security_logs").insert({
        action: "prompt_injection_attempt",
        user_id: isInternalCall ? null : userId,
        details: { input_preview: lastMessage.slice(0, 200), function: "ayn-unified" },
        severity: "high",
      }).then(() => {}, () => {});
    }

    // Per-chat cap.
    if (sessionId && !isInternalCall) {
      const { count, error } = await supabase.from("messages")
        .select("id", { count: "exact", head: true })
        .eq("session_id", sessionId).eq("user_id", userId);
      if (!error && count !== null && count >= MAX_MESSAGES_PER_CHAT) {
        return json({
          error: "Chat limit reached",
          message: "This chat has reached the 100 message limit. Please start a new chat to continue.",
          chatLimitExceeded: true, messageCount: count, limit: MAX_MESSAGES_PER_CHAT,
        }, 429);
      }
    }

    const [limitCheck, copilot] = await Promise.all([
      isInternalCall ? Promise.resolve({ allowed: true } as const) : checkUserLimit(supabase, userId),
      isInternalCall
        ? Promise.resolve({ text: "no user context (internal call)", hasResume: false, hasProfile: false, summary: null })
        : buildJobSearchContext(supabase, userId).catch((e) => {
            console.error("[ayn-unified] context build failed:", e instanceof Error ? e.message : e);
            return { text: "context unavailable this turn. say so plainly rather than guessing.", hasResume: false, hasProfile: false, summary: null };
          }),
    ]);

    if (!limitCheck.allowed) {
      return json({ error: "Daily limit reached", reason: (limitCheck as { reason?: string }).reason, limitExceeded: true }, 429);
    }

    const fileContext = (context as { fileContext?: { name?: string; type?: string; url?: string } })?.fileContext;
    const language = detectLanguage(lastMessage);

    const systemPrompt = buildCopilotSystemPrompt({
      contextBlock: copilot.text,
      language,
      hasFile: !!fileContext,
    }) + "\n\n" + INJECTION_GUARD;

    // The current turn becomes multimodal when a readable file is attached.
    const filePart = fileContext ? await buildFilePart(fileContext) : null;
    const modelMessages: Array<{ role: string; content: unknown }> = [
      { role: "system", content: systemPrompt },
      ...history.slice(0, -1).map((m) => ({
        role: m.role,
        content: typeof m.content === "string" ? sanitizeUserPrompt(m.content) : m.content,
      })),
    ];
    const currentText = sanitizeUserPrompt(lastMessage);
    modelMessages.push(
      filePart
        ? { role: "user", content: [{ type: "text", text: currentText }, filePart] }
        : { role: "user", content: currentText },
    );

    const chain = fileContext ? "files" : needsDeepReasoning(lastMessage) ? "deep" : "chat";
    const { response, modelUsed } = await callWithFallback(chain, modelMessages, !!stream, supabase, userId);

    if (stream && response instanceof Response) {
      // Strip [MEMORY:] tags on the way out, save them once the stream closes.
      const rawStream = response.body!;
      const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
      const encoder = new TextEncoder();
      const decoder = new TextDecoder();
      let buffer = "";
      let full = "";

      (async () => {
        const reader = rawStream.getReader();
        const writer = writable.getWriter();
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) {
              if (buffer) {
                const cleaned = buffer.replace(/\[MEMORY:[^\]]+\]/g, "").trimEnd();
                if (cleaned) await writer.write(encoder.encode(cleaned));
              }
              if (full.includes("[MEMORY:") && !isInternalCall) {
                extractAndSaveMemories(supabase, userId, full).catch(() => {});
              }
              break;
            }
            const chunk = decoder.decode(value, { stream: true });
            full += chunk;
            buffer += chunk;
            let nl: number;
            while ((nl = buffer.indexOf("\n")) !== -1) {
              const line = buffer.slice(0, nl + 1);
              buffer = buffer.slice(nl + 1);
              await writer.write(encoder.encode(line.replace(/\[MEMORY:[^\]]+\]/g, "")));
            }
          }
        } catch (e) {
          console.error("[ayn-unified] stream error:", e);
        } finally {
          writer.close();
        }
      })();

      return new Response(readable, {
        headers: { ...corsHeaders, "Content-Type": "text/event-stream", "X-Model-Used": "AYN" },
      });
    }

    // Non-streaming path (Safari fallback, internal calls, forced json).
    const raw = (response as { content: string }).content || "";
    if (raw.includes("[MEMORY:") && !isInternalCall) {
      extractAndSaveMemories(supabase, userId, raw).catch(() => {});
    }
    const content = stripMemoryTags(raw);

    return json({
      content,
      emotion: detectResponseEmotion(content),
      userEmotion: detectUserEmotion(lastMessage),
      model: modelUsed,
    });
  } catch (error) {
    console.error("[ayn-unified] fatal:", error instanceof Error ? error.message : error);
    return new Response(JSON.stringify({ error: "Something went wrong. Try again." }), {
      status: 500,
      headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  }
});
