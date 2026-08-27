// v3.131.0 — stage 10 of the resume-hub reorganization: billing and
// credits. Seeker credits (tailor/cover-letter/optimize) are metered by
// a real ledger sum (credit_ledger), never a bare counter — creditBalance
// always re-sums, creditSpend/creditRefund only ever insert a new signed
// row. Employer limits (proposals/assessments/searches) are per-period
// counts against the plan, with an optional per-account override
// (account_limit_overrides) where null means "fall back to the plan" and
// 0 is a real, deliberate zero — see effectiveLimit's own doc comment,
// the one place that distinction is decided. creditRefund has no caller
// anywhere in index.ts today (confirmed by grep before this move) —
// genuinely orphaned already, not something this move changed; exported
// here in case a future caller needs it, not re-imported below since
// nothing currently calls it. Pure code movement, zero logic changes.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.45.0";
import { json } from "./utils.ts";

// ══════════════════════════════════════════════════════════════
// v3.14.0 — BILLING
// Seeker credits: a tailored resume costs 2, a cover letter costs 1.
// Everything else (scoring, Ask AYN, the extension, the profile, talent
// pool discovery, proposals, assessments, downloads) is free on every
// tier and is never touched by this code. Cache hits cost nothing.
// Employer limits: proposals and assessments are metered per period,
// searching is unlimited with a soft abuse cap.
// Balances are the sum of credit_ledger rows, never a bare counter.
// ══════════════════════════════════════════════════════════════
export const COST_TAILOR = 2;
export const COST_COVER = 1;
export const COST_OPTIMIZE = 15;
// v3.265.0 -- auto-apply: real Playwright automation reading and filling a
// job's actual application form. Charged once per job on the first
// successful auto_apply_fill (see jobs.auto_apply_charged_at) -- the
// natural preview-then-confirm-submit flow calls this action twice per
// real application, and only the first counts.
export const COST_AUTO_APPLY = 5;
export const EMPLOYER_SEARCH_SOFT_CAP = 200;

export type Anyish = SupabaseClient<any, any, any>;

export async function billingEnsure(admin: Anyish, userId: string, audience: "seeker" | "employer" = "seeker") {
  const { data } = await admin.rpc("billing_ensure", { _user_id: userId, _audience: audience });
  return (Array.isArray(data) ? data[0] : data) as
    | { user_id: string; plan_key: string; status: string; current_period_start: string; current_period_end: string; trial_ends_at: string | null }
    | null;
}

export async function creditBalance(admin: Anyish, userId: string): Promise<number> {
  const { data } = await admin.rpc("credit_balance", { _user_id: userId });
  return Number(data ?? 0);
}

export async function creditSpend(admin: Anyish, userId: string, amount: number, reason: string, ref?: string) {
  const { data } = await admin.rpc("credit_spend", {
    _user_id: userId, _amount: amount, _reason: reason, _ref: ref ?? null,
  });
  return (data || { ok: false, balance: 0, cost: amount }) as { ok: boolean; balance: number; cost: number };
}

export async function creditRefund(admin: Anyish, userId: string, amount: number, reason: string, ref?: string) {
  try { await admin.rpc("credit_grant", { _user_id: userId, _amount: amount, _reason: reason, _ref: ref ?? null }); }
  catch (e) { console.error("credit refund failed", (e as Error).message); }
}

export function insufficientCredits(balance: number, cost: number, what: string): Response {
  return json({
    error: "insufficient_credits",
    code: "insufficient_credits",
    balance,
    cost,
    message: `A ${what} costs ${cost} ${cost === 1 ? "credit" : "credits"} and you have ${balance} left. Credits reset at the start of your next period.`,
  }, 402);
}

// Enough credit to run? Charge only after the generation succeeds.
export async function assertCredits(admin: Anyish, userId: string, cost: number, what: string): Promise<Response | null> {
  await billingEnsure(admin, userId, "seeker");
  const balance = await creditBalance(admin, userId);
  if (balance < cost) return insufficientCredits(balance, cost, what);
  return null;
}

export interface LimitOverride {
  proposals_limit: number | null;
  assessments_limit: number | null;
  searches_limit: number | null;
  monthly_credits: number | null;
  reason: string;
}

