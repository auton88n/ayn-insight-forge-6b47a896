// Facts a job posting states in its own text, pulled out once so the site can show and filter on them.
// Deterministic (no AI call, no cost) and only ever reports what the text says: if the posting is silent
// or ambiguous the value stays empty. Never an estimate.
//
// Everything is judged one sentence at a time, because the same words mean different things in different
// sentences: "Sponsor" can be a business role in a clinical study, and "25 years of experience" is
// usually the company boasting, not what it asks of the candidate.
export type Sponsorship = "offered" | "not_offered";
export type PayPeriod = "year" | "month" | "hour";
export type WorkModeText = "remote" | "hybrid" | "onsite";
export interface TextSalary {
  min: number;
  max: number;
  /** null when the text only says "$" and the place does not settle which dollar. */
  currency: string | null;
  period: PayPeriod;
  /** The same range per year (hourly x 2080, monthly x 12), in the same currency. */
  annual_min: number;
  annual_max: number;
}
export interface JobFacts {
  /** The largest number of years of experience the posting asks the candidate for. */
  years_required: number | null;
  /** What the posting says about visa sponsorship for the candidate, if anything. */
  sponsorship: Sponsorship | null;
  /** A pay range the posting writes out in its own text. Never estimated. */
  salary: TextSalary | null;
  /** Remote, hybrid or on-site, when the text says so plainly. */
  work_mode: WorkModeText | null;
  /** Standard benefits the posting names, in plain labels. */
  benefits: string[];
}

