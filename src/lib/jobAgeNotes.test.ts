import { describe, expect, it } from "vitest";
import { jobAgeNotes, jobFactChips } from "./jobPostingFormat";

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();

describe("jobAgeNotes", () => {
  it("says when AYN first saw a listing much earlier than its shown date", () => {
    const notes = jobAgeNotes({ posted_at: daysAgo(1), first_seen_at: daysAgo(47), repost_count: 0 });
    expect(notes.map((n) => n.text)).toEqual(["First seen 47 days ago"]);
  });
  it("stays quiet for a genuinely new listing or a small gap", () => {
    expect(jobAgeNotes({ posted_at: daysAgo(1), first_seen_at: daysAgo(2) })).toEqual([]);
    expect(jobAgeNotes({ posted_at: daysAgo(6), first_seen_at: daysAgo(9) })).toEqual([]);
    expect(jobAgeNotes({ posted_at: daysAgo(1) })).toEqual([]);
  });
  it("counts the earlier lives of a re-listed role", () => {
    expect(jobAgeNotes({ posted_at: daysAgo(0), first_seen_at: daysAgo(1), repost_count: 2 }).map((n) => n.text)).toEqual(["Listed 3 times"]);
  });
});

describe("jobFactChips", () => {
  it("shows only what the posting states", () => {
    expect(jobFactChips({})).toEqual([]);
    expect(jobFactChips({ years_required: 5, sponsorship: "not_offered" }).map((c) => c.text)).toEqual(["5+ years asked", "No visa sponsorship"]);
    expect(jobFactChips({ sponsorship: "offered" }).map((c) => c.text)).toEqual(["Visa sponsorship offered"]);
  });
});

describe("jobFactChips: new flags", () => {
  it("flags an entry level role that asks for several years", () => {
    const c = jobFactChips({ seniority: "junior", years_required: 5 });
    expect(c[0]).toMatchObject({ text: "Entry level, but asks 5+ years", tone: "gold" });
    expect(jobFactChips({ seniority: "senior", years_required: 5 })[0].text).toBe("5+ years asked");
    expect(jobFactChips({ seniority: "junior", years_required: 1 })[0].text).toBe("1+ years asked");
  });
  it("shows where a remote role is limited to", () => {
    expect(jobFactChips({ remote_region: "United States" }).map((c) => c.text)).toEqual(["Remote, United States only"]);
  });
  it("shows an upcoming deadline, marks it closing soon, and hides a passed one", () => {
    const inDays = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
    expect(jobFactChips({ apply_by: inDays(30) })[0].text).toMatch(/^Apply by /);
    expect(jobFactChips({ apply_by: inDays(3) })[0].text).toMatch(/^Closing soon: apply by /);
    expect(jobFactChips({ apply_by: inDays(-5) })).toEqual([]);
  });
});