export interface EmployerBilling {
  plan: { key: string; name: string; price_cents: number; interval: string; proposals_limit: number | null; assessments_limit: number | null; searches_limit: number | null };
  /** v3.29.0 per account override. Null on a field means fall back to the plan, 0 is a real zero. */
  override: LimitOverride | null;
  status: string;
  current_period_start: string;
  current_period_end: string;
  trial_ends_at: string | null;
  proposals_used: number;
  assessments_used: number;
  searches_used: number;
}

/** The one place null versus zero is decided. Null override falls back to the plan. */
export function effectiveLimit(b: EmployerBilling, kind: "proposal" | "assessment" | "search"): { limit: number | null; overridden: boolean } {
  const planValue = kind === "proposal" ? b.plan.proposals_limit
    : kind === "assessment" ? b.plan.assessments_limit
    : b.plan.searches_limit;
  const ovValue = !b.override ? null
    : kind === "proposal" ? b.override.proposals_limit
    : kind === "assessment" ? b.override.assessments_limit
    : b.override.searches_limit;
  if (ovValue !== null && ovValue !== undefined) return { limit: ovValue, overridden: true };
  return { limit: planValue ?? null, overridden: false };
}

export async function employerBilling(admin: Anyish, userId: string, orgId: string): Promise<EmployerBilling> {
  const sub = await billingEnsure(admin, userId, "employer");
  const planKey = sub?.plan_key || "employer_trial";
  const { data: plan } = await admin.from("plans")
    .select("key, name, price_cents, interval, proposals_limit, assessments_limit, searches_limit").eq("key", planKey).maybeSingle();
  const { data: override } = await admin.from("account_limit_overrides")
    .select("proposals_limit, assessments_limit, searches_limit, monthly_credits, reason")
    .eq("user_id", userId).maybeSingle();
  const start = sub?.current_period_start || new Date(Date.now() - 30 * 86400000).toISOString();

  const [{ count: proposals }, { count: assessments }, { count: searches }] = await Promise.all([
    admin.from("reveal_requests").select("id", { count: "exact", head: true }).eq("org_id", orgId).gte("created_at", start),
    admin.from("assessments").select("id", { count: "exact", head: true }).eq("org_id", orgId).neq("status", "draft").gte("sent_at", start),
    admin.from("employer_searches").select("id", { count: "exact", head: true }).eq("org_id", orgId).gte("created_at", start),
  ]);

  return {
    plan: plan || { key: planKey, name: "Free month", price_cents: 0, interval: "month", proposals_limit: 5, assessments_limit: 3, searches_limit: 25 },
    override: (override as LimitOverride | null) || null,
    status: sub?.status || "trialing",
    current_period_start: start,
    current_period_end: sub?.current_period_end || new Date(Date.now() + 30 * 86400000).toISOString(),
    trial_ends_at: sub?.trial_ends_at || null,
    proposals_used: proposals || 0,
    assessments_used: assessments || 0,
    searches_used: searches || 0,
  };
}

export function planLimitReached(b: EmployerBilling, kind: "proposal" | "assessment" | "search"): Response | null {
  const { limit, overridden } = effectiveLimit(b, kind);
  const used = kind === "proposal" ? b.proposals_used
    : kind === "assessment" ? b.assessments_used
    : b.searches_used;
  if (limit === null || limit === undefined) return null;
  if (used < limit) return null;
  const noun = kind === "proposal" ? "proposals" : kind === "assessment" ? "assessments" : "candidate searches";
  const resets = new Date(b.current_period_end).toDateString();
  const message = overridden
    ? limit === 0
      ? `This account is set to 0 ${noun} per period. Contact support if you need that changed.`
      : `This account is set to ${limit} ${noun} per period and you have used all of them. Your period resets on ${resets}. Contact support if you need a higher number.`
    : `Your ${b.plan.name} plan includes ${limit} ${noun} per period and you have used all of them. Your period resets on ${resets}. Upgrade to ${kind === "search" ? "search more" : "send more"}.`;
  return json({
    error: "plan_limit_reached",
    code: "plan_limit_reached",
    kind,
    used,
    limit,
    overridden,
    plan: b.plan.name,
    message,
  }, 402);
}
