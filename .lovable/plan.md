# Ask once, up front: "add these gaps and change the title?"

## The change you asked for

The earlier plan walked the person through every gap one at a time, after the tailor run. That is slow and it interrupts the moment they actually wanted: a finished resume for this job.

New flow, one question, before the writing starts:

1. AYN checks the posting against the resume. No AI call, no credits, instant.
2. If the posting asks for things the resume does not evidence, AYN shows one dialog:
   - *"This job asks for 3 things your resume does not show yet: Kubernetes, Terraform, GraphQL API design."*
   - *"The header title will change from Backend Engineer to Senior Backend Engineer."*
   - *"Only agree if these are genuinely true of you. You are responsible for what your resume claims."*
3. **Yes** → tailoring runs and includes those items and the new title.
4. **No, just improve what I have** → tailoring runs normally and adds nothing that is not already true on the page. The title stays theirs. The gaps are still listed honestly afterward as real, open gaps.

One decision, one click, then the tailor runs once and is done.

## What is kept from the old behaviour

- The gaps and title mismatch are still shown after the run, so nothing is hidden either way.
- If they said no, the "these are still missing" list is exactly what they declined, named plainly.
- Nothing is ever invented: a gap the person agreed to is added as the requirement's own wording in skills, not as a fabricated accomplishment with a made-up number.

## What this deliberately does not do

- No per-gap interview. That was the slow part and it is gone.
- No silent adding. Declining is a real, respected answer, not a nag.
- No second charge. The gap check before the dialog is free and deterministic; the tailor run is the one thing that costs credits, same as today.

## Technical notes

**Backend** (`supabase/functions/resume-hub/index.ts`)

- New free action `tailor_gap_preview`: resolves the JD the same way `tailor` does, runs `computeGap` from `_shared/tailoring.ts`, and returns `{ missing: string[], matchPct, currentTitle, jobTitle }`. Deterministic only, no AI call, gated by the existing `featureGate` / `accountGate` / `rateLimitGate` chain.
- `tailor` gains two optional booleans on its payload: `acceptGaps` and `acceptTitle`, both defaulting to false.
  - `acceptGaps: true` appends the agreed requirement wording to the resume's `skills` and tells the prompt it may reference them.
  - `acceptGaps: false` keeps the existing hard rule: never credit a skill the resume does not evidence.
  - `acceptTitle: true` allows `basics.title` to take the posting's title; false keeps the standing v3.98.0 rule that the header title comes from the candidate's own most recent real role.
- No new table. The agreement is a per-run choice, and the resulting resume already records what was claimed.

**Frontend** (`src/components/resume-hub/JobsTab.tsx`)

- The existing pre-tailor confirmation dialog becomes the gap dialog: on clicking Tailor, call `tailor_gap_preview` first, then show the gaps and the title change with two buttons, **Yes, add these** and **No, just improve what I have**.
- If the preview returns no gaps and no title mismatch, skip straight to tailoring with the current dialog unchanged.
- The existing post-run "Add" chips and "Use this job's title" button are removed; that decision now happens once, before the run.

## One prerequisite, flagged honestly

`npx tsc --noEmit` currently reports 25 errors across 8 files, all predating this plan (a clean checkout reproduces them). They all trace to `src/integrations/supabase/types.ts` being generated against the Lovable-connected Supabase project while the app runs against the self-hosted VPS database. Worth regenerating from the VPS before adding to this file, though this plan adds no new table so it is not strictly blocking.

## Second half of the ask: fix mistakes and re-check the score after tailoring

Tailoring today writes once, checks a few things, and hands the resume over. The number the person sees afterwards can be low for two different reasons, and only one of them is honest:

- **Real gaps.** The job asks for something they genuinely have not done. Nothing should paper over this.
- **A miss by the writer.** Something is genuinely on their resume, the job asks for it in different words, and the tailor run failed to line the wording up. That is a mistake, not a gap, and it should be corrected before the person ever sees it.

The change is a correction pass that only ever fixes the second kind.

1. After the tailor run, AYN re-checks the finished resume against the job. This is the same free, deterministic check, run on the output instead of the profile.
2. Every requirement still marked missing is sorted into two buckets: **evidenced in your background but not surfaced** and **genuinely not there**.
3. If the first bucket is not empty, AYN runs one repair pass naming exactly those items, then re-checks. Nothing new is invented; the repair may only surface wording for things already true on the page.
4. The resume is also re-graded for writing mistakes (invented figures, first-person pronouns, clichés, dashes, a generic summary). Anything found gets the same one repair attempt.
5. The person sees the final number with a plain sentence explaining it: either *"Everything this job asks for that you have done is now on the page"*, or *"3 things are still missing because you have not done them"* naming them.

## What 100% honestly means here

If the person said **yes** to the gap dialog above, every requirement is on the page and the score does reach 100%. If they said **no**, the ceiling is whatever their real background supports, and AYN says so in words rather than showing a bare low number that reads like a bug. AYN never closes a gap the person did not agree to, and never claims a perfect score it did not actually measure.

## Technical notes for this half

**Backend** (`supabase/functions/resume-hub/index.ts`, `tailor` action)

- The output-side gap check already exists (`outputGap` / `matchPct`, computed from `flattenResumeSkillsAndProse`). It currently only reports. It becomes the trigger for the repair pass.
- Split `outputGap.missing` using the existing profile-side `gap`: a requirement missing on the output but matched on the profile is a **misalignment** (fixable); missing on both is a **real gap** (left alone). This reuses `verifyKeywordAlignment`'s own reasoning rather than adding a second notion of "should have been there".
- One repair call, at most, per tailor run: same model, same rules, given the current resume plus the exact list of misaligned items, plus any `verifyWriteQuality` violations found on the output. Re-run both checks after; keep the repair only if it is genuinely better on both, otherwise keep the first draft. Same "keep the better of the two" pattern the existing figure check already uses.
- Response gains `gapAnalysis.stillMissing` (the real gaps, named) alongside the existing `missing` and `matchPct`, so the frontend can explain the number instead of just printing it.
- No extra credits. The repair is part of the one tailor run the person already paid for.

**Frontend** (`src/components/resume-hub/JobsTab.tsx`)

- Under the tailored resume, one line: the score, then either the "everything you have done is on the page" sentence or the named real gaps.
