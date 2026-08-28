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
