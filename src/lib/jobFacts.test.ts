import { describe, expect, it } from "vitest";
import { extractBenefits, extractJobFacts, extractSalaryFromText, extractSponsorship, extractWorkMode, extractYearsRequired } from "../../supabase/functions/_shared/jobFacts";

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
    const f = extractJobFacts("8+ years of experience required. No visa sponsorship.");
    expect(f.years_required).toBe(8);
    expect(f.sponsorship).toBe("not_offered");
  });
});

describe("extractSalaryFromText", () => {
  it("reads a yearly range and takes the currency from where the job is", () => {
    const s = extractSalaryFromText("The salary range for this role is $120,000 - $150,000 per year.", "Austin, TX");
    expect(s).toMatchObject({ min: 120000, max: 150000, currency: "USD", period: "year", annual_min: 120000, annual_max: 150000 });
  });
  it("uses CAD for a Canadian job and leaves an unknown place as unknown", () => {
    expect(extractSalaryFromText("Compensation: $90,000 to $110,000 annually", "Toronto, ON")?.currency).toBe("CAD");
    expect(extractSalaryFromText("Compensation: $90,000 to $110,000 annually", "Berlin")?.currency).toBeNull();
  });
  it("lets a code written after the numbers beat the job's place", () => {
    expect(extractSalaryFromText("US employees: $289,700 - $362,100 USDCanadian employees: $250,000 - $300,000 CAD", "Toronto, ON")?.currency).toBe("USD");
  });
  it("reads explicit currencies", () => {
    expect(extractSalaryFromText("Salary: \u00a350,000 - \u00a360,000", "London")?.currency).toBe("GBP");
    expect(extractSalaryFromText("Pay: CAD 80,000 - 95,000 per year")?.currency).toBe("CAD");
  });
  it("annualizes hourly and monthly pay", () => {
    expect(extractSalaryFromText("Pay is $45 - $55 per hour", "Denver, CO")).toMatchObject({ period: "hour", annual_min: 93600, annual_max: 114400 });
    expect(extractSalaryFromText("Salary \u20ac4,000 - \u20ac5,000 per month")).toMatchObject({ period: "month", annual_min: 48000, annual_max: 60000, currency: "EUR" });
  });
  it("ignores bonuses, funding and ambiguous small numbers", () => {
    expect(extractSalaryFromText("Includes a sign-on bonus of $10,000 - $20,000.")).toBeNull();
    expect(extractSalaryFromText("We raised $50 - $100 million to grow.")).toBeNull();
    expect(extractSalaryFromText("Team of $5 - $10")).toBeNull();
  });
  it("prefers the range that sits next to pay words", () => {
    const s = extractSalaryFromText("Our client raised $20,000 - $30,000 gifts. The base salary range is $130,000 - $160,000.", "Seattle, WA");
    expect(s?.min).toBe(130000);
  });
});

describe("extractWorkMode", () => {
  it("reads plain statements", () => {
    expect(extractWorkMode("This is a fully remote position.")).toBe("remote");
    expect(extractWorkMode("We work in a hybrid model, 3 days in the office.")).toBe("hybrid");
    expect(extractWorkMode("This role is on-site in Munich.")).toBe("onsite");
  });
  it("ignores hybrid or in-person mentions that are not about this role", () => {
    expect(extractWorkMode("You will collaborate with hybrid/remote teams.")).toBeNull();
    expect(extractWorkMode("The final round is a mandatory in-person interview.")).toBeNull();
    expect(extractWorkMode("Not eligible for relocation, visa sponsorship, or fully remote work.")).toBeNull();
    expect(extractWorkMode("Experience with hybrid cloud infrastructure.")).toBeNull();
  });
  it("reads a hybrid role and a location line", () => {
    expect(extractWorkMode("This is a hybrid role out of our San Francisco office.")).toBe("hybrid");
    expect(extractWorkMode("Full-time | On-site | North Israel")).toBe("onsite");
  });
  it("stays empty when silent or contradictory", () => {
    expect(extractWorkMode("Great team and mission.")).toBeNull();
    expect(extractWorkMode("Fully remote role, but you must work on-site for quarterly meetings.")).toBeNull();
  });
});

describe("extractBenefits", () => {
  it("lists the benefits named", () => {
    const b = extractBenefits("We offer medical, dental and vision insurance, a 401(k) with match, stock options and unlimited PTO.");
    expect(b).toEqual(expect.arrayContaining(["Health insurance", "Retirement plan", "Equity", "Paid time off"]));
  });
  it("does not count diversity, equity and inclusion as equity", () => {
    expect(extractBenefits("We are committed to diversity, equity and inclusion.")).toEqual([]);
  });
  it("does not count a benefit the posting says it lacks", () => {
    expect(extractBenefits("Relocation assistance is not available for this role.")).toEqual([]);
  });
});
