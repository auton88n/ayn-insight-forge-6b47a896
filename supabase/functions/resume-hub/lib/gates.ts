// v3.131.0 — stage 2 of the resume-hub reorganization. Every "can this
// request proceed" gate: platform kill switches, per-account suspension and
// capability restrictions, the extension minimum-version check, and rate
// limiting. Pure code movement from index.ts, zero logic changes — verified
// via a real deploy plus live calls through every gate this pass touches.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.45.0";
import { json } from "./utils.ts";

// ─────────────────────────────────────────────────────────────
// v3.24.0 MAINTENANCE SWITCHES
// The admin panel writes system_config.feature_flags. Every action that
// spends money or touches the marketplace asks here first, so turning a
// switch off actually stops the work, not just the button.
// ─────────────────────────────────────────────────────────────
export type FeatureKey = "platform" | "candidate_search" | "proposals" | "assessments" | "tailoring" | "signups";

let flagCache: { at: number; flags: Record<string, boolean>; messages: Record<string, string> } | null = null;

export async function readFlags(admin: SupabaseClient<any, any, any>) {
  if (flagCache && Date.now() - flagCache.at < 30_000) return flagCache;
  try {
    // get_feature_flags is the same reader the frontend uses, so the server and
    // the screen can never disagree about what is switched off.
    const { data, error } = await admin.rpc("get_feature_flags");
    if (error) throw error;
    const d = (data || {}) as { flags?: Record<string, boolean>; messages?: Record<string, string> };
    flagCache = { at: Date.now(), flags: d.flags || {}, messages: d.messages || {} };
  } catch {
    // A read failure must never take the product down.
    flagCache = { at: Date.now(), flags: {}, messages: {} };
  }
  return flagCache;
}

const MAINTENANCE_FALLBACK: Record<FeatureKey, string> = {
  platform: "AYN is under maintenance right now. We are back shortly.",
  candidate_search: "Candidate search is paused for maintenance.",
  proposals: "Sending proposals is paused for maintenance.",
  assessments: "Assessments are paused for maintenance.",
  tailoring: "Tailored resumes and cover letters are paused for maintenance. No credits are being spent.",
  signups: "New accounts are paused for maintenance.",
};

/** Which switch owns which action. Anything absent is only gated by platform. */
export const ACTION_FLAG: Record<string, FeatureKey> = {
  employer_spec_extract: "candidate_search",
  employer_skill_catalog: "candidate_search",
  employer_match: "candidate_search",
  employer_draft_proposal: "proposals",
  employer_reveal_request: "proposals",
  employer_assessment_generate: "assessments",
  employer_assessment_send: "assessments",
  assessment_start: "assessments",
  assessment_answer: "assessments",
  assessment_submit: "assessments",
  tailor: "tailoring",
  cover_letter: "tailoring",
};

/**
 * Returns a 503 Response when the feature (or the whole platform) is off,
 * otherwise null. Callers do: const off = await featureGate(admin, 'x'); if (off) return off;
 */
export async function featureGate(
  admin: SupabaseClient<any, any, any>,
  key: FeatureKey,
): Promise<Response | null> {
  const f = await readFlags(admin);
  for (const k of ["platform", key] as FeatureKey[]) {
    if (f.flags[k] === false) {
      return json({
        code: "feature_disabled",
        error: "maintenance",
        feature: k,
        message: (f.messages[k] || "").trim() || MAINTENANCE_FALLBACK[k],
      }, 503);
    }
  }
  return null;
}


// ─────────────────────────────────────────────────────────────
// v3.28.0 ACCOUNT MODERATION
// Same answer shape as the v3.25.0 maintenance gate, different codes.
// Order is deliberate: the global switch is checked first (above), then the
// account suspension, then the one capability the account is restricted from.
// ─────────────────────────────────────────────────────────────
export type AccountCapability = "discovery" | "proposals" | "assessments" | "ai";

