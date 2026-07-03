## Problem

On Gem/BioRender-style forms, AYN fills Gender and Race but leaves Veteran Status and Disability Status empty. Root cause is in the scanner, not the resolver:

1. `aynEnsureRendered()` scrolls to the bottom in 4 quick steps and immediately returns to the original scroll position after only 80ms. Sections that mount via IntersectionObserver often haven't finished rendering before we scroll back up, and some ATS UIs unmount off-screen sections again (virtualization) — so by the time `SCAN_FORM` walks the DOM, Veteran / Disability radios are gone.
2. The structural radio pass at `content.js:1247` filters with `r.offsetParent !== null`, i.e. it only registers radios currently visible on screen. Anything below the fold or inside a collapsed section is dropped even when it does exist in the DOM.
3. There is no second scan pass. If a section mounts 200–500 ms after the first walk (common on React forms with Suspense), we never see it.

The AI backend already answers these three groups correctly (`ruleAnswer` returns "Decline" for EEO / Veteran / Disability). They just never reach the backend because the scanner didn't emit fields for them.

## Fix (scanner only — no resolver / injector / backend changes)

Keep the containment rule from 1.9.63/1.9.64: only touch `extension/content.js`, bump version in `constants.js` and `manifest.json`, rebuild the zip.

### 1. Stronger `aynEnsureRendered`

- Replace the 4-step scroll with a loop that scrolls to `scrollHeight`, waits ~250 ms, re-reads `scrollHeight`, and repeats until the height is stable or 6 iterations pass (handles pages where mounting new sections extends the page further).
- After reaching the bottom, wait one extra `requestAnimationFrame` + 300 ms so IntersectionObserver-driven mounts settle.
- Do **not** scroll back to the top before scanning. Return the original `scrollTop` in a closure and restore it only after `SCAN_FORM` finishes (new step below).
- Add a `try/finally` around the SCAN handler so the scroll position is always restored even on error.

### 2. Drop the visibility filter in structural radio grouping

In the `allRadios` filter at `content.js:1247`, remove `r.offsetParent !== null`. Keep the `!r.disabled` check. Off-screen but present radios (Veteran / Disability once the section is mounted) will then be grouped and emitted. The existing container-of walk already prevents grouping across unrelated sections.

### 3. Second-pass rescan for late mounts

After the main field-collection loop finishes but before returning the field list to the background, call a new helper `aynRescanIfChanged()`:

- Snapshot `document.querySelectorAll('input,textarea,select,[role="radio"],[role="checkbox"],[role="combobox"]').length` before the scan.
- After the scan, wait 400 ms and recount.
- If the count grew, run the field-collection loop one more time and merge any *new* IDs (skip anything already in the field map). One extra pass is enough for React Suspense / lazy sections; more would just add latency.

### 4. Version + build

- `extension/constants.js`: `BUILD: '1.9.65'`.
- `extension/manifest.json`: `"version": "1.9.65"`.
- `extension/content.js`: `AYN_BUILD = '1.9.65'`.
- Rebuild `public/ayn-extension.zip` from `extension/`.

## Out of scope

- `SCAN_FORM` message shape, frame enumeration, `INJECT_VALUES`, the two-lane resolver, `ext_autofill`, and the `ruleAnswer` layer stay byte-identical.
- No new permissions.

## Verification

After the user reloads the extension:
- On the same BioRender/Gem form, sidepanel should now list Veteran Status and Disability Status as fields (previously absent).
- Both should be filled with "Decline to self-identify" / "Decline to self-identify as a protected veteran" via the existing `ruleAnswer` path.
- Fields telemetry in `autofill_runs` should show the two new group IDs with `source: 'ai'` and confidence ≥ 0.9.