const MAX_YEARS = 25;
// "5+ years of experience", "3-5 years' experience in X", "5 to 7 years of relevant experience".
const YEARS_WITH_EXPERIENCE = /\b(\d{1,2})\s*(?:\+|plus)?\s*(?:(?:-|–|to)\s*\d{1,2}\s*\+?\s*)?years?['’]?s?\b[^.\n]{0,70}?\b(?:experience|background|exposure)\b/gi;
// "at least 5 years", "minimum of 3 years", "more than 7 years".
const YEARS_WITH_MINIMUM = /\b(?:at least|minimum(?: of)?|min\.?|over|more than)\s+(\d{1,2})\s*\+?\s*years?\b/gi;
// A sentence about the company, not the candidate.
const ABOUT_THE_COMPANY = /\b(?:our|we(?:['’]ve| have| are| been)?|the company|the firm|founded|established|since)\b/i;
// A sentence that is clearly asking something of the candidate.
const ASKS_THE_CANDIDATE = /\b(?:looking for|seeking|requires?|required|requirements?|qualifications?|candidates?|you(?:\s+(?:have|bring|will|should|must|are))?|minimum|must|should|ideal|preferred)\b/i;

const IMMIGRATION_CONTEXT = /\b(?:visas?|work permits?|work authori[sz]ation|authori[sz]ed to work|eligible to work|right to work|legally (?:able|authori[sz]ed|entitled)|immigration|h-?1b|employment[- ]based|employment authori[sz]ation|citizens?|citizenship|permanent resident|green card|relocation)\b/i;
const NEGATIVE = /\b(?:no|not|unable|cannot|can['’]?t|won['’]?t|will not|does not|do not|doesn['’]?t|don['’]?t|never|without|unavailable)\b/i;
const POSITIVE = /\b(?:available|provided|offered|will sponsor|can sponsor|we sponsor|do sponsor|able to sponsor|are sponsoring|offers? (?:visa )?sponsorship|sponsorship (?:may|can) be)\b/i;

function sentences(text: string): string[] {
  return text.split(/(?<=[.!])\s+|\n+/).map((s) => s.trim()).filter(Boolean);
}

export function extractYearsRequired(text: string): number | null {
  let best: number | null = null;
  for (const sentence of sentences(text)) {
    // A boast like "We have over 20 years of experience helping clients" is not a requirement.
    if (ABOUT_THE_COMPANY.test(sentence) && !ASKS_THE_CANDIDATE.test(sentence.replace(/\b(?:we|our)\b/gi, ""))) continue;
    for (const re of [YEARS_WITH_EXPERIENCE, YEARS_WITH_MINIMUM]) {
      re.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = re.exec(sentence)) !== null) {
        const n = parseInt(m[1], 10);
        // A very large number needs a clear ask from the candidate side; otherwise it is most likely the company's history.
        if (n >= 15 && !ASKS_THE_CANDIDATE.test(sentence)) continue;
        if (n >= 1 && n <= MAX_YEARS && (best === null || n > best)) best = n;
      }
    }
  }
  return best;
}

export function extractSponsorship(text: string): Sponsorship | null {
  let offered = false;
  for (const sentence of sentences(text)) {
    if (!/sponsor/i.test(sentence) || sentence.includes("?")) continue;
    if (!IMMIGRATION_CONTEXT.test(sentence)) continue;   // "Sponsor" the business role, or event sponsorship
    if (NEGATIVE.test(sentence)) return "not_offered";
    if (POSITIVE.test(sentence)) offered = true;
  }
  return offered ? "offered" : null;
}

// ---------------------------------------------------------------------------------------------
// Pay written out in the posting text. Reads a real range the employer wrote; never estimates one.
// ---------------------------------------------------------------------------------------------
const MARK = "(?:US\\$|CA\\$|AU\\$|NZ\\$|C\\$|A\\$|\\$|\u00a3|\u20ac|USD|CAD|AUD|EUR|GBP|AED|CHF)\\s?";
const NUM = "(\\d{1,3}(?:,\\d{3})+|\\d+(?:\\.\\d+)?)";
const SALARY_RANGE = new RegExp(`(${MARK})${NUM}\\s?([Kk])?\\s?(?:-|\u2013|\u2014|to)\\s?(?:${MARK})?${NUM}\\s?([Kk])?`, "g");
const HOURLY = /(?:per\s*hour|\/\s*h(?:ou)?r\b|\bhourly\b|\ban hour\b|\bper\s*hr\b)/i;
const MONTHLY = /(?:per\s*month|\/\s*month|\bmonthly\b|\ba month\b)/i;
const NOT_PAY = /\b(?:bonus|sign-?on|signing|stipend|equity|stock|funding|raised|valuation|revenue|market size|budget|reimbursement|allowance|commission)\b/i;
const PAY_CONTEXT = /\b(?:salary|compensation|pay|base|range|wage|wages|earn|earning|annual)\b/i;

const MARKER_CURRENCY: Array<[RegExp, string]> = [
  [/^(?:US\$|USD)/i, "USD"], [/^(?:CA\$|C\$|CAD)/i, "CAD"], [/^(?:AU\$|A\$|AUD)/i, "AUD"], [/^NZ\$/i, "NZD"],
  [/^\u00a3|^GBP/i, "GBP"], [/^\u20ac|^EUR/i, "EUR"], [/^AED/i, "AED"], [/^CHF/i, "CHF"],
];
const US_STATES = "AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY|DC";

/** Which dollar a bare "$" means, from where the job is. Unknown stays unknown. */
export function currencyFromLocation(location: string | null | undefined): string | null {
  const loc = String(location || "");
  if (!loc) return null;
  if (/\b(?:canada|ontario|british columbia|alberta|quebec|toronto|vancouver|calgary|montreal|ottawa)\b|,\s*(?:ON|BC|AB|QC|MB|NS|NB|SK)\b/i.test(loc)) return "CAD";
  if (/\b(?:australia|sydney|melbourne|brisbane|perth)\b/i.test(loc)) return "AUD";
  if (/\b(?:united states|usa|u\.s\.)\b/i.test(loc) || new RegExp(`,\\s*(?:${US_STATES})\\b`).test(loc)) return "USD";
  return null;
}

export function extractSalaryFromText(text: string, location?: string | null): TextSalary | null {
  let best: { score: number; index: number; salary: TextSalary } | null = null;
  SALARY_RANGE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = SALARY_RANGE.exec(text)) !== null) {
    const [whole, marker, loRaw, loK, hiRaw, hiK] = m;
    const lo = parseFloat(loRaw.replace(/,/g, "")) * (loK ? 1000 : 1);
    const hi = parseFloat(hiRaw.replace(/,/g, "")) * (hiK ? 1000 : 1);
    if (!(lo > 0) || !(hi >= lo)) continue;
    const start = Math.max(0, m.index - 80);
    const window = text.slice(start, Math.min(text.length, m.index + whole.length + 80));
    // Words like "bonus" or "raised" only rule a range out when they are in the same sentence as it.
    const before = text.slice(Math.max(0, m.index - 80), m.index).split(/[.!?\n]/).pop() || "";
    const after = text.slice(m.index + whole.length, m.index + whole.length + 40).split(/[.!?\n]/)[0] || "";
    if (NOT_PAY.test(before + " " + whole + " " + after)) continue;
    // Period: spoken, or clear from the size of the numbers. A small pair with no period word is ambiguous: skipped.
    let period: PayPeriod | null = null;
    if (HOURLY.test(window)) period = "hour";
    else if (MONTHLY.test(window)) period = "month";
    else if (lo >= 15_000) period = "year";
    if (!period) continue;
    const inRange = period === "year" ? lo >= 15_000 && hi <= 1_500_000
      : period === "hour" ? lo >= 5 && hi <= 500
      : lo >= 1_000 && hi <= 100_000;
    if (!inRange) continue;
    // A "range" whose ends are very far apart is a headcount or a sum, not pay.
    if (hi / lo > 3) continue;
    let currency: string | null = null;
    for (const [re, cur] of MARKER_CURRENCY) { if (re.test(marker.trim())) { currency = cur; break; } }
    if (!currency) {
      // A code written right after the numbers ("$289,700 to $362,100 USD") beats anything nearby or the job's place.
      const CODE = "(USD|CAD|AUD|NZD|GBP|EUR|AED|CHF)(?![a-z])";
      const right = new RegExp(`^\\s?${CODE}`).exec(text.slice(m.index + whole.length));
      const near = new RegExp(`(?<![A-Za-z])${CODE}`).exec(window);
      currency = right ? right[1] : near ? near[1] : currencyFromLocation(location);
    }
    const factor = period === "hour" ? 2080 : period === "month" ? 12 : 1;
    const salary: TextSalary = {
      min: Math.round(lo), max: Math.round(hi), currency, period,
      annual_min: Math.round(lo * factor), annual_max: Math.round(hi * factor),
    };
    const score = (PAY_CONTEXT.test(window) ? 2 : 0) + (currency ? 1 : 0);
    if (!best || score > best.score) best = { score, index: m.index, salary };
  }
  return best ? best.salary : null;
}

