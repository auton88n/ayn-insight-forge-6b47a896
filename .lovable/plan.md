## Why your Fill tab doesn't show the job title card

Looking at the screenshot, the Autofill button is shown but the job hero card above it (logo + company + title + field count) never appears. I traced the bug:

- `renderFillHero()` removes the `hidden` CSS class on `#fill-job-banner`
- but `refreshForActiveTab()` (runs on every tab change / SPA navigation) hides it with `fb.style.display = 'none'`
- Inline style beats the class, so the banner stays invisible forever after the first navigation

So v1.9.5 shipped the hero card but a stale line of code keeps killing it.

## Fix plan (Chrome extension only)

### 1. Fix the hero card never showing — `extension/sidepanel.js`
- In `refreshForActiveTab()` replace `fb.style.display = 'none'` with `fb.classList.add('hidden')` so `renderFillHero` can re-show it
- In `renderFillHero()` also clear any leftover inline `display` style as a safety net
- In `detectForFill()` reset hero text to neutral placeholders before re-detect so the previous job never flashes

### 2. Make the Fill hero look like Jobright (better than now) — `extension/sidepanel.html` + `extension/sidepanel.css`
Redesign the `#fill-job-banner` card so the Fill tab leads with a clean job context block, then the orange CTA, mirroring Jobright's layout:

```text
┌──────────────────────────────────────────┐
│ [logo]  Company name                     │
│         Product Owner, Agentic AI        │
│         12 fields ready · partial ok     │
└──────────────────────────────────────────┘
       ⚡ Autofill This Application
```

Visual upgrades:
- 56px rounded company logo (Clearbit) with subtle border + soft shadow, fallback initial chip in AYN orange
- Company name as small uppercase muted label, job title as the prominent line (16–17px, semibold, 2-line clamp)
- Meta row with a small bolt icon + "N fields ready" pill
- Card uses the same white surface + soft border + shadow tier used on the rest of the panel (no gradient stripe)
- Tighter top spacing so the CTA sits directly under the card
- Keep the hidden match-ring slot untouched (Score tab still owns scoring)

### 3. Polish the Autofill CTA
- Full-width 44px orange button, bolt icon, label "Autofill This Application"
- Subtle press state + 8px gap from the hero card
- Remove the leftover empty-state padding when the hero is active

### 4. Versioning & packaging
- Bump `extension/manifest.json` to `1.9.6`
- Update the download label in `src/pages/ResumeHub.tsx` to v1.9.6
- `node --check` all touched extension JS
- Rebuild `public/ayn-extension.zip` from `extension/`

### Out of scope
- No backend / edge function changes
- No other tabs touched (Score, Ask, Contacts, Cover, Tracker, Resume)
- No dashboard styling beyond the version label
