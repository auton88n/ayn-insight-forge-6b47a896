## Goal

Replace the two side by side CTA buttons in the hero with a single audience switch placed at the top of the hero. Choosing "Looking for a job" or "Hiring" swaps the whole hero content (headline, subline, button, note, mockup) to speak to that audience only.

## What changes

All in `src/components/landing/LandingSections.tsx` plus a few new styles in `src/index.css`. No backend, no data, no logic changes.

### 1. Audience state
Add local state in `LandingSections`: `audience` as `'job_seeker' | 'employer'`, defaulting to `job_seeker`. Persist the last choice in `localStorage` so a returning visitor lands on the side they picked.

### 2. The switch
A pill shaped segmented control sitting above the headline, where the "Free to start, no credit card" pill is today:

```text
 ┌───────────────────────────────────────┐
 │  I am looking for a job │  I am hiring│
 └───────────────────────────────────────┘
```
- Two buttons inside one rounded track, the active one filled with AYN orange, the inactive one quiet.
- Real buttons with `role="tab"` / `aria-selected` so it is keyboard and screen reader friendly.
- The "Free to start, no credit card" pill moves under the switch and only shows on the seeker side (employers are onboarded one at a time, so it shows "Onboarding employers one at a time" there instead).

### 3. Hero content per audience

Seeker:
- Headline: "Stop rewriting your resume for every job."
- Lead: a resume and cover letter written for the exact posting in front of you, from your real history, in the time it takes to read the ad.
- Button: "Start free" opening signup with role job_seeker.
- Note: read only on every page, AYN never types into a form and never submits anything for you.
- Art: `ExtensionOnPostingMockup`.

Employer:
- Headline: "Three people worth talking to, not six hundred maybes."
- Lead: describe the role once, AYN searches people who chose to be found and returns the strongest fits with the evidence, the gaps and a way to verify them before you commit.
- Button: "Request employer access" opening signup with role employer.
- Note: contact details stay private until the candidate accepts your proposal.
- Art: `CandidateCardMockup`.

The swap is a short crossfade with a small vertical lift so it reads as a change of view rather than a page jump. Both mockups already exist in `AppMockups.tsx`.

### 4. Rest of the page
The sections below the hero stay as they are, both audiences visible when scrolling. One small addition: when the employer side is selected, the page scrolls the reader toward the employer section, and vice versa, only when the switch is clicked, never on load.

## Technical notes

- `LandingSections` becomes stateful; it is already a `memo` component and keeps that.
- New CSS classes: `.lp-switch`, `.lp-switch-btn`, `.lp-switch-btn.is-on`, added next to the existing `.lp-*` landing tokens in `src/index.css`, using existing semantic tokens (no hardcoded colors).
- `onStartFree(role)` is already wired through `src/components/LandingPage.tsx` to the role aware auth modal, so the CTA needs no new plumbing.
- Hero art is swapped by key so the crossfade animates correctly; both mockups are inline SVG, so there is no extra network cost.
