## 1. The candidate dialog background still slips

Today the whole dialog panel is the scroller (`overflow-y-auto` on `DialogContent`), so a hard scroll or trackpad rubber band moves the panel's content past its own white surface and the blurred page shows through at the edges.

Change the candidate dialog to a fixed layout:
- `DialogContent` becomes a flex column with a fixed height cap and no scrolling of its own, solid `bg-background`.
- The header (name, score, role) and the footer actions stay pinned.
- Only the middle section scrolls, with `overscroll-contain` so the scroll never chains to the page behind it.
- Same treatment for the proposal and assessment dialogs.

Verify by driving the preview: open a candidate, scroll the body hard to both ends, screenshot, and confirm the white surface stays continuous with no blurred backdrop visible inside the panel.

## 2. "AYN is writing questions" takes too long

`employer_assessment_generate` calls the slow quality model (`google/gemini-2.5-pro`) with the candidate's full profile block plus six experience rows.

Speed it up without dropping question quality:
- Generate questions on `google/gemini-2.5-flash` (the existing default, already in the fallback chain), keeping the same system prompt and structured tool schema.
- Trim the payload: four experience rows, three achievement bullets each, drop fields the prompt does not use.
- Ask for the smaller end of the range, 4 multiple choice plus 2 short answer, which is fewer tokens to produce.
- Grading and growth notes stay on the quality model, since that is not on the employer's waiting path.
- While it runs, the dialog shows the orange AYN spinner (same one now used in search) rather than the plain grey one.

## 3. Sent proposals must name the candidate

Right now the proposals list shows only the job title, so three proposals for one role look identical.

- `employer_reveal_status` returns the candidate's first name for every proposal, not just accepted ones. This matches what the employer already sees on candidate cards in v3.15.1; last name, email and phone still unlock only on accept.
- Each row reads as: candidate first name as the headline, job title and when it was sent underneath, status badge on the right.
- If a first name is missing, fall back to the candidate reference label so two rows are never identical.
- `SentProposal` in `src/lib/employer.ts` gains `first_name`.

## Technical notes

Files: `src/pages/EmployerHub.tsx` (dialog layout, proposals rows, spinner), `src/lib/employer.ts` (type), `supabase/functions/resume-hub/index.ts` (`employer_assessment_generate` model and payload, `employer_reveal_status` name field), then redeploy `resume-hub`. No schema change, no new table, no change to what data unlocks at which stage.
