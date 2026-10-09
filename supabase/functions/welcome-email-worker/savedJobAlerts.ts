import type { SupabaseClient } from "npm:@supabase/supabase-js@2.45.0";
import { wrapEmail, heading, para, ctaButton, escapeHtml, sendBrandedEmail } from "../_shared/emailTemplate.ts";
import { permanentEmailError, retryAt, sendWindowExpired } from "./reliability.ts";

type Admin = SupabaseClient;
interface Alert {
  id: string; user_id: string; job_id: string; attempts: number; title: string; company: string;
  send_started_at: string | null;
  send_payload: { to: string; subject: string; html: string } | null;
}

// The existing authenticated minute worker also drains this bounded outbox.
// A failure here cannot block welcome sends; no new public email endpoint.
export async function sendSavedJobAlerts(admin: Admin) {
  const { data, error } = await admin.rpc("claim_saved_job_alerts", { p_limit: 3 });
  if (error) throw error;
  const summary = { claimed: data?.length || 0, sent: 0, skipped: 0, failed: 0, retry: 0 };
  for (const row of (data || []) as Alert[]) {
    const finish = async (patch: Record<string, unknown>) => {
      const { data: updated, error } = await admin.from("saved_job_email_alerts").update(patch)
        .eq("id", row.id).eq("status", "sending").eq("attempts", row.attempts).select("id").maybeSingle();
      if (error || !updated) throw new Error(error?.message || "Saved job alert claim lost");
    };
    try {
      const { data: sendable, error: checkError } = await admin.rpc("saved_job_alert_sendable", { p_id: row.id });
      if (checkError) throw checkError;
      const { data: found, error: authError } = await admin.auth.admin.getUserById(row.user_id);
      if (authError) throw authError;
      const user = found?.user;
      if (!sendable || !user?.email || !user.email_confirmed_at || user.email.endsWith("@erased.invalid") || user.banned_until
        || (row.send_payload && row.send_payload.to !== user.email)) {
        await finish({ status: "skipped", last_error: "Preference, account, saved job or listing changed" });
        summary.skipped++; continue;
      }
      if (sendWindowExpired(row.send_started_at)) {
        await finish({ status: "failed", last_error: "Uncertain send beyond provider deduplication window; inspect email provider" });
        summary.failed++; continue;
      }
      const payload = row.send_payload || {
        to: user.email, subject: "An update about your saved job",
        html: wrapEmail(heading("A saved job is no longer listed on AYN")
          + para(`${escapeHtml(row.title)} at ${escapeHtml(row.company)} has left AYN's catalog.`)
          + para("The employer may have closed it, or the listing may have left our freshness window. This is not confirmation that hiring ended. Your saved job is still in AYN; check the employer's page before deciding what to do.")
          + para('<a href="https://ayn.careers/settings">Turn off saved job alerts in Settings → Email preferences</a>'),
          ["The AYN Team"], ctaButton("https://ayn.careers/#saved-jobs", "View saved jobs")),
      };
      if (!row.send_payload) await finish({ send_payload: payload, send_started_at: new Date().toISOString() });
      const result = await sendBrandedEmail(payload.to, payload.subject, payload.html, `saved-job/${row.id}`);
      const { error: logError } = await admin.from("email_logs").insert({
        user_id: row.user_id, email_type: "saved_job_removed", recipient_email: payload.to,
        status: result.ok ? "sent" : "failed", error_message: result.ok ? null : String(result.error).slice(0,400),
        metadata: { resend_id: result.id || null, alert_id: row.id, attempt: row.attempts },
      });
      if (logError && logError.code !== "23505") throw logError;
      if (result.ok) {
        await finish({ status: "sent", sent_at: new Date().toISOString(), resend_id: result.id || null, last_error: null });
        summary.sent++;
      } else {
        const message = String(result.error || "Unknown email failure").slice(0,400);
        const failed = row.attempts >= 4 || permanentEmailError(message);
        await finish({ status: failed ? "failed" : "pending", last_error: message, next_attempt_at: retryAt(row.attempts) });
        if (failed) summary.failed++; else summary.retry++;
      }
    } catch (e) {
      const failed = row.attempts >= 4;
      await finish({ status: failed ? "failed" : "pending", last_error: String(e).slice(0,400), next_attempt_at: retryAt(row.attempts) });
      if (failed) summary.failed++; else summary.retry++;
    }
    await new Promise(resolve => setTimeout(resolve,600));
  }
  return summary;
}
