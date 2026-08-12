// @vitest-environment node
//
// Codifies the live burst test rate limiting was verified with by hand:
// hammer a free, cheap action past its ceiling and confirm the backend
// actually refuses, not just that the code compiles.
import { describe, it, expect, afterAll } from "vitest";
import { createTestAccount, eraseTestAccount, callHub, requireTestEnv } from "./setup";

describe("rate limiting", () => {
  let userId: string;
  let accessToken: string;

  afterAll(async () => {
    if (userId) await eraseTestAccount(userId);
  });

  it("blocks a real burst past resume_diagnose's ceiling", async () => {
    requireTestEnv();
    const account = await createTestAccount({ label: "ratelimit", role: "job_seeker" });
    userId = account.userId;
    accessToken = account.accessToken;

    const resume = { basics: { name: "Test" }, summary: "Test.", skills: ["Python"], experience: [], education: [] };
    // resume_diagnose's deployed ceiling is 30/15min; fire a real concurrent
    // burst past it. Not asserting the exact boundary count (already proven
    // live, sequentially, during the original build) — just that the real
    // deployed backend actually refuses somewhere in a 35-request burst,
    // proving the check is genuinely wired in, not just present in the diff.
    const results = await Promise.all(
      Array.from({ length: 35 }, () => callHub(accessToken, { action: "resume_diagnose", resume })),
    );
    const blocked = results.filter(r => r.status === 429);
    expect(blocked.length).toBeGreaterThan(0);
    expect(blocked[0].body?.code).toBe("rate_limited");
  }, 60_000);
});
