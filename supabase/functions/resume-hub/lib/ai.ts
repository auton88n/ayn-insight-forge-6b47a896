// v3.131.0 — stage 3 of the resume-hub reorganization: the AI gateway
// call, its usage/cost telemetry, and the shared aiCtx context every AI
// action sets before calling it. Pure code movement, zero logic changes.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.45.0";

// ─────────────────────────────────────────────────────────────
// v3.24.0 AI USAGE LOGGING
// Every gateway call writes one row to llm_usage_logs so the admin AI cost
// pane reads real numbers. Best effort: logging never fails a request.
// ─────────────────────────────────────────────────────────────
export type AiCtx = { admin: SupabaseClient<any, any, any> | null; userId: string | null; feature: string };
let aiCtx: AiCtx = { admin: null, userId: null, feature: "unknown" };
export function setAiCtx(admin: SupabaseClient<any, any, any> | null, userId: string | null, feature: string) {
  aiCtx = { admin, userId, feature };
}

// Rough USD per 1M tokens, in, out. Only used to give the admin a signal.
export const PRICES: Record<string, [number, number]> = {
  "google/gemini-2.5-pro": [1.25, 10],
  "google/gemini-2.5-flash": [0.30, 2.50],
  "google/gemini-2.5-flash-lite": [0.10, 0.40],
  "openai/text-embedding-3-small": [0.02, 0],
};

export function logAiUsage(opts: {
  model: string; inputTokens: number; outputTokens: number; ms: number;
  wasFallback: boolean; fallbackReason?: string;
}) {
  const { admin, userId, feature } = aiCtx;
  if (!admin || !userId) return;
  const [pin, pout] = PRICES[opts.model] || [0.30, 2.50];
  const cost = (opts.inputTokens / 1_000_000) * pin + (opts.outputTokens / 1_000_000) * pout;
  admin.from("llm_usage_logs").insert({
    user_id: userId,
    intent_type: feature,
    model_name: opts.model,
    input_tokens: opts.inputTokens,
    output_tokens: opts.outputTokens,
    cost_sar: Number(cost.toFixed(6)),
    response_time_ms: opts.ms,
    was_fallback: opts.wasFallback,
    fallback_reason: opts.fallbackReason ?? null,
  }).then(({ error }: { error: unknown }) => {
    if (error) console.error("llm_usage_logs insert failed", error);
  }, (e: unknown) => console.error("llm_usage_logs insert threw", e));
}

// v3.158.0 — self-hosted deployments have no LOVABLE_API_KEY of their own
// (that credential is Lovable's, tied to the managed Cloud project). When
// AI_RELAY_URL is set, calls go through ai-relay (a thin function that
// stays on Cloud, still holding the real key) instead of Lovable directly,
// authenticated with RELAY_SECRET, a value that is never the real Lovable
// key. Both checks below key off AI_RELAY_URL specifically, not just
// whether RELAY_SECRET happens to exist -- Supabase secrets are project
// wide, so RELAY_SECRET is visible to Cloud's own resume-hub too once set;
// without gating on AI_RELAY_URL, Cloud would wrongly try to send that
// secret to Lovable's real gateway instead of LOVABLE_API_KEY.
const AI_RELAY_URL = Deno.env.get("AI_RELAY_URL");
export const GATEWAY_URL = AI_RELAY_URL || "https://ai.gateway.lovable.dev/v1/chat/completions";
export const DEFAULT_MODEL = "google/gemini-2.5-flash";
export const QUALITY_MODEL = "google/gemini-2.5-pro";

// v3.311.0 — a real, live production bug: parse_file's own Stage 3 (the
// vision/PDF path in index.ts) had a SECOND, separate, hardcoded
// `Deno.env.get("LOVABLE_API_KEY")` check that never went through this same
// AI_RELAY_URL/RELAY_SECRET logic -- so every resume upload on this
// self-hosted deployment threw "LOVABLE_API_KEY not configured" before any
// file-type-specific logic even ran, regardless of DOCX/PDF/text, since
// that check sat unconditionally at the very top of the action, ahead of
// even the mammoth DOCX path that never needed an AI key at all. Exported
// here so GATEWAY_URL and its matching auth key can never drift apart
// again -- one function, same fallback callAI() itself already uses,
// instead of a second hand-copied check living in a different file.
export function relayApiKey(): string | undefined {
  return AI_RELAY_URL ? Deno.env.get("RELAY_SECRET") : Deno.env.get("LOVABLE_API_KEY");
}



