# Apply the ATS gaps to the tailored resume

## What is actually broken

You are right, and it is a real hole. Two different things are both called "gaps" in AYN, and tailoring only ever closed one of them:

1. **Keyword gaps against the job** (the job asks for "PostgreSQL", your resume says "Postgres"). Tailoring already handles this, including a guaranteed deterministic fallback added earlier.
2. **ATS writing-quality gaps** (the score you see on Profile, out of 100): weak bullets with no number and no strong verb, a generic summary, inconsistent date formats, a tense mismatch, the same verb opening three bullets, a first-person pronoun. **The tailor action never runs this check at all.** Every one of those problems is inherited straight from the base resume into every tailored copy, no matter how low the base scored.

So a resume scoring 65 on Profile gets tailored, keywords get aligned, and it is still a 65 on writing quality when it reaches the employer's ATS.

## What gets built

Add an **ATS repair pass** inside the `tailor` action, right after the existing keyword retry and before the tailored resume is saved:

1. Score the freshly tailored resume with the same `scoreResumeContent` the Profile score uses.
2. If it is below 100, send one repair call listing the exact issues code found, with hard limits: reword only, never add a number, role, employer, date, skill or certification that is not already in the profile, keep every figure and date byte-for-byte.
3. Re-score. Keep the repair only if the score actually went up and no existing write-quality rule (figures preserved, no clichés, no pronouns, no dashes) was broken to get there.
4. Return the tailored resume's own `ats` score, verdict and remaining issues alongside the existing `gapAnalysis`, and show it in the Jobs tab under the tailored resume, so you can see the tailored copy's real score instead of only the base resume's.

## One honest limit, stated plainly

A few rubric deductions cannot be closed by rewording, only by inventing: fewer than 2 roles, and a real unexplained employment gap of 6 months or more. Those stay reported rather than fabricated away, which is the same rule that keeps every other AI write in this product trustworthy. Everything else on the rubric (weak bullets, generic summary, date format, tense, repeated verbs, pronouns) is genuinely fixable by rewording and will be fixed, so a resume with a normal work history will land at or very near 100 after tailoring, and where it cannot, the reason will be named on screen instead of hidden.

## Technical detail

- `supabase/functions/resume-hub/index.ts`, `tailor` action: import is already present (`scoreResumeContent`). Insert the score, repair, re-score, keep-if-better block after `missingFigures` is computed and before the deterministic keyword guarantee, so the guarantee still applies to the final object. Add `ats: { score, verdict, issues }` to the cached `result`.
- `src/lib/resumeHub.ts`: widen the `tailor` return type with the new `ats` field.
- `src/components/resume-hub/JobsTab.tsx`: show the tailored copy's ATS score and any remaining issues in the tailored-resume card.
- Cost is one extra scoring call always, plus one repair call and one re-score only when the tailored resume is below 100. No credit change, no new action, no schema change.
