/**
 * ext-fill-form-retry
 *
 * Part 1 of the "close the AI decision loop" upgrade. The extension calls this
 * per-field after inject+verify detects a failure. We take the original field,
 * original answer, failure classification, and the current DOM snapshot, and
 * ask the model to re-plan one answer.
 *
 * Contract:
 *   POST { field, original_answer, failure_class, options?, siblings?, ats?, url? }
 *   ->   { answer: { value?, optionValue?, optionLabel?, optionLabels?, skip?, confidence, reasoning } }
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-source, x-proxy-secret",
};

const MODEL = "google/gemini-2.5-flash";

type FailureClass =
  | "injection_failed"
  | "option_not_found"
  | "validation_rejected"
  | "field_became_visible"
  | "unknown";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const secret = req.headers.get("x-proxy-secret");
    const PROXY_SECRET = Deno.env.get("AYN_PROXY_SECRET") || "ayn-proxy-2024";
    if (secret !== PROXY_SECRET) {
      return json({ error: "Unauthorized" }, 401);
    }

    const body = await req.json();
    const field = body?.field;
    if (!field || typeof field !== "object") return json({ error: "field required" }, 400);
    const failure_class: FailureClass = body?.failure_class ?? "unknown";
    const original_answer = body?.original_answer ?? null;
    const options: Array<{ value: string; label: string }> = Array.isArray(body?.options)
      ? body.options.slice(0, 60)
      : [];
    const siblings: Array<{ label: string; value?: string }> = Array.isArray(body?.siblings)
      ? body.siblings.slice(0, 12)
      : [];
    const ats = String(body?.ats ?? "unknown");
    const url = String(body?.url ?? "");

    const LOVABLE_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_KEY) return json({ error: "LOVABLE_API_KEY not configured" }, 500);

    const system = [
      "You re-plan a SINGLE answer for one form field that failed to fill correctly on the first attempt.",
      "You will be told WHY the first attempt failed. Do not repeat the same answer verbatim.",
      "Return ONLY a compact JSON object matching this TypeScript type:",
      "{ value?: string; optionValue?: string; optionLabel?: string; optionLabels?: string[]; skip?: boolean; confidence: number; reasoning: string }",
      "Rules:",
      "- If failure_class is 'option_not_found', pick an option strictly from the provided options list by label.",
      "- If failure_class is 'injection_failed', return the same intent but a shorter/simpler value if possible.",
      "- If failure_class is 'validation_rejected', respect any format hint in the field.validation.",
      "- If failure_class is 'field_became_visible', treat as a fresh answer decision.",
      "- If you truly cannot answer, return { skip: true, confidence: 0, reasoning: '...' }.",
      "- Confidence is a number 0..1. Never include prose outside the JSON.",
    ].join("\n");

    const user = JSON.stringify({
      ats,
      url,
      failure_class,
      original_answer,
      field: {
        label: field.label,
        kind: field.kind,
        semanticType: field.semanticType,
        required: !!field.required,
        placeholder: field.placeholder ?? null,
        helpText: field.helpText ?? null,
        validation: field.validation ?? null,
      },
      options,
      siblings,
    });

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
          { role: "user", content: user },
        ],
        max_tokens: 400,
        temperature: 0.3,
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
    const raw = data?.choices?.[0]?.message?.content ?? "{}";
    let answer: Record<string, unknown> = {};
    try {
      answer = JSON.parse(raw);
    } catch {
      answer = { skip: true, confidence: 0, reasoning: "model_returned_non_json" };
    }

    return json({ answer });
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
