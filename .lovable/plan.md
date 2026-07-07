# Targeted Engine Patches from Open-Source Audit

Ran the reference research + audited our own code. Nothing in the open-source ecosystem justifies a rewrite — our scanner is already more capable than any of the projects surveyed. But the audit found **3 concrete gaps** that plausibly explain missed fields on Workday, Greenhouse, and portal-heavy ATS pages.

Each patch is small, surgical, and independently reversible. No engine architecture changes. `AYN_QE_ENABLED` stays `true`. Manifest stays `2.3.1`.

---

## Patch 1 — Reject generated IDs before using `el.id` for label lookup

**Why:** Workday appends hash suffixes (`--ab12cd`), React uses `:r0:`, MUI/Radix/HeadlessUI use `mui-*`/`rc-*`, and many ATS pages use raw UUIDs. Our code today calls `document.querySelector(\`label[for="${el.id}"]\`)` unconditionally. Most of the time this misses cleanly, but when a generated ID accidentally collides with a `label[for]` on a different field, we get the WRONG label attached — which produces a "scanned but mis-labeled" field the AI then answers incorrectly (or refuses to answer).

**Change:** Add one shared regex + a guard at 5 call sites.

```js
// content.js — new helper near top of label utils
const AYN_GENERATED_ID_RE =
  /^:[a-z0-9]+:$|^[0-9a-f]{8}-[0-9a-f]{4}-|--[a-f0-9]{6,}$|^(mui|rc|rdk|headlessui|radix)-[a-z0-9-]+$|^r[0-9]+$/i;
function aynStableId(el) {
  const id = el && el.id;
  return id && !AYN_GENERATED_ID_RE.test(id) ? id : '';
}
```

Files/lines to guard (replace `el.id` with `aynStableId(el)`):
- `extension/content.js:579` (`aynAccName`)
- `extension/content.js:636` (`aynFieldQuestion`)
- `extension/content.js:715` (`getLabelFor`)
- `extension/question-engine/evidence/dom.ts:79` (`readNativeLabel`)
- `extension/question-engine/evidence/accessibility.ts:89` (`computeAccessibleName`)

**Risk:** near-zero. Guard is opt-in — real stable IDs (`email`, `firstName`) pass through untouched.

---

## Patch 2 — Follow `aria-controls` / `aria-owns` before global option poll

**Why:** Our detection side already resolves the listbox via `aria-controls` (`content.js:906`), but the injection side (`aynFillTypeahead` at `content.js:2947`) and the evidence collector (`evidence/dom.ts:134`) don't. Injection does a document-wide `querySelectorAll('[role="option"], …')` and hopes the first match is right. Evidence collection only looks at descendants, so **portal-rendered options are invisible to the scanner** — that's a real "field scanned, zero options" bug on Workday country pickers and Greenhouse "How did you hear about us."

**Change (injection, `content.js:2947`):** Before the global poll, prefer the specific listbox:

```js
const ctrlId = el.getAttribute('aria-controls') || el.getAttribute('aria-owns');
const listbox = ctrlId ? document.getElementById(ctrlId) : null;
const scope = listbox && listbox.offsetParent !== null ? listbox : document;
optionEls = Array.from(scope.querySelectorAll(
  '[role="option"], [role="listbox"] [role="option"], [role="listbox"] li, ...'
)).filter(o => isVisibleOpt(o) /* … */);
```

**Change (evidence collection, `evidence/dom.ts:134`):** 3-tier chain instead of descendants-only:

```ts
const ctrl = el.getAttribute('aria-controls') || el.getAttribute('aria-owns');
const portalListbox = ctrl ? doc.getElementById(ctrl) : null;
let optionEls: Element[] = [];
if (portalListbox) optionEls = Array.from(portalListbox.querySelectorAll('[role="option"]'));
if (!optionEls.length) optionEls = Array.from(el.querySelectorAll('[role="option"]'));
if (!optionEls.length) optionEls = Array.from(doc.querySelectorAll('[role="option"]'))
  .filter(o => !o.closest('[aria-hidden="true"]'));
```

**Risk:** low. Falls back to current behavior when `aria-controls` is absent.

---

## Patch 3 — Harden radio matching against synthetic `value` attributes

**Why:** Injector at `content.js:3151` already prefers visible label first, then `r.value`. Correct for `value="Yes"`. But when Workday emits `value="opt_1"` and the AI happens to echo `"opt_1"` as `optionValue`, we match on synthetic value instead of visible label — locking in whatever position the AI guessed instead of the semantic answer.

**Change:** Skip synthetic-looking values in the fallback branch.

```js
// content.js around line 3151
const SYNTH_VALUE_RE = /^(on|off|true|false|\d+|opt[_-]?\d+|[a-f0-9]{8,})$/i;
for (const want of cands) {
  for (const r of radios) {
    const lbl = ((r.closest('label') || r.parentElement)?.innerText || '').trim();
    if (aynOptionMatches(lbl, want)) { target = r; break outer; }
    if (r.value && !SYNTH_VALUE_RE.test(r.value) && aynOptionMatches(r.value, want)) {
      target = r; break outer;
    }
  }
}
```

Apply the same guard in the native radio group path (`content.js:3208`) if it uses `r.value` similarly.

**Risk:** near-zero. Only tightens an existing fallback; primary label match unchanged.

---

## Build + verify

1. Apply the 3 patches to `extension/content.js` + `evidence/dom.ts` + `evidence/accessibility.ts`.
2. `node extension/build.mjs` — rebuilds bundles.
3. Repack `public/ayn-extension.zip`.
4. Reload extension, open a Workday or Greenhouse form, click Fill, check console:
   - `[AYN-HYBRID] rich=N legacy=N` — count should be same or higher (Patch 2 recovers portal fields).
   - `[AYN-BG]` question-match lines should show labels for fields that previously came through as empty or with hash-ID labels (Patch 1).
   - Radio groups on Workday demographics should now flip to the correct option (Patch 3).

## What this plan does NOT do

- No changes to `AYN_QE_ENABLED`, no legacy fallback re-enabled.
- No manifest bump.
- No new files, no new dependencies.
- No changes to the AI prompt, backend, or resume-hub function.
- No architectural refactor of the question engine.

## What to do if it still misses fields

Send one real form URL where a field is missed. With Patches 1–2 in place, `window.__AYN_QUESTIONS__` and the new `[AYN-HYBRID]` breadcrumbs are enough to classify any remaining miss into one of six buckets (not-scanned / wrong-label / wrong-kind / no-options / no-AI-answer / injection-failed) in under 5 minutes. Then we fix the actual bucket.
