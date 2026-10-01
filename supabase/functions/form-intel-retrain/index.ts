// v3.298.0 -- the periodic half of the flag-and-retrain loop. A real
// person flagging a cached form_widget_patterns classification (see
// resume-hub's own auto_apply_flag_widget action, and
// flagWidgetClassification's header in resume-hub/lib/formIntelligence.ts)
// only ever marks a row needs_review = true; nothing re-classifies it
// until either the SAME widget shape is encountered live again (which may
// never happen soon on a company nobody's applying to right now) or this
// function runs.
//
// Cron-scheduled every few days (see the form-intel-retrain pg_cron job)
// -- deliberately not more often than that. Re-running the same
// deterministic-temperature classifier on the same stored structural
// shape with no new signal will very often just reproduce the same
// answer; this exists to periodically clear the backlog and reset
// flagged_count on rows that turn out to reclassify the same, and to
// give a real, confirmed second opinion on ones that don't, not to churn
// AI calls on a tight loop.
//
// Deliberately reuses classifyWidgets() itself rather than a separate
// re-implementation -- a flagged row, forced to miss the cache by its own
// needs_review flag (see classifyWidgets' own cache-read), goes through
// the identical AI call and upsert path a brand-new widget would, so
// there is exactly one place this app ever asks a model to classify a
// widget shape, not two that could drift apart.
//
// A flag's own free-text note is deliberately NEVER passed into the AI
// prompt here -- it is real, admin-visible context for a human reviewing
// the pattern by hand, but feeding arbitrary user-supplied text into a
// classification prompt is a real prompt-injection surface this app's
// own standing discipline (code decides facts from SANITIZED structural
// data, the model only classifies) exists specifically to avoid.
import { createClient } from "npm:@supabase/supabase-js@2.45.0";
import { corsHeaders as getCorsHeadersFn } from "../_shared/cors.ts";
import { classifyWidgets, type WidgetSignature } from "../resume-hub/lib/formIntelligence.ts";

const corsHeaders = getCorsHeadersFn({ headers: new Headers() } as Request);

// Bounds one run's real AI cost regardless of how large the backlog
// gets -- classifyWidgets itself batches every widget in one call, so
// this is one real request per run, not one per row.
const BATCH_SIZE = 40;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceKey);

    const { data: rows, error: rowsErr } = await admin
      .from("form_widget_patterns")
      .select("signature_hash, signature, widget_type, flagged_count")
      .eq("needs_review", true)
      .not("signature", "is", null)
      .order("last_flagged_at", { ascending: true, nullsFirst: true })
      .limit(BATCH_SIZE);
    if (rowsErr) throw rowsErr;

    const pending = (rows || []) as Array<{
      signature_hash: string; signature: WidgetSignature; widget_type: string; flagged_count: number;
    }>;

    if (!pending.length) {
      return new Response(JSON.stringify({ reviewed: 0, changed: 0, unchanged: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // classifyWidgets keys its own internal per-batch correlation by
    // localId, not signature_hash -- each stored signature already
    // carries whatever localId it had at the moment it was first cached,
    // which only needs to be unique within THIS one call, not globally.
    const widgets = pending.map((r) => r.signature);
    const before = new Map(pending.map((r) => [r.signature_hash, r.widget_type]));

    const results = await classifyWidgets(admin, widgets);

    let changed = 0;
    let unchanged = 0;
    for (const r of results) {
      const original = pending.find((p) => p.signature.localId === r.localId);
      if (!original) continue;
      if (before.get(original.signature_hash) === r.widgetType) unchanged++;
      else changed++;
    }

    return new Response(JSON.stringify({
      reviewed: pending.length, changed, unchanged,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("form-intel-retrain failed", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
