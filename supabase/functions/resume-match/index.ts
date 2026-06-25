import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SCORE_SYSTEM = `You are an honest technical recruiter. Compare the RESUME to the JOB DESCRIPTION. Never credit the candidate with experience or seniority the resume does not contain. Judge against the years and domain the job asks for. No em dashes, no en dashes.

Return ONLY valid JSON with no code fences, no markdown, no explanation, just the raw JSON object:
{
  "score": <integer 0 to 100>,
  "verdict": "<one sentence>",
  "matchLabel": "Poor" | "Fair" | "Good" | "Strong",
  "comparisonRows": [
    { "label": "<requirement name>", "jobRequires": "<what the job asks for>", "candidateHas": "<what the resume shows>", "status": "match" | "partial" | "miss" }
  ],
  "keywords": [
    { "text": "<keyword from the job>", "matched": true | false }
  ],
  "suggestedEdits": ["<string>"],
  "redFlags": ["<string>"]
}

Rules:
- score must be an integer between 0 and 100 (clamp if needed)
- matchLabel thresholds: Poor=0-49, Fair=50-69, Good=70-84, Strong=85-100. The label MUST agree with the score.
- comparisonRows: 4 to 6 items covering at minimum title alignment, years of experience, domain/industry fit, and core skills/tools
- keywords: 8 to 10 important keywords pulled from the JOB DESCRIPTION; set "matched": true only if the resume genuinely contains evidence of that keyword
- suggestedEdits: at most 5 short, concrete edits the candidate could make
- redFlags: at most 4 items; return an empty array if none
- Do not wrap the JSON in backticks or any other text`;

const REWRITE_SYSTEM = `You are an expert resume writer. Rewrite the RESUME so it honestly aligns with the JOB DESCRIPTION. Keep every fact true, never invent experience, numbers, or skills. Weave in the job's real keywords only where the resume already supports them. No em dashes, no en dashes, write dates as '2023 to Present'. Return plain markdown of the improved resume only.`;

function extractJSON(text: string): string {
  const stripped = text.replace(/```(?:json)?\s*/gi, "").replace(/```/g, "").trim();
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

    const clampScore = (n: number) => Math.max(0, Math.min(100, Math.round(n)));
    const labelFor = (s: number): "Poor" | "Fair" | "Good" | "Strong" => {
      if (s >= 85) return "Strong";
      if (s >= 70) return "Good";
      if (s >= 50) return "Fair";
      return "Poor";
    };

    const score = clampScore(Number(parsed.score) || 0);

    const rawRows = Array.isArray(parsed.comparisonRows) ? parsed.comparisonRows : [];
    const comparisonRows = rawRows.slice(0, 6).map((row) => {
      const r = (row && typeof row === "object" ? row : {}) as Record<string, unknown>;
      const status = r.status === "match" || r.status === "partial" || r.status === "miss" ? r.status : "miss";
      return {
        label: String(r.label || ""),
        jobRequires: String(r.jobRequires || ""),
        candidateHas: String(r.candidateHas || ""),
        status,
      };
    });

    const rawKeywords = Array.isArray(parsed.keywords) ? parsed.keywords : [];
    const keywords = rawKeywords.slice(0, 10).map((k) => {
      const o = (k && typeof k === "object" ? k : {}) as Record<string, unknown>;
      return { text: String(o.text || ""), matched: Boolean(o.matched) };
    }).filter((k) => k.text);

    const capStr = (arr: unknown, n: number) =>
      Array.isArray(arr) ? (arr as unknown[]).slice(0, n).map((x) => String(x)) : [];

    const allowedLabel = parsed.matchLabel === "Poor" || parsed.matchLabel === "Fair" || parsed.matchLabel === "Good" || parsed.matchLabel === "Strong";
    const matchLabel = allowedLabel ? (parsed.matchLabel as "Poor" | "Fair" | "Good" | "Strong") : labelFor(score);

    const result = {
      score,
      matchLabel,
      verdict: String(parsed.verdict || ""),
      comparisonRows,
      keywords,
      suggestedEdits: capStr(parsed.suggestedEdits, 5),
      redFlags: capStr(parsed.redFlags, 4),
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
