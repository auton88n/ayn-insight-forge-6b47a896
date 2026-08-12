// @vitest-environment node
//
// Every admin_*/get_admin_* function is supposed to check has_role(admin)
// as its literal first statement (blueprint.md item 4). This proves the
// boundary from the outside, the same way a real non-admin account would
// actually hit it — not by reading the function body and trusting it.
import { describe, it, expect, afterAll } from "vitest";
import { createTestAccount, eraseTestAccount, callPostgrest, requireTestEnv } from "./setup";

describe("admin RPC boundary", () => {
  let userId: string;
  let accessToken: string;

  afterAll(async () => {
    if (userId) await eraseTestAccount(userId);
  });

  it("refuses a real, non-admin account on every admin RPC checked", async () => {
    requireTestEnv();
    const account = await createTestAccount({ label: "adminboundary", role: "job_seeker" });
    userId = account.userId;
    accessToken = account.accessToken;

    // Real, correctly-shaped params so PostgREST actually routes to each
    // function (a schema-cache 404 on a made-up signature would prove
    // nothing) — the admin check inside each function must still be the
    // first thing that runs, before the dummy uuid is ever looked at.
    const dummyId = "00000000-0000-0000-0000-000000000000";
    const calls: Array<[string, Record<string, unknown>]> = [
      ["get_admin_overview", {}],
      ["get_admin_money", {}],
      ["admin_suspend_account", { p_user_id: dummyId, p_reason: "integration test" }],
      ["admin_erase_account", { p_user_id: dummyId, p_reason: "integration test", p_confirm_email: "test@example.com" }],
    ];
    for (const [rpc, args] of calls) {
      const res = await callPostgrest(accessToken, "POST", `rpc/${rpc}`, args);
      if (res.status === 200) {
        throw new Error(`${rpc} returned 200 to a non-admin caller: ${JSON.stringify(res.body)}`);
      }
      expect(JSON.stringify(res.body).toLowerCase()).toContain("admin");
    }
  }, 30_000);
});
