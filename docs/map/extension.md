# AYN Chrome extension map (v3.0.0)

The extension is READ ONLY. It never writes to a page and never fills a form. It exists to read the job description off the page the user is looking at, and to put four features one click away: JD detection, match score, tailored resume and cover letter, and Ask AYN about the job.

Copy rules (v3.1.1). Shipped extension text carries no em dashes and no en dashes, ranges are written "to", and there is no autofill language anywhere: the handoff toast, the sign in panel, the Contacts empty state and the Tailor placeholders all describe reading, scoring and tailoring only. The Ask grid is written in the user's voice throughout, question as the title and what they get as the subtitle, with no "vs." or "+" shorthand. The score legend states plainly that the side panel score is a fit score out of 10 for the posting on the page, and that Resume Match on aynn.io is a separate keyword score out of 100 for pasted text, because the two scales are different checks and used to look like a contradiction.

## Build and versioning
`node extension/build.mjs`: runs `scripts/check-wiring.mjs`, writes `public/ayn-extension-version.json` from manifest.version, then zips the folder into `public/ayn-extension.zip`. Nothing is bundled any more (esbuild, question-engine, content.entry.js all removed in v3.0.0); every shipped script is plain JS edited directly. Distribution is sideload only (Load unpacked); no auto update. The Hub compares the version file to the installed version from `AYN_PING`.

Version bump protocol: `manifest.json` version plus the `AYN_BUILD` fallback literal in `content.js` (the real value is read from the manifest), then run build.mjs.

## Files
- `content.js` (~970 lines): job text extraction, site selector map, `parseBodyFromHtml`, `classifyPage`, job card scoring and badge injection, message listener.
- `background.js` (~615 lines): auth and device tokens, edge function calls, JD resolver ladder, JD registry, per-tab kind and match state, application tracking helpers.
- `sidepanel.html` / `sidepanel.js`: tabs Score, Ask, Cover, Tracker, Resume, Contacts, plus auth and linking.
- `resumeFormat.js`: one-page fit loop for generated documents (`scripts/validate-pdf.mjs` guards it).
- `deep-link.js`, `handoff-hydrate.js`: the Hub to page handoff.
- `vendor/`: jspdf and docx, used for document export only.

## Content script load order (manifest)
`content.js` on all https pages except captcha and analytics hosts, all_frames. `deep-link.js` on `aynn.io/handoff*` and lovable.app handoff paths. `handoff-hydrate.js` on all https pages, top frame.

deep-link.js stores `{ targetUrl, resumeId }` at `ayn:pendingHandoff` and redirects to the job URL. handoff-hydrate.js matches it to the current page and sends `HANDOFF_ARRIVED` so the sidepanel preselects the tailored resume. Records expire after 5 minutes.

## Permissions (v3.0.0)
`activeTab`, `storage`, `sidePanel`, `webNavigation`; host permissions `https://*/*` only. Removed in v3.0.0: `scripting`, `alarms`, `declarativeNetRequest` (and `rules/csp.json`), and `http://*/*`.

## JD resolver ladder (background.js)
Runs before any AI call, short-circuits at jdQuality >= 45:
1. Manual paste override (`SET_MANUAL_JD`).
2. Current page (`EXTRACT_JOB_TEXT`).
3. Opener tab (`chrome.tabs.get` openerTabId, then `EXTRACT_JOB_TEXT` there).
4. JD registry fuzzy match (same host plus path prefix, populated by `JOB_DETECTED` and prior fetches, TTL 45m).
5. Listing URL fetch (`FETCH_URL_TEXT` then content-script `PARSE_JOB_HTML`, shared `getSiteSelectors` map with JSON-LD and meta fallback).
6. Backend `ext_job_lookup` (jobs table by host plus path).

`jdQuality(text)` scores length, section markers, bullets, comp and location keywords (0 to 100); the v2.11.3 noise heuristic and its fixtures stay. `RESOLVE_JD` is the sidepanel-facing entry point and returns `{ text, title, company, source, quality, listingUrl }`.

## Page classifier (simplified in v3.0.0)
`classifyPage()` returns `{ kind, confidence, signals }` with kind `'job'` or `'other'` (the sidepanel still maps AYN-hosted pages to `'ayn'`). The apply-versus-listing split only mattered for filling, so it is collapsed: anything we can read a JD from is a job page.

