// Gives every live job posting a semantic vector (job_postings.embedding), so "Match me" can
// rank jobs by how close they are to a person's real background, not by exact wording overlap.
//
// Runs every few minutes on cron. Each run embeds the newest jobs that have no vector yet, in a
// small, time-bounded batch. A vector is only stored when the real embedding model produced it:
// the hash fallback is never stored, so the row stays empty and is retried on the next run
// instead of mixing two incompatible kinds of vector. Service-role bearer only.
import { createClient } from "npm:@supabase/supabase-js@2.45.0";
import { embedText, FALLBACK_EMBED_MODEL } from "../resume-hub/lib/embeddings.ts";
import { mapConcurrent } from "../_shared/concurrency.ts";
import { jobEmbedInput } from "../_shared/jobEmbedText.ts";

const BATCH = 120;
const CONCURRENCY = 4;
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
    .select("id, title, company, category, seniority, location, description")
    .is("embedding", null)
    .order("created_at", { ascending: false })
    .limit(BATCH);
  if (error) return json({ error: error.message }, 500);

  const started = Date.now();
  const summary = { picked: (rows || []).length, embedded: 0, fallback: 0, failed: 0, skipped_time: 0 };

  await mapConcurrent(rows || [], CONCURRENCY, async (row: Record<string, unknown>) => {
    if (Date.now() - started > TIME_BUDGET_MS) { summary.skipped_time++; return; }
    try {
      const { vector, model } = await embedText(jobEmbedInput(row as never));
      if (model === FALLBACK_EMBED_MODEL) { summary.fallback++; return; }
      const { error: updateError } = await admin.from("job_postings").update({
        embedding: JSON.stringify(vector), embedding_model: model, embedded_at: new Date().toISOString(),
      }).eq("id", row.id as string);
      if (updateError) { summary.failed++; return; }
      summary.embedded++;
    } catch {
      summary.failed++;
    }
  });

  const { count } = await admin.from("job_postings").select("id", { count: "exact", head: true }).is("embedding", null);
  return json({ ...summary, remaining: count ?? null });
});
