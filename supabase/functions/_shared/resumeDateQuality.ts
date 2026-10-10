/** Date notation is compared only within employment dates of known month precision.
 * Present and year-only education/certification dates are not format defects. */
export function employmentDateNotationIssue(resume: unknown): string | null {
  const work = (resume as { work?: Array<{ start?: unknown; end?: unknown }> } | null)?.work;
  const styles = new Set<string>();
  for (const role of Array.isArray(work) ? work : []) {
    for (const raw of [role?.start, role?.end]) {
      if (typeof raw !== 'string') continue;
      const value = raw.trim();
      if (/^(?:0?[1-9]|1[0-2])\/\d{4}$/.test(value)) styles.add('month/year');
      else if (/^\d{4}-(?:0[1-9]|1[0-2])$/.test(value)) styles.add('year-month');
      else if (/^(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\.?\s+\d{4}$/i.test(value)) styles.add('named month');
    }
  }
  return styles.size > 1 ? 'Employment dates use different month/year notation. Use one style for dates whose months are known; keep year-only dates and Present as they are.' : null;
}

export function isDateNotationFinding(issue: string): boolean {
  return /\bdate(?:s|\s+formats?|\s+notation)\b/i.test(issue) && /\b(?:inconsistent|consisten\w*|notation|formats?)\b/i.test(issue);
}

/** Do not silently raise a persisted score: an obsolete finding requires a free recheck. */
export function hasUnsupportedDateFinding(resume: unknown, issues: string[] | null): boolean {
  return !employmentDateNotationIssue(resume) && (issues ?? []).some(isDateNotationFinding);
}
