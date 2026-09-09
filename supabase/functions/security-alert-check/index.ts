// security-alert-check — Sept 2026 security review, the second layer.
// security_logs already has a real-time trigger (notify_security_alert ->
// admin-notifications) for individual high/critical rows, but that can
// only ever react to ONE row at a time — it has no way to notice "50
// failed-auth attempts from the same place in the last ten minutes" when
// each individual row is only medium severity on its own. This is that
// pattern check, cron-scheduled every 10 minutes, mirroring
// error-alert-check's own already-proven structure (same auth hardening,
// same cooldown shape) almost exactly.
import { createClient } from "npm:@supabase/supabase-js@2.45.0";
import { corsHeaders as getCorsHeadersFn } from "../_shared/cors.ts";
import { wrapEmail, heading, para, escapeHtml, sendBrandedEmail } from "../_shared/emailTemplate.ts";

const corsHeaders = getCorsHeadersFn({ headers: new Headers() } as Request);

// Deliberately excluded from burst detection: these are a routine,
// always-on access-audit trail (every legitimate profile view logs one),
// not an attack signal on their own. Hundreds of these an hour is normal.
const ROUTINE_ACTIONS = new Set(["sensitive_data_access", "sensitive_profile_access"]);

const BURST_THRESHOLD = 5;
const ALERT_COOLDOWN_MS = 30 * 60 * 1000;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Same hardening as error-alert-check: require the exact service-role
    // key, not just any valid JWT, since this is an internal cron target
    // with no legitimate reason to ever be called by anything else.
    const authHeader = req.headers.get("Authorization") ?? "";
    if (authHeader.replace(/^Bearer\s+/i, "") !== serviceKey) {
      return new Response(JSON.stringify({ error: "forbidden" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(supabaseUrl, serviceKey);

    const { data: state, error: stateErr } = await admin
      .from("security_alert_state")
      .select("last_checked_at, last_alert_sent_at")
      .eq("id", "singleton")
      .maybeSingle();
    if (stateErr) throw stateErr;

    const since = state?.last_checked_at || new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const now = new Date();

    const { data: rows, error: rowsErr } = await admin
      .from("security_logs")
      .select("user_id, action, severity, ip_address, details, created_at")
      .gt("created_at", since)
      .order("created_at", { ascending: false })
      .limit(1000);
    if (rowsErr) throw rowsErr;

    const all = rows || [];
    const critical = all.filter((r) => r.severity === "critical");
    const relevant = all.filter((r) => !ROUTINE_ACTIONS.has(r.action));

    // Group non-routine events by whichever identity we have — the caller's
    // own user_id when signed in, otherwise their ip_address (the only
    // thing an unauthenticated probe leaves behind).
    const byGroup = new Map<string, { key: string; count: number; actions: Set<string>; severity: string }>();
    for (const r of relevant) {
      const key = r.user_id ? `user:${r.user_id}` : r.ip_address ? `ip:${r.ip_address}` : null;
      if (!key) continue;
      const existing = byGroup.get(key);
      if (existing) {
        existing.count++;
        existing.actions.add(r.action);
        if (r.severity === "critical" || (r.severity === "high" && existing.severity !== "critical")) existing.severity = r.severity;
      } else {
        byGroup.set(key, { key, count: 1, actions: new Set([r.action]), severity: r.severity });
      }
    }
    const bursts = Array.from(byGroup.values()).filter((g) => g.count >= BURST_THRESHOLD);

    const shouldAlert = critical.length > 0 || bursts.length > 0;
    const cooldownActive = state?.last_alert_sent_at
      ? now.getTime() - new Date(state.last_alert_sent_at).getTime() < ALERT_COOLDOWN_MS
      : false;

    let alerted = false;
    if (shouldAlert && !cooldownActive) {
      const notifyEmail = Deno.env.get("NOTIFICATION_EMAIL");
      if (notifyEmail) {
        const criticalHtml = critical.slice(0, 5).map((r) => para(
          `<strong>${escapeHtml(r.action)}</strong> — critical${r.ip_address ? ` from ${escapeHtml(r.ip_address)}` : ""}`,
        )).join("");

        const burstHtml = bursts.slice(0, 10).sort((a, b) => b.count - a.count).map((b) => para(
          `<strong>${escapeHtml(b.key)}</strong>: ${b.count} events (${escapeHtml(Array.from(b.actions).join(", "))})`,
          { muted: b.severity !== "high" && b.severity !== "critical" },
        )).join("");

        const subject = critical.length > 0
          ? `AYN security alert: ${critical.length} critical event${critical.length === 1 ? "" : "s"}`
          : `AYN security alert: a real pattern detected (${bursts.length} source${bursts.length === 1 ? "" : "s"})`;

        const html = wrapEmail(
          heading("Something needs a look") +
          (critical.length > 0 ? para(`${critical.length} critical security event${critical.length === 1 ? "" : "s"} since ${new Date(since).toLocaleString()}.`) + criticalHtml : "") +
          (bursts.length > 0 ? para(`${bursts.length} source${bursts.length === 1 ? "" : "s"} hit ${BURST_THRESHOLD}+ security events in this window:`) + burstHtml : ""),
          ["The AYN system"],
        );

        const sendResult = await sendBrandedEmail(notifyEmail, subject, html);
        await admin.from("email_logs").insert({
          email_type: "security_alert_burst",
          recipient_email: notifyEmail,
          status: sendResult.ok ? "sent" : "failed",
          error_message: sendResult.ok ? null : sendResult.error,
          metadata: { critical_count: critical.length, burst_count: bursts.length },
        });
        alerted = sendResult.ok;
      }
    }

    await admin.from("security_alert_state").update({
      last_checked_at: now.toISOString(),
      ...(alerted ? { last_alert_sent_at: now.toISOString(), last_alert_count: relevant.length } : {}),
    }).eq("id", "singleton");

    return new Response(JSON.stringify({
      checked: all.length, relevant: relevant.length, critical: critical.length,
      bursts: bursts.length, alerted, cooldown_active: cooldownActive,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("security-alert-check failed", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
