// Checks on what the AI extracted into a profile, so a guess can't end up
// shown as a fact. The extraction prompt already says "leave it out if
// unstated", but a model sometimes fills these in anyway, and a wrong
// "needs sponsorship" or a salary nobody wrote down changes how employers
// see the person. These keep a value only when the source text gives some
// evidence for it. Pure functions with no imports, so they can be tested
// directly.

type WorkAuthLike = Record<string, unknown> & { citizenship?: string };
type PrefsLike = Record<string, unknown>;

const SPONSORSHIP_EVIDENCE = /\b(sponsor\w*|visa|work permit|work authori[sz]ation|right to work|authori[sz]ed to work|require(s|d)? authori[sz]ation)\b/i;
const SALARY_EVIDENCE = /\b(salary|compensation|expected pay|expecting|desired pay|per (year|annum|hour)|annual|\/\s?(yr|year|hr))\b|[$£€]\s?\d|\b\d[\d,.]*\s?(k|usd|cad|aed|eur|gbp|aud)\b/i;

/** "canada" -> "Canada", "united  states" -> "United States". Leaves anything
 * with capitals already (a deliberate "USA", "UAE") exactly as written. */
export function tidyCountryName(value: string | undefined): string | undefined {
  if (!value) return value;
  const trimmed = value.trim().replace(/\s+/g, " ");
  if (trimmed !== trimmed.toLowerCase()) return trimmed;
  return trimmed.replace(/\b([a-z])/g, (m) => m.toUpperCase());
}

export function guardExtractedProfile<W extends WorkAuthLike, P extends PrefsLike>(
  parts: { work_auth: W; preferences: P },
  sourceText: string,
): { work_auth: W; preferences: P } {
  const work_auth = { ...parts.work_auth };
  const preferences = { ...parts.preferences };

  if (typeof work_auth.citizenship === "string") work_auth.citizenship = tidyCountryName(work_auth.citizenship) as W["citizenship"];

  if (!SPONSORSHIP_EVIDENCE.test(sourceText)) {
    delete work_auth.needs_sponsorship_now;
    delete work_auth.needs_sponsorship_future;
  }
  if (!SALARY_EVIDENCE.test(sourceText)) {
    delete preferences.salary_min_usd;
    delete preferences.salary_currency;
  }
  if (preferences.salary_currency && preferences.salary_min_usd == null) delete preferences.salary_currency;

  return { work_auth, preferences };
}
