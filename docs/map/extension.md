# Form intelligence — the extension, job-checker, and the shared classifier

AYN reads and fills a real job application form two ways, and both feed
into the same underlying "what does a field contain and how do I operate
it" logic. This file is the map for both, and for the shared layer
(v3.290.0) that stops them from silently drifting apart every time a new
ATS widget shape gets reported.

## The two surfaces

**`extension/` (Chrome Auto-Apply extension, sideload only)** — runs
entirely in the user's own real Chrome, on the real page they're already
looking at. `background.js` injects `content.js` (plus `resumeDocs.js`
and `vendor/jspdf.umd.min.js` for resume-file attachment) into the
clicked tab only, on click, never automatically. It reads every real,
visible field, matches each one against the signed-in user's real AYN
profile via `resume-hub`'s `auto_apply_extract` action, fills what it
can, and **never clicks submit**. That's the whole point of it existing:
job-checker's own server-side path (below) is a real Playwright browser
on a VPS, and some ATS platforms flag that as automated because it
genuinely is. The extension is the honest fix — not a bot pretending to
be a person, just AYN helping fill a form the person is already on, in
their own session.

**`job-checker/server.py` (`ayn-job-checker`, Docker, server-side)** —
the same idea, minus a human in the loop: `/extract_form` reads a job's
real application page with a headless Playwright browser, `/fill_form`
writes real values into it and, only when the caller explicitly passes
`submit: true` after its own human-confirmation step (see
`src/components/resume-hub/AutoApplyPanel.tsx`'s `review` → `previewed`
→ real "This looks right, submit" button flow), clicks the real submit
button. This is what backs the web app's own Jobs-tab auto-apply, for
anyone who hasn't installed the extension. `job-checker` was originally
built for a different, read-only job (checking whether a posting is
still open / scam-flagged, see `/check` and `docs/map/deployment.md`) —
`/extract_form`/`/fill_form` are a second, later capability living in
the same container.

Both call the identical `resume-hub` actions to decide **what** goes in
a field (`loadIdentity`, `matchApplicationAnswers` /
`application_answer_match`) — neither surface has ever had its own
opinion about that. What they've always had *separately* is the DOM
logic for **finding and operating** a field, and that's where they'd
drifted: `content.js` had grown real, hand-added support for ARIA
radiogroups, plain `aria-pressed` toggle-button pairs, `role="combobox"`
custom dropdowns, and listbox-diff-driven typeahead fields — each added
after a real user report, one at a time. `job-checker/server.py`'s own
`_extract_fields` had none of it; it only ever scanned plain
`<input>/<select>/<textarea>`. v3.290.0 brought it to extraction parity
for the first three (see below) — the fourth (typeahead fill) is real,
separate follow-up work, not yet ported server-side.

## The deterministic layer (free, instant, no network call)

Both `content.js`'s `extractFields()` and `job-checker`'s
`_extract_fields()` run this first, and it handles the overwhelming
majority of real fields on a real page:

- native `<input>`/`<select>`/`<textarea>` (radio grouped by `name`,
  file inputs flagged separately, `type="range"` deliberately excluded
  — a slider is a search preference, never a fact AYN has one right
  answer for)
- `[role="radiogroup"] > [role="radio"]` (a Yes/No question built as a
  real ARIA radio group, not a native `<input>` pair)
- `button[aria-pressed]` sibling pairs/groups sharing a parent, with no
  radiogroup wrapper at all — a real, common accessible pattern the
  radiogroup scan alone never covers
- `[role="combobox"]` triggers (Radix Select / react-select style —
  never a real `<select>`), plus, client-side only so far, a
  listbox-diff fallback for a plain `<input>` wired to its own
  JS-driven typeahead with no `role="combobox"` declared on it at all
  (location/city/school/employer fields are the common case — see
  `TYPEAHEAD_LABEL_RE` in `content.js`)

