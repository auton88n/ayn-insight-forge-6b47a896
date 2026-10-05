// Sends the welcome email to every newly verified account, from the
// welcome_emails queue (see migration 20261005100000). Called every minute by
// pg_cron with the service-role key, and nothing else may call it.
//
// Safe to run repeatedly and from two places at once: rows are claimed with
// FOR UPDATE SKIP LOCKED, there is one row per account, and a row left behind
// by a crashed run becomes claimable again after ten minutes. A temporary
// failure is retried with a growing delay (5, 15, 60 minutes); a permanent
// one (a non-retryable 4xx) or the fourth failure stops the retries
// and shows up as "failed" in the admin panel, where it can be re-queued.
import { createClient } from "npm:@supabase/supabase-js@2.45.0";
import { wrapEmail, heading, para, ctaButton, escapeHtml, sendBrandedEmail } from "../_shared/emailTemplate.ts";
import { permanentEmailError, retryAt, sendWindowExpired } from "./reliability.ts";

const MAX_ATTEMPTS = 4;
const APP_URL = "https://ayn.careers/";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

function firstName(user: { email?: string; user_metadata?: Record<string, unknown> }): string {
  const meta = user.user_metadata || {};
  const full = String(meta.full_name || meta.name || "").trim();
  if (full) return full.split(/\s+/)[0];
  return "";
}

function seekerEmail(name: string, credits: number) {
  const hi = name ? `Hi ${escapeHtml(name)},` : "Hi,";
  const creditLine = credits > 0
    ? ` You start with ${credits} free credits for tailored resumes and cover letters.`
    : "";
  const html = wrapEmail(
    heading("Welcome to AYN") +
      para(hi) +
      para(`Your account is ready.${creditLine}`) +
      para("Three good places to start:") +
      para("1. Add your resume, or build one from scratch. Everything AYN writes for you is built only from your real history.") +
      para("2. Browse real jobs. Every listing comes from a company's own career page, never a job board scrape.") +
      para("3. Open a job and see how well you match, then tailor your resume and write a cover letter for it.") +
      para("If you want employers to find you, you can switch on discoverability in your profile at any time. It is off until you choose.", { muted: true, marginTop: 8 }),
    ["Sincerely,", "The AYN Team"],
    ctaButton(APP_URL, "Open AYN"),
  );
  return { subject: "Welcome to AYN", html };
}

function employerEmail(name: string) {
  const hi = name ? `Hi ${escapeHtml(name)},` : "Hi,";
  const html = wrapEmail(
    heading("Thanks for applying to AYN") +
      para(hi) +
      para("We have your company application. We review every company by hand before it can search for candidates, so you will not be able to search yet.") +
      para("We will email you as soon as the review is done. After approval, you describe a role once and AYN returns the strongest candidates who chose to be found, with the evidence behind each match.") +
      para("Candidate contact details are only shared when a candidate accepts your proposal.", { muted: true, marginTop: 8 }),
    ["Sincerely,", "The AYN Team"],
    ctaButton(APP_URL + "employers", "See how it works"),
  );
  return { subject: "Thanks for applying to AYN", html };
}

