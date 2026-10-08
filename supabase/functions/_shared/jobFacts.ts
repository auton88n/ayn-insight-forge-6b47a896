// Facts a job posting states in its own text, pulled out once so the site can show and filter on them.
// Deterministic (no AI call, no cost) and only ever reports what the text says: if the posting is silent
// or ambiguous the value stays empty. Never an estimate.
//
// Everything is judged one sentence at a time, because the same words mean different things in different
// sentences: "Sponsor" can be a business role in a clinical study, and "25 years of experience" is
// usually the company boasting, not what it asks of the candidate.
export type Sponsorship = "offered" | "not_offered";
export interface JobFacts {
  /** The largest number of years of experience the posting asks the candidate for. */
  years_required: number | null;
  /** What the posting says about visa sponsorship for the candidate, if anything. */
  sponsorship: Sponsorship | null;
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

export function extractJobFacts(description: string | null | undefined): JobFacts {
  const text = String(description || "");
  return { years_required: extractYearsRequired(text), sponsorship: extractSponsorship(text) };
}