export async function callAI(opts: {
  model?: string;
  system: string;
  user: string | Array<unknown>;
  toolName?: string;
  toolSchema?: Record<string, unknown>;
  /** Lower = more consistent/repeatable output. Omit to use the model's own default. */
  temperature?: number;
}): Promise<{ text: string; structured?: unknown }> {
  const apiKey = AI_RELAY_URL ? Deno.env.get("RELAY_SECRET") : Deno.env.get("LOVABLE_API_KEY");
  if (!apiKey) throw new Error("LOVABLE_API_KEY not configured");

  const primary = opts.model ?? DEFAULT_MODEL;
  // Fallback chain: try a cheaper/different model when the primary 402/5xx's.
  const FALLBACKS: Record<string, string[]> = {
    [QUALITY_MODEL]: [DEFAULT_MODEL, "google/gemini-2.5-flash-lite"],
    [DEFAULT_MODEL]: ["google/gemini-2.5-flash-lite"],
  };
  const chain = [primary, ...(FALLBACKS[primary] || [])];

  let lastErr = "";
  for (let mi = 0; mi < chain.length; mi++) {
    const model = chain[mi];
    const body: Record<string, unknown> = {
      model,
      messages: [
        { role: "system", content: opts.system },
        { role: "user", content: opts.user },
      ],
      ...(opts.temperature != null ? { temperature: opts.temperature } : {}),
    };
    if (opts.toolName && opts.toolSchema) {
      body.tools = [{
        type: "function",
        function: { name: opts.toolName, description: opts.toolName, parameters: opts.toolSchema },
      }];
      body.tool_choice = { type: "function", function: { name: opts.toolName } };
    }

    // Up to 3 attempts per model with exponential backoff on 429 / transient 5xx.
    for (let attempt = 0; attempt < 3; attempt++) {
      let r: Response;
      const startedAt = Date.now();
      try {
        r = await fetch(GATEWAY_URL, {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      } catch (e) {
        lastErr = `network: ${(e as Error).message}`;
        await new Promise(res => setTimeout(res, 400 * (attempt + 1)));
        continue;
      }

      if (r.ok) {
        const data = await r.json();
        const usage = data?.usage || {};
        logAiUsage({
          model,
          inputTokens: Number(usage.prompt_tokens ?? usage.input_tokens ?? 0),
          outputTokens: Number(usage.completion_tokens ?? usage.output_tokens ?? 0),
          ms: Date.now() - startedAt,
          wasFallback: mi > 0,
          fallbackReason: mi > 0 ? lastErr || "primary model unavailable" : undefined,
        });
        const choice = data?.choices?.[0];
        const finishReason = choice?.finish_reason || choice?.finishReason || data?.stop_reason;
        if (finishReason === "length" || finishReason === "max_tokens") {
          throw new Error("AI response truncated. Retry with fewer fields or more output tokens.");
        }
        const msg = data?.choices?.[0]?.message;
        const tc = msg?.tool_calls?.[0]?.function?.arguments;
        if (tc) {
          try { return { text: "", structured: JSON.parse(tc) }; }
          catch { return { text: tc, structured: undefined }; }
        }
        return { text: msg?.content ?? "" };
      }


      // 402 = credits — don't retry same model, jump to next in chain.
      if (r.status === 402) {
        lastErr = "AI credits exhausted.";
        break;
      }
      // 429 / 5xx = transient — backoff then retry same model.
      if (r.status === 429 || (r.status >= 500 && r.status < 600)) {
        lastErr = `AI ${r.status}`;
        // 1s, 2s, 4s
        await new Promise(res => setTimeout(res, 1000 * Math.pow(2, attempt)));
        continue;
      }
      // 4xx other = terminal, stop everything.
      const t = await r.text();
      throw new Error(`AI error ${r.status}: ${t.slice(0, 200)}`);
    }
  }
  throw new Error(lastErr || "AI request failed");
}
