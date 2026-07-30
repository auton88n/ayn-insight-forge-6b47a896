# Employer Hub v3.15.0 — five fixes

## 1. The text under a candidate card is hard to read
`CandidateAskCards.tsx` renders AYN's answer at 12px muted grey inside a faint tint, so the most substantive text on the card is the least visible.

- Answer text goes to `text-sm leading-relaxed text-foreground`, inside a card with a visible border and a left orange accent so it reads as an answer, not a footnote.
- The active question is shown as a small heading above the answer ("Why this score"), so it is clear what is being answered.
- Loading state becomes a short skeleton with a spinner line instead of pulsing grey text.
- Question chips get a clearer active state (orange tint, orange text).

## 2 and 3. The candidate detail dialog
Currently one long "why" paragraph, then four unequal chip grids, then the background block.

- The dialog becomes a single readable column with consistent section rhythm: header (score, headline, seniority, location, match band), then Why AYN picked them as a bulleted list (never one wall of text: split on sentences when the model returns a paragraph), then a two column Met / Missing block with equal padding and dividers, then Skills where "Backed by their resume" and "AYN inferred" are two labelled rows of one chip family instead of two competing badge styles, then Background.
- The Background block (`CandidateProfile.tsx`) is tightened: consistent section spacing, skill level labels aligned in a fixed left column, experience rows as a clean two line stack with a subtle divider between roles, education and "what they are looking for" in the same rhythm. Empty values still render nothing.
- Body text at `text-sm`, section labels at 11px uppercase, one spacing scale across all sections.

## 4. Company profile becomes a page, not a dialog
- The Company rail item switches the main tab to `company` and renders `CompanyProfile` full width in the main column (same as Search, Proposals, Assessments).
- The collapsed summary row is removed in that context: the fields are shown open, grouped as Identity (name, website, industry, headquarters), Presence (LinkedIn, logo), Size, and About. Autosave on blur stays exactly as is.
- The company dialog is deleted; the menu item and `companyOpen` state go away.

## 5. Search becomes staged, and sign out moves into the nav
- The Search tab gets three views held in one state: `spec` (the intake wizard and role summary), `loading` (full width "AYN is reading the pool" with skeleton cards and nothing else on screen), and `results` (only the candidate cards, with a "Back to the role" button and a one line summary of the role searched at the top).
- Hitting Find scrolls to top and switches views, so the results are never buried under the intake table.
- Editing from the results view returns to `spec` with everything preserved, exactly as the draft persistence already does.
- The top right company icon and its dropdown are removed. The nav rail gains a bottom section with the company avatar and a Sign out icon button (tooltip "Sign out"); the mobile bottom bar gains a fifth Sign out item. Header keeps the AYN mark and company name only.

## Technical notes
- Files: `src/pages/EmployerHub.tsx` (view state, rail, header, company tab, dialog removal), `src/components/employer/CandidateAskCards.tsx`, `src/components/employer/CandidateResultCard.tsx`, `src/components/employer/CandidateProfile.tsx`, `src/components/employer/CompanyProfile.tsx` (a `page` mode next to `onboarding`).
- Presentation only. No edge function, schema, or API changes; no candidate identity is rendered anywhere new.
- All colour stays on semantic tokens inside `.employer-surface` so the orange scope keeps working, including in portals.
- Verify with a Playwright pass at 1280 wide and at mobile width: rail sign out present, no top right icon, Find moves to a loading view then results, company profile renders in the main column.