Deno.serve(async (req) => {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return json({ error: "not configured" }, 500);
  if (req.headers.get("Authorization") !== `Bearer ${key}`) return json({ error: "unauthorized" }, 401);

  const admin = createClient(url, key, { auth: { persistSession: false } });
  const { data: claimed, error: claimError } = await admin.rpc("claim_welcome_emails", { p_limit: 10 });
  if (claimError) return json({ error: claimError.message }, 500);

  const summary = { claimed: (claimed || []).length, sent: 0, failed: 0, retry: 0, skipped: 0 };

  for (const row of (claimed || []) as { user_id: string; attempts: number }[]) {
    const userId = row.user_id;
    const finish = async (patch: Record<string, unknown>) => {
      const { data, error } = await admin.from("welcome_emails").update(patch)
        .eq("user_id", userId).eq("attempts", row.attempts).eq("status", "sending")
        .select("user_id").maybeSingle();
      if (error || !data) throw new Error(error?.message || "Welcome claim lost");
    };

    try {
      if (row.attempts > MAX_ATTEMPTS) {
        await finish({ status: "failed", last_error: "Retry limit reached; check provider before resending" });
        summary.failed++;
        continue;
      }
      const { data: found, error: userError } = await admin.auth.admin.getUserById(userId);
      if (userError) throw userError;
      const user = found?.user;
      if (!user?.email || user.email.endsWith("@erased.invalid") || user.banned_until) {
        await finish({ status: "skipped", skipped_reason: "account missing, erased or suspended" });
        summary.skipped++;
        continue;
      }

      const [{ data: employer, error: employerError }, { data: ledger, error: ledgerError }] = await Promise.all([
        admin.from("employer_accounts").select("status").eq("user_id", userId).maybeSingle(),
        admin.from("credit_ledger").select("delta").eq("user_id", userId),
      ]);
      if (employerError || ledgerError) throw employerError || ledgerError;
      const credits = (ledger || []).reduce((n: number, r: { delta: number }) => n + (r.delta || 0), 0);
      const name = firstName(user);
      const { subject, html } = employer ? employerEmail(name) : seekerEmail(name, credits);

      const { data: request, error: requestError } = await admin.from("welcome_emails")
        .select("send_key, send_payload, send_started_at").eq("user_id", userId).single();
      if (requestError) throw requestError;
      if (sendWindowExpired(request.send_started_at)) {
        await finish({ status: "failed", last_error: "Send outcome uncertain: retry window expired. Check provider before resending." });
        summary.failed++;
        continue;
      }
      const payload = request.send_payload || { to: user.email, subject, html, audience: employer ? "employer" : "job_seeker" };
      if (!request.send_payload) {
        await finish({ send_payload: payload, send_started_at: new Date().toISOString() });
      }
      const result = await sendBrandedEmail(payload.to, payload.subject, payload.html, `welcome/${request.send_key}`);

      if (result.ok) {
        const { error: logError } = await admin.from("email_logs").insert({
          user_id: userId, email_type: "welcome", recipient_email: payload.to, status: "sent",
          metadata: { resend_id: result.id ?? null, audience: payload.audience },
        });
        if (logError && logError.code !== '23505') throw logError;
        await finish({ status: "sent", sent_at: new Date().toISOString(), resend_id: result.id ?? null, last_error: null });
        summary.sent++;
      } else {
        const error = String(result.error || "unknown error").slice(0, 400);
        const permanent = permanentEmailError(error);
        const exhausted = row.attempts >= MAX_ATTEMPTS;
        const { error: logError } = await admin.from("email_logs").insert({
          user_id: userId, email_type: "welcome", recipient_email: user.email, status: "failed", error_message: error,
          metadata: { attempt: row.attempts },
        });
        if (logError) throw logError;
        if (permanent || exhausted) {
          await finish({ status: "failed", last_error: error });
          summary.failed++;
        } else {
          await finish({ status: "pending", last_error: error, next_attempt_at: retryAt(row.attempts) });
          summary.retry++;
        }
      }
    } catch (e) {
      const error = String((e as Error).message || e).slice(0, 400);
      try {
        await finish({ status: row.attempts >= MAX_ATTEMPTS ? "failed" : "pending", last_error: error, next_attempt_at: retryAt(row.attempts) });
      } catch {
        return json({ error: "Could not persist welcome outcome; claim will recover after lease expiry" }, 503);
      }
      if (row.attempts >= MAX_ATTEMPTS) summary.failed++;
      else summary.retry++;
    }
    // Stay under the email provider's rate limit.
    await new Promise((r) => setTimeout(r, 600));
  }

  return json(summary);
});
