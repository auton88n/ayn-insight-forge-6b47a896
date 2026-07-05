## Why it's inconsistent today (honest diagnosis)

AYN is not one autofill engine — it is a pipeline of ~6 stages, and each ATS breaks a different stage. Whichever stage is weakest on a given site is what you see fail.

```text
1. detect     → is this an ATS apply page?
2. reveal     → aynEnsureRendered scrolls + waits for lazy sections
3. scan       → scanFormFields walks DOM, frames, shadow roots
4. resolve    → backend (resume-hub) picks answers per field
5. inject     → filler / page-world clicks + native-setter writes
6. verify     → (does not exist today)
```

Concrete failure modes mapped to stages, matching what you reported (Greenhouse / Lever / Workday / Ashby-Gem-BioRender, "fields skipped / wrong option / value doesn't stick"):

- **Fields skipped** → stage 2 or 3. Lazy sections (Workday step 2, Ashby demographics block, Gem EEO) mount after the scan. Custom radios (`role="radio"` styled buttons) get grouped only when 2+ share a container the walker recognizes.
- **Wrong option clicked** → stage 4 or 5. Question label resolution picks a neighbor's option text as the "label" (dom.js helps, but only for grouped radios — comboboxes and Yes/No button pairs still use older logic). Ashby Yes/No hidden-checkbox proxy sometimes double-toggles.
- **Value doesn't stick** → stage 5. React-controlled inputs on Lever/Workday reset when we write via native setter but don't fire the exact synthetic event React expects; typeahead comboboxes (Greenhouse location, Workday country) need a keystroke + option-click sequence, not a value write.
- **Nothing fills** → usually stage 1 (URL not matched) or a same-origin iframe we didn't enumerate (Workday sometimes nests the app in a second iframe after SSO).

None of this is "AI didn't understand the form." The AI never got asked about the field, or was asked with the wrong label, or we clicked and React didn't hear it.

## Fix plan (no backend changes)

Contained to `extension/` + version bump + zip. No `resume-hub` or edge-function edits.

### 1. Add stage 6: post-inject verification and retry (`content.js`)

After `INJECT_VALUES` finishes, read back every field we claimed to fill:

- text/textarea: current `.value` equals what we wrote (trimmed)
- native radio/checkbox: `checked === true` on the intended atom
- custom `[role="radio"]`: `aria-checked === "true"` on the intended atom
- select/combobox: selected option text matches (or the visible trigger text matches)

For every mismatch, retry once with the alternate injection path (native → main-world bridge, or bridge → keystroke sequence for typeaheads). Emit a `fillDiag` record with `{fieldId, method, verified, retried, finalMethod}` that rides the existing telemetry channel. This alone converts "sometimes sticks" into "sticks or we know why not."

### 2. Harden stage 2 for all lazy patterns, not just Gem

Extend `aynEnsureRendered` with:
- A settle loop that runs until `document.body.scrollHeight` AND the count of `input,textarea,select,[role=radio],[role=checkbox],[role=combobox]` are both stable for 2 consecutive 250ms ticks (max 8 iterations).
- A "reveal all collapsibles" pass: click any visible `button[aria-expanded="false"]` whose accessible name matches `/voluntary|self[- ]?identif|demograph|eeo|additional|more|expand/i`. Workday, Greenhouse, and Ashby all hide EEO behind exactly one of these.
- Same-origin iframe recursion in the reveal step (today reveal runs top-doc only; scan already recurses).

### 3. Widen stage 3 grouping

Custom radios currently need 2+ siblings under a common container to become a group. Two additions:
- **Fieldset/`role="radiogroup"` first**: if a `radiogroup` or `fieldset` wraps N atoms, use it as the container directly instead of walking up looking for a common ancestor.
- **`aria-labelledby` shortcut**: if all atoms in a candidate group share the same `aria-labelledby`/`name`, group them regardless of container distance.

This is the single biggest reason Workday and BioRender skip fields: the atoms are correctly grouped by ARIA but scattered in the DOM.

### 4. Fix the two known injection bugs

- **Typeahead comboboxes** (Greenhouse location, Workday country, Ashby school): stop writing `.value` directly. Sequence: focus → dispatch `input` for each character of the target → wait one frame → click the `[role="option"]` whose text matches. Falls back to the current native-setter path only if no listbox opens within 400ms.
- **Ashby Yes/No hidden-checkbox proxy**: gate the click behind a "read current `aria-pressed`/`aria-checked` first, click only if it doesn't already match" check, so we never toggle a correct answer back off.

### 5. Version + build

- `extension/constants.js`: `BUILD: '2.1.0'`
- `extension/content.js`: `AYN_BUILD = '2.1.0'`
- `extension/manifest.json`: `"version": "2.1.0"`
- `node --check` on every edited file, then rebuild `public/ayn-extension.zip`.

## Explicitly out of scope

- `resume-hub/index.ts`, prompts, EEO policy, rule layer — untouched.
- `dom.js` public API — keep as is; changes in content.js only.
- No new manifest permissions.
- No changes to `sidepanel.js`, `deep-link.js`, `handoff-hydrate.js`, `resumeFormat.js`, `vendor/`.

## Verification

I'll drive Playwright against a saved snapshot of the Ashby URL you gave (`jobs.ashbyhq.com/Jerry.ai/ac7f85a8-...`) plus a Greenhouse and a Lever posting, run a fill, and confirm from telemetry that every emitted field either has `verified: true` or a specific `finalMethod` explaining the retry. That's the acceptance test — "verified or logged," never silently skipped.
