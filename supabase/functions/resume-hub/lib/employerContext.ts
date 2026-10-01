// v3.324.0 — extracted from index.ts (was a set of closures defined inline
// inside the Deno.serve dispatcher, reading admin/userId/action from the
// outer request scope) as the first stage of splitting the ~58-action,
// 3,500+ line dispatcher into per-domain files. These three checks --
// "is this account an approved employer," "is this caller a member of
// this org," "is this org's own profile complete enough to search or
// contact a candidate" -- gate every employer action that touches a
// candidate, and are needed by handler files across several domains
// (org/intake, candidate search, proposals, assessments), so they live
// here rather than in any one domain file.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.45.0";
import { json } from "./utils.ts";
import { logSecurityEvent, shouldEscalate } from "./gates.ts";

// v3.129.0 — every employer action was once gated only on org membership,
// never on employer_accounts.status. "A UI-only gate is not a gate" (the
// same principle assertOrgProfileComplete's own history already named for
// the company-profile check) applied here too, and the admin approval
// queue itself had the identical gap: any signed-in user, including a
// plain job seeker, could call employer_org_create directly and reach the
// real candidate pool with zero admin approval. Fixed at the one place
// every org-scoped action already funnels through -- assertOrgMember.
export async function isApprovedEmployer(admin: SupabaseClient, userId: string, action: string): Promise<boolean> {
  const { data } = await admin.from("employer_accounts")
    .select("status").eq("user_id", userId).maybeSingle();
  const status = (data as { status?: string } | null)?.status ?? null;
  const approved = status === "approved";
  // Deliberately low severity: a not-yet-approved employer hitting a
  // gated action is routine onboarding, not an attack signal.
  if (!approved) await logSecurityEvent(admin, userId, "employer_gate_denied", "low", { action, status });
  return approved;
}

export async function assertOrgMember(admin: SupabaseClient, userId: string, action: string, orgId: string): Promise<boolean> {
  const { data } = await admin.from("org_members")
    .select("org_id").eq("org_id", orgId).eq("user_id", userId).maybeSingle();
  if (!data) {
    // This is the real cross-tenant shape: a signed-in employer
    // reaching for an org they are not a member of. This exact class
    // of bug was a confirmed critical vulnerability once already in
    // this app's history (org_members_insert_self) — worth a high
    // severity, real-time alert on its own, not just aggregate counts.
    // Escalation throttled per (user, reason), same as
    // admin_action_denied — the record is never dropped, only the
    // immediate email is capped to once per window.
    const escalate = await shouldEscalate(admin, userId, "org_member_denied");
    await logSecurityEvent(admin, userId, "org_member_denied", escalate ? "high" : "medium", { action, org_id: orgId });
    return false;
  }
  return await isApprovedEmployer(admin, userId, action);
}

// v3.10.0 — the company profile a candidate reads on a proposal.
export const ORG_COLS = "id, name, website, industry, company_size, headquarters, about, logo_url, linkedin_url";

// v3.11.0 — the company profile gate. A UI-only gate is not a gate, so
// every action that searches for or contacts a candidate checks here too.
export const REQUIRED_ORG_FIELDS: [string, string][] = [
  ["name", "company name"],
  ["website", "website"],
  ["industry", "industry"],
  ["headquarters", "headquarters"],
  ["company_size", "company size"],
  ["about", "about paragraph"],
];
export const ABOUT_MIN = 80;

/** Returns an error response when the org profile is incomplete, else null. */
export async function assertOrgProfileComplete(admin: SupabaseClient, orgId: string): Promise<Response | null> {
  const { data: org } = await admin.from("orgs")
    .select(ORG_COLS).eq("id", orgId).maybeSingle();
  if (!org) return json({ error: "org not found" }, 404);
  const missing: string[] = [];
  for (const [key, label] of REQUIRED_ORG_FIELDS) {
    const v = String((org as Record<string, unknown>)[key] ?? "").trim();
    if (!v || (key === "about" && v.length < ABOUT_MIN)) missing.push(label);
  }
  if (missing.length === 0) return null;
  return json({
    error: `Complete your company profile first. Still missing: ${missing.join(", ")}. Candidates see this on every proposal.`,
    missing_org_fields: missing,
  }, 428);
}
