// v3.325.0 — extracted from index.ts, part of the ~58-action dispatcher
// split into per-domain files (continuing stage 12-14's pattern). Plans,
// seeker/employer billing summaries, upgrade intent, and the admin
// employer-approval-queue actions (list + decide). Pure code movement,
// zero logic changes — every line below is byte-for-byte the same as the
// original inline `if (action === "...")` block, just wrapped in an
// exported function taking ActionCtx instead of closing over index.ts's
// own dispatcher scope.
import type { ActionCtx } from "./actionCtx.ts";
import { json } from "./utils.ts";
import { COST_TAILOR, COST_COVER, EMPLOYER_SEARCH_SOFT_CAP, billingEnsure, creditBalance, employerBilling, effectiveLimit } from "./billing.ts";

export async function handlePlansList(ctx: ActionCtx): Promise<Response> {
  // v3.253.0 -- searches_limit was missing from this SELECT even though
  // it's a real column on every employer plan row (employer_billing_get
  // already reads it, just never this generic list action) -- the
  // employer dashboard's own Features & pricing tab needs real per-plan
  // search limits, not a hardcoded guess.
  const { data } = await ctx.admin.from("plans")
    .select("key, audience, name, price_cents, interval, credits, proposals_limit, assessments_limit, searches_limit, sort")
    .eq("active", true).order("sort");
  return json({ plans: data || [] });
}

// Seeker: plan, balance, renewal date, recent ledger.
export async function handleBillingGet(ctx: ActionCtx): Promise<Response> {
  const sub = await billingEnsure(ctx.admin, ctx.userId, "seeker");
  const [{ data: plan }, balance, { data: ledger }] = await Promise.all([
    ctx.admin.from("plans").select("key, name, price_cents, interval, credits")
      .eq("key", sub?.plan_key || "seeker_free").maybeSingle(),
    creditBalance(ctx.admin, ctx.userId),
    ctx.admin.from("credit_ledger").select("delta, reason, balance_after, created_at")
      .eq("user_id", ctx.userId).order("created_at", { ascending: false }).limit(20),
  ]);
  return json({
    plan: plan || null,
    status: sub?.status || "active",
    balance,
    current_period_end: sub?.current_period_end || null,
    costs: { tailored_resume: COST_TAILOR, cover_letter: COST_COVER },
    ledger: ledger || [],
  });
}

// Employer: plan, what is used this period, trial end.
export async function handleEmployerBillingGet(ctx: ActionCtx): Promise<Response> {
  const { org_id } = ctx.payload as { org_id?: string };
  if (!org_id) return json({ error: "org_id required" }, 400);
  if (!(await ctx.assertOrgMember(org_id))) return json({ error: "not an org member" }, 403);
  const b = await employerBilling(ctx.admin, ctx.userId, org_id);
  // v3.29.0 — the surface reads the limits actually in force, not the raw plan.
  return json({
    ...b,
    plan: {
      ...b.plan,
      proposals_limit: effectiveLimit(b, "proposal").limit,
      assessments_limit: effectiveLimit(b, "assessment").limit,
      searches_limit: effectiveLimit(b, "search").limit,
    },
    plan_limits: {
      proposals_limit: b.plan.proposals_limit,
      assessments_limit: b.plan.assessments_limit,
      searches_limit: b.plan.searches_limit,
    },
    overridden: !!b.override,
    search_soft_cap: EMPLOYER_SEARCH_SOFT_CAP,
  });
}

// Payments are not wired yet, so an upgrade records intent and the team follows up.
export async function handleBillingUpgradeIntent(ctx: ActionCtx): Promise<Response> {
  const { plan_key, note } = ctx.payload as { plan_key?: string; note?: string };
  if (!plan_key) return json({ error: "plan_key required" }, 400);
  const { data: plan } = await ctx.admin.from("plans").select("key, name").eq("key", plan_key).maybeSingle();
  if (!plan) return json({ error: "unknown plan" }, 404);
  await ctx.admin.from("upgrade_intents").insert({
    user_id: ctx.userId, plan_key, note: String(note || "").slice(0, 500) || null,
  });
  return json({ ok: true, plan: plan.name, message: "Thanks. We will be in touch to set up billing." });
}

