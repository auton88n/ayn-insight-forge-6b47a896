// Facts a job posting states in its own text, pulled out once so the site can show and filter on them.
// Deterministic (no AI call, no cost) and only ever reports what the text says: if the posting is silent
// or ambiguous the value stays empty. Never an estimate.
export type Sponsorship = "offered" | "not_offered";
export interface JobFacts {
  /** The largest number of years of experience the posting asks for, e.g. "5+ years of experience". */
  years_required: number | null;
  /** What the posting says about visa sponsorship, if anything. */
  sponsorship: Sponsorship | null;
}

const MAX_YEARS = 25;
// "5+ years of experience", "3-5 years' experience in X", "5 to 7 years of relevant experience".
const YEARS_WITH_EXPERIENCE = /\b(\d{1,2})\s*(?:\+|plus)?\s*(?:(?:-|–|to)\s*\d{1,2}\s*\+?\s*)?years?['’]?s?\b[^.\n]{0,70}?\b(?:experience|background|exposure)\b/gi;
// "at least 5 years", "minimum of 3 years", "more than 7 years".
const YEARS_WITH_MINIMUM = /\b(?:at least|minimum(?: of)?|min\.?|over|more than)\s+(\d{1,2})\s*\+?\s*years?\b/gi;

const NOT_OFFERED: RegExp[] = [
  /\b(?:no|not|unable to|cannot|can['’]?t|won['’]?t|will not|does not|do not|doesn['’]?t|don['’]?t|never)\b[^.\n]{0,50}\bsponsor/i,
  /\bsponsorship\b[^.\n]{0,30}\b(?:is |are )?(?:not|unavailable)\b/i,
  /\bwithout\b[^.\n]{0,40}\bsponsorship\b/i,
];
const OFFERED: RegExp[] = [
  /\b(?:visa )?sponsorship\b[^.\n]{0,20}\b(?:is |are )?(?:available|provided|offered)\b/i,
  /\b(?:we|company|employer)\b[^.\n]{0,25}\b(?:will|can|do|are able to|offer(?:s)?|provide(?:s)?)\b[^.\n]{0,20}\bsponsor/i,
  /\bvisa sponsorship\b[^.\n]{0,30}\b(?:for (?:the )?right|for qualified|may be)/i,
];

export function extractYearsRequired(text: string): number | null {
  let best: number | null = null;
  for (const re of [YEARS_WITH_EXPERIENCE, YEARS_WITH_MINIMUM]) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const n = parseInt(m[1], 10);
      if (n >= 1 && n <= MAX_YEARS && (best === null || n > best)) best = n;
    }
  }
  return best;
}

export function extractSponsorship(text: string): Sponsorship | null {
  if (NOT_OFFERED.some((re) => re.test(text))) return "not_offered";
  if (OFFERED.some((re) => re.test(text))) return "offered";
  return null;
}

export function extractJobFacts(description: string | null | undefined): JobFacts {
  const text = String(description || "");
  return { years_required: extractYearsRequired(text), sponsorship: extractSponsorship(text) };
}
