// Reads facts a job posting states in its own text (years of experience asked for, visa sponsorship,
// a pay range, how the role is worked, benefits named)
// and stores them as columns, so the site can show and filter on them. Deterministic, no AI call, no
// cost. Runs every minute on cron over rows not yet read; new jobs are picked up within minutes.
// Service-role bearer only.
import { createClient } from "npm:@supabase/supabase-js@2.45.0";
import { mapConcurrent } from "../_shared/concurrency.ts";
import { extractJobFacts } from "../_shared/jobFacts.ts";

const BATCH = 600;
const CONCURRENCY = 10;
const TIME_BUDGET_MS = 90_000;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return json({ error: "not configured" }, 500);
  if (req.headers.get("Authorization") !== `Bearer ${key}`) return json({ error: "unauthorized" }, 401);

  const admin = createClient(url, key, { auth: { persistSession: false } });
  const { data: rows, error } = await admin
    .from("job_postings")
    .select("id, description, location")
    .is("facts_extracted_at", null)
    .order("created_at", { ascending: false })
    .limit(BATCH);
  if (error) return json({ error: error.message }, 500);

  const started = Date.now();
  const summary = { picked: (rows || []).length, updated: 0, failed: 0, skipped_time: 0, with_years: 0, with_sponsorship: 0, with_salary: 0, with_work_mode: 0, with_benefits: 0 };
  await mapConcurrent(rows || [], CONCURRENCY, async (row: { id: string; description: string | null; location: string | null }) => {
    if (Date.now() - started > TIME_BUDGET_MS) { summary.skipped_time++; return; }
    const facts = extractJobFacts(row.description, { location: row.location });
    const { error: updateError } = await admin.from("job_postings").update({
      years_required: facts.years_required,
      sponsorship: facts.sponsorship,
      salary_text_min: facts.salary?.min ?? null,
      salary_text_max: facts.salary?.max ?? null,
      salary_text_currency: facts.salary?.currency ?? null,
      salary_text_period: facts.salary?.period ?? null,
      salary_text_annual_min: facts.salary?.annual_min ?? null,
      salary_text_annual_max: facts.salary?.annual_max ?? null,
      work_mode_text: facts.work_mode,
      benefits: facts.benefits.length ? facts.benefits : null,
      facts_extracted_at: new Date().toISOString(),
    }).eq("id", row.id);
    if (updateError) { summary.failed++; return; }
    summary.updated++;
    if (facts.years_required !== null) summary.with_years++;
    if (facts.sponsorship !== null) summary.with_sponsorship++;
    if (facts.salary) summary.with_salary++;
    if (facts.work_mode) summary.with_work_mode++;
    if (facts.benefits.length) summary.with_benefits++;
  });

  const { count } = await admin.from("job_postings").select("id", { count: "exact", head: true }).is("facts_extracted_at", null);
  return json({ ...summary, remaining: count ?? null });
});
