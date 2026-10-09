// content-engine — SEO/AEO article generator.
//
// Cron-triggered (see the content-engine pg_cron entry — registered live,
// same as job-board-sync's own, this stack has no migration runner), same
// service-role-bearer-token auth pattern as job-board-sync. Not a public
// endpoint.
//
// Numeric claims are checked against SQL-computed source data. This does
// not establish that every interpretation or company claim is correct:
// unsupervised publishing still needs content-quality monitoring. The
// topic and data functions article_topic_candidates()
// and article_source_data() (supabase/migrations/20261002090000_*.sql) do
// every real calculation — sample-size floors, salary percentiles, the
// same plausibility filter job_market_snapshot() already proved live.
// This function asks the model to phrase that JSON, then checks every
// numeric token in the generated fields against the source and enforces a
// minimum length before writing it to the public articles table.
import { createClient } from "npm:@supabase/supabase-js@2.45.0";
import { corsHeaders, handleCors } from "../_shared/cors.ts";
import { invalidFigures } from "./grounding.ts";
import { aiTimeout } from "./timeBudget.ts";

// ───────────────────────── AI relay (self-contained) ─────────────────────────
// Deliberately a second, minimal caller rather than importing resume-hub's
// own callAI() — matches this codebase's established precedent (see
// ai-openai-bridge mirroring ai-relay) of duplicating a small amount of
// code per isolated function bundle rather than reaching across functions,
// since each edge function deploys as its own self-contained unit here.
const AI_RELAY_URL = Deno.env.get("AI_RELAY_URL");
const GATEWAY_URL = AI_RELAY_URL || "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = "google/gemini-2.5-flash";
const PRICES_PER_1M: [number, number] = [0.30, 2.50]; // [input, output] USD

function relayApiKey(): string | undefined {
  return AI_RELAY_URL ? Deno.env.get("RELAY_SECRET") : Deno.env.get("LOVABLE_API_KEY");
}

async function callAI(opts: {
  system: string;
  user: string;
  toolName: string;
  toolSchema: Record<string, unknown>;
  deadline: number;
}): Promise<{ structured: Record<string, unknown>; costCents: number }> {
  const apiKey = relayApiKey();
  if (!apiKey) throw new Error("AI relay key not configured");

  const body = {
    model: MODEL,
    messages: [
      { role: "system", content: opts.system },
      { role: "user", content: opts.user },
    ],
    temperature: 0.5,
    tools: [{ type: "function", function: { name: opts.toolName, description: opts.toolName, parameters: opts.toolSchema } }],
    tool_choice: { type: "function", function: { name: opts.toolName } },
  };

  let lastErr = "";
  for (let attempt = 0; attempt < 3; attempt++) {
    const timeout = aiTimeout(opts.deadline);
    let r: Response;
    try {
      r = await fetch(GATEWAY_URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeout),
      });
    } catch (e) {
      lastErr = `network: ${(e as Error).message}`;
      await new Promise((res) => setTimeout(res, 800 * (attempt + 1)));
      continue;
    }
    if (r.ok) {
      const data = await r.json();
      const usage = data?.usage || {};
      const inTok = Number(usage.prompt_tokens ?? usage.input_tokens ?? 0);
      const outTok = Number(usage.completion_tokens ?? usage.output_tokens ?? 0);
      const costUsd = (inTok / 1_000_000) * PRICES_PER_1M[0] + (outTok / 1_000_000) * PRICES_PER_1M[1];
      const tc = data?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
      if (!tc) throw new Error("AI returned no structured output");
      return { structured: JSON.parse(tc), costCents: Math.round(costUsd * 100 * 100) / 100 };
    }
    if (r.status === 429 || (r.status >= 500 && r.status < 600)) {
      lastErr = `AI ${r.status}`;
      await new Promise((res) => setTimeout(res, 1000 * Math.pow(2, attempt)));
      continue;
    }
    const t = await r.text();
    throw new Error(`AI error ${r.status}: ${t.slice(0, 200)}`);
  }
  throw new Error(lastErr || "AI request failed");
}

