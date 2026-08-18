// Integration test helpers — real accounts, real HTTP calls against the
// live deployed backend, real cleanup afterward. This mirrors, verbatim,
// the manual verification technique this codebase's own history was built
// on (blueprint.md: "confirm a change by making it happen for real... not
// by reading the code and reasoning that it should work") — the only
// difference is these are now scripted and repeatable instead of one-off.
//
// Requires three env vars, none of which are committed anywhere:
//   SUPABASE_URL              — same value as src/config.ts
//   SUPABASE_ANON_KEY         — the public anon key (safe to expose, already is)
//   SUPABASE_SERVICE_ROLE_KEY — from the Supabase dashboard, NEVER commit this
// See tests/integration/README.md for how to supply them.

const SUPABASE_URL = process.env.SUPABASE_URL;
const ANON_KEY = process.env.SUPABASE_ANON_KEY;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export function requireTestEnv() {
  const missing = [
    !SUPABASE_URL && "SUPABASE_URL",
    !ANON_KEY && "SUPABASE_ANON_KEY",
    !SERVICE_ROLE_KEY && "SUPABASE_SERVICE_ROLE_KEY",
  ].filter(Boolean);
  if (missing.length) {
    throw new Error(
      `Integration tests need real Supabase credentials. Missing: ${missing.join(", ")}. ` +
      `See tests/integration/README.md.`,
    );
  }
  return { url: SUPABASE_URL!, anonKey: ANON_KEY!, serviceRoleKey: SERVICE_ROLE_KEY! };
}

export type TestAccount = {
  userId: string;
  email: string;
  accessToken: string;
};

/** Creates a real throwaway account via the admin endpoint (pre-confirmed, no
 * email ever sent — the public /signup endpoint requires a real confirmation
 * email to send successfully before the account exists at all, which makes
 * an unrelated test's account-creation step hostage to whatever the mail
 * provider's own test-domain rules happen to be; this test suite has no
 * reason to exercise that path, only the accounts it produces), signs in for
 * a real JWT. */
export async function createTestAccount(opts: { role?: "job_seeker" | "employer"; label: string }): Promise<TestAccount> {
  const { url, anonKey, serviceRoleKey } = requireTestEnv();
  const email = `ayn.itest.${opts.label}.${Date.now()}.${Math.random().toString(36).slice(2, 8)}@example.com`;
  const password = "TestPass!2026integration";

  const createRes = await fetch(`${url}/auth/v1/admin/users`, {
    method: "POST",
    headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      email, password, email_confirm: true,
      user_metadata: { full_name: "Integration Test", role: opts.role || "job_seeker" },
    }),
  });
  if (!createRes.ok) throw new Error(`account create failed: ${createRes.status} ${await createRes.text()}`);
  const createBody = await createRes.json();
  const userId = createBody.id as string;

  const tokenRes = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: anonKey, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!tokenRes.ok) throw new Error(`sign-in failed: ${tokenRes.status} ${await tokenRes.text()}`);
  const tokenBody = await tokenRes.json();

  return { userId, email, accessToken: tokenBody.access_token as string };
}

/** Fully erases a test account via the real erase_account_core RPC, same as every manual cleanup this session used. */
export async function eraseTestAccount(userId: string): Promise<void> {
  const { url, serviceRoleKey } = requireTestEnv();
  await fetch(`${url}/rest/v1/rpc/erase_account_core`, {
    method: "POST",
    headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ p_user_id: userId, p_actor: userId, p_reason: "integration_test_cleanup" }),
  });
}

/** Grants credits directly (service role only — mirrors how stripe-webhook/admin_adjust_credits do it). */
export async function grantCredits(userId: string, amount: number, ref: string): Promise<void> {
  const { url, serviceRoleKey } = requireTestEnv();
  const res = await fetch(`${url}/rest/v1/rpc/credit_grant`, {
    method: "POST",
    headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ _user_id: userId, _amount: amount, _reason: "integration_test_topup", _ref: ref }),
  });
  if (!res.ok) throw new Error(`credit_grant failed: ${res.status} ${await res.text()}`);
}

/** Wipes every credit_ledger row for this account and seeds a single clean
 * row at exactly `amount` — a true reset, not an addition. grantCredits
 * alone can't produce a known small balance for a concurrency test: it
 * only ever adds to whatever billing_ensure's own free-tier period_grant
 * already put there (real, variable, plan-dependent), which is exactly
 * the confound that made an earlier version of the concurrency test look
 * like it had found a broken lock when the real cause was simply more
 * real balance being available than the test accounted for. Call
 * billing_ensure (e.g. via a billing_get callHub) before this, not after
 * — otherwise that same grant lands after the reset and reintroduces the
 * same confound. */
export async function resetCreditsTo(userId: string, amount: number): Promise<void> {
  const { url, serviceRoleKey } = requireTestEnv();
  const headers = { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}`, "Content-Type": "application/json" };
  const del = await fetch(`${url}/rest/v1/credit_ledger?user_id=eq.${userId}`, { method: "DELETE", headers });
  if (!del.ok) throw new Error(`credit_ledger reset (delete) failed: ${del.status} ${await del.text()}`);
  const ins = await fetch(`${url}/rest/v1/credit_ledger`, {
    method: "POST",
    headers,
    body: JSON.stringify({ user_id: userId, delta: amount, reason: "integration_test_reset", balance_after: amount }),
  });
  if (!ins.ok) throw new Error(`credit_ledger reset (insert) failed: ${ins.status} ${await ins.text()}`);
}

/** Calls resume-hub as a given real account, returns { status, body }. */
export async function callHub(accessToken: string, payload: Record<string, unknown>): Promise<{ status: number; body: any }> {
  const { url, anonKey } = requireTestEnv();
  const res = await fetch(`${url}/functions/v1/resume-hub`, {
    method: "POST",
    headers: { apikey: anonKey, Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  let body: any = null;
  try { body = await res.json(); } catch { /* non-JSON response */ }
  return { status: res.status, body };
}

/** Direct PostgREST read/write as a given real account — the actual path RLS enforces against, not a simulation of it. */
export async function callPostgrest(
  accessToken: string,
  method: "GET" | "POST" | "PATCH" | "DELETE",
  path: string,
  body?: Record<string, unknown>,
): Promise<{ status: number; body: any }> {
  const { url, anonKey } = requireTestEnv();
  const res = await fetch(`${url}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...(method !== "GET" ? { Prefer: "return=representation" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let responseBody: any = null;
  try { responseBody = await res.json(); } catch { /* non-JSON response */ }
  return { status: res.status, body: responseBody };
}