// ---- Admin: employer access requests ----
export async function handleAdminEmployerList(ctx: ActionCtx): Promise<Response> {
  if (!(await ctx.isPlatformAdmin())) return json({ error: "admin only" }, 403);
  const { data: accounts } = await ctx.admin.from("employer_accounts")
    .select("id, user_id, company_name, status, created_at, approved_at, package_notes, position_title, phone, company_website, company_address, company_country")
    .order("created_at", { ascending: false }).limit(200);
  const ids = (accounts || []).map(a => a.user_id);
  const [{ data: profiles }, { data: members }, { data: subs }] = await Promise.all([
    ids.length ? ctx.admin.from("profiles").select("user_id, email, full_name").in("user_id", ids) : { data: [] },
    ids.length ? ctx.admin.from("org_members").select("user_id, org_id").in("user_id", ids) : { data: [] },
    ids.length ? ctx.admin.from("subscriptions").select("user_id, plan_key, status, current_period_start, current_period_end, trial_ends_at").in("user_id", ids) : { data: [] },
  ]);
  const orgIds = [...new Set((members || []).map(m => m.org_id))];
  const { data: orgs } = orgIds.length
    ? await ctx.admin.from("orgs").select("id, name, website, industry, company_size, headquarters, about").in("id", orgIds)
    : { data: [] };
  const orgByUser = new Map((members || []).map(m => [m.user_id, (orgs || []).find(o => o.id === m.org_id) || null]));
  const profByUser = new Map((profiles || []).map(p => [p.user_id, p]));
  const subByUser = new Map((subs || []).map(s => [s.user_id, s]));

  const rows = [];
  for (const a of (accounts || [])) {
    const org = orgByUser.get(a.user_id) as Record<string, unknown> | null;
    const sub = subByUser.get(a.user_id) || null;
    let usage = null;
    if (org?.id && sub) {
      const b = await employerBilling(ctx.admin, a.user_id, String(org.id));
      usage = {
        plan: b.plan.name, proposals_used: b.proposals_used, proposals_limit: effectiveLimit(b, "proposal").limit,
        assessments_used: b.assessments_used, assessments_limit: effectiveLimit(b, "assessment").limit,
        searches_used: b.searches_used, searches_limit: effectiveLimit(b, "search").limit,
        overridden: !!b.override,
        period_end: b.current_period_end,

      };
    }
    rows.push({
      id: a.id, user_id: a.user_id, status: a.status,
      company_name: org?.name || a.company_name,
      website: org?.website || null, industry: org?.industry || null,
      company_size: org?.company_size || null, headquarters: org?.headquarters || null,
      about: org?.about || null,
      email: profByUser.get(a.user_id)?.email || null,
      contact_name: profByUser.get(a.user_id)?.full_name || null,
      requested_at: a.created_at, approved_at: a.approved_at,
      note: a.package_notes,
      subscription: sub, usage,
      // v3.163.0 — collected and checked at signup (handle_new_user_profile),
      // surfaced here so approval is an informed decision, not a blind one.
      verification: {
        position: a.position_title, phone: a.phone,
        website: a.company_website, address: a.company_address,
        country: a.company_country,
      },
    });
  }
  return json({ employers: rows });
}

export async function handleAdminEmployerDecide(ctx: ActionCtx): Promise<Response> {
  if (!(await ctx.isPlatformAdmin())) return json({ error: "admin only" }, 403);
  const { user_id, decision, note } = ctx.payload as { user_id?: string; decision?: string; note?: string };
  if (!user_id || !["approve", "decline", "suspend"].includes(String(decision))) {
    return json({ error: "user_id and a decision of approve, decline or suspend are required" }, 400);
  }
  // Declined and suspended are different things: declined never got in,
  // suspended was approved and then stopped.
  const status = decision === "approve" ? "approved" : decision === "decline" ? "declined" : "suspended";

  const { error } = await ctx.admin.from("employer_accounts").update({
    status,
    approved_at: decision === "approve" ? new Date().toISOString() : null,
    approved_by: ctx.userId,
    package_notes: String(note || "").slice(0, 500) || null,
  }).eq("user_id", user_id);
  if (error) return json({ error: error.message }, 500);
  // Approval starts the free month automatically.
  if (decision === "approve") await billingEnsure(ctx.admin, user_id, "employer");
  return json({ ok: true, status });
}