// ───────────────────────── Article generation ─────────────────────────
const ARTICLE_SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string", description: "Specific, plain, under 70 characters. Never generic listicle phrasing." },
    dek: { type: "string", description: "One sentence, under 160 characters, restating the single most useful real number." },
    meta_description: { type: "string", description: "Under 155 characters, plain, no clickbait." },
    body_md: { type: "string", description: "Markdown (## headings, no h1). MUST be at least 450 words, target 500-700 -- count as you write; a short, thin report is a failed one. Spend real sentences interpreting what the numbers mean for someone deciding whether to apply or hire (e.g. how the percentile spread compares to the median, what the work-mode split suggests, what the freshness numbers say about how active this market is right now), never just listing the figures in one line each. No em dashes or en dashes anywhere -- use a period, comma, or the word 'to' for a range instead." },
    faq: {
      type: "array",
      description: "0-3 entries, ONLY if a real, distinct question this exact data can honestly answer exists. Omit entirely rather than force one.",
      items: { type: "object", properties: { question: { type: "string" }, answer: { type: "string" } }, required: ["question", "answer"] },
    },
  },
  required: ["title", "dek", "meta_description", "body_md"],
};
const MIN_ARTICLE_WORDS = 450;

function slugify(s: string): string {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function buildPrompt(kind: string, category: string, city: string | null, sourceData: unknown) {
  const topic = kind === "salary_report"
    ? `a salary/market report for "${category}"${city ? ` in "${city}"` : ""}`
    : `a hiring-trend report on who is actively hiring for "${category}" right now`;
  const system = [
    "You write short, plain, evidence-led market reports for AYN, a job-search platform.",
    "You will be given one jsonb object: the complete, real, already-computed set of facts for this report, pulled live from AYN's own job catalog.",
    "RULES, NO EXCEPTIONS:",
    "1. Every number, percentage, and dollar figure in your output must appear verbatim in the data you were given. Never compute, round differently, estimate, or introduce a figure that is not already there.",
    "2. Never invent a company name, a claim, or a statistic not present in the data.",
    "3. If the data is thin for a field (e.g. zero top_companies), simply don't make a claim about it rather than inventing one.",
    "4. No em dashes, no en dashes, anywhere. Use a period, a comma, or the word 'to' for a range.",
    "5. No AI-cliche phrasing: no 'leverage', 'seamless', 'unlock', 'dive into', 'in today's fast-paced'. Write like a specific, careful analyst, not a generic blog.",
    "6. Write real markdown with 2-3 short ## sections. Open with the single most useful real number, not a throat-clearing intro paragraph.",
    "7. Say 'median', never '50th percentile'. You may say '25th percentile' and '75th percentile' for p25_salary and p75_salary, nothing else. Never state an average, total, difference, ratio, share, or percentage you worked out yourself, and never write a figure like '50 percent' or 'half'. Compare numbers in words ('well above', 'about double' is NOT allowed, 'higher than') without stating a computed number.",
  ].join(" ");
  const user = `Write ${topic}. Here is the complete, real data to ground every claim in -- nothing outside this object is true for this report:\n\n${JSON.stringify(sourceData)}`;
  return { system, user };
}

async function generateOne(
  kind: string, category: string, city: string | null, sourceData: unknown, deadline: number,
): Promise<{ title: string; dek: string; meta_description: string; body_md: string; faq: unknown; costCents: number }> {
  const { system, user } = buildPrompt(kind, category, city, sourceData);
  let { structured, costCents } = await callAI({ system, user, toolName: "emit_article", toolSchema: ARTICLE_SCHEMA, deadline });
  const unsupportedFigures = (draft: Record<string, unknown>) => invalidFigures(
    [draft.title, draft.dek, draft.meta_description, draft.body_md, JSON.stringify(draft.faq || "")]
      .map((field) => String(field || "")).join("\n"),
    sourceData,
  );
  let bad = unsupportedFigures(structured);
  let wc = String(structured.body_md || "").split(/\s+/).filter(Boolean).length;

  if (bad.length || wc < MIN_ARTICLE_WORDS) {
    // One combined retry -- naming the exact offending figures (same shape
    // as the rest of this codebase's write-quality retry pattern,
    // verifyWriteQuality in _shared/tailoring.ts) and, found live on the
    // very first real run, a real length shortfall too: a soft "target
    // 500-700 words" in the schema description alone wasn't enough, the
    // model's first two real drafts both landed under 150. One retry
    // covers both problems in the same extra call rather than two.
    const notes: string[] = [];
    if (bad.length) notes.push(`Your previous draft stated these figures, which do NOT appear anywhere in the data above: ${bad.join(", ")}. Every figure must come from the data only.`);
    if (wc < MIN_ARTICLE_WORDS) notes.push(`Your previous draft was only ${wc} words. It must be at least 450, ideally 500-700. Expand the interpretation in each section, do not just repeat the same facts in fewer words.`);
    const retryUser = `${user}\n\n${notes.join(" ")}\n\nRewrite it from scratch with both of these fixed.`;
    const retry = await callAI({ system, user: retryUser, toolName: "emit_article", toolSchema: ARTICLE_SCHEMA, deadline });
    structured = retry.structured;
    costCents += retry.costCents;
    bad = unsupportedFigures(structured);
    wc = String(structured.body_md || "").split(/\s+/).filter(Boolean).length;
    if (bad.length) throw new Error(`Grounding check failed twice, still contains unsupported figures: ${bad.join(", ")}`);
    if (wc < MIN_ARTICLE_WORDS) throw new Error(`Still too short after retry: ${wc} words.`);
  }

  return {
    title: String(structured.title || "").trim(),
    dek: String(structured.dek || "").trim(),
    meta_description: String(structured.meta_description || "").trim(),
    body_md: String(structured.body_md || "").trim(),
    faq: Array.isArray(structured.faq) && structured.faq.length ? structured.faq : null,
    costCents,
  };
}

Deno.serve(async (req: Request) => {
  const deadline = Date.now() + 45_000;
  if (req.method === "OPTIONS") return handleCors(req);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Cron-triggered internal function, not a public endpoint -- same
    // service-role-bearer check as job-board-sync.
    const authHeader = req.headers.get("Authorization") ?? "";
    if (authHeader.replace(/^Bearer\s+/i, "") !== serviceKey) {
      return new Response(JSON.stringify({ error: "forbidden" }), {
        status: 403, headers: { ...corsHeaders(req), "Content-Type": "application/json" },
      });
    }

    const admin = createClient(supabaseUrl, serviceKey);

    // Admin-configurable (see admin_article_set_config / the Articles
    // section's own cadence control) via app_settings, so the per-run
    // volume can change without a code deploy. The cron's own request body
    // still only ever sends {} -- it never hardcodes a count -- so this
    // setting is the one real source of truth for a cron-triggered run. A
    // request body limit is kept as an explicit override purely for manual
    // testing (curl-ing this function directly with a one-off count).
    let topicsPerRun = 2;
    let refreshExisting = false;
    const { data: setting } = await admin.from("app_settings").select("value").eq("key", "content_engine_articles_per_run").maybeSingle();
    const configured = Number(setting?.value);
    if (Number.isFinite(configured) && configured >= 1 && configured <= 5) topicsPerRun = configured;
    try {
      const body = await req.json();
      if (typeof body?.limit === "number" && body.limit > 0 && body.limit <= 5) topicsPerRun = body.limit;
      refreshExisting = body?.refresh_existing === true;
    } catch { /* no body, use configured/default */ }

    // Maintenance calls refresh one report at a time: a five-report live
    // refresh exceeded the shared edge worker's runtime budget.
    if (refreshExisting) topicsPerRun = 1;
    const { data: candidates, error: candErr } = await admin.rpc(refreshExisting ? "article_refresh_candidates" : "article_topic_candidates", { p_limit: topicsPerRun });
    if (candErr) throw candErr;

    const results: Array<Record<string, unknown>> = [];
    for (const c of (candidates ?? []) as Array<{ kind: string; category: string; city: string | null; sample_size: number }>) {
      try {
        const { data: sourceData, error: srcErr } = await admin.rpc("article_source_data", {
          p_kind: c.kind, p_category: c.category, p_city: c.city,
        });
        if (srcErr) throw srcErr;

        const article = await generateOne(c.kind, c.category, c.city, sourceData, deadline);
        const wordCount = article.body_md.split(/\s+/).filter(Boolean).length;
        const slugParts = [c.kind === "salary_report" ? "salary" : "hiring", c.category, c.city].filter(Boolean) as string[];
        const slug = slugify(slugParts.join("-"));

        const { data: articleId, error: upsertErr } = await admin.rpc("article_upsert", {
          p_slug: slug, p_kind: c.kind, p_category: c.category, p_city: c.city,
          p_title: article.title, p_dek: article.dek, p_meta_description: article.meta_description,
          p_body_md: article.body_md, p_faq: article.faq, p_source_data: sourceData,
          p_word_count: wordCount, p_generation_cost_cents: article.costCents,
        });
        if (upsertErr) throw upsertErr;

        results.push({ ok: true, slug, kind: c.kind, category: c.category, city: c.city, id: articleId, word_count: wordCount, cost_cents: article.costCents });
      } catch (e) {
        results.push({ ok: false, kind: c.kind, category: c.category, city: c.city, error: String(e) });
      }
    }

    return new Response(JSON.stringify({ ok: true, candidates: candidates?.length ?? 0, results }), {
      headers: { ...corsHeaders(req), "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders(req), "Content-Type": "application/json" },
    });
  }
});
