// v3.14.0 — billing client. Seekers spend credits on tailored resumes (2)
// and cover letters (1). Everything else (scoring, Ask AYN, the extension,
// the profile, discovery, proposals, assessments, downloads) is free on
// every plan and is never metered. Employers are metered on proposals and
// assessments only. Payments are not wired yet, so upgrading records an
// intent and the team follows up.
import { supabase } from "@/integrations/supabase/client";
import { SUPABASE_URL } from "@/config";

const FN = `${SUPABASE_URL}/functions/v1/resume-hub`;

async function call<T>(body: unknown): Promise<T> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Not signed in");
  const r = await fetch(FN, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const text = await r.text();
  let parsed: unknown;
  try { parsed = JSON.parse(text); } catch { parsed = { error: text }; }
  if (!r.ok) throw new Error((parsed as { error?: string })?.error || `Request failed (${r.status})`);
  return parsed as T;
}

export type Plan = {
  key: string;
  audience: "seeker" | "employer";
  name: string;
  price_cents: number;
  interval: "month" | "week";
  credits: number | null;
  proposals_limit: number | null;
  assessments_limit: number | null;
};

export type SeekerBilling = {
  plan: { key: string; name: string; price_cents: number; interval: string; credits: number | null } | null;
  status: string;
  balance: number;
  current_period_end: string | null;
  costs: { tailored_resume: number; cover_letter: number };
  ledger: Array<{ delta: number; reason: string; balance_after: number; created_at: string }>;
};

export type EmployerBilling = {
  plan: { key: string; name: string; price_cents: number; interval: string; proposals_limit: number | null; assessments_limit: number | null };
  status: string;
  current_period_start: string;
  current_period_end: string;
  trial_ends_at: string | null;
  proposals_used: number;
  assessments_used: number;
  searches_used: number;
  search_soft_cap: number;
};

export type AdminEmployerRow = {
  id: string;
  user_id: string;
  status: "pending_approval" | "approved" | "suspended";
  company_name: string | null;
  website: string | null;
  industry: string | null;
  company_size: string | null;
  headquarters: string | null;
  about: string | null;
  email: string | null;
  contact_name: string | null;
  requested_at: string;
  approved_at: string | null;
  note: string | null;
  subscription: { plan_key: string; status: string; current_period_end: string; trial_ends_at: string | null } | null;
  usage: {
    plan: string;
    proposals_used: number; proposals_limit: number | null;
    assessments_used: number; assessments_limit: number | null;
    searches_used: number; period_end: string;
  } | null;
};

export const billingApi = {
  plans: () => call<{ plans: Plan[] }>({ action: "plans_list" }).then(r => r.plans),
  seeker: () => call<SeekerBilling>({ action: "billing_get" }),
  employer: (org_id: string) => call<EmployerBilling>({ action: "employer_billing_get", org_id }),
  upgradeIntent: (plan_key: string, note?: string) =>
    call<{ ok: boolean; plan: string; message: string }>({ action: "billing_upgrade_intent", plan_key, note }),
  adminEmployers: () => call<{ employers: AdminEmployerRow[] }>({ action: "admin_employer_list" }).then(r => r.employers),
  adminDecide: (user_id: string, decision: "approve" | "decline" | "suspend", note?: string) =>
    call<{ ok: boolean; status: string }>({ action: "admin_employer_decide", user_id, decision, note }),
};

export const priceLabel = (cents: number, interval: string) =>
  cents === 0 ? "Free" : `$${(cents / 100).toFixed(cents % 100 === 0 ? 0 : 2)} / ${interval}`;
