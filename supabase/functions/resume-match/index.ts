// resume-match v2.0.0 — Score & rewrite a resume against a job description.
// Auth: requires a valid Supabase JWT (Authorization: Bearer ...).
// CORS: origin-validated, no wildcard.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ── CORS helpers ──────────────────────────────────────────────────────────────
const ALLOWED_ORIGINS = [
  'https://aynn.io',
  'https://www.aynn.io',
  'https://ayn-insight-forge.lovable.app',
  'http://localhost:5173',
  'http://localhost:8080',
];

function resolveOrigin(req: Request): string {
  const origin = req.headers.get('Origin') || '';
  if (ALLOWED_ORIGINS.includes(origin)) return origin;
  if (/^https:\/\/[a-z0-9-]+\.lovableproject\.com$/.test(origin)) return origin;
  if (/^https:\/\/[a-z0-9-]+--[a-z0-9-]+\.lovable\.app$/.test(origin)) return origin;
  return ALLOWED_ORIGINS[0];
}

function corsHeaders(req: Request) {
  return {
    "Access-Control-Allow-Origin": resolveOrigin(req),
    "Access-Control-Allow-Headers": "authorization, x-client-info, x-application-name, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

function json(req: Request, data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders(req), "Content-Type": "application/json" },
  });
}

// ── LLM prompts ───────────────────────────────────────────────────────────────
const SCORE_SYSTEM = `You are an honest technical recruiter. Compare the RESUME to the JOB DESCRIPTION. Never credit the candidate with experience or seniority the resume does not contain. Judge against the years and domain the job asks for. No em dashes.

Return ONLY valid JSON with no code fences, no markdown, no preamble. Just the raw JSON object:
{
  "score": <integer 0-100>,
  "verdict": "<one short sentence>",
  "matchLabel": "<Poor | Fair | Good | Strong>",
  "comparisonRows": [
    {
      "label": "<requirement label e.g. Job Title, Years of Experience, Domain>",
      "jobRequires": "<what the job asks for>",
      "candidateHas": "<what the resume shows>",
      "status": "<match | partial | miss>"
    }
  ],
  "keywords": [
    { "text": "<keyword>", "matched": <true or false> }
  ],
  "suggestedEdits": ["<string>"],
  "redFlags": ["<string>"]
}

Rules:
- score: integer 0 to 100
- matchLabel: Poor for 0-49, Fair for 50-69, Good for 70-84, Strong for 85-100
- comparisonRows: 4-6 rows covering title fit, experience level, domain, key skills, education if relevant
- status match = clearly satisfied, partial = somewhat present, miss = clearly absent
- keywords: 8-10 most important skills or tools from the job; set matched true if the resume already has it
- suggestedEdits: max 5 specific edits to improve fit
- redFlags: max 4 things a recruiter would flag, empty array if none
- Do not wrap in code fences or add any text outside the JSON`;

const REWRITE_SYSTEM = `You are an expert resume writer. Rewrite the RESUME so it honestly aligns with the JOB DESCRIPTION. Keep every fact true, never invent experience, numbers, or skills. Weave in the job's real keywords only where the resume already supports them. No em dashes, no en dashes, write dates as 2023 to Present. Return plain markdown of the improved resume only.`;

function extractJSON(text: string): string {
  const stripped = text.replace(/```(?:json)?\s*/gi, "").replace(/```/g, "").trim();
  const start = stripped.indexOf("{");
  const end = stripped.lastIndexOf("}");
  if (start !== -1 && end !== -1 && end > start) return stripped.slice(start, end + 1);
  return stripped;
}

// ── Request handler ───────────────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders(req) });

  // ── Authentication: require valid Supabase session ──────────────────────────
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) {
    return json(req, { error: "Unauthorized" }, 401);
  }
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const supa = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: u } = await supa.auth.getUser();
  if (!u?.user?.id) {
    return json(req, { error: "Unauthorized" }, 401);
  }

  try {
    const { resume, job, mode } = await req.json();
    if (!resume || !job) {
      return json(req, { error: "Both resume and job are required" }, 400);
    }
    if (mode !== "score" && mode !== "rewrite") {
      return json(req, { error: "mode must be score or rewrite" }, 400);
    }

    const KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!KEY) throw new Error("LOVABLE_API_KEY missing");

    const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.0-flash-001",
        messages: [
          { role: "system", content: mode === "score" ? SCORE_SYSTEM : REWRITE_SYSTEM },
          { role: "user", content: `RESUME:\n${resume}\n\nJOB DESCRIPTION:\n${job}` },
        ],
        temperature: 0.3,
        stream: false,
      }),
    });

    if (r.status === 429) return json(req, { error: "Rate limit. Try again shortly." }, 429);
    if (r.status === 402) return json(req, { error: "Add credits to your AI workspace." }, 402);
    if (!r.ok) {
      const t = await r.text();
      return json(req, { error: `gateway ${r.status}: ${t}` }, 500);
    }

    const data = await r.json();
    const rawContent = data?.choices?.[0]?.message?.content ?? "";

    if (mode === "rewrite") {
      return json(req, { markdown: rawContent });
    }

    let parsed: Record<string, unknown>;
    try { parsed = JSON.parse(extractJSON(rawContent)); }
    catch {
      return json(req, { error: "Failed to parse AI response", raw: rawContent }, 500);
    }

    const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));
    const cap = (arr: unknown, n: number) => Array.isArray(arr) ? (arr as unknown[]).slice(0, n) : [];
    const validStatuses = ["match", "partial", "miss"];
    const validLabels = ["Poor", "Fair", "Good", "Strong"];
    const score = clamp(Number(parsed.score) || 0);
    const rawLabel = String(parsed.matchLabel || "");
    const matchLabel = validLabels.includes(rawLabel) ? rawLabel : score >= 85 ? "Strong" : score >= 70 ? "Good" : score >= 50 ? "Fair" : "Poor";

    return json(req, {
      score, matchLabel,
      verdict: String(parsed.verdict || ""),
      comparisonRows: cap(parsed.comparisonRows, 6).map((row: unknown) => {
        const ro = (row && typeof row === "object" ? row : {}) as Record<string, unknown>;
        return {
          label: String(ro.label || ""),
          jobRequires: String(ro.jobRequires || ""),
          candidateHas: String(ro.candidateHas || ""),
          status: validStatuses.includes(String(ro.status)) ? String(ro.status) : "miss",
        };
      }),
      keywords: cap(parsed.keywords, 10).map((k: unknown) => {
        const kw = (k && typeof k === "object" ? k : {}) as Record<string, unknown>;
        return { text: String(kw.text || ""), matched: Boolean(kw.matched) };
      }),
      suggestedEdits: cap(parsed.suggestedEdits, 5).map(String),
      redFlags: cap(parsed.redFlags, 4).map(String),
    });

  } catch (e: unknown) {
    return json(req, { error: e instanceof Error ? e.message : "unknown error" }, 500);
  }
});
