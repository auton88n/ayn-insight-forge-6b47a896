# AYN Extension v1.9.56 — Zero-Skip Autofill

Goal: eliminate the #1 pain — **fields left empty** — on every site (not just known ATS). No frame/motion changes, no UI redesign, just detection + inference + write reliability.

## Root causes we're targeting

Fields go empty for 5 reasons. We fix each with a dedicated pass.

1. **Field never discovered** — inputs inside Shadow DOM, closed dialogs, virtualized lists, or lazy-mounted sections aren't in the initial scan.
2. **Question text not resolved** — no label/aria, so backend has nothing to match → returns nothing → field skipped.
3. **Backend returns nothing** — question is fine but LLM has no matching resume data and no inference rule → empty answer.
4. **Value written but wiped** — React/Angular/Workday clears the input after our write, and our settle-reapply gives up too early.
5. **Custom widgets** — combobox, listbox, contenteditable, file inputs, date pickers — our writer only handles native `<input>/<select>/<textarea>`.

## Plan

### Pass A — Discovery (fix cause #1)

- **Continuous rescan loop**: after first fill, keep a MutationObserver for 8s; when new fields appear (accordion opens, "Add another" clicked, step 2 mounts), auto-queue them for the next fill batch instead of requiring a re-click.
- **Deep Shadow + closed-root fallback**: walk `element.shadowRoot` recursively, and for closed shadow roots use `elementFromPoint` sweep to still enumerate focusable inputs.
- **Virtualized/lazy sections**: before scanning, programmatically scroll the form container top→bottom in 400px steps to force lazy mounts, then scroll back.

### Pass B — Question resolution (fix cause #2)

Add a 4th resolver tier after `aynFieldQuestion` → `aynShortLabelFallback`:
- **Visual-neighbor resolver**: use `getBoundingClientRect` to find the nearest text node above/left of the field within 120px, ignoring other inputs' labels. Solves grid forms where DOM order ≠ visual order.
- **Placeholder + name-attr synthesis**: when only `name="q_12345"` exists, combine placeholder + surrounding `<legend>`/`<h*>` into a synthetic question rather than dropping the field.
- **Never return empty**: if all resolvers fail, send the field to backend with `question: "(unlabeled field near: <nearest heading>)"` and `kind` + `options` — backend can still infer from context.

### Pass C — Backend inference (fix cause #3)

Update `ext_autofill` system prompt in `supabase/functions/resume-hub/index.ts`:
- **Never return empty string** for a field unless truly impossible. Add a fallback ladder: resume → profile → sensible default (e.g. "No" for felony/sponsorship-needed when resume shows work auth, "Prefer not to say" for demographics, today's date for "available start date" when unknown).
- **Options-field guarantee**: for any field with `options`, MUST pick one — never skip. If uncertain, pick the most neutral option ("Prefer not to answer" > last option > first non-empty).
- **Add "confidence" field** in response so frontend can log low-confidence writes for the telemetry table.

### Pass D — Write reliability (fix cause #4)

- **Extend `aynSettleReapply` window**: 3 verification passes at 250ms / 800ms / 2000ms instead of one. If wiped on the 3rd pass, dispatch a synthetic `focus → keystroke → blur` sequence via `page-world.js` power-setter.
- **Framework detection**: sniff React fiber / Angular zone / Vue instance on the field; pick the write strategy known to work for that framework (native setter for React, `dispatchEvent('input',{bubbles:true})` + `blur` for Angular, `v-model` trigger for Vue).
- **Post-fill audit**: after the whole batch, one final sweep counts empty required fields and re-runs only those (max 2 retries). Report each still-empty field to `autofill_runs.skipped_reason`.

### Pass E — Custom widgets (fix cause #5)

- **Combobox/listbox**: detect `role="combobox"` / `aria-haspopup="listbox"`, open the popup, wait for options, click by fuzzy match on visible text.
- **Contenteditable**: use `execCommand('insertText')` + input event.
- **Date pickers**: try native `type=date` first; if custom, type ISO into the trigger input, dispatch keydown Enter.
- **Skip gracefully**: file inputs and captchas are logged as `unsupported` not `failed`, so telemetry stays accurate.

### Telemetry & verification

- Extend `autofill_runs` inserts with per-field `{selector, question, resolver_tier, write_strategy, outcome, retries}` so we can see exactly where skips happen.
- Add a dev-only console table when `localStorage.AYN_DEBUG === '1'` summarizing each field's journey.

## Deliverable

- Ship as **v1.9.56** in one bundle, all 5 passes together (they compound — half of them isn't much better than today).
- `extension/manifest.json` version bump.
- `extension/content.js`, `extension/filler.js`, `extension/background.js`, `extension/page-world.js` updated.
- `supabase/functions/resume-hub/index.ts` prompt update + redeploy.
- Rebuild `public/ayn-extension.zip`.
- No frame, motion, or dashboard UI changes.

## Technical notes (safe to skim)

- All new logic is behind existing `AYN_IS_TOP` / `all_frames` gating from v1.9.53–54 — no permission changes, no manifest surface expansion.
- Backend prompt change is additive; existing correct answers keep working.
- Retry cap (2) + settle window (2s max) keeps worst-case fill time under +3s vs today.
