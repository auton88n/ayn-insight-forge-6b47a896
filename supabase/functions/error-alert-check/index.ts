// v3.159.0 — npm: specifier, see job-board-sync's identical comment.
import { createClient } from "npm:@supabase/supabase-js@2.45.0";
import { corsHeaders as getCorsHeadersFn } from "../_shared/cors.ts";
import { wrapEmail, heading, para, escapeHtml, sendBrandedEmail } from "../_shared/emailTemplate.ts";

const corsHeaders = getCorsHeadersFn({ headers: new Headers() } as Request);

// v3.132.0 — cron-scheduled every 10 minutes (see the error-alert-check
// pg_cron job). error_logs previously only ever heard from the frontend
// ErrorBoundary; resume-hub's own outer catch now also writes here
// (source: "backend"), so this is the one place that can see a real
// backend failure burst and a real frontend one in the same query.
//
// Alert condition: any "critical" row at all, or 3+ "error" rows, since
// error_alert_state.last_checked_at. A 30 minute cooldown after a sent
// alert stops one ongoing burst from producing an email every 10 minutes
// while it lasts — the founder needs to know once, not repeatedly.
const ERROR_BURST_THRESHOLD = 3;
const ALERT_COOLDOWN_MS = 30 * 60 * 1000;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceKey);

    const { data: state, error: stateErr } = await admin
      .from("error_alert_state")
      .select("last_checked_at, last_alert_sent_at")
      .eq("id", "singleton")
      .maybeSingle();
    if (stateErr) throw stateErr;

    const since = state?.last_checked_at || new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const now = new Date();

    const { data: rows, error: rowsErr } = await admin
      .from("error_logs")
      .select("error_message, source, severity, endpoint, created_at")
      .gt("created_at", since)
      .in("severity", ["error", "critical"])
      .order("created_at", { ascending: false })
      .limit(200);
    if (rowsErr) throw rowsErr;

    const errors = rows || [];
    const criticalCount = errors.filter(r => r.severity === "critical").length;
    const errorCount = errors.length;
    const shouldAlert = criticalCount >= 1 || errorCount >= ERROR_BURST_THRESHOLD;

    const cooldownActive = state?.last_alert_sent_at
      ? now.getTime() - new Date(state.last_alert_sent_at).getTime() < ALERT_COOLDOWN_MS
      : false;

    let alerted = false;
    if (shouldAlert && !cooldownActive && errors.length > 0) {
      const notifyEmail = Deno.env.get("NOTIFICATION_EMAIL");
      if (notifyEmail) {
        // Dedupe to distinct (endpoint, message) pairs so a single loop
        // failing on every request doesn't read as 50 unrelated problems.
        const byKey = new Map<string, { endpoint: string; message: string; count: number; severity: string }>();
        for (const r of errors) {
          const key = `${r.endpoint || r.source || "unknown"}::${r.error_message}`;
          const existing = byKey.get(key);
          if (existing) existing.count++;
          else byKey.set(key, {
            endpoint: r.endpoint || r.source || "unknown",
            message: r.error_message,
            count: 1,
            severity: r.severity,
          });
        }
        const distinct = Array.from(byKey.values()).sort((a, b) => b.count - a.count).slice(0, 10);

        const rowsHtml = distinct.map(d => para(
          `<strong>${escapeHtml(d.endpoint)}</strong>${d.count > 1 ? ` (${d.count}×)` : ""} — ${escapeHtml(d.message.slice(0, 200))}`,
          { muted: d.severity !== "critical" },
        )).join("");

        const subject = criticalCount >= 1
          ? `AYN alert: ${criticalCount} critical error${criticalCount === 1 ? "" : "s"}`
          : `AYN alert: ${errorCount} errors in the last check window`;

        const html = wrapEmail(
          heading("Something needs a look") +
          para(`${errorCount} error${errorCount === 1 ? "" : "s"} logged since the last check (${new Date(since).toLocaleString()}).`) +
          rowsHtml,
          ["The AYN system"],
        );

        const sendResult = await sendBrandedEmail(notifyEmail, subject, html);
        await admin.from("email_logs").insert({
          email_type: "error_alert",
          recipient_email: notifyEmail,
          status: sendResult.ok ? "sent" : "failed",
          error_message: sendResult.ok ? null : sendResult.error,
          metadata: { error_count: errorCount, critical_count: criticalCount },
        });
        alerted = sendResult.ok;
      }
    }

    await admin.from("error_alert_state").update({
      last_checked_at: now.toISOString(),
      ...(alerted ? { last_alert_sent_at: now.toISOString(), last_alert_count: errorCount } : {}),
    }).eq("id", "singleton");

    return new Response(JSON.stringify({
      checked: errorCount, critical: criticalCount, alerted, cooldown_active: cooldownActive,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("error-alert-check failed", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
