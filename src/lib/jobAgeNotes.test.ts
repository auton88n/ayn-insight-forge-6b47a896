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
