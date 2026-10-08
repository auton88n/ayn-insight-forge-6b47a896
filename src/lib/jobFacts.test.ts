import { describe, expect, it } from "vitest";
import { extractJobFacts, extractSponsorship, extractYearsRequired } from "../../supabase/functions/_shared/jobFacts";

describe("extractYearsRequired", () => {
  it("reads the common phrasings", () => {
    expect(extractYearsRequired("Requires 5+ years of experience in product management.")).toBe(5);
    expect(extractYearsRequired("3-5 years' experience with Python")).toBe(3); // a range's minimum
    expect(extractYearsRequired("At least 7 years in a similar role")).toBe(7);
    expect(extractYearsRequired("minimum of 4 years")).toBe(4);
  });
  it("takes the largest stated requirement", () => {
    expect(extractYearsRequired("2+ years of SQL experience and 8+ years of overall experience")).toBe(8);
  });
  it("ignores a company boasting about its own history", () => {
    expect(extractYearsRequired("We have over 20 years of experience helping clients grow.")).toBeNull();
    expect(extractYearsRequired("Our team brings 25 years of combined experience in the industry.")).toBeNull();
    expect(extractYearsRequired("We are looking for a leader with 12+ years of experience in sales.")).toBe(12);
  });
  it("stays empty when nothing is stated or the number is not about experience", () => {
    expect(extractYearsRequired("Join a fast growing team. We celebrate 10 years of customer love.")).toBeNull();
    expect(extractYearsRequired("")).toBeNull();
  });
});

describe("extractSponsorship", () => {
  it("detects an explicit refusal", () => {
    expect(extractSponsorship("We are unable to sponsor visas for this role.")).toBe("not_offered");
    expect(extractSponsorship("Must be authorized to work in the US without sponsorship.")).toBe("not_offered");
    expect(extractSponsorship("Visa sponsorship is not available.")).toBe("not_offered");
  });
  it("detects an offer", () => {
    expect(extractSponsorship("Visa sponsorship is available for the right candidate.")).toBe("offered");
    expect(extractSponsorship("We will sponsor work visas and relocation.")).toBe("offered");
  });
  it("does not mistake a business or event sponsor for visa sponsorship", () => {
    expect(extractSponsorship("Work with the clinical Sponsor and external vendors, and not the CRO.")).toBeNull();
    expect(extractSponsorship("We do not accept corporate sponsorship for this event.")).toBeNull();
  });
  it("reads a candidate must not need sponsorship as not offered", () => {
    expect(extractSponsorship("Candidates must be authorized to work for any employer that does not require sponsorship.")).toBe("not_offered");
  });
  it("stays empty when the posting is silent or only asks a question", () => {
    expect(extractSponsorship("Great benefits and a friendly team.")).toBeNull();
    expect(extractSponsorship("Do you now or will you in the future require sponsorship?")).toBeNull();
  });
  it("combines into one result", () => {
    expect(extractJobFacts("8+ years of experience required. No visa sponsorship.")).toEqual({ years_required: 8, sponsorship: "not_offered" });
  });
});
