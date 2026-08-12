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

/** Signs up a real throwaway account, confirms its email via the service role, signs in for a real JWT. */
export async function createTestAccount(opts: { role?: "job_seeker" | "employer"; label: string }): Promise<TestAccount> {
  const { url, anonKey, serviceRoleKey } = requireTestEnv();
  const email = `ayn.itest.${opts.label}.${Date.now()}.${Math.random().toString(36).slice(2, 8)}@example.com`;
  const password = "TestPass!2026integration";

  const signupRes = await fetch(`${url}/auth/v1/signup`, {
    method: "POST",
    headers: { apikey: anonKey, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, data: { full_name: "Integration Test", role: opts.role || "job_seeker" } }),
  });
  if (!signupRes.ok) throw new Error(`signup failed: ${signupRes.status} ${await signupRes.text()}`);
  const signupBody = await signupRes.json();
  const userId = signupBody.id as string;

  // Email confirmation is an admin-only write (auth.users), needs the service role.
  const confirmRes = await fetch(`${url}/auth/v1/admin/users/${userId}`, {
    method: "PUT",
    headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ email_confirm: true }),
  });
  if (!confirmRes.ok) throw new Error(`email confirm failed: ${confirmRes.status} ${await confirmRes.text()}`);

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
