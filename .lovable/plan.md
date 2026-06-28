## Three targeted extension fixes

All changes inside `extension/` (HTML/JS only). Bump version to **v1.9.7**, `node --check` everything, rebuild `public/ayn-extension.zip`, update download label in `src/pages/ResumeHub.tsx`.

### 1. Stop showing "UNKNOWN COMPANY" on the Fill hero
The Fill hero says "Unknown Company" whenever the page (e.g. an Ashby/Greenhouse/Workday application form) does not expose a company DOM node. Today `renderFillHero` falls back to the page host, but `applyFormReady` (the fast path that runs before DETECT_PAGE returns) passes `F.company` which is empty on first paint, and the existing `extractCompanyFromTitle` only handles `Title - Company` / `Title at Company` patterns.

Fixes in `extension/sidepanel.js`:
- Add a `deriveCompany(tab, pageCompany, pageTitle)` helper that returns the first usable value from: page-extracted company → `extractCompanyFromTitle` → cleaned host map (e.g. `boards.greenhouse.io/acme` → "Acme", `acme.ashbyhq.com` → "Acme", `acme.wd5.myworkdayjobs.com` → "Acme", `jobs.lever.co/acme` → "Acme") → capitalized bare hostname (`careers.openai.com` → "OpenAI" / "Openai"). Never return empty.
- Use it inside `applyFormReady` and `detectForFill` so the hero always shows a real company string before AND after the deep scan.
- Apply the same derivation in the Score, Contacts, and Cover hero blocks (they share the same blank-company bug) so the label is consistent across tabs.
- Tighten `renderFillHero` so "Unknown Company" is never rendered; if everything fails, show the cleaned hostname.

In `extension/content.js`, broaden the company selector list with ATS-specific fallbacks already used by the JD extractor: `[data-source="company-name"]`, `[class*="companyName"]`, `[class*="company-name"]`, Greenhouse `.app-title .company-name`, Ashby `[class*="_companyName"]`, Workday `[data-automation-id="jobPostingCompany"]`, so DETECT_PAGE returns a real company more often. No new network calls.

### 2. Make "Scan this page again" actually rescan
Today the empty-state CTA in the Fill tab is rendered but no `id` / click handler runs `detectForFill()` again after the first failure. Clicking it does nothing, matching the screenshot complaint.

Fix in `extension/sidepanel.html` + `extension/sidepanel.js`:
- Give the button a stable id (`fill-rescan-btn`) and a matching button inside the Score empty state (`score-rescan-btn`).
- Wire both to handlers that:
  1. Show a small spinner on the button (`Scanning…`)
  2. Call `chrome.tabs.reload(tabId, { bypassCache: false })` only if the user opts in (no auto-reload by default — just rerun the scan)
  3. Re-run `detectForFill()` / `detectForScore()` after a 250ms debounce so the content script has time to reinject on SPA navigations
  4. If `chrome.runtime.lastError` indicates the content script is not injected, call `chrome.scripting.executeScript({ files: ['content.js'] })` via a new `RESCAN_INJECT` message to background.js, then retry once.
- Background change in `extension/background.js`: add a `RESCAN_INJECT` handler that programmatically injects `content.js` into the active tab when missing, then responds so the panel can retry.
- Show a toast ("Page still not ready — try refreshing the tab") only if the second attempt also fails, instead of leaving the same dead empty state.

### 3. Move the tab bar to the TOP (above the main view) instead of the bottom
Currently `<div class="tabs" id="tabs">` is rendered after `<div class="main">` and CSS makes it a sticky bottom rail (v1.9.4).

Fixes in `extension/sidepanel.html`:
- Move the `<div class="tabs hidden" id="tabs">…</div>` block from the end of `<body>` to directly after the header (`.header`) and before `<div class="main">`.

Fixes in `extension/sidepanel.html` `<style>`:
- Update `.tabs` rules: replace `border-top` with `border-bottom`, drop `env(safe-area-inset-bottom)` padding, use `padding: 8px 8px 10px;`.
- Update `.tab.active::after` so the active indicator sits at the BOTTOM edge of each tab pointing down (`bottom: 3px` stays but now visually under the active tab as a top-rail underline — which is the desired Jobright look in the screenshot).
- Keep horizontal scroll, icon-over-label layout, and orange active pill exactly as-is — no visual identity change, only position.

No changes to: Score/Contacts/Cover/Tracker/Resume/Ask logic, AI prompts, edge functions, dashboard, or styles outside the extension.

### Packaging
- `extension/manifest.json` → `"version": "1.9.7"`
- `src/pages/ResumeHub.tsx` download label → `Download v1.9.7`
- `node --check extension/sidepanel.js extension/content.js extension/background.js`
- Rebuild `public/ayn-extension.zip` from `extension/`
