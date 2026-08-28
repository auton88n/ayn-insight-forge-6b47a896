# Honest 100% tailoring: confirm the gap, own it, then actually close it

## The problem, stated plainly

Right now, after a tailor run, AYN shows the missing JD requirements as chips with an **Add** button. Clicking Add appends the job posting's own wording into the resume's skills list. Nothing else happens.

That is the exact thing you called out:

- The person is never asked whether the claim is actually true.
- Nobody records that they said yes and took responsibility for it.
- Pasting the posting's keyword into a skills list is not evidence. It is a keyword.
- The match score is computed once, at tailor time, and never recalculated. So the number never moves, and the person has no way to know whether the resume now genuinely answers the job or not.

The fix is not to be more generous with what counts as a match. The fix is to make the gap real, make the person's answer real, and make the score real.

## What this builds

### 1. Every gap is a question, not a button

For each requirement the job asks for and the resume does not evidence, AYN shows the requirement in the posting's own words and asks one plain question: *have you actually done this, and what did you do?*

Three possible answers:

- **"Yes, and here is what I did"** with a free-text box. Their own words, in their own language.
- **"I have this, it just is not written down"** for a genuine skill they hold that never made it onto the page.
- **"No, I have not done this"** which closes the item honestly and leaves it as a real, disclosed gap.

No one-click "add this keyword" path survives. Every closed gap traces back to something the person actually typed or explicitly affirmed.

### 2. They confirm it, and that confirmation is recorded

Before anything is written into the resume, the person ticks a single explicit line stating that what they wrote is true and that they are responsible for it. AYN stores the requirement text, their exact words, and the timestamp. It is a real record, not a disappearing checkbox.

### 3. AYN turns their answer into real resume content, or refuses

Their answer goes through the same verification the existing gap-probe already uses:

- Anything shaped like an instruction to the AI is stripped before the model ever sees it.
- Every number in the output must already appear in what the person typed.
- Any company name must be traceable to their answer.
- A vague answer ("sure, probably", "not sure") is declined rather than turned into a bullet.

The result is a real bullet on the right role, or a real skill entry, in their own factual terms. Never an invented metric.

### 4. The score is recomputed and shown live

After each closed gap, AYN re-runs the same deterministic requirement check against the updated tailored resume and shows a real, moving count: *"14 of 17 requirements from this posting are evidenced in your resume."*

It reaches 100% only when the check genuinely says so. If three gaps stay open because the person honestly does not have those things, the panel says exactly that, names them, and stops. No number is nudged, rounded, or presented as complete when it is not.

### 5. The disclosure moves before the spend, not after

The pre-tailor confirmation dialog is reworded to say what actually happens: AYN rewrites wording for this one job, never invents facts, and will afterward walk them through each gap the posting asks for that their resume does not yet answer, one at a time, for them to confirm or decline.

## What this deliberately does not do

- No auto-adding of a requirement just because it is in the posting.
- No treating an unanswered question as a yes.
- No claiming 100% when real gaps remain. The panel shows the honest number and names what is still open.
- No new credit charge for closing gaps. The tailor run was already paid for; confirming facts about your own history is not a second generation.

## Technical notes

**Backend** (`supabase/functions/resume-hub/index.ts`)

- New free action `tailor_gap_close`: takes the requirement text, the person's raw answer, and their responsibility confirmation. Reuses the existing `stripInstructionLikeSpans` and `inventedFigures` guards from `resume_gap_probe`, plus its "decline rather than guess" prompt discipline. Returns either a bullet targeted at a named role, a skill entry, or `applicable: false` with the reason.
- New free action `tailor_gap_recheck`: runs `computeGap` from `_shared/tailoring.ts` against the current tailored resume content and returns `{ matched, missing, matchPct }`. Deterministic, no AI call, so the number cannot drift.
- Both gated by the existing `featureGate` / `accountGate` / `rateLimitGate` chain, same as `resume_gap_probe`.

**Database**

- New table `tailor_gap_confirmations`: `user_id`, `job_id`, `requirement_text`, `user_answer`, `outcome` (`closed` / `declined` / `affirmed_existing`), `confirmed_at`. Owner-scoped RLS, grants to `authenticated` and `service_role`. Added to `erase_account_core` alongside the other user-scoped content tables.

**Frontend** (`src/components/resume-hub/JobsTab.tsx`)

- `gapSuggestions` state grows from `{ text, value }` to a per-requirement record carrying answer text, outcome, and a busy flag.
- The Add-button chip row is replaced by a stepped panel: one requirement at a time, question, answer box, responsibility checkbox, and Confirm / I do not have this.
- `patchTailoredContent` keeps doing the in-place write, extended to append a bullet to a named work entry rather than only touching `skills`.
- A live coverage line above the panel, refreshed from `tailor_gap_recheck` after each confirmation.
- The pre-tailor dialog copy is updated to match.
