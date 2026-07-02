# v1.9.58 — Skip Diagnostics + Vision Clarity

## 1. Explain "High-accuracy vision" in the sidepanel
- In `extension/sidepanel.html` / `sidepanel.js`, update the helper text under the toggle to something honest and short:
  > "Uses a screenshot + AI to read forms that don't expose proper labels (canvas UIs, unusual ATS layouts). Slower and costs more tokens. Leave off unless a form is being skipped."
- No behavior change to the toggle itself.

## 2. Detailed skip logging for open-text fields
Goal: for every textarea / contenteditable / role=textbox that ends up empty, record **why**, **which rule matched**, and **which DOM selector was used** — visible in DevTools and persisted for review.

### 2a. Content script (`extension/content.js`)
- Add `aynLogSkip(field, reason, meta)` helper that:
  - Builds a stable CSS selector for the element (id → name → nth-of-type path, max 4 segments).
  - Emits `console.groupCollapsed('[AYN skip] <reason>')` with: selector, tag, role, resolved question, labelSource, kind, required flag, matched rule name, backend response snippet, verify-pass result.
  - Pushes the entry into an in-memory `window.__aynSkipLog` ring buffer (last 50) so the sidepanel can read it.
- Instrument the existing decision points to call `aynLogSkip` with a specific `reason` code:
  - `no_question_resolved` — `aynFieldQuestion` + `aynNearbyPrompt` + `aynShortLabelFallback` all returned empty.
  - `backend_returned_empty` — `ext_autofill` responded with no value for this field.
  - `backend_skipped_optional` — model chose to skip; log the model's stated reason if present.
  - `write_verify_failed` — value written but wiped by React after `aynSettleReapply` passes.
  - `editor_unsupported` — rich editor detected but no adapter matched.
  - `hidden_or_offscreen` — element not visible at fill time.
- Each entry stores the exact rule/function name that produced (or failed to produce) the value, e.g. `resolver: aynNearbyPrompt`, `writer: setNativeValue+paste`.

### 2b. Background script (`extension/background.js`)
- When the fill run completes, forward the skip-log ring buffer alongside the existing `autofill_runs` telemetry payload.

### 2c. Backend (`supabase/functions/resume-hub/index.ts`)
- Extend `ext_autofill` to include a short `skip_reason` string in the per-field response when it deliberately returns no value (currently it just omits). Content script maps that into `backend_skipped_optional` above.
- Persist the skip log JSON into a new column on `public.autofill_runs`.

### 2d. Database
- Migration: `alter table public.autofill_runs add column skip_log jsonb;`
- Keep existing RLS.

### 2e. Sidepanel debug view (optional, small)
- Add a hidden "Show last skip log" link in `sidepanel.html` that renders `window.__aynSkipLog` as a table (reason, question, selector, rule). Only visible after clicking the version number 5x — no visual noise for normal users.

## 3. Version
- Bump `manifest.json` and `AYN_BUILD` to `1.9.58`.
- Rebuild `public/ayn-extension.zip`.
- Redeploy `resume-hub` edge function.

## Out of scope
- No changes to the autofill algorithms themselves — this release is purely observability + one copy tweak.