Filling reuses the same read-back-verified primitives everywhere: a
native setter + `_valueTracker` update for a React-controlled input
(`setNativeValue`), a real `.click()` (never a dispatched synthetic
event, which many components' own handlers ignore) for anything
button-shaped, and the fill is only ever reported as successful once the
element's own resulting state is read back and confirmed — `el.value`
for text, `aria-checked`/`aria-pressed` for a button-shaped toggle,
`aria-selected` or trigger text for a combobox option. A click that
fires with no way to confirm it stuck is reported as **failed**, never
as a false success — this is a hard, load-bearing rule, not a detail.

## Form Intelligence — the AI fallback (v3.290.0)

The deterministic layer above is real, but it's also the result of
patching one reported shape at a time, forever — and that's the exact
"go back and forth" this layer exists to end.

**`supabase/functions/resume-hub/lib/formIntelligence.ts`**,
action `auto_apply_classify_widgets` — the shared fallback for whatever
neither deterministic scan already recognizes. It is deliberately narrow
in what it's trusted to do:

1. Both callers — `content.js`'s `scanUnrecognizedWidgets()`
   client-side, and `job-checker/server.py`'s own mirror scan inside
   `_extract_fields_raw` server-side — scan for the identical small,
   bounded set of CANDIDATE shapes the deterministic pass didn't
   already claim: (a) sibling button groups with **zero** ARIA state at
   all (a visually segmented Yes/No pair, real accessibility gap,
   common), and (b) a clickable trigger whose own text reads like a
   placeholder ("Select…", "Choose…", "Start typing…") but never
   declared `role="combobox"`.
2. For each candidate, it builds a small, **sanitized structural
   signature** — tag, role, aria-attribute *names* (never values),
   immediate-child tag counts, a short class hint, plus the page's own
   already-visible question/option text. Nothing about the person
   filling the form is ever in this payload; the question text was
   already being sent to the backend for every other field type too.
3. `classifyWidgets()` hashes each signature (structural fields only —
   tag/role/ariaAttrs/childShape/classHint, deliberately excluding the
   question text and any per-call id) and checks
   `public.form_widget_patterns` for a cache hit. Hits are free and
   instant. Misses are batched into **one** `callAI` tool-call
   (`DEFAULT_MODEL`, `temperature: 0`), never one request per widget.
4. The model picks exactly one type from a fixed, five-value enum —
   `toggle_button_group | combobox_static | combobox_typeahead |
   custom_checkbox | unrecognized` — and nothing else. It never returns
   code, a selector, or a value. The interaction **recipe** for each
   type is a fixed lookup table in `formIntelligence.ts`
   (`RECIPE_BY_TYPE`), not something the model generates — this is the
   concrete guarantee that nothing AI-authored is ever executed. A
   classification the model returns outside the fixed enum is coerced
   to `unrecognized`, same as no classification at all.
5. Every classification (cache hit or fresh) is upserted into
   `form_widget_patterns`. Because ATS platforms (Greenhouse, Lever,
   Ashby, Workday, and the rest) each reuse **one fixed component
   library** across every company's own job board built on them, one
   real classification of "Ashby's own toggle-button widget" now covers
   every Ashby-hosted application, for every AYN user, from then on —
   not just the one page that first triggered it. This is the actual
   mechanism behind "AYN gets smarter about every form it sees,
   permanently" rather than "an engineer patches one more shape."
6. The caller interprets the returned type using the SAME
   already-audited functions the deterministic layer uses —
   `toggle_button_group`/`custom_checkbox` register as a synthetic radio
   group (flows through `fillRadio`'s existing click+aria-state
   verify); `combobox_static`/`combobox_typeahead` register as a
   synthetic select (flows through `fillCombobox` / the typeahead
   listbox-diff helper). **The interpreter decides which mechanism
   actually runs, never the model** — a trigger that isn't a real
   text-editable `<input>` can never "type," regardless of what it was
   classified as, and always falls back to click-then-search instead.
   `unrecognized` is left uncaptured, the same honest "not on file"
   outcome as a field neither scan ever found.

**`supabase/functions/form-intel-bridge/index.ts`** (v3.291.0) — the
path `job-checker` (no user session, no direct Postgres access) uses to
reach the same classifier and the same cache. A second, deliberately
self-contained implementation of `classifyWidgets()` — not a shared
import, edge functions each deploy as their own isolated bundle,
mirroring the same choice `ai-openai-bridge` already made for its own
minimal AI-calling duplicate — authenticated the same way job-checker
already authenticates to `ai-openai-bridge`: the real service-role key
as a Bearer token, not a new secret. Both bridges write to and read
from the identical `form_widget_patterns` table, so a shape learned
from one surface is instantly a cache hit on the other.

**`public.form_widget_patterns`** — `signature_hash` (unique),
`widget_type`, `interaction_recipe` (jsonb), `confidence` (`'ai'` |
`'verified'` — never auto-downgraded by one failed attempt),
`sample_count`, `last_seen_at`. RLS on, zero policies — service-role
only, the same shape as `assessment_rubrics`/`job_cache`: a signed-in
user can never read or write this directly over PostgREST, only
`resume-hub`'s own service client, after its own auth/rate-limit gates
already ran. Free action (rate-limited only, `ACTION_CAPABILITY: "ai"`,
no credit charge) — a structural-classification utility that makes
`auto_apply_extract`'s own output more complete, not a distinct paid
outcome, the same treatment `auto_apply_extract` itself already gets.

## Safety invariants (do not relax these without re-reading this file)

- The AI classifier **never** returns code, a selector, or a value to
  execute — only one of five fixed type strings. The recipe for each
  type is a hardcoded lookup table, not model output.
- A fill is only ever reported as successful after a real read-back
  confirms it — never because a click or a value-set call didn't throw.
- The extension **never** clicks submit, full stop. `job-checker`'s
  `/fill_form` only ever submits when the caller passes `submit: true`
  after its own real human-confirmation step (a preview screenshot, an
  explicit button click) — never on its own initiative.
- A widget-pattern classification failure degrades to `unrecognized`
  (an honest "not on file," same as today) — it never blocks or delays
  the rest of a real autofill pass, and it never guesses.
- The signature sent for classification is structural only — never a
  value, never anything about the person filling the form. The question
  text sent alongside it is the same static page copy every other field
  type already sends today.

## Real, disclosed limits — not yet built

- `job-checker`'s own fill path has no equivalent of `content.js`'s
  listbox-diff typeahead helper yet — a location/city-style field with
  no `role="combobox"` still isn't fillable server-side, even though
  extraction-side parity for the other three shapes is done.
- The candidate scanner (`scanUnrecognizedWidgets`) is intentionally
  narrow — two bounded shapes, not a generic "anything clickable" sweep
  — to keep false-positive risk and per-page classification cost low.
  A genuinely novel shape outside those two patterns (a real date
  picker, a multi-select checkbox group, a signature pad) still isn't
  detected at all; extending the candidate scanner to cover it is real,
  scoped future work, not a gap in the classifier itself.
- `form_widget_patterns.confidence` distinguishes `'ai'` from
  `'verified'` in the schema, but nothing yet promotes a row to
  `'verified'` after a real, successful, read-back-confirmed fill —
  the column exists for this and is unused today.
- A genuinely closed shadow root (`mode: "closed"`) stays unreachable by
  design on both surfaces — not something either implementation, or the
  classifier, can see into.