// ---------------------------------------------------------------------------------------------
// Work mode and benefits, only when the text says so plainly.
// ---------------------------------------------------------------------------------------------
// Each cue describes how THIS role is worked, not a team, a customer or an interview. Judged one sentence
// at a time, and a sentence that says "not" or "no" is skipped ("not eligible for fully remote work").
const BENEFIT_NEGATIVE_WORDS = /\b(?:no|not|without|unfortunately|unable|cannot|isn['\u2019]?t|aren['\u2019]?t|does not|do not|never)\b/i;
const REMOTE_CUES = /\b(?:fully|100%|completely|entirely)\s+remote\b|\bremote[- ]first\b|\bwork from anywhere\b|\bthis is a remote (?:role|position|job)\b|\bremote (?:position|role|opportunity)\b|\bwork remotely\b|\blocation\W{0,4}remote\b|\|\s*remote\s*\|/i;
const HYBRID_CUES = /\bhybrid (?:work|working|position|role|opportunity|schedule|setup|arrangement|policy|model|office|mode|basis)\b|\bhybrid[-\s]schedule\b|\b(?:is|be|are|operate|offer|offering|work|working|remain|remains)\s+(?:a |an )?hybrid\b(?![\s/-]*(?:cloud|and remote|remote))|\blocation\W{0,4}hybrid\b|\|\s*hybrid\s*\||\*hybrid\b|\bhybrid (?:in|from|based|out of)\b|\b[1-4]\s*(?:-|to)?\s*[1-4]?\s*days? (?:per|a|each) week (?:in|at|from)[^.\n]{0,20}(?:office|site)\b|\b[1-4] days (?:in|at) the office\b/i;
const ONSITE_CUES = /\b(?:this (?:role|position|job) is|role is|position is|is an?|fully|100%|entirely|must (?:work|be)|required to (?:work|be))\s+(?:on-?site|in[- ]office|in the office)\b|\bon-?site (?:position|role|job|in|at|based)\b|\bin[- ]office (?:position|role)\b|\bwork (?:from|at) (?:our|the) (?:office|site)\b|\|\s*on-?site\s*\||\blocation\W{0,4}on-?site\b|#LI-onsite\b/i;

