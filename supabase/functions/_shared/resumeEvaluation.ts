import { buildSections, computeGap, flattenResumeSkillsAndProse } from './tailoring.ts';

export const RESUME_EVALUATION_VERSION = 'document-alignment-2026-10-09-prose-v2';

/** Same document/JD and version always yield the same assessment. This is
 * wording coverage, not proof of proficiency or an employer ATS prediction. */
export function evaluateResumeText(text: string, jd: string) {
  const gap = computeGap(jd, buildSections(null, null, text));
  const total = gap.matched.length + gap.missing.length;
  return {
    evaluationVersion: RESUME_EVALUATION_VERSION,
    matchPct: total ? Math.round(100 * gap.matched.length / total) : null,
    requirementCount: total,
    gap,
  };
}

export function evaluateResumeDocument(resume: unknown, jd: string) {
  return evaluateResumeText(flattenResumeSkillsAndProse(resume), jd);
}
