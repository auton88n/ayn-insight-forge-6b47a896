/**
 * ext-vision-discover
 *
 * v2.11.0 — auth via extension token or web session (see _shared/ext-auth.ts).
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { authenticateExtOrSession } from "../_shared/ext-auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-source, x-ayn-ext-token",
};

const MODEL = "google/gemini-2.5-flash";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const auth = await authenticateExtOrSession(req);
    if (!auth.ok) return json({ error: auth.error }, auth.status);

    const body = await req.json();
    const image_base64: string = String(body?.image_base64 ?? "");
    const image_mime: string = String(body?.image_mime ?? "image/png");
    if (!image_base64 || image_base64.length < 200) {
      return json({ error: "image_base64 required" }, 400);
    }
    if (image_base64.length > 3_500_000) {
      return json({ error: "image too large" }, 413);
    }

    const context = body?.context ?? {};
    const LOVABLE_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_KEY) return json({ error: "LOVABLE_API_KEY not configured" }, 500);

    const system = [
      "You are a form-understanding vision model. Given a screenshot of ONE section of a job-application form,",
      "list every question you can visually see (labels, prompts, checkbox/radio groups, dropdowns, text areas).",
      "Return STRICT JSON:",
      "{ questions: Array<{ label: string, kind: 'text'|'single_choice'|'multi_choice'|'boolean', options?: string[], anchor_hint?: string }> }",
      "- Ignore navigation, headers, footers, marketing copy.",
      "- If a question shows visible option choices, include them under `options` verbatim.",
      "- `anchor_hint` is a short human-readable landmark near the field (e.g. 'below Legal name', 'right of Are you authorized').",
      "- No prose outside the JSON. If you see nothing form-like, return { questions: [] }.",
    ].join("\n");

    const dataUrl = image_base64.startsWith("data:")
      ? image_base64
      : `data:${image_mime};base64,${image_base64}`;

    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: system },
          {
            role: "user",
            content: [
              { type: "text", text: `Context: ${JSON.stringify(context)}` },
              { type: "image_url", image_url: { url: dataUrl } },
            ],
          },
        ],
        max_tokens: 900,
        temperature: 0.1,
        response_format: { type: "json_object" },
      }),
    });

    if (resp.status === 429) return json({ error: "rate_limited" }, 429);
    if (resp.status === 402) return json({ error: "credits_exhausted" }, 402);
    if (!resp.ok) {
      const t = await resp.text();
      return json({ error: `gateway_${resp.status}`, detail: t.slice(0, 500) }, 502);
    }

    const data = await resp.json();
    const finishReason = data?.choices?.[0]?.finish_reason || data?.stop_reason;
    if (finishReason === "length" || finishReason === "max_tokens") {
      return json({ questions: [], error: "response_truncated" }, 502);
    }
    const raw = data?.choices?.[0]?.message?.content ?? "{}";
    let parsed: { questions?: unknown[] } = {};
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = { questions: [] };
    }

    const questions = Array.isArray(parsed.questions)
      ? parsed.questions
          .filter((q: any) => q && typeof q.label === "string" && typeof q.kind === "string")
          .slice(0, 30)
          .map((q: any) => ({
            label: String(q.label).slice(0, 300),
            kind: q.kind,
            options: Array.isArray(q.options)
              ? q.options.map((o: any) => String(o).slice(0, 200)).slice(0, 40)
              : undefined,
            anchor_hint: typeof q.anchor_hint === "string" ? q.anchor_hint.slice(0, 200) : undefined,
          }))
      : [];

    console.log(`[ext-vision-discover] user=${auth.userId} via=${auth.via} found=${questions.length}`);
    return json({ questions });
  } catch (e) {
    return json({ error: (e as Error).message ?? String(e) }, 500);
  }
});

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
