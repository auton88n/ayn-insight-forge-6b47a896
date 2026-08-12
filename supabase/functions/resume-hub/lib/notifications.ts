// v3.131.0 — stage 9 of the resume-hub reorganization: proposal/
// assessment notification emails. Best effort only, same rule as
// sendReceiptEmail in stripe-webhook: a Resend failure must never fail
// the action (proposal sent, assessment sent, decision recorded,
// assessment submitted) that triggered it. Pure code movement, zero
// logic changes.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.45.0";
import { wrapEmail, sendBrandedEmail } from "../../_shared/emailTemplate.ts";

// v3.44.0 — proposal/assessment notification emails. Best effort only,
// same rule as sendReceiptEmail in stripe-webhook: a Resend failure must
// never fail the action (proposal sent, assessment sent, decision
// recorded, assessment submitted) that triggered it.
export async function notifyCandidate(
  admin: SupabaseClient<any, any, any>,
  candidateUserId: string,
  subject: string,
  bodyHtml: string,
  emailType: string,
  ctaHtml?: string,
): Promise<void> {
  try {
    const { data: authUser } = await admin.auth.admin.getUserById(candidateUserId);
    const email = authUser?.user?.email;
    if (!email) return;
    const r = await sendBrandedEmail(email, subject, wrapEmail(bodyHtml, undefined, ctaHtml));
    if (!r.ok) console.error("[notifyCandidate] send failed", r.error);
    // v3.47.0 — so the admin panel's email log shows whether this actually sent.
    await admin.from("email_logs").insert({
      user_id: candidateUserId, email_type: emailType, recipient_email: email,
      status: r.ok ? "sent" : "failed", error_message: r.ok ? null : r.error,
    }).then(({ error }: { error: unknown }) => { if (error) console.error("[notifyCandidate] email_logs insert failed", error); });
  } catch (e) {
    console.error("[notifyCandidate] threw", e);
  }
}

// Notifies every member of an org, not just whoever is signed in right
// now — the schema supports multi-seat orgs even though production today
// is solo employers (see v3.29.0 note in docs/map/platform.md).
export async function notifyOrgMembers(
  admin: SupabaseClient<any, any, any>,
  orgId: string,
  subject: string,
  bodyHtml: string,
  emailType: string,
  ctaHtml?: string,
): Promise<void> {
  try {
    const { data: members } = await admin.from("org_members").select("user_id").eq("org_id", orgId);
    const ids = [...new Set((members || []).map(m => m.user_id).filter(Boolean))];
    const html = wrapEmail(bodyHtml, undefined, ctaHtml);
    await Promise.all(ids.map(async (uid) => {
      const { data: authUser } = await admin.auth.admin.getUserById(uid);
      const email = authUser?.user?.email;
      if (!email) return;
      const r = await sendBrandedEmail(email, subject, html);
      if (!r.ok) console.error("[notifyOrgMembers] send failed", r.error);
      await admin.from("email_logs").insert({
        user_id: uid, email_type: emailType, recipient_email: email,
        status: r.ok ? "sent" : "failed", error_message: r.ok ? null : r.error,
      }).then(({ error }: { error: unknown }) => { if (error) console.error("[notifyOrgMembers] email_logs insert failed", error); });
    }));
  } catch (e) {
    console.error("[notifyOrgMembers] threw", e);
  }
}
