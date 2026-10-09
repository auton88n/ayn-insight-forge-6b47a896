import { describe, expect, it } from "vitest";
import { extractApplyBy, extractBenefits, extractJobFacts, extractRemoteRegion, extractSalaryFromText, extractSponsorship, extractWorkMode, extractYearsRequired, payPeriodWarning } from "../../supabase/functions/_shared/jobFacts";

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
  it('rejects contradictory explicit units instead of converting them to annual', () => {
    expect(extractSalaryFromText('Salary: $60,000 - $65,000 per hour', 'Austin, TX')).toBeNull();
    expect(extractSalaryFromText('Salary: $60,000 - $65,000 per month', 'Austin, TX')).toBeNull();
    expect(extractSalaryFromText('Annual salary $60,000 - $65,000 per hour', 'Austin, TX')).toBeNull();
    expect(payPeriodWarning('Pay: Up to $65,000.00 per hour')).toBe('$65,000.00 per hour');
  });
  it('attaches periods to their own amount rather than adjacent compensation', () => {
    expect(extractSalaryFromText('Hourly wage between $20- $23', 'Austin, TX')).toMatchObject({ period: 'hour', min: 20, max: 23 });
    expect(extractSalaryFromText('Hourly Pay Rate: $25.00 - $31.00', 'Austin, TX')).toMatchObject({ period: 'hour' });
    expect(extractSalaryFromText('The starting base hourly rate for this role is $29.00 - $33.00.', 'Austin, TX')).toMatchObject({ period: 'hour' });
    expect(extractSalaryFromText('Salary ($20 - $23) per hour', 'Austin, TX')).toMatchObject({ period: 'hour' });
    expect(extractSalaryFromText('Hourly Pay Range (CA Only)$26—$30 USDWHAT TO EXPECT', 'Austin, TX')).toMatchObject({ period: 'hour' });
    expect(extractSalaryFromText('Salary Hiring Range: $29-34/ hr (~$60 - 70k)', 'Austin, TX')).toMatchObject({ period: 'hour' });
    expect(extractSalaryFromText('ABOUT VALORVIP$17.00 - $23.00 / hourly', 'Austin, TX')).toMatchObject({ period: 'hour' });
    expect(extractSalaryFromText('Base Pay Range (hourly)$28—$39 USD', 'Austin, TX')).toMatchObject({ period: 'hour' });
    expect(extractSalaryFromText('Salary €3,065 to €4,250 gross per month')).toMatchObject({ period: 'month' });
    expect(extractSalaryFromText('Salary: $27.00-$30.00/per hour')).toMatchObject({ period: 'hour' });
    expect(extractSalaryFromText('Pay $41.00 - $51.00 base per hour')).toMatchObject({ period: 'hour' });
    expect(extractSalaryFromText('Pay Rate (per hour)$14.85—$18.85 USD')).toMatchObject({ period: 'hour' });
    expect(extractSalaryFromText('Pay range $24-27+ per hour')).toMatchObject({ period: 'hour' });
    expect(extractSalaryFromText('In office three days per week with a base compensation range of $85,000–$95,000.')).toMatchObject({ period: 'year' });
    expect(extractSalaryFromText('Package up to $179,169 per year, including a base pay rate of $48.95 - $69.57 per hour.')).toMatchObject({ period: 'hour' });
    expect(extractSalaryFromText('This is an hourly rate.$45.77—$57.21 USD')).toMatchObject({ period: 'hour' });
    expect(extractSalaryFromText('Salary: $18.54 - 25.75$/HOURLY')).toMatchObject({ period: 'hour' });
    expect(extractSalaryFromText('Pay $25 - $30 per per hour')).toMatchObject({ period: 'hour' });
    expect(extractSalaryFromText('Salary $31/hr - $44/hr')).toMatchObject({ period: 'hour' });
    expect(extractSalaryFromText('Pay $18 - $20 per/hr.')).toMatchObject({ period: 'hour' });
    expect(extractSalaryFromText('The base salary range for this role is $130,000 - $190,000 (Total OTE: $145,000 - $220,000)')).toMatchObject({ min: 130000, max: 190000 });
    expect(extractSalaryFromText('Salary $15,000 - $20,000 per year, paid monthly.', 'Austin, TX')?.period).toBe('year');
    expect(extractSalaryFromText('Base salary $18,000 - $20,000. Monthly performance incentive available.', 'Austin, TX')?.period).toBe('year');
    expect(extractSalaryFromText('Salary $20,000 - $25,000 per week.', 'Austin, TX')).toBeNull();
    expect(extractSalaryFromText('Hourly pay: $20.50 - $25.75', 'Austin, TX')?.period).toBe('hour');
    expect(extractSalaryFromText('Monthly salary: $4,000.00 - $5,000.00', 'Berlin')?.period).toBe('month');
    expect(payPeriodWarning('Salary $45 - $55 per hour')).toBeNull();
    expect(payPeriodWarning('Services cost $500 per hour.')).toBeNull();
  });
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
  it("does not call a yearly salary monthly because the word appears nearby", () => {
    const s = extractSalaryFromText("Base salary $65,000 - $100,000 plus a monthly performance incentive.", "Dallas, TX");
    expect(s).toMatchObject({ period: "year", annual_min: 65000, annual_max: 100000 });
  });
  it("skips an hourly figure too high to be a wage (a customer rate)", () => {
    expect(extractSalaryFromText("Moving crews are billed at $150 - $250 per hour.")).toBeNull();
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

describe("extractRemoteRegion", () => {
  it("reads a region limit on a remote role", () => {
    expect(extractRemoteRegion("This is a remote position within the United States.", true)).toBe("United States");
    expect(extractRemoteRegion("Location: Remote, US or Canada", true)).toBe("United States or Canada");
    expect(extractRemoteRegion("Candidates must be located in the UK to be considered.", true)).toBe("United Kingdom");
  });
  it("leaves a list that includes places it does not know", () => {
    expect(extractRemoteRegion("This role will be remote and based in the UK, Ireland or Spain.", true)).toBeNull();
  });
  it("does not read an office location as a restriction", () => {
    expect(extractRemoteRegion("We are remote-first with a headquarters office in the US.", true)).toBeNull();
    expect(extractRemoteRegion("Fully remote role open worldwide.", true)).toBeNull();
  });
  it("only trusts 'must be located in' when the role is remote", () => {
    expect(extractRemoteRegion("You must be located in the US.", false)).toBeNull();
  });
});

describe("extractApplyBy", () => {
  const now = new Date("2026-10-08T00:00:00Z");
  it("reads written dates", () => {
    expect(extractApplyBy("Applications close on November 15, 2026.", now)).toBe("2026-11-15");
    expect(extractApplyBy("Apply by 20 October 2026", now)).toBe("2026-10-20");
    expect(extractApplyBy("Application deadline: 2026-12-01", now)).toBe("2026-12-01");
  });
  it("takes the next occurrence when no year is written", () => {
    expect(extractApplyBy("Apply by January 15", now)).toBe("2027-01-15");
  });
  it("does not believe impossible, long-past or far-future dates", () => {
    expect(extractApplyBy("Apply by February 31, 2027", now)).toBeNull();
    expect(extractApplyBy("Applications close on March 3, 2024", now)).toBeNull();
    expect(extractApplyBy("Closing date: 5 May 2031", now)).toBeNull();
    expect(extractApplyBy("Join us. We were founded on March 3.", now)).toBeNull();
  });
});
