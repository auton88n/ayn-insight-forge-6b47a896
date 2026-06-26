
# Fix AYN Extension Features (Phase 1 + Phase 2)

Goal: make the extension actually *read* job pages correctly and make the AI backend resilient, so Score / Autofill / Contacts / Cover / Tailor stop feeling shallow or broken. No new features — just fix what's already there.

## Phase 1 — `extension/content.js` (page-reading layer)

The single biggest reason features feel dumb: the extension reads a truncated, partial, stale page.

1. **Full JD extraction.** Replace the single `document.querySelector(sel.desc)` in `extractJobText` with a `combinedText` helper that:
   - collects **all** matching nodes,
   - drops nodes nested inside another match (dedupe),
   - joins them into one full description string.
2. **"See more" expansion before reading.** Add a conservative `expandSeeMore` that clicks "see more / show more / read more / view more" controls once per URL. Hard-skip anything matching `apply|submit|sign in|save|follow|message|connect|easy apply`. Cap at 4 clicks.
3. **SPA re-detection.** Patch `history.pushState` / `replaceState` and listen for `popstate`. On every route change re-run: expand → arm auto-tracker → re-score cards → re-detect job, with retry backoff (up to 5 tries) because SPA content renders after the URL changes.
4. **`ca.indeed.com` selector fix.** Sort the selector map longest-pattern-first so `ca.indeed.com/viewjob` is no longer shadowed by `indeed.com/viewjob`.
5. **Quiet `chrome.runtime.lastError`** on `JOB_DETECTED` / `AUTO_TRACK_SUBMIT` via a `sendQuiet` helper (kills console noise + dropped events when side panel is closed).
6. **Tighten `nearestQuestionText`.** Prefer real `label` / `legend` / `aria-labelledby` / `aria-label` associations; only fall back to proximity text that actually looks like a question (ends in `?` or starts with `What|How|Are|Do|Have|Why|When|Where|Which`). Stops autofill from mislabeling fields and injecting wrong values.

## Phase 2 — `supabase/functions/resume-hub/index.ts` (backend resilience)

1. **Delete dead duplicate handlers.** `ext_job_score`, `ext_suggest_roles`, `smart_tailor`, and the second `ext_ask` are defined twice; only the first runs. Delete the unreachable second copies so there's one source of truth (prevents "I fixed it but nothing changed" traps).
2. **Verify retry/backoff + fallback on `callAI`.** HEAD already has some retry logic — confirm it covers: exponential backoff on `429`, fallback model on `402` (credits exhausted) and sustained `5xx`, and graceful degradation (keyword-only score) instead of throwing when AI is fully unavailable.
3. **Score the *full* JD, not a 500-char teaser.** Card-badge path stays cheap (title + company + snippet). When a full job page is open, `ext_job_score` should accept the full extracted JD from the new Phase 1 extractor and use it in the "senior recruiter" prompt so the must-have verification actually has something to verify against.

## Phase 3 — `extension/manifest.json` + side panel wiring

1. Bump `manifest.json` version to `1.4.3`.
2. Update the version label shown in `src/components/resume-hub/ExtensionTab.tsx`.
3. Rebuild `public/ayn-extension.zip` from `extension/` using `nix run nixpkgs#zip`.

## Out of scope (deliberately deferred)

- `"all_frames": true` + cross-origin iframe autofill (Phase 3 of the bigger plan — bigger structural change, do it next round).
- Per-ATS deep field maps for Workday/Greenhouse/Lever (Phase 3).
- Narrowing `host_permissions` from `https://*/*` to JOB_PAGE_RE domains (Web Store readiness — Phase 4).
- Backend "ingest + cache job by key" hybrid path (will follow once Phase 1's richer JD is live and we see real payload sizes).

## Verification

- Reload unpacked extension at `chrome://extensions`, confirm version `1.4.3`.
- Open a LinkedIn job, click through 2-3 postings without reloading — side panel JD must update each time and show full text (not the truncated blurb).
- Open a `ca.indeed.com` posting — company field populates.
- Open a Workday posting — JD updates on next-job navigation.
- Trigger Score with credits exhausted (or mock 402) — must fall back, not crash.
- Grep `supabase/functions/resume-hub/index.ts` for `ext_job_score` / `smart_tailor` — exactly one definition each.

## Technical notes

- Phase 1 edits are localized to `extension/content.js`; no other extension files change in Phase 1.
- Phase 2 edits are localized to `supabase/functions/resume-hub/index.ts`; deploys automatically.
- Sync against current HEAD (`04a8318`) before editing — recent "page detection" commit touched side panel + DETECT_PAGE but left `extractJobText` and the one-shot 1500ms timer intact, so Phase 1 still applies cleanly.
