// @vitest-environment node
//
// "Test RLS by becoming the user, not by reading the policy" — the exact
// blueprint.md rule that caught the guest-ticket impersonation bug and the
// credit_balance IDOR. These tests do precisely that: two real accounts,
// real JWTs, real PostgREST calls, checking the actual enforcement path a
// real attacker would use — not a SET LOCAL simulation of it.
import { describe, it, expect, afterAll } from "vitest";
import { createTestAccount, eraseTestAccount, callPostgrest, requireTestEnv } from "./setup";

describe("cross-user data isolation", () => {
  let userAId: string, userBId: string;
  let tokenA: string, tokenB: string;
  let resumeAId: string;

  afterAll(async () => {
    if (userAId) await eraseTestAccount(userAId);
    if (userBId) await eraseTestAccount(userBId);
  });

  it("sets up two real, unrelated accounts", async () => {
    requireTestEnv();
    const a = await createTestAccount({ label: "isoA", role: "job_seeker" });
    const b = await createTestAccount({ label: "isoB", role: "job_seeker" });
    userAId = a.userId; tokenA = a.accessToken;
    userBId = b.userId; tokenB = b.accessToken;

    const created = await callPostgrest(tokenA, "POST", "resumes", {
      user_id: userAId, is_primary: true,
      content: { basics: { name: "User A" }, summary: "A's real resume.", skills: [], experience: [], education: [] },
    });
    expect(created.status).toBeLessThan(300);
    resumeAId = created.body[0].id;
  });

  it("refuses user B reading user A's resume by id", async () => {
    const res = await callPostgrest(tokenB, "GET", `resumes?id=eq.${resumeAId}`);
    // RLS filters to zero rows rather than a 4xx — the row simply isn't there.
    expect(Array.isArray(res.body) ? res.body.length : 0).toBe(0);
  });

  it("refuses user B updating user A's resume", async () => {
    const res = await callPostgrest(tokenB, "PATCH", `resumes?id=eq.${resumeAId}`, { is_primary: false });
    expect(Array.isArray(res.body) ? res.body.length : 0).toBe(0);
    const stillA = await callPostgrest(tokenA, "GET", `resumes?id=eq.${resumeAId}`);
    expect(stillA.body[0]?.is_primary).toBe(true);
  });

  it("refuses user B reading user A's canonical profile", async () => {
    await callPostgrest(tokenA, "POST", "user_profile_canonical", {
      user_id: userAId, skills: [{ name: "Secret Skill" }], experiences: [], education: [], certifications: [], derived: {},
    });
    const res = await callPostgrest(tokenB, "GET", `user_profile_canonical?user_id=eq.${userAId}`);
    expect(Array.isArray(res.body) ? res.body.length : 0).toBe(0);
  });

  it("refuses ANY authenticated user reading assessment_rubrics or assessment_results directly", async () => {
    // The zero-grant boundary blueprint.md calls out by name: "the candidate
    // never sees their score" only holds because these two tables have no
    // grant to authenticated at all, not just an RLS filter.
    const rubrics = await callPostgrest(tokenA, "GET", "assessment_rubrics?limit=1");
    const results = await callPostgrest(tokenA, "GET", "assessment_results?limit=1");
    // 403 "permission denied for table" — the grant-level refusal, not an
    // auth failure. Confirmed against the real deployed API before fixing
    // this assertion, not assumed.
    expect(rubrics.status).toBe(403);
    expect(results.status).toBe(403);
  });
});