/** Which capability an action needs. Anything absent needs none. */
export const ACTION_CAPABILITY: Record<string, AccountCapability> = {
  employer_draft_proposal: "proposals",
  employer_reveal_request: "proposals",
  employer_assessment_generate: "assessments",
  employer_assessment_send: "assessments",
  tailor: "ai",
  cover_letter: "ai",
  score: "ai",
  application_answer_match: "ai",
  auto_apply_extract: "ai",
  auto_apply_fill: "ai",
};

export const RESTRICTION_MESSAGE: Record<AccountCapability, string> = {
  discovery: "Your profile has been removed from the talent pool by an administrator.",
  proposals: "Sending proposals is switched off for this account by an administrator.",
  assessments: "Assessments are switched off for this account by an administrator.",
  ai: "AI features are switched off for this account by an administrator.",
};

/** True when this person cannot appear in the talent pool. */
export async function discoveryRestriction(
  admin: SupabaseClient<any, any, any>,
  userId: string,
): Promise<{ restricted: boolean; reason: string }> {
  const { data } = await admin.from("account_restrictions")
    .select("reason").eq("user_id", userId).eq("capability", "discovery").maybeSingle();
  return { restricted: !!data, reason: (data as { reason?: string } | null)?.reason || "" };
}

/** Every user id in the given list that is restricted from discovery. */
export async function discoveryRestrictedIds(
  admin: SupabaseClient<any, any, any>,
  ids: string[],
): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  const { data } = await admin.from("account_restrictions")
    .select("user_id").eq("capability", "discovery").in("user_id", ids);
  return new Set((data || []).map((r: { user_id: string }) => r.user_id));
}

export async function accountGate(
  admin: SupabaseClient<any, any, any>,
  userId: string,
  action: string,
): Promise<Response | null> {
  const [{ data: susp }, { data: restrictions }] = await Promise.all([
    admin.from("account_suspensions")
      .select("reason, until, suspended_at").eq("user_id", userId).eq("active", true).maybeSingle(),
    admin.from("account_restrictions").select("capability, reason").eq("user_id", userId),
  ]);

  if (susp) {
    const until = (susp as { until?: string }).until;
    return json({
      code: "account_suspended",
      error: "account_suspended",
      reason: (susp as { reason?: string }).reason || "",
      until: until || null,
      message: until
        ? `This account is suspended until ${new Date(until).toLocaleDateString("en-CA")}. Contact support if you think this is wrong.`
        : "This account is suspended. Contact support if you think this is wrong.",
    }, 403);
  }

  const needed = ACTION_CAPABILITY[action];
  if (!needed) return null;
  const hit = (restrictions || []).find((r: { capability: string }) => r.capability === needed);
  if (!hit) return null;
  return json({
    code: "account_restricted",
    error: "account_restricted",
    capability: needed,
    reason: (hit as { reason?: string }).reason || "",
    message: RESTRICTION_MESSAGE[needed],
  }, 403);
}


// ─────────────────────────────────────────────────────────────
// v3.131.0 RATE LIMITING — closes a real, previously-documented gap
// (blueprint.md: "the tables existing is not evidence that throttling is
// happening"). Wraps the already-existing, already-secure, service-role-only
// check_api_rate_limit() SQL function (a real sliding-window limiter with
// its own atomic upsert and admin-visible violation logging) rather than
// building a second mechanism. Limits are deliberately generous — high
// enough that no real human doing real work should ever see one — this is
// an abuse backstop, not a feature restriction.
export async function rateLimitGate(
  admin: SupabaseClient<any, any, any>,
  userId: string,
  endpoint: string,
  maxRequests: number,
  windowMinutes: number,
): Promise<Response | null> {
  const { data, error } = await admin.rpc("check_api_rate_limit", {
    p_user_id: userId, p_endpoint: endpoint, p_max_requests: maxRequests, p_window_minutes: windowMinutes,
  });
  // Fails open: a rate-limit-check failure should never block a real action.
  if (error || !data || !data[0]) return null;
  const row = data[0] as { allowed: boolean; retry_after_seconds: number };
  if (row.allowed) return null;
  return json({
    code: "rate_limited",
    error: "rate_limited",
    message: "You're doing that faster than a real person would. Try again in a minute.",
    retry_after_seconds: row.retry_after_seconds,
  }, 429);
}
