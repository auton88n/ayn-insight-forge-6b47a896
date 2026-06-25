import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SCORE_SYSTEM = `You are an honest technical recruiter. Compare the RESUME to the JOB DESCRIPTION. Never credit the candidate with experience or seniority the resume does not contain. Judge against the years and domain the job asks for. No em dashes.

Return ONLY valid JSON with no code fences, no markdown, no explanation — just the raw JSON object:
{
  "score": <integer 0 to 10>,
  "verdict": "<one sentence>",
  "missingKeywords": ["<string>", ...],
  "matchedStrengths": ["<string>", ...],
  "suggestedEdits": ["<string>", ...],
  "redFlags": ["<string>", ...]
}

Rules:
- score must be an integer between 0 and 10 (clamp if needed)
- Each array must have at most 6 items
- If there are no redFlags, return an empty array for that field
- Do not wrap the JSON in backticks or any other text`;

const REWRITE_SYSTEM = `You are an expert resume writer. Rewrite the RESUME so it honestly aligns with the JOB DESCRIPTION. Keep every fact true, never invent experience, numbers, or skills. Weave in the job's real keywords only where the resume already supports them. No em dashes, no en dashes, write dates as '2023 to Present'. Return plain markdown of the improved resume only.`;

function extractJSON(text: string): string {
  // Strip code fences
  const stripped = text.replace(/```(?:json)?\s*/gi, "").replace(/```/g, "").trim();
  // Find the first { ... } block
  const start = stripped.indexOf("{");
  const end = stripped.lastIndexOf("}");
  if (start !== -1 && end !== -1 && end > start) {
    return stripped.slice(start, end + 1);
  }
  return stripped;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { resume, job, mode } = await req.json();

    if (!resume || !job) {
      return new Response(
        JSON.stringify({ error: "Both resume and job are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (mode !== "score" && mode !== "rewrite") {
      return new Response(
        JSON.stringify({ error: "mode must be 'score' or 'rewrite'" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!KEY) throw new Error("LOVABLE_API_KEY missing");

    const systemPrompt = mode === "score" ? SCORE_SYSTEM : REWRITE_SYSTEM;
    const userMsg = `RESUME:\n${resume}\n\nJOB DESCRIPTION:\n${job}`;

    const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.0-flash-001",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMsg },
        ],
        temperature: 0.3,
        stream: false,
      }),
    });

    if (r.status === 429) {
      return new Response(
        JSON.stringify({ error: "Rate limit. Try again shortly." }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    if (r.status === 402) {
      return new Response(
        JSON.stringify({ error: "Add credits to your AI workspace." }),
        { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    if (!r.ok) {
      const t = await r.text();
      return new Response(
        JSON.stringify({ error: `gateway ${r.status}: ${t}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await r.json();
    const rawContent = data?.choices?.[0]?.message?.content ?? "";

    if (mode === "rewrite") {
      return new Response(
        JSON.stringify({ markdown: rawContent }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // mode === "score" — parse and validate JSON
    let parsed: Record<string, unknown>;
    try {
      const cleaned = extractJSON(rawContent);
      parsed = JSON.parse(cleaned);
    } catch {
      return new Response(
        JSON.stringify({ error: "Failed to parse AI response as JSON", raw: rawContent }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Normalize and clamp
    const clamp = (n: number) => Math.max(0, Math.min(10, Math.round(n)));
    const capArray = (arr: unknown) =>
      Array.isArray(arr) ? (arr as string[]).slice(0, 6) : [];

    const result = {
      score: clamp(Number(parsed.score) || 0),
      verdict: String(parsed.verdict || ""),
      missingKeywords: capArray(parsed.missingKeywords),
      matchedStrengths: capArray(parsed.matchedStrengths),
      suggestedEdits: capArray(parsed.suggestedEdits),
      redFlags: capArray(parsed.redFlags),
    };

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "unknown error";
    return new Response(
      JSON.stringify({ error: msg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
