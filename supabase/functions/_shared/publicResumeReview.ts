import { evaluateResumeText } from './resumeEvaluation.ts';

export const PUBLIC_REVIEW_VERSION = 'text-review-2026-09-28';

/** A server-side projection: never spread the private assessment into this response.
 * The percentage uses every extracted requirement, not only disclosed findings. */
export function publicResumeReview(resumeText: string, jdText: string) {
  const assessment = evaluateResumeText(resumeText, jdText);
  const { gap, requirementCount: total } = assessment;
  return {
    evaluationVersion: assessment.evaluationVersion,
    disclosureVersion: PUBLIC_REVIEW_VERSION,
    matchPct: assessment.matchPct,
    requirementCount: total,
    matchedCount: gap.matched.length,
    missingCount: gap.missing.length,
    // Compatibility fields deliberately contain no full analysis.
    matched: [] as string[],
    missing: gap.missing.slice(0, 3).map(r => r.text),
    niceToHave: [] as string[],
    disclosureLimit: 3,
  };
}