export function extractWorkMode(text: string): WorkModeText | null {
  let hybrid = false, remote = false, onsite = false;
  for (const sentence of sentences(text)) {
    if (BENEFIT_NEGATIVE_WORDS.test(sentence)) continue;
    if (HYBRID_CUES.test(sentence)) hybrid = true;
    if (REMOTE_CUES.test(sentence)) remote = true;
    if (ONSITE_CUES.test(sentence)) onsite = true;
  }
  if (hybrid) return "hybrid";
  if (remote && !onsite) return "remote";
  if (onsite && !remote) return "onsite";
  return null;   // silent, or says both: leave it to the feed
}

const BENEFIT_RULES: Array<[string, RegExp]> = [
  ["Health insurance", /\b(?:medical|health|dental|vision)\b[^.\n]{0,40}\b(?:insurance|coverage|benefits|plan)\b|\bhealth(?:care)? benefits\b/i],
  ["Retirement plan", /\b401\s?\(?k\)?|\bRRSP\b|\bpension\b|\bretirement (?:plan|savings|benefits?)\b/i],
  ["Equity", /\b(?:stock options?|RSUs?|share options?|employee stock|equity (?:grant|package|compensation|stake|ownership|award)s?|equity)\b/i],
  ["Bonus", /\b(?:annual|performance|signing|sign-on|discretionary|referral) bonus\b|\bbonus (?:plan|program|eligible|potential)\b/i],
  ["Paid time off", /\b(?:paid time off|PTO|paid vacation|unlimited (?:vacation|PTO|time off)|vacation days|paid holidays)\b/i],
  ["Parental leave", /\b(?:parental|maternity|paternity|family) leave\b/i],
  ["Learning budget", /\b(?:learning|education|professional development|training) (?:budget|stipend|allowance|reimbursement)\b|\btuition (?:reimbursement|assistance)\b/i],
  ["Relocation help", /\brelocation (?:assistance|package|support|bonus|allowance)\b/i],
  ["Home office stipend", /\b(?:home office|remote work|wfh|work[- ]from[- ]home) (?:stipend|allowance|budget)\b/i],
  ["Flexible hours", /\bflexible (?:hours|schedule|working hours|work hours)\b/i],
];
const BENEFIT_NEGATIVE = /\b(?:no|not|without|unfortunately|unable|cannot|isn['\u2019]?t|aren['\u2019]?t|does not|do not)\b/i;

export function extractBenefits(text: string): string[] {
  // "Diversity, equity and inclusion" is not a share of the company.
  const cleaned = text.replace(/\b(?:diversity|inclusion)[,\s&]+(?:and\s+)?equity\b[^.\n]{0,25}|\bequity[,\s]+(?:diversity|inclusion)\b[^.\n]{0,25}|\bequal opportunity\b/gi, " ");
  const found: string[] = [];
  for (const sentence of sentences(cleaned)) {
    if (BENEFIT_NEGATIVE.test(sentence)) continue;
    for (const [label, re] of BENEFIT_RULES) {
      if (!found.includes(label) && re.test(sentence)) found.push(label);
    }
  }
  return found;
}

export function extractJobFacts(description: string | null | undefined, ctx?: { location?: string | null }): JobFacts {
  const text = String(description || "");
  return {
    years_required: extractYearsRequired(text),
    sponsorship: extractSponsorship(text),
    salary: extractSalaryFromText(text, ctx?.location),
    work_mode: extractWorkMode(text),
    benefits: extractBenefits(text),
  };
}
