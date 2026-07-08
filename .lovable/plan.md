# Plan: Fix autofill correctness across all ATSes (not just Ashby)

Goal: stop "AI writes the right answer, then it disappears" and "field left blank" across Workday, Greenhouse, Lever, iCIMS, Ashby, and generic forms. The bugs are structural, not Ashby-specific.

## Root causes (apply to every ATS)

1. **Wrong write primitive** — `el.value = v; dispatch('input')` is a no-op in React 18 / Vue 3 / Angular controlled inputs. Value reverts on next render.
2. **7-stage post-fill pipeline** (`injectValues → settleReapply → postInjectVerify → retryUnverified → closedLoopReplan → visionFallback → stabilizeAfterRender`) — each stage rescans and rewrites without checking if the live value already matches, so stages overwrite each other's correct answers.
3. **Stale node maps** — `__AYN_BG_MAP__` / `__AYN_TEXT_FIELD_MAP__` cached at scan time; after any rerender the refs are dead and buttongroups silently skip.
4. **AI used for deterministic decisions** — LinkedIn URL validation, work-auth polarity, Yes/No compliance questions are regex / lookup tables, not LLM calls.
5. **Adapter contract too thin** — writes live in shared `filler.js` instead of per-ATS adapters, so Workday's dropdown ritual and Ashby's combobox close ritual collide.
6. **No format guards before write** — LinkedIn field accepts `www.ghazi.today`, phone accepts free text, etc.

## Changes (ATS-agnostic)

### 1. One canonical write primitive (`extension/dom.js`)
Single `writeControlled(el, value)` used everywhere:
```
nativeSetter.call(el, value)   // bypass React _valueTracker
dispatch InputEvent('input', {bubbles, data: value})
dispatch Event('change', {bubbles})
el.blur()
```
Delete every other `el.value =` / `dispatch('input')` call in `filler.js`, `content.js`, `page-world.js`.

### 2. Collapse the 7-stage pipeline into one verify-and-retry loop (`content.js`)
Replace `injectValues → … → stabilizeAfterRender` with:
```
for each field:
  if liveMatchesWanted(field, want): mark ok, continue
  adapter.write(field, want)
  wait MutationObserver 500ms
  if liveMatchesWanted: ok
  else retry once
  else log revert_after_retry, skip
```
Single `aynLiveMatchesWanted(field, want)` re-reads the live DOM (input value / selected buttongroup / checked radio / combobox pill) with the same normalization.

### 3. Fingerprint-based re-anchoring (all adapters + `field-detector.ts`)
Every field gets `fingerprint = sha256(normalize(label) + kind + optionsSignature)`. `__AYN_BG_MAP__` and `__AYN_TEXT_FIELD_MAP__` are rebuilt from live DOM keyed by fingerprint at the start of each pass. Dead refs never used.

### 4. Move writes into adapters (`adapters/*.ts`)
Add `write(field, want, doc): Promise<WriteResult>` to `ATSPlugin`. Each adapter owns its ATS's quirks:
- **Ashby**: combobox → type exact canonical option from `window.__appData`, click option, Escape + blur to close listbox.
- **Workday**: dropdown → click trigger, wait for `data-automation-id="promptOption"`, click matching option.
- **Greenhouse**: react-select → focus, type, Enter.
- **Lever**: native `<select>` → set value + change event.
- **iCIMS**: iframe-scoped native inputs.
- **Generic**: fallback to `writeControlled`.

`filler.js` keeps only profile→answer resolution; no DOM writes.

### 5. Read ATS's own state where available
- **Ashby**: parse `window.__appData` for canonical option labels, required flags, field types.
- **Workday**: read `window.workday`/`_dwsxfl` when present for form definition.
- **Greenhouse**: read embedded `application` JSON.
Fall back to DOM scraping when unavailable.

### 6. Deterministic decision layer (`filler.js` + new `semantic-types.ts` rules)
Move these OUT of the AI path:
- **LinkedIn URL**: regex `^https:\/\/(www\.)?linkedin\.com\/(in|pub)\/[\w\-%.]+\/?$` — reject `ghazi.today` etc.
- **Email / phone / URL / postal code**: format validators.
- **Work-auth polarity**: parse label for country tokens (`US`, `Canada`, `UK`, `EU`), match against `work_auth.countries[]`, return Yes/No.
- **Sponsorship**: `requires_sponsorship` boolean → always emit Yes or No, never blank.
- **EEO / disability / veteran / gender**: existing decline rules.
AI is only called for open-ended text (essays, "why this company").

### 7. Post-fill rescan for revealed fields
After the verify-loop settles, run one bounded rescan through the Question Engine detector. Diff against previous question set; any new questions (revealed by conditional logic, e.g. sponsorship after country) get one pass through the same loop. No recursion.

### 8. Resume upload verification
Track `_resumeAttachedAt` only after `DataTransfer` drop resolves AND the dropzone reports a file (poll `input[type=file].files.length > 0` or dropzone success class ≤1s). On failure, surface "manual upload required" in sidepanel with a click-to-open button instead of falsely claiming success.

### 9. Version + bundles
Bump to `2.5.0`. Rebuild `content.bundle.js`, `question-engine.bundle.js`, `public/ayn-extension.zip`.

## Files touched

- `extension/dom.js` — canonical `writeControlled`
- `extension/content.js` — collapse pipeline, live-match guard, fingerprint re-anchor, post-fill rescan, resume verification
- `extension/filler.js` — deterministic validators, work-auth/sponsorship polarity, remove all DOM writes
- `extension/question-engine/adapters/{ashby,workday,greenhouse,lever,icims,generic}.ts` — implement `write()`
- `extension/question-engine/adapters/index.ts` — add `write` to `ATSPlugin`
- `extension/question-engine/field-detector.ts` — expose fingerprint
- `extension/question-engine/semantic-types.ts` — format validators
- `extension/sidepanel.js` — honest resume upload status
- `extension/manifest.json`, `extension/constants.js` — 2.5.0
- Rebuild bundles + zip

## Explicitly out of scope

- Edge functions (`ext-fill-form-retry`, `ext-vision-discover`, `ext-memory`) — bugs are in-browser
- Memory reuse rules already tightened in 2.4.1
- Adding new ATSes — only fixing the six already supported

## Success criteria

- Ashby recording bugs (work-auth flipped, sponsorship blank, LinkedIn wrong, residence combobox stuck, resume falsely reported) all resolved
- Same regressions checked on a Workday, Greenhouse, and Lever posting: no correct answer overwritten, no silently skipped buttongroup, no fake resume success
- Fill logs show ≤2 write attempts per field (was 5-7)
