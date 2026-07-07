/**
 * ext-vision-discover
 *
 * Part 3 of the "wire vision into the question layer" upgrade. The extension
 * sends a screenshot (base64) of a form region the DOM scanner produced no
 * fields for, and we ask a multimodal model to describe the questions it
 * visually sees. Returned descriptors are merged as (source: 'vision') evidence
 * back into the question layer.
 *
 * Contract:
 *   POST { image_base64, image_mime?, context?: { url, ats, section_label } }
 *   ->   { questions: Array<{ label, kind, options?, anchor_hint }> }
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-source, x-proxy-secret",
};

const MODEL = "google/gemini-2.5-flash";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const secret = req.headers.get("x-proxy-secret");
    const PROXY_SECRET = Deno.env.get("AYN_PROXY_SECRET") || "ayn-proxy-2024";
    if (secret !== PROXY_SECRET) return json({ error: "Unauthorized" }, 401);

    const body = await req.json();
    const image_base64: string = String(body?.image_base64 ?? "");
    const image_mime: string = String(body?.image_mime ?? "image/png");
    if (!image_base64 || image_base64.length < 200) {
      return json({ error: "image_base64 required" }, 400);
    }
    if (image_base64.length > 3_500_000) {
      // ~2.5MB decoded; anything larger is almost certainly the whole page.
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
