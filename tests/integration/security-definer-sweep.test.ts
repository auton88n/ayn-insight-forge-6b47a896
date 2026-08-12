// @vitest-environment node
//
// Automates blueprint.md's own single most valuable security technique:
// "grant-level access is not the same thing as ownership." Every real
// severe vulnerability this app has ever had (credit_balance, then
// credit_grant/credit_spend/billing_ensure) was a SECURITY DEFINER function
// granted to authenticated/anon with no ownership check in its own body.
// This calls the real get_admin_security_definer_audit() RPC (which runs
// the exact pg_proc query blueprint.md documents) and fails the moment
// anything beyond the two known-safe, intentionally-public functions shows
// up — the same regression this codebase's real credit-mint exploit would
// have been caught by, had this test existed at the time.
import { describe, it, expect, afterAll } from "vitest";
import { createTestAccount, eraseTestAccount, callPostgrest, requireTestEnv } from "./setup";

const EXPECTED_SAFE = new Set(["get_feature_flags", "has_role"]);

describe("SECURITY DEFINER grant sweep", () => {
  let userId: string;
  let accessToken: string;

  afterAll(async () => {
    if (userId) {
      const { url, serviceRoleKey } = requireTestEnv();
      await fetch(`${url}/rest/v1/user_roles?user_id=eq.${userId}`, {
        method: "DELETE",
        headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` },
      });
      await eraseTestAccount(userId);
    }
  });

  it("finds only the two known-safe functions granted with no ownership check", async () => {
    const { url, serviceRoleKey } = requireTestEnv();
    const account = await createTestAccount({ label: "adminsweep", role: "job_seeker" });
    userId = account.userId;
    accessToken = account.accessToken;

    // Grant admin just long enough to run the audit, matching the exact
    // "temporarily admin-flagged account" pattern this app's own history
    // uses for every live admin-boundary test.
    const grantRes = await fetch(`${url}/rest/v1/user_roles`, {
      method: "POST",
      headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: userId, role: "admin" }),
    });
    expect(grantRes.status).toBeLessThan(300);

    const res = await callPostgrest(accessToken, "POST", "rpc/get_admin_security_definer_audit", {});
    expect(res.status).toBe(200);
    const unexpected = (res.body as Array<{ proname: string }>).filter(r => !EXPECTED_SAFE.has(r.proname));
    expect(unexpected, `Unexpected SECURITY DEFINER exposure: ${JSON.stringify(unexpected)}`).toEqual([]);
  }, 30_000);
});
