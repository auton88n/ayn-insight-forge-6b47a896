// v3.14.0 — billing client. Seekers spend credits on tailored resumes (2)
// and cover letters (1). Everything else (scoring, Ask AYN, the extension,
// the profile, discovery, proposals, assessments, downloads) is free on
// every plan and is never metered. Employers are metered on proposals and
// assessments only. Payments are not wired yet, so upgrading records an
// intent and the team follows up.
import { supabase } from "@/integrations/supabase/client";
import { SUPABASE_URL } from "@/config";

const FN = `${SUPABASE_URL}/functions/v1/resume-hub`;

// v3.313.0 — real, reported bug: a stale access token after the tab sat
// idle/backgrounded a while produces a genuine 401 here too, same as
// resumeHub.ts's own identical fix (see that file's own comment for the
// full root cause). Shared by call() and stripeCall() below, this file's
// own two separate hand-rolled fetch functions.
function looksLikeExpiredJwt(status: number, data: unknown): boolean {
  if (status !== 401) return false;
  const coded = data as { code?: string; message?: string; error?: string };
  return coded?.code === "PGRST301" || /jwt|invalid session|invalid token/i.test(String(coded?.message || coded?.error || ""));
}

async function call<T>(body: unknown): Promise<T> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Not signed in");
  const headers = {
    Authorization: `Bearer ${token}`,
    apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string,
    "Content-Type": "application/json",
  };
  const r = await fetch(FN, { method: "POST", headers, body: JSON.stringify(body) });
  const text = await r.text();
  let parsed: unknown;
  try { parsed = JSON.parse(text); } catch { parsed = { error: text }; }

  if (!r.ok && looksLikeExpiredJwt(r.status, parsed)) {
    const { data: refreshed, error: refreshErr } = await supabase.auth.refreshSession();
    if (!refreshErr && refreshed.session) {
      const retryHeaders = { ...headers, Authorization: `Bearer ${refreshed.session.access_token}` };
      const r2 = await fetch(FN, { method: "POST", headers: retryHeaders, body: JSON.stringify(body) });
      const text2 = await r2.text();
      let parsed2: unknown;
      try { parsed2 = JSON.parse(text2); } catch { parsed2 = { error: text2 }; }
      if (r2.ok) return parsed2 as T;
      throw new Error((parsed2 as { error?: string })?.error || `Request failed (${r2.status})`);
    }
  }
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
  // v3.253.0 -- plans_list now selects this real column too (it always
  // existed on employer plan rows, just wasn't in this response before).
  searches_limit: number | null;
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
  plan: { key: string; name: string; price_cents: number; interval: string; proposals_limit: number | null; assessments_limit: number | null; searches_limit: number | null };
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
  status: "pending_approval" | "approved" | "declined" | "suspended";
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
    searches_used: number; searches_limit: number | null; period_end: string;
  } | null;
};

export type Invoice = {
  id: string;
  number: string | null;
  status: string | null;
  amount_paid: number;
  amount_due: number;
  currency: string;
  created: number;
  hosted_invoice_url: string | null;
  invoice_pdf: string | null;
};

export type StripeSubscriptionState = {
  id: string;
  status: string;
  cancel_at_period_end: boolean;
  current_period_end: number | null;
  price_id: string | null;
};

async function stripeCall<T>(body: unknown): Promise<T> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Not signed in");
  const headers = {
    Authorization: `Bearer ${token}`,
    apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string,
    "Content-Type": "application/json",
  };
  const STRIPE_FN = `${SUPABASE_URL}/functions/v1/stripe-billing`;
  const r = await fetch(STRIPE_FN, { method: "POST", headers, body: JSON.stringify(body) });
  const out = await r.json().catch(() => ({}));

  if (!r.ok && looksLikeExpiredJwt(r.status, out)) {
    const { data: refreshed, error: refreshErr } = await supabase.auth.refreshSession();
    if (!refreshErr && refreshed.session) {
      const retryHeaders = { ...headers, Authorization: `Bearer ${refreshed.session.access_token}` };
      const r2 = await fetch(STRIPE_FN, { method: "POST", headers: retryHeaders, body: JSON.stringify(body) });
      const out2 = await r2.json().catch(() => ({}));
      if (r2.ok) return out2 as T;
      throw new Error(out2?.error || `Request failed (${r2.status})`);
    }
  }
  if (!r.ok) throw new Error(out?.error || `Request failed (${r.status})`);
  return out as T;
}

export const billingApi = {
  plans: () => call<{ plans: Plan[] }>({ action: "plans_list" }).then(r => r.plans),
  seeker: () => call<SeekerBilling>({ action: "billing_get" }),
  employer: (org_id: string) => call<EmployerBilling>({ action: "employer_billing_get", org_id }),
  upgradeIntent: (plan_key: string, note?: string) =>
    call<{ ok: boolean; plan: string; message: string }>({ action: "billing_upgrade_intent", plan_key, note }),
  checkout: async (plan_key: string) => {
    const out = await stripeCall<{ url?: string }>({ action: "checkout", plan_key });
    if (!out?.url) throw new Error("Could not start checkout");
    return out.url;
  },
  portal: async () => {
    const out = await stripeCall<{ url?: string }>({ action: "portal" });
    if (!out?.url) throw new Error("Could not open billing");
    return out.url;
  },

  // v3.30.0 — cancel from inside the product. Takes effect at the end of the
  // period already paid for. Nothing is refunded.
  cancel: () => stripeCall<{ ok: true; cancel_at_period_end: boolean; current_period_end: number | null }>({ action: "cancel" }),

  // v3.34.0 — the rest of the self service set: undo a cancellation, move down
  // a tier or all the way to Free, and read the receipts.
  resume: () => stripeCall<{ ok: true; cancel_at_period_end: false }>({ action: "resume" }),
  changePlan: (plan_key: string) =>
    stripeCall<{ ok?: boolean; needs_checkout?: boolean; moved_to?: string; cancel_at_period_end?: boolean; current_period_end?: number | null }>(
      { action: "change_plan", plan_key },
    ),
  state: () => stripeCall<{ subscription: StripeSubscriptionState | null }>({ action: "state" }),
  invoices: () => stripeCall<{ invoices: Invoice[] }>({ action: "invoices" }).then(r => r.invoices),





  adminEmployers: () => call<{ employers: AdminEmployerRow[] }>({ action: "admin_employer_list" }).then(r => r.employers),
  adminDecide: (user_id: string, decision: "approve" | "decline" | "suspend", note?: string) =>
    call<{ ok: boolean; status: string }>({ action: "admin_employer_decide", user_id, decision, note }),
};

export const priceLabel = (cents: number, interval: string) =>
  cents === 0 ? "Free" : `$${(cents / 100).toFixed(cents % 100 === 0 ? 0 : 2)} / ${interval}`;
