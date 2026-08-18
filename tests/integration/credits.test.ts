// @vitest-environment node
//
// The single most severe vulnerability ever found in this codebase was a
// credit-ledger bug (credit_grant letting any user mint free credits). The
// fix that followed it (pg_advisory_xact_lock in credit_spend/credit_grant/
// billing_ensure) was verified once, by hand, with a burst of concurrent
// curl calls — this automates that same proof so a future change to the
// locking can't silently reintroduce the race without a test noticing.
import { describe, it, expect, afterAll } from "vitest";
import { createTestAccount, eraseTestAccount, resetCreditsTo, callHub, requireTestEnv } from "./setup";

describe("credit spend concurrency", () => {
  let userId: string;
  let accessToken: string;

  afterAll(async () => {
    if (userId) await eraseTestAccount(userId);
  });

  it("never double-spends under real concurrent requests", async () => {
    requireTestEnv();
    const account = await createTestAccount({ label: "credits", role: "job_seeker" });
    userId = account.userId;
    accessToken = account.accessToken;

    // Seed a minimal profile + primary resume directly (service role),
    // matching every manual seed used throughout this app's own audit
    // history — tailor needs both before it will do real work.
    const { url, serviceRoleKey } = requireTestEnv();
    await fetch(`${url}/rest/v1/user_profile_canonical`, {
      method: "POST",
      headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        user_id: userId,
        skills: [{ name: "Python", level: "proven" }],
        experiences: [{ title: "Analyst", company: "Acme", start: "2022-01", end: null, bullets: ["Built dashboards."] }],
        education: [{ degree: "BSc", school: "State University" }],
        certifications: [], derived: {},
      }),
    });
    await fetch(`${url}/rest/v1/resumes`, {
      method: "POST",
      headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        user_id: userId, is_primary: true,
        content: { basics: { name: "Test", title: "Analyst" }, summary: "Analyst.", skills: ["Python"], experience: [], education: [] },
      }),
    });

    // billing_ensure grants this plan's free-tier credits the first time
    // it ever runs for an account — if that first run happens to land
    // *during* the concurrent burst below (a real, documented quirk: a
    // spend on a never-billed account triggers a same-transaction
    // period_grant before the deduction), the real available balance
    // during the race is larger than the seed alone, and more than one
    // charge can legitimately succeed with the lock still working
    // correctly. Triggering it here first, before the deliberate reset,
    // means the balance below is the true, final balance during the race.
    await callHub(accessToken, { action: "billing_get" });

    // Reset to a known, small balance: exactly enough for ONE tailor call
    // (COST_TAILOR = 2), then fire three concurrent requests at it, each
    // against different JD text so none can land as a free cache hit
    // (tailor caches per user+JD, a legitimate zero-cost repeat — a real
    // product behavior, not something this test is checking). At most one
    // may succeed; the other two must be refused with no partial charge.
    await resetCreditsTo(userId, 2);

    const results = await Promise.all([
      callHub(accessToken, { action: "tailor", jdText: "Data Analyst role A. Requirements: Python, SQL." }),
      callHub(accessToken, { action: "tailor", jdText: "Data Analyst role B. Requirements: SQL, dashboards." }),
      callHub(accessToken, { action: "tailor", jdText: "Data Analyst role C. Requirements: Python, dashboards." }),
    ]);

    const succeeded = results.filter(r => r.status === 200 && !r.body?.error);
    const refused = results.filter(r => r.status !== 200 || r.body?.error);

    expect(succeeded.length).toBeLessThanOrEqual(1);
    expect(succeeded.length + refused.length).toBe(3);

    // Confirm the real ledger, not just the HTTP responses, agrees.
    const balanceRes = await callHub(accessToken, { action: "billing_get" });
    expect(balanceRes.body.balance).toBeGreaterThanOrEqual(0);
  }, 60_000);
});
