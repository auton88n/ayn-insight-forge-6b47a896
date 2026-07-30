## Goal

Make the employer surface (EmployerHub) feel modern and easy to move around: a compact icon rail instead of the wide text nav, a visible loading state while AYN searches, and candidate cards that are properly structured and easy to read.

## 1. Navigation becomes an icon rail

Replace the 224px text-and-hint sidebar with a narrow icon rail, matching the Resume Hub language the seeker already has:

- Vertical rail of 4 icon buttons (Search, Proposals, Assessments, Company), active state in AYN orange, hover tooltip showing the label plus the one-line hint.
- Pending proposal count stays as a small dot badge on the Proposals icon.
- The main content area gets the reclaimed width, so specs and candidate cards breathe.
- Mobile: the rail becomes a bottom-anchored icon bar (same icons, same badges) instead of the current row of text buttons.
- A small page heading above the content names the current section, so the icon-only rail never leaves the user guessing where they are.

## 2. Real loading state after "Find"

Today the results area stays empty while the match runs, so the click feels dead.

- While searching: show a "AYN is reading the pool" panel with three skeleton candidate cards (score ring placeholder, two text lines, chip row) so the layout does not jump when results land.
- The Find button shows a spinner and disabled state (already partly there, made consistent).
- Empty result state: a clear card saying no one in the pool matches these must-haves yet, with a hint to relax a must-have.

## 3. Candidate cards, restructured

Rebuild each result card into clear, labelled zones instead of the current stack of unlabelled text:

```text
┌───────────────────────────────────────────────┐
│ (87)  Senior Backend Engineer                 │
│       Senior · 7 years · Toronto      [Open]  │
├───────────────────────────────────────────────┤
│ HAS WHAT YOU ASKED FOR                        │
│  ✓ Python   ✓ Postgres   ✓ AWS                │
│ MISSING                                       │
│  – Kubernetes                                 │
├───────────────────────────────────────────────┤
│ WHY AYN PICKED THEM                           │
│  • one reason per line, full sentences        │
│  • …                                          │
├───────────────────────────────────────────────┤
│ Ask AYN about them   [4 question cards]       │
│ [Send a job proposal] [Send an assessment]    │
└───────────────────────────────────────────────┘
```

Specifics:
- Section eyebrow labels (uppercase, muted, small) so no block of text is unexplained.
- Matched skills get a check mark and a positive chip; gaps get a muted outline chip under a separate "Missing" label, so green and grey are never mixed in one row.
- The "why" lines become a proper bulleted list at body size with relaxed leading, not 12px muted text; long lists collapse behind "Show more".
- Score ring gets a label ("match") under it and a plain-language band (strong / good / partial) so the number means something.
- Primary actions (Send a job proposal, Send an assessment) move onto the card footer, so the employer does not have to open the dialog to act.
- Consistent card padding, one divider style, and larger tap targets.

## Technical notes

- All work is presentation-only in `src/pages/EmployerHub.tsx`, plus a small extracted `src/components/employer/CandidateResultCard.tsx` (card markup) and `CandidateCardSkeleton.tsx` (loading state) to keep the page file manageable.
- Nav rail styles reuse the existing `.employer-surface` token scope and the `rh-navitem` pattern from `src/styles/resume-hub.css`; no hardcoded colors.
- No backend, edge function, schema, or API changes. `employer_match`, proposals, and assessments keep their current contracts.