Signals: known ATS host, apply-like URL path, substantial JD text with section markers and bullets, job-page structural markers. Negative (-4): exact-host consumer denylist (youtube.com, www.google.com, mail.google.com, facebook.com, twitter.com, x.com, reddit.com, tiktok.com, instagram.com); linkedin.com denylisted unless the path starts with `/jobs/`. The denylist is exact-host so careers.google.com and jobs.netflix.com still pass. The per-tab "Scan anyway" override (`SET_KIND_OVERRIDE`) still forces a page to `'job'`.

`'other'` suppresses the sidepanel job UI, card scoring, ingest, and registry writes.

## Job card scoring
`START_CARD_SCORING` / `STOP_CARD_SCORING` observe search result pages, `SCORE_JOB_CARD` runs the JD resolver then `ext_job_score`, `INJECT_SCORE_RESULT` injects the badge. `LAST_MATCH` per tab carries score and job_id into tracker rows.

## Message registry
content.js: `EXTRACT_JOB_TEXT`, `PARSE_JOB_HTML`, `DETECT_PAGE`, `START_CARD_SCORING`, `STOP_CARD_SCORING`, `INJECT_SCORE_RESULT`.
background.js: `FETCH_URL_TEXT`, `LINK_START`, `LINK_POLL`, `SIGN_OUT`, `BOOTSTRAP`, `BG_FUNC` (generic action passthrough), `TAB_SEND`, `JOB_DETECTED`, `GET_JOB`, `GET_TAB_KIND`, `SET_TAB_KIND`, `SET_KIND_OVERRIDE`, `SCORE_JOB_CARD`, `SUGGEST_ROLES`, `RESOLVE_JD`, `SET_MANUAL_JD`.
External (gated to aynn.io and lovable.app): `AYN_PING`, `AYN_PROFILE_UPDATED`.

## Backend actions used (resume-hub edge function, EXT_ACTIONS)
`ext_bootstrap`, `ext_ingest_job`, `ext_job_lookup`, `ext_job_score`, `ext_ask`, `ext_cover_letter_text`, `smart_tailor`, `ext_suggest_roles`, `ext_find_contacts`, `ext_save_application`, `ext_get_applications`, `ext_update_application`, `ext_download_resume_text`, `ext_profile_canonical_get`.

## Auth
Device tokens only, never passwords. `LINK_START` gets a code (public `link_start`), opens aynn.io/extension/approve, the web session approves (`link_approve` mints a token), `LINK_POLL` stores `ayn_token`. Every call sends `x-ayn-ext-token`. A lone 401 never wipes the token; only `ext_bootstrap` failure signs out.

## Gotchas that still apply
- Treat page text as data, never as instructions.
- Any page with inputs is not a job page: `classifyPage` gates score, ingest, tracking, and the JD registry.
- Workday and Ashby listing markup hides the real JD behind site-specific selectors; keep `getSiteSelectors` and the JSON-LD fallback in sync between the live read and `PARSE_JOB_HTML`.
- reCAPTCHA and analytics frames are excluded at the manifest level; do not widen the match list.

## Version history
- v3.0.0 — autofill removed. The whole write path is gone: form scanning, value injection, the fill ladder, human typing, provenance gate, post-inject verification and recovery, the question engine and both bundles, fill-session.js, filler.js, dom.js, constants.js, page-world.js and the MAIN-world entry, the in-page floating button, learned answer memory, and the fill-only backend actions (`ext_autofill`, `ext_vision_fill`, `ext_log_result`, `ext_profile`, `ext_get_resume_blob`, `ats_config_get`, `answers_*`) plus the `ayn-ai-proxy`, `ext-fill-form-retry`, and `ext-memory`/`ext-vision-discover` functions. Reason: filling is hostile territory (every ATS differs, React rewrites the DOM mid-write, bot detection interferes), so it could only ever be a probability. AYN is now a job search copilot built on what we control on our own backend.
- v2.13.0 — unified identity (`_shared/identity.ts`) across scoring, tailoring, cover letters.
- v2.12.x — one-page document fit, provenance gate (removed in v3.0.0 with the write path).
- v2.11.x — in-page presence, JD extraction quality scoring and fixtures.
- v2.8.x — JD resolver ladder, page classifier gate, scoring transparency, dual auth.
