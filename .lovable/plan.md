# Fill tab: Jobright-style job hero + cleaner Autofill CTA (v1.9.5)

## Problem
Today our Fill tab opens with a bare orange "Autofill This Application" button and no job context. Jobright shows a rich job card first (logo, company, role, posted/applicants, match %), then a single Autofill button below. Ours feels generic; theirs feels grounded in the actual job.

## Goal
Reuse the job context we already extract (title, company, logo, posted date, applicant count, match score, score ring) and surface it as a polished hero card at the top of the Fill tab. The orange Autofill CTA becomes the clear next action under that card. No logic changes — pure UI restructure inside the Fill tab of `extension/sidepanel.html` + `sidepanel.js`.

## What changes (extension only — no edge function or backend work)

### 1. New "Job Hero Card" at the top of Fill tab
Layout, top to bottom inside one rounded white card with soft shadow:
- Row 1: square company logo (Clearbit, with letter fallback) on the left; company name (bold) + industry/subtitle (muted) in the middle; circular match-score ring on the right (reuses `setHeroRing` from v1.9.4, tier-tinted stroke green/orange/amber/red).
- Row 2: job title in larger semibold ink.
- Row 3: muted meta line — "{postedRelative} · {applicants} applicants" when known, falls back to host/location.
- Hairline divider.
- Row 4: optional "Insider Connections" placeholder hidden by default (we don't have contacts data wired into Fill yet, so it stays out for v1.9.5).

### 2. Autofill CTA placement
- Move the existing orange "Autofill This Application" button directly underneath the hero card.
- Keep it full-width, taller (52px), bold label, lightning icon, lifted orange shadow. No copy change.
- Keep current click handler, progress bar, and result list rendering below it untouched.

### 3. Resume attachment card
- Keep the existing "Resume file attachment" panel as-is below the CTA. Only nudge spacing so it sits as a clear secondary block, not competing with the hero.

### 4. Empty / loading states
- Before a job is detected: hero card shows skeleton (gray logo square, two gray bars, dimmed ring at "--"). CTA stays enabled and falls back to current behavior.
- After detection: populated with real data; ring animates from 0 to the local score (already computed by v1.5.x local scorer; no AI call added).

## Files touched
- `extension/sidepanel.html` — add `.job-hero` styles + new markup block at the top of `#tab-fill`. Restructure the existing Fill section so the CTA sits below the hero.
- `extension/sidepanel.js` — small `renderFillHero(job)` helper that populates logo, company, title, meta, and calls `setHeroRing('fill-hero-ring', 'fill-hero-ring-num', pct)`. Call it from the same place that already updates Fill state on job detection / SPA navigation.
- `extension/manifest.json` — bump version to `1.9.5`.
- `src/pages/ResumeHub.tsx` — bump download label to v1.9.5.
- Rebuild `public/ayn-extension.zip`.

## Non-goals
- No changes to autofill logic, scoring math, edge functions, or any other tab.
- No "Insider Connections" data wiring in this pass (placeholder only, hidden).
- No color system changes — orange CTA + tier-tinted ring stay the v1.9.4 palette.

## Verification
- `node --check` on all extension JS.
- Manually confirm in the side panel: hero renders with logo/title/meta/ring, CTA sits below, resume card sits below CTA, autofill click still runs and progress + result list still populate.
