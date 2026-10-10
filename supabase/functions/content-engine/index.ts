// Internal scheduled catalog reports. Browser, crawler and publisher share the
// same factual formatter; no model-generated interpretation or word-count padding.
import { createClient } from "npm:@supabase/supabase-js@2.45.0";
import { corsHeaders, handleCors } from "../_shared/cors.ts";
import { applySalaryFloor, hasEnoughPayData } from "./grounding.ts";
import { presentArticle } from "../_shared/articlePresentation.mjs";

function slugify(s: string): string {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return handleCors(req);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Cron-triggered internal function, not a public endpoint -- same
    // service-role-bearer check as job-board-sync.
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!serviceKey || !supabaseUrl || authHeader.replace(/^Bearer\s+/i, "") !== serviceKey) {
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
    if (Number.isInteger(configured) && configured >= 1 && configured <= 5) topicsPerRun = configured;
    try {
      const body = await req.json();
      if (Number.isInteger(body?.limit) && body.limit > 0 && body.limit <= 5) topicsPerRun = body.limit;
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
        // A salary report with no usable pay sample would publish an anecdote as a
        // market median. Skip it instead; hiring reports never depended on pay.
        if (c.kind === "salary_report" && !hasEnoughPayData(sourceData as Record<string, unknown>)) {
          results.push({ ok: false, kind: c.kind, category: c.category, city: c.city, error: "skipped: too few salary-stating postings" });
          continue;
        }

        const groundedData = applySalaryFloor(sourceData as Record<string, unknown>);
        // Numeric catalog reports do not need a model to invent interpretation.
        // The same formatter also replaces legacy prose on browser/crawler reads.
        const article = { ...presentArticle({ kind: c.kind, category: c.category, city: c.city, source_data: groundedData }), costCents: 0 };
        const wordCount = article.body_md.split(/\s+/).filter(Boolean).length;
        const slugParts = [c.kind === "salary_report" ? "salary" : "hiring", c.category, c.city].filter(Boolean) as string[];
        const slug = slugify(slugParts.join("-"));

        const { data: articleId, error: upsertErr } = await admin.rpc("article_upsert", {
          p_slug: slug, p_kind: c.kind, p_category: c.category, p_city: c.city,
          p_title: article.title, p_dek: article.dek, p_meta_description: article.meta_description,
          p_body_md: article.body_md, p_faq: article.faq, p_source_data: groundedData,
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
