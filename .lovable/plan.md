# AYN Extension v2.2.0 — Universal Autofill Hardening

## Why current builds keep breaking on new ATS forms

I audited the full pipeline (content.js, dom.js, filler.js, page-world.js, background.js, resume-hub). The problem is not "one bad rule" — there are **10 concrete bugs**, each of which explains one class of failure you keep hitting. Every previous patch fixed 1–2 and left the rest. This plan fixes all 10 in a single versioned release, with post-inject verification wired to actual retries so we stop guessing whether it worked.

## The 10 root causes (with the fix for each)

### Scan / grouping
1. **W2 — ARIA `role="radio"` atoms silently dropped when there is no `role="radiogroup"`/`fieldset` wrapper.** Ashby & Super.com gender/race groups hit this. `content.js:1267` returns early. Fix: fall back to grouping by shared `aria-labelledby` target, then by shared parent `div` when ≥2 atoms exist.
2. **W3 — EEO multi-select checkboxes with unique `name` per option are emitted one-at-a-time.** `content.js:1448`. Fix: detect sibling unique-name checkboxes under the same field container and emit one grouped `checkbox` field with `options[]` + `multi: true`.
3. **W7 — `aria-labelledby` never resolved for the question label.** `dom.js:177` `findQuestion`. Fix: priority-0 branch that reads `container.getAttribute('aria-labelledby')` and uses that element's text as the label.

### Injection
4. **W1 — Ashby Yes/No idempotency guard reports success even when the pre-selected button is the wrong answer.** `content.js:2980`. Fix: only short-circuit when the already-selected button's label matches `wantRaw`; otherwise click the correct one.
5. **W4 + W6 — React 18 textareas & inputs revert because `_valueTracker` is gone and page-world bridge only looks for `__reactProps$`.** `page-world.js:21`, `content.js:2386`. Fix: extend the page-world bridge to walk `__reactFiber$` and invoke `memoizedProps.onChange` directly. Call this bridge on the FIRST attempt for React-controlled fields, not as last resort.
6. **W5 — Typeahead comboboxes set the full string at once, so the ATS search API never fires.** `content.js:2713`. Fix: type the first 4 characters key-by-key via `aynTypeKeystrokes`, extend poll window to 2.5 s with backoff, accept portal-rendered options (rect-based visibility, not just `offsetParent`).
7. **W10 — `aynPostInjectVerify` marks failures but never re-injects anything other than text.** `content.js:2076`. Fix: return `unverifiedIds`; the INJECT_VALUES handler re-attempts each once (re-click for buttongroup/custom-radio/select, page-world bridge for text).

### Orchestration
8. **W8 — Same-origin iframes are excluded from the frame list.** `background.js:147` only pushes cross-origin frames. Fix: enumerate ALL non-error frames; the existing content-script injection fallback (background.js:107) handles missing scripts.
9. **W9 — Second scan pass ignores fields that were skipped in pass 1 but are still empty.** `background.js:549`. Fix: re-send fields whose ID never appeared in `values` AND whose `currentValue` is still empty, not just brand-new IDs.

### Resolver (backend, minimal touch)
10. **Multi-select EEO answers and typeahead location precision.** `resume-hub/index.ts:980` and prompt at `:1033`. Fix: add `optionLabels: string[]` return path in `ruleAnswer` when the grouped field is `multi:true`; extend the AI prompt to always emit full "City, Region, Country" for location typeaheads.

## Files touched

```text
extension/dom.js            +1 branch in findQuestion (aria-labelledby)
extension/content.js        6 targeted patches (W1, W2, W3, W5, W6, W10)
extension/page-world.js     fiber walk fallback (W4)
extension/background.js     2 patches (W8, W9)
extension/constants.js      BUILD → 2.2.0
extension/manifest.json     version → 2.2.0
supabase/functions/resume-hub/index.ts   multi-select EEO + typeahead prompt (W3, W5 backend)
public/ayn-extension.zip    rebuilt
```

No file rewrites. Every edit is a scoped patch at a specific line range from the audit.

## Verification

Drive Playwright against the three URLs where you saw failures and one healthy control:

```text
1. https://jobs.ashbyhq.com/Jerry.ai/ac7f85a8-…   (Ashby Yes/No + demographics)
2. https://jobs.ashbyhq.com/super.com/6e1342f4-…  (Ashby multi-select race/ethnicity + textareas)
3. A live Greenhouse posting                       (typeahead location + EEO)
4. A live Lever posting                            (React-controlled inputs)
```

For each URL, run fill, then assert from telemetry that **every** emitted field has one of:
- `verified: true`
- `retried: true, finalMethod: "<name>", verified: true`
- `skip: true` with a reason (never a silent miss)

Ship criterion: zero unverified fields on all 4 URLs, and the "18 fields ready to fill" indicator on Super.com reaches 18/18 filled (currently 16/16 filled, 4 to review → 2 silent misses).

## Explicitly out of scope

- No new manifest permissions.
- No changes to sidepanel.js, deep-link.js, handoff-hydrate.js, resumeFormat.js, filler.js.
- No changes to EEO decline policy (stored user answer still wins per v2.0.1).
- No changes to `src/` (dashboard).
- No refactor of the resolver's structure — only the two additions in item 10.
