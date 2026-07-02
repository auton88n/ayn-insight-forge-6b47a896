# AYN Extension v1.9.55 — Jobright Parity Pack

Close all four architectural gaps identified in the reverse-engineering of Jobright v1.14.0. No UX changes to the side panel; this is plumbing.

## 1. `declarativeNetRequest` — CSP strip for hostile ATS pages

**Why:** Workday, some Greenhouse embeds, and a few Oracle Cloud pages set a `Content-Security-Policy` that blocks our `page-world.js` power-setter or refuses `blob:` PDF downloads. Jobright ships a static ruleset to strip those headers on job-page navigations.

**Changes:**
- `manifest.json`: add `"declarativeNetRequest"` permission and a `declarative_net_request.rule_resources` block pointing at `rules/csp.json`.
- New file `extension/rules/csp.json` — one rule per ATS host pattern (Workday `*.myworkdayjobs.com`, Greenhouse `boards.greenhouse.io`, Lever `jobs.lever.co`, Ashby `jobs.ashbyhq.com`, iCIMS, SmartRecruiters, Taleo), each: `action: { type: "modifyHeaders", responseHeaders: [{ header: "content-security-policy", operation: "remove" }, { header: "content-security-policy-report-only", operation: "remove" }] }`, `condition.resourceTypes: ["main_frame", "sub_frame"]`.
- Scope narrowly — do NOT apply to `<all_urls>` (would break banking, gov sites).

## 2. Split `content.js` into modules

**Why:** `content.js` is a ~3k-line monolith. Jobright splits into `constants.js` + `filler.js` + `contents.js` for parse-time and cache reuse.

**Changes:**
- New `extension/constants.js` — regexes, exclude lists, similarity thresholds, timing constants (`aynFieldQuestion`, language synonyms, `AYN_IS_TOP`). Loaded first in `content_scripts[0]`.
- New `extension/filler.js` — extraction of `aynFillTextbox`, `aynSettleReapply`, radio/checkbox/select fillers, verify-and-retry executor, structural radio grouping. Loaded second.
- `extension/content.js` — trimmed to orchestration: `SCAN_FORM`, `INJECT_VALUES`, activity glow, message routing. Calls into `filler.js` globals.
- `manifest.json`: `content_scripts[0].js` becomes `["constants.js", "filler.js", "content.js"]` (order matters, all isolated world).
- `page-world.js` and its MAIN-world entry unchanged.
- **Zero behavior change** — this is a pure refactor. Add a smoke-test checklist in `README.md` covering Workday, Greenhouse, Lever, Ashby, LinkedIn Easy Apply.

## 3. Page-to-extension click bridge + stable key

**Why:** So aynn.io (dashboard "Autofill this job" button) can trigger the extension without the user opening the side panel. Requires a fixed extension ID.

**Changes:**
- `manifest.json`: add `"key"` field (generate one via `openssl genrsa 2048 | openssl rsa -pubout -outform DER | base64` — stored as text, safe to commit). Also add `"externally_connectable": { "matches": ["https://aynn.io/*", "https://*.aynn.io/*", "https://*.lovable.app/*"] }`.
- `background.js`: add `chrome.runtime.onMessageExternal.addListener` handling `{ type: "AYN_TRIGGER_AUTOFILL", jobUrl }` — opens/focuses the tab, then routes into existing `AUTO_AUTOFILL`.
- `src/lib/extension.ts` (new, dashboard side) — helper `triggerAutofill(jobUrl)` that calls `chrome.runtime.sendMessage(EXTENSION_ID, ...)`, with `EXTENSION_ID` derived from the committed key (compute once, hardcode as constant).
- Wire an "Autofill with AYN" button on `/resume-hub` job cards (uses the helper; falls back to "Install extension" if `chrome.runtime` is undefined).

## 4. aynn.io deep-link handler

**Why:** Jobright's `scroll-to-anchor.js` is a domain-scoped content script that reads a URL hash on their own site to jump the user into a specific job. AYN needs the reverse: when the dashboard hands off to a job page, restore context (JD, saved answers) automatically.

**Changes:**
- New `extension/deep-link.js` — content script scoped to `matches: ["https://aynn.io/handoff*", "https://*.aynn.io/handoff*", "https://*.lovable.app/handoff*"]`. Reads `?job=<encoded url>&resume=<id>` from `location`, stores into `chrome.storage.local` under `ayn:pendingHandoff`, then `window.close()` or redirects to the target job URL.
- `content.js` on first load per tab: checks `ayn:pendingHandoff`, if the current URL matches the stored job URL, hydrates JD/resume selection and shows a toast "Restored from AYN".
- Dashboard: add a "Continue on the job page" link that opens `https://aynn.io/handoff?job=...` in a new tab.

## Rollout

- Bump `manifest.json` version to `1.9.55`.
- Rebuild `public/ayn-resume-tailor.zip` via the existing nix zip command.
- Update `README.md` install steps to note the new stable extension ID.
- Post-install regression: run the smoke-test list on Workday, Greenhouse, Lever, Ashby, LinkedIn Easy Apply, iCIMS. Confirm autofill success rate is unchanged or better; confirm CSP rules only fire on the listed hosts (check `chrome://extensions` → Service worker → `chrome.declarativeNetRequest.getMatchedRules`).

## Technical notes

- The `key` field permanently pins the extension ID. Once shipped, do not change it — users would get a duplicate install.
- `declarativeNetRequest` static rules count against the 30k global rule limit; we'll use ~10 rules, negligible.
- `externally_connectable` uses `https://` match patterns only — no `<all_urls>`, no wildcards on TLD.
- All existing v1.9.54 behavior (frame-aware routing, `@@F<n>@@` namespacing, verify-and-retry) is preserved.
