## Goal

The switch at the top ("I am looking for a job" / "I am hiring") should change the whole page, not just the hero. Scrolling down in seeker mode shows only seeker content; hiring mode shows only employer content. No mixing.

## What changes

**One audience state drives the page** (`src/components/landing/LandingSections.tsx`)

The existing `audience` state already controls the hero. Every section below the hero becomes audience-owned:

| Section | Seeker mode | Hiring mode |
|---|---|---|
| Logo strip ("Reads job posts on") | shown | replaced by a hiring-side line (candidates who opted in, evidence, assessments) |
| The problem | only the job seeker pain column, full width | only the employer pain column, full width |
| Seeker showcase (tailored docs + feature tiles) | shown | hidden |
| Employer showcase (candidate card, 4 steps, assessments) | hidden | shown |
| Trust | shown, with seeker-worded chips | shown, with employer-worded chips |
| FAQ | seeker questions only | employer questions only |
| Closing | single "Start free" CTA | single "Request employer access" CTA |

The `PAINS`, `FAQS` and trust chip data get split into a seeker set and an employer set, so nothing from the other side leaks in. Every CTA on the page passes the current audience, so there is never a mixed "Start free / I am hiring" pair below the fold.

**Switching feels intentional**

Switching re-keys the page body so the new sections fade in the same way the hero already does, and it scrolls back to the top of the hero so the user sees the new story from its beginning rather than landing mid-page in unrelated content. The choice keeps persisting to localStorage.

**Header nav follows the mode**

The top nav currently always shows "For employers". In hiring mode the anchors point at the employer sections; in seeker mode "For employers" becomes the way to flip the switch rather than a link to a hidden section, so no nav item can scroll to something that is not rendered.

## Technical notes

- All work is in `src/components/landing/LandingSections.tsx`, with small anchor-handling changes in `src/components/shared/Header.tsx` and minor CSS in `src/index.css` (single-column pain block, fade on audience change).
- Sections are conditionally rendered, not hidden with CSS, so the hidden side is not read by screen readers or search crawlers as duplicate content on the same viewport. Both stories remain in the DOM across a switch only for the duration of the fade.
- Anchor ids (`#features`, `#employers`, `#trust`, `#faq`) stay stable; clicking an anchor for the other side flips the audience first, then scrolls.
- The reveal-on-scroll observer is re-run after a switch so newly mounted sections animate in instead of sitting invisible.
- Verified at phone, tablet and desktop widths after the change.
