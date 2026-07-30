## Goal

Bring the marketing page in line with v3.0.0 (AYN is read only, no autofill) and remove the broken job tracking feature from the web app and the extension.

## Part 1: Landing page rewrite

Files: `src/components/landing/LandingSections.tsx`, `src/components/landing/HeroFillMockup.tsx`, `src/components/LandingPage.tsx`, `index.html`.

New promise, match score first:
- H1: knowing whether a job is worth your hour, before you spend it.
- Sub: AYN reads the real posting, scores your fit, then writes the resume and cover letter for that role.
- CTAs unchanged: Start free, Add to Chrome.

Hero visual: `HeroFillMockup` currently animates a form filling itself. Replace it with a match score card mockup (same CSS only animation approach, no canvas, no new dependency): score dial counting up, three grounded reason lines, and a "reads the real posting" chip. Reduced motion respected as today.

Section changes:
```text
HERO           match score promise + score card mockup
PROOF STRIP    "Reads job posts on" (was "Fills applications on")
HOW IT WORKS   1 Add your resume once  2 Open any job posting  3 See your score, then tailor
BENTO          match score (big), grounded on the real posting, tailored resume and
               cover letter, Ask AYN about the role, one workspace
FOR EMPLOYERS  unchanged
TRUST          reworded: AYN grounds every score in the posting text and tells you what
               it could not read. It never writes to a page.
FAQ            4 answers rewritten with no autofill claim
CLOSING        "Know before you apply"
```

Removed copy: every autofill claim, "click fill", "it learns your answers", "fill history", the run summary panel. `RunSummaryIllustration` is dropped from the page (kept in `ProductIllustrations.tsx` unless unused elsewhere, then removed too).

SEO: title, meta description, keywords and the `createFAQSchema` entries in `LandingPage.tsx` plus the `<title>`/og/twitter tags in `index.html` all move from "autofill job applications" to match score and tailored resume wording. Single H1, section h2s, canonical unchanged.

## Part 2: Remove job tracking everywhere

Web app:
- Delete `src/components/resume-hub/TrackerTab.tsx`.
- `src/pages/ResumeHub.tsx`: drop the `tracker` tab key, nav entry, and render branch; redirect `?tab=tracker` to overview.
- `src/components/resume-hub/JobsTab.tsx`: remove `addToTracker` and the "Add to tracker" button.
- `src/components/resume-hub/OverviewTab.tsx`: remove the `job_applications` count stat and reflow the remaining stats.

Extension:
- `sidepanel.html`: remove the Tracker tab button, the `v-tracker` view, the tracker styles, and the "Save job to tracker" button in the cover view.
- `sidepanel.js`: remove the tracker view id, tab routing, `loadTracker`, `renderTracker`, save handlers and their listeners.
- `background.js`: remove the application tracker actions and the submit-time score enrichment path that only fed the tracker.
- Bump `manifest.json` to 3.0.1 and the `AYN_BUILD` fallback, then run `node extension/build.mjs`.

Backend and data: the `job_applications` table and its rows are left untouched, and the tracker actions in `supabase/functions/resume-hub` are deleted so nothing calls them.

## Verification

- `scripts/check-wiring.mjs` must pass (it checks sidepanel messages have handlers and extension actions are registered).
- Grep for `tracker` and `autofill` in `src/` and `extension/` to confirm no dangling references.
- Playwright screenshots of `/` at 390px, 826px and 1440px, plus `/resume-hub` to confirm the tab row reflows.
