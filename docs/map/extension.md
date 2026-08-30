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
`sample_count`, `last_seen_at`, plus (v3.298.0) `signature` (jsonb, the
widget's own raw structural shape — see below), `needs_review`,
`flagged_count`, `last_flagged_at`. RLS on, zero policies — service-role
only, the same shape as `assessment_rubrics`/`job_cache`: a signed-in
user can never read or write this directly over PostgREST, only
`resume-hub`'s own service client, after its own auth/rate-limit gates
already ran. Free action (rate-limited only, `ACTION_CAPABILITY: "ai"`,
no credit charge) — a structural-classification utility that makes
`auto_apply_extract`'s own output more complete, not a distinct paid
outcome, the same treatment `auto_apply_extract` itself already gets.

### The flag-and-retrain loop (v3.298.0)

Found while doing a real training sweep across many live sites: the
cache above had no way for a real wrong classification to ever be
corrected short of an engineer manually clearing the row. Two pieces
close that.

**Flagging** — `content.js`'s own after-fill results panel shows a
"Wrong?" button next to every widget this run actually had to classify
(never for the deterministic layer, which doesn't need this). Clicking
it calls a new free action, `auto_apply_flag_widget`, with the exact
same sanitized structural signature the classification itself was made
from — never a client-supplied hash, `flagWidgetClassification`
(`resume-hub/lib/formIntelligence.ts`) re-hashes it server side, so a
flag can only ever land on the widget shape that actually produced it.
A single flag never wipes a classification out from under every other
AYN user currently relying on it — a new `REVIEW_THRESHOLD` (2) real,
separate flags against the same signature hash is what actually forces
a fresh look, via a new `needs_review` column, atomically incremented
and threshold-checked in one round trip by a new Postgres function,
`increment_widget_pattern_flag` (`SECURITY DEFINER`, service-role
execute only). Every real flag is also logged to a new table,
`form_widget_pattern_flags` (signature_hash, who, an optional free-text
note, when) — service-role only, same shape as the pattern table itself.

`classifyWidgets`' own cache read now treats `needs_review = true` as a
miss even on a hash match, so the very next real encounter of that
widget shape anywhere re-classifies it fresh instead of repeating the
same wrong answer forever, and the fresh classification clears
`needs_review`/`flagged_count` back to zero.

**Retraining without waiting for a live page** — a flagged widget's
shape might not be encountered live again soon (nobody applying to that
specific company right now). `signature` (the widget's full sanitized
structural shape — the same one already proven safe to send an AI, tag/
role/ariaAttrs/childShape/classHint/nearbyText/optionTexts) is now
stored on every classification, not just its hash, specifically so a
flagged row can be re-classified from stored data alone. New edge
function `form-intel-retrain`, meant to be cron-scheduled every few
days (see below), pulls up to 40 `needs_review = true` rows with a
stored signature and re-runs them straight through `classifyWidgets()`
itself — not a second implementation of the classification logic, the
literal same function a live page's own extraction calls, so there is
exactly one place this app ever asks a model to classify a widget
shape.

A flag's own free-text `note` is deliberately never passed into the AI
prompt — real, human-readable context for an admin reading the table by
hand, but feeding arbitrary user-supplied text into a classification
prompt would be a real prompt-injection surface, directly against this
whole layer's own founding rule (code decides from sanitized structural
data, the model only classifies).

**Deployed and live-verified.** The migration
(`20260830040000_form_widget_patterns_flag_and_retrain.sql`),
`auto_apply_flag_widget`, and `form-intel-retrain` were all applied and
deployed for real against production; `form-intel-retrain` is
cron-registered live (`0 6 */3 * *`, `net.http_post` with the real anon
key as bearer, the same pattern `job-board-sync`/`error-alert-check`
already use — registered directly via psql, never tracked in a
migration, matching this app's own standing convention). A real seeded
row was walked through `increment_widget_pattern_flag` twice to confirm
the threshold behavior (one flag: still `needs_review=false`; a second,
distinct flag on the same hash: `needs_review` flips true, matching
`REVIEW_THRESHOLD=2`), then through a real `form-intel-retrain` run to
confirm it picks up a `needs_review=true` row and re-classifies it —
all synthetic rows deleted after.

**A real, previously-shipped data-loss bug found during this
verification, not assumed from reading the code.** Every write to
`form_widget_patterns` in `classifyWidgets()` (both the "obviously not a
question" upsert and the AI-classified upsert) was fire-and-forget —
`.then(() => {}, () => {})` with no `await` — on the theory that a cache
write shouldn't block the response. Re-testing `form-intel-retrain`
against a seeded row repeatedly showed the classification changing
correctly in the function's own response but the database row not
reflecting it. Root-caused to the Supabase Edge Runtime's own isolate
lifecycle: nothing guarantees an un-awaited promise gets to finish once
the HTTP response has already gone out — the runtime is free to recycle
the isolate the moment the response is sent, silently killing the write
mid-flight. Fixed by awaiting both upserts (wrapped in try/catch so a
write failure still can't fail the caller's real response, just logs).
Re-verified live afterward: the identical retrain re-classification now
correctly lands in the database every time. The one already-fire-and-
forget call this pass deliberately left alone is the freshness-only
`last_seen_at` bump on a cache hit — losing that occasional touch is a
real, accepted, low-severity gap, not the correctness-critical path.

### Real, per-site domain provenance ("label each website with its own knowledge")

Asked directly, after several rounds of live fixes across many
different real sites, to make sure AYN doesn't "get confused" as more
sites are folded in, and to track which real site taught it which
pattern. The cache stays deliberately keyed by structural shape alone —
domain-keying would throw away the entire point of this layer (one real
Ashby classification already covers every Ashby-hosted company; a
domain-keyed cache would mean paying for the identical classification
once per company, forever, exactly the "go back and forth" this system
exists to end). What's genuinely worth having instead: real visibility
into which domains have actually contributed to and benefited from a
given pattern.

New `form_widget_patterns.sample_domains` (`text[]`, default `{}`), and
`record_widget_domain(p_hash, p_domain, p_max=20)` — a
`SECURITY DEFINER` SQL function doing an atomic, concurrency-safe
dedup+cap append (`update ... where not (p_domain = any(sample_domains))
and cardinality(sample_domains) < p_max`), the same reason
`increment_widget_pattern_flag` exists rather than a plain JS
read-then-write: two real classify calls for the same widget shape
landing near-simultaneously (a popular ATS platform, several real users
hitting it together) must not lose one caller's own domain to a race. A
first draft of this function sorted the array before capping at
`p_max` — caught and fixed before ever using it, since that would have
silently and permanently excluded any domain that happened to sort
after the cutoff; the real fix is a plain length check before append,
no ordering at all.

`content.js` now sends `pageHostname: location.hostname` on every
`auto_apply_classify_widgets` call; `classifyWidgets()` (both
`resume-hub`'s own implementation and `form-intel-bridge`'s separate
one) takes it as an optional third argument, capped to 200 characters
before it ever reaches a database write, and calls `record_widget_domain`
best-effort (never awaited, same reasoning as the `last_seen_at` bump)
on every result — cache hit and fresh classification alike.

Fixing `form-intel-bridge`'s own domain support surfaced a second, real,
separate gap in that implementation, closed in the same pass: its own
upserts never stored `signature`/`needs_review`/`flagged_count` at all
(only `resume-hub`'s own `classifyWidgets` did), meaning any widget
shape first classified through `job-checker` had zero retrain-loop
coverage — a permanently un-replayable row, regardless of how many
times it was later flagged. Fixed by adding the same three fields to
both of its upsert blocks, and it picked up the identical
`needs_review` forced-miss cache check and the fire-and-forget-to-
awaited upsert fix in the same pass, since both bugs were structurally
identical to `resume-hub`'s own copy — this file's own header already
says the duplication is deliberate, not shared, so a bug found in one
implementation has to be checked for and fixed in the other by hand,
not inherited automatically.

Verified live against the real deployed functions with a real
throwaway account: a first `auto_apply_classify_widgets` call for a
synthetic toggle-button-group shape correctly created a new row with
`sample_domains: {first-domain}`; a second call for the identical shape
from a different `pageHostname` correctly hit the cache
(`fromCache:true`) and still appended the second domain
(`sample_domains: {first-domain, second-domain}`), confirming both the
cache-miss/upsert path and the cache-hit path call `record_widget_domain`
correctly. A separate `form-intel-bridge` call (service-role
authenticated) confirmed its own new row was written with a real,
non-null `signature` for the first time. All verification rows and the
throwaway account deleted after.

### Wave-2 extraction/labeling fixes, found training against real sites

A further round of the same real, persistent-Playwright-profile
training sweep against real, live ATS sites (Mytos/Lever, ENFOS/
Workable, Personio, Ashby/Linear, Breezy HR/Otto Engineering) —
`frame_agent.js` throughout, all confirmed via `node --check` and
`node scripts/check-wiring.mjs` after every edit:

- Decorative `aria-hidden="true"` SVGs bleeding their own fallback
  `<desc>` text into a field's resolved label — `visibleText()` now
  skips an `aria-hidden` subtree entirely, and `isDecorativeChild()`
  lets `labelFor()`'s bounded sole-child ancestor climb tolerate a
  decorative sibling instead of stopping short.
- A generic, non-descriptive `aria-label` value (the literal word
  `"label"`, a real placeholder some form builders emit) previously
  read as if it were real — `isPlaceholderAriaLabel()` filters it out
  so the resolver keeps looking instead of trusting it.
- `aria-labelledby` pointing at more than one id, or an id that itself
  needs further resolution — `resolveLabelledBy(idList)` walks the
  full list instead of only ever reading the first id.
- A radio group's real caption living in shapes with no `<legend>` at
  all: a `<label>` that's a direct child of the `<fieldset>` (not
  wrapping it), a fieldset's own `aria-label`/`aria-labelledby`, or no
  fieldset at all (a bare `<h3>`/heading plus a `<ul>` of options) —
  the native-radio group-label IIFE now checks fieldset
  `aria-label`/`aria-labelledby` before `legend`, checks a direct-child
  `<label>`, and as a last resort calls the new
  `groupCommonAncestorCaption(name)`, which finds the true DOM common
  ancestor of every same-named radio via `document.getElementsByName`
  and checks that ancestor's own previous sibling for a real caption.
- The "just my own answer, not a real group caption" guard was too
  narrow — `ownWrapOrAriaMatches(el, own)` now also treats a
  `label[for=el.id]` that matches the option's own text as the same
  false-positive shape a wrapping `<label>` already was, so it doesn't
  get mistaken for the group's real caption.
- A real, timing-dependent duplicate-registration bug on Ashby's own
  `role="radiogroup"` scan — an option already registered by the native
  `<input type=radio>` scan could get registered a second time by the
  role-based scan before the DOM state the dedup relied on had
  stabilized. Fixed with an explicit `registeredBeforeRadiogroups`
  dedup check.
- File-input trigger lookup now also tries `nearbyUploadTrigger(el)`
  for a real upload button sitting near, not necessarily wrapping, the
  file input.
- Multi-step wizards that advance via a client-side route change
  (`location.href` changes with no full page reload) rather than
  revealing new fields on the same page — `watchForNewFields(session)`
  now also detects `location.href !== startUrl` inside its existing
  debounced MutationObserver callback, and `content.js`'s own notice UI
  branches its copy/button label on whether this was a same-page reveal
  or a real step transition ("This looks like a new step in the
  application.").

Extension version bumped `1.9.1` → `1.10.0` to reflect this wave —
there is no literal build-version string duplicated anywhere else in
the extension source to keep in sync, `manifest.json`'s own `version`
field is the single source.

## Cross-frame support (v3.294.0)

The extension's own extraction/candidate-scan/fill core (everything
described above) lives in `extension/frame_agent.js`, not `content.js`
itself — pulled out specifically so it can run in **every frame** of a
page, not just the top one. `background.js` injects it with
`chrome.scripting.executeScript({target:{allFrames:true}})` before
injecting `content.js` (which still only ever goes into the top frame,
`allFrames` defaulting to false) — both land in the same per-frame
ISOLATED-world execution context, so `content.js` in the top frame calls
straight into what `frame_agent.js` already exposed on `window`
(`__aynExtractFields`, `__aynFillTextLike`, etc.) rather than loading a
second copy.

A sub-frame (`window !== window.top`) runs its own local extraction the
moment it loads and self-reports the result via
`chrome.runtime.sendMessage({type:"AYN_FRAME_REPORT", ...})`. A content
script has no way to message a *different* frame directly — only the
background script's own `chrome.tabs.sendMessage(tabId, msg,
{frameId})` can target one — so `background.js` is a pure relay:
`AYN_FRAME_REPORT` goes up to the top frame (`frameId: 0`), and
`AYN_RELAY_TO_FRAME` (issued by the top frame when a matched field's id
says it came from another frame) goes back down to that exact frame,
with the real fill response relayed back as the reply. The top frame
merges every sub-frame's fields with a `frame<N>:` id prefix (never
colliding with its own or another frame's), collected for a bounded
~700ms window — a frame that never reports (blocked, slow, or genuinely
has nothing fillable) never hangs the rest of a real autofill pass.

Deliberately v1-scoped: only the **deterministic** layer runs across
frames. Form Intelligence (the AI-classified candidate layer) stays
top-frame-only — the deterministic layer alone already covers the large
majority of real fields, and relaying a full classify-then-fill round
trip through a sub-frame is real, separate follow-up work.

Verified with a real `<iframe>`, the real unmodified `frame_agent.js`
source, and `postMessage` standing in for the `chrome.runtime`/
`chrome.tabs` transport (the actual chrome APIs need a real loaded
extension to exercise, which this project's own tooling can't do): a
real cross-frame extraction, merge, and both a text fill and a
radio-group fill, each confirmed by reading the iframe's own DOM
afterward, not assumed from a returned `{ok:true}` alone.

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

## Ultimate stress + training pass (v3.295.0)

An even larger synthetic harness (~20 sections: real component-library
shapes -- Material UI, Ant Design, Bootstrap, Workday's attribute-only
markup -- plus portal-detached widgets, nested iframes, scale, duplicate
typeaheads) found and fixed two real gaps in the unrecognized-widget
candidate scan (`scanUnrecognizedWidgets`, `frame_agent.js`):

- A per-option-wrapped button group (Ant Design's `Segmented` component
  is the concrete real-world shape) was invisible to the scan entirely --
  it only ever looked for buttons as DIRECT siblings of one shared
  parent, and this component wraps each option in its own individual
  container, so every button's own parent has exactly one button child,
  always failing the "2 or more sibling buttons" check. Fixed by also
  checking one level up (the wrapper's own parent) and unwrapping a
  container that holds exactly one real button down to that button, so
  both the bare-sibling shape and the wrapped-per-option shape resolve
  to the same candidate group.
- `candidateNearbyText`'s sibling-exclusion check only ever excluded a
  previous sibling containing certain literal HTML tags (button, input,
  a, nav). A sibling that is itself an ARIA-role-based interactive
  widget with none of those tags -- a portal-rendered `role="listbox"`
  full of `role="option"` children, sitting adjacent to an unrelated
  toggle group, both rendered via a portal onto `document.body` -- was
  not excluded, and its whole concatenated option text was picked up as
  the toggle group's own label. Fixed by also excluding a sibling whose
  own role, or a descendant's role, matches a fixed list of
  ARIA-interactive roles (option, listbox, menu, menuitem, dialog,
  tooltip, combobox, radiogroup, radio).

THE ACTUAL TRAINING RUN, AGAINST THE LIVE, DEPLOYED CLASSIFIER. Minted a
real throwaway account, got a real user JWT, and called the live
`auto_apply_classify_widgets` action with real structural signatures
from the harness's P2/P3/P4 (real component-library toggle and
multi-select shapes) and D1-D4 (deliberate false-positive test widgets:
a star rating, a cookie banner, a chat launcher, a share bar). Real
results: P2 and P3 correctly classified `toggle_button_group`, P4
correctly classified `multi_select_button_group` -- the first live
proof the toggle-vs-multi-select distinction actually holds, not just
the fixture it was designed against. But 3 of 4 false-positive widgets
came back misclassified as real, fillable toggle groups (a star rating,
a cookie banner, a chat launcher), and the fourth as an unsupported
multi-select (harmless, but still wrong). Two of the three shapes are
checkable in code with total certainty -- no visible question text at
all, or every visible option reading identically (a rating scale
rendered as repeated glyphs) -- so `classifyWidgets` now filters both
out before they ever reach the model, in both duplicated
implementations, zero AI cost either way. Re-verified live after
deploying and clearing the stale cached (wrong) classifications: all
four false positives now correctly return `unrecognized` with
`fromCache: false`, confirming the code guard fired rather than a
lucky re-roll. Test account fully erased after.

## Real, disclosed limits — not yet built

- `job-checker`'s own fill path has no equivalent of `content.js`'s
  listbox-diff typeahead helper yet — a location/city-style field with
  no `role="combobox"` still isn't fillable server-side, even though
  extraction-side parity for the other three shapes is done. `job-checker`
  also has no equivalent of the extension's own cross-frame support --
  it only ever reads the single page it navigates to.
- Cross-frame support (see above) is deterministic-layer-only for now --
  a widget inside an `<iframe>` that only the AI-classified candidate
  layer would recognize (a zero-ARIA toggle group, an un-roled
  placeholder trigger) is still invisible there, even though the exact
  same shape works correctly in the top frame. Relaying a full
  classify-then-fill round trip through a sub-frame is real, separate
  follow-up work.
- The candidate scanner (`scanUnrecognizedWidgets`) is intentionally
  narrow — two bounded shapes, not a generic "anything clickable" sweep
  — to keep false-positive risk and per-page classification cost low.
  A genuinely novel shape outside those two patterns (a real date
  picker, a signature pad) still isn't detected at all; extending the
  candidate scanner to cover it is real, scoped future work, not a gap
  in the classifier itself.
- A genuine multi-select "choose all that apply" group is now correctly
  *recognized* (`multi_select_button_group`, distinguished from
  `toggle_button_group` by the classifier reading the real question
  phrasing) but never auto-filled — it's flagged by name for the person
  to answer themselves. Real auto-selection would mean matching several
  possible answers against the person's own profile at once, a
  genuinely different kind of matching `matchApplicationAnswers` isn't
  built for; not attempted here.
- `form_widget_patterns.confidence` distinguishes `'ai'` from
  `'verified'` in the schema, but nothing yet promotes a row to
  `'verified'` after a real, successful, read-back-confirmed fill —
  the column exists for this and is unused today.
- A genuinely closed shadow root (`mode: "closed"`) stays unreachable by
  design on both surfaces — not something either implementation, or the
  classifier, can see into.
- Extraction now prefers a single real `<form>` when a page has two or
  more (see `pickScanRoot()`), but a page with zero or exactly one form
  — the real Ashby-style case this whole app was built around — is
  completely unaffected and still scans the whole document, meaning a
  genuinely unrelated widget on a form-less page can still get swept in.
  This is a real, accepted, disclosed trade-off, not an oversight: fully
  closing it would mean breaking the no-`<form>` case this extension
  exists to handle.

## Live training pass, wave 3 (v3.301.0 to v3.304.0)

A real, persistent-Playwright-profile harness driving the actual
unpacked extension against genuine, live job postings pulled from AYN's
own `/jobs` catalog — the same discipline documented above, continued
across five real sites (`careers-page.com`, `careers.hireology.com`,
`careers.stratoswealthpartners.com`, `ats.rippling.com`,
`smsicorp.zohorecruit.com`), each finding one real, distinct bug class:

- **`consentCaptionAfter()`** (v3.301.0) — a standalone consent
  checkbox whose real caption *follows* it in the markup instead of
  preceding it (the standard "I agree to the terms and conditions &
  privacy policy" shape), where the caption legitimately contains one
  or two inline document links. `siblingText()`'s own interactive-
  descendant check correctly disqualifies a sibling *containing* a link
  for its other callers, but wrongly rejected this one; a narrower,
  self-only interactive check was added instead of widening
  `siblingText()` itself.
- **`isBareGenericLabel()` / `BARE_GENERIC_LABEL`** (v3.301.0, widened
  v3.303.0) — a `label[for]` (or, once widened, an `aria-label`) whose
  entire text is nothing but a UI-chrome placeholder word ("Select",
  "Choose", "Search") or a leaked ARIA role name ("textbox",
  "combobox", "listbox"), standing in for a real caption sitting
  elsewhere (a floating-label select's own real question one `<p>`
  sibling up; a react-select combobox's real `aria-labelledby` sitting
  unread because a generic `aria-label` won first). One shared check
  now covers all three attribute sources this same class of problem
  can show up on, rather than three separately drifting ones.
- **`checkboxGroupLabel`** (v3.302.0) — a checkbox *group* (several
  checkboxes answering one real multi-select question, e.g. "years of
  experience, check the range that applies") has no equivalent to a
  radio group's `name`-keyed grouping, since checkboxes carry no such
  HTML requirement. A checkbox now checks its own closest `<fieldset>`
  for a `<legend>` — the one signal actually observed live, deliberately
  not the full radio-group machinery (aria-labelledby-on-fieldset,
  direct-child-label, `ownWrapOrAriaMatches`, `groupCommonAncestorCaption`)
  since those were each hard-won for a specific confirmed *radio* shape.
  A new field name, not a reuse of `radioGroup`/`radioGroupLabel` —
  those carry real, load-bearing single-choice-fill semantics elsewhere
  that a genuinely multi-select checkbox group must never be mistaken
  for.
- **`.crc-form-row` ancestor lookup** (v3.304.0) — the deepest find of
  this wave: an entire real application (Zoho Recruit) came back 18 of
  20 fields either generic-placeholder-labeled or honestly unlabeled,
  because its own web-component form builder nests several custom-
  element layers between an input and its real caption — past the
  existing 2-hop ancestor climb's deliberately narrow reach. Traced with
  Playwright's own text locator (a raw DOM `textContent` search came back
  empty; whitespace/normalization differences made the literal match
  fail even though the real `<label>` element was sitting right there).
  A first, narrower attempt keyed the fix to a predictable
  `label id="crc-label-{fieldName}"` / `input name="{fieldName}"`
  pairing — correct on 8 of 9 fields, but several real fields here
  (every search-typeahead combobox: City, State, the phone country-code
  picker) share one generic, non-unique id with no `name` at all,
  unreachable by that pairing. Replaced with the more general signal
  Zoho's own form builder actually guarantees: every field, named or
  not, sits inside one `.crc-form-row` container holding exactly one
  real `<label>` — `el.closest(".crc-form-row")?.querySelector("label")`
  — which correctly reaches all 20 fields, including two legitimately
  different widgets (a phone country-code picker and its own number
  field) that correctly share one row's single "Mobile" label.

Also directly verified in this same pass, no fix needed: the cross-
frame extraction mechanism (v3.294.0) against two genuine cross-origin-
iframe application forms in production (Comeet's own ATS, both under
`comeet.com` directly and white-labeled under a company's own domain,
`upwind.io`) — both correctly self-reported 11-12 real, fully-labeled
fields including a real radio group and a custom free-text question,
the first live confirmation of this mechanism against a real third-
party site since it shipped. Two real, distinct identity-provider gates
were also found and correctly characterized as platform behavior, not
extension gaps: UKG requires signing into its own Auth0-backed
candidate portal before an application form is reachable at all, and Y
Combinator's own "Work at a Startup" apply flow requires the same —
both correctly extract the one real field present on whichever pre-
auth page a candidate actually lands on.

Every fix in this wave was regression-checked, after each individual
change, against every other real site already verified earlier in the
same pass (not just the site that surfaced the bug) — each held its
exact prior field count with zero new gaps introduced.

## The other half of "smart" — application_answer_match (v3.265.0, extended v3.305.0)

Everything documented above (the deterministic scanner, Form
Intelligence's AI classification, the flag-and-retrain loop) answers one
question: *what kind of control is this field, and how do I operate it*.
A second, separate system answers a different one: *what real value goes
into it*, for the specific class of question that isn't safe for a model
to phrase from scratch — work authorization, salary, licenses, background
checks — legal/factual questions where an invented-sounding but wrong
answer is a real problem, not just a UX one.

`supabase/functions/resume-hub/lib/applicationAnswers.ts`
(`matchApplicationAnswers`, action `application_answer_match`, folded
into `auto_apply_extract`'s own real result) is a fixed, growing list of
`KNOWN_QUESTIONS` — each entry a regex covering the common real phrasings
plus a `resolve()` function reading one already-stored fact off the
person's own `CanonicalProfile` (`work_auth`, `preferences`,
`certifications`, `screening_answers`) and returning it verbatim. The
model is never asked to invent or infer an answer here — every resolver
either returns a real stored value or `null`, and `null` means the
person types it themselves. Narrative/open-ended questions ("why do you
want this role") are deliberately out of this file's scope — those are
safe for a model to write from real resume facts, this file is only for
the class of question that isn't. Two passes: cheap keyword regex first
(covers the vast majority of real phrasings, zero AI cost), then an
embedding-similarity fallback (`SIMILARITY_THRESHOLD = 0.72`) only for
whatever the regex pass didn't already resolve.

**A real, significant gap found by testing the actual end-to-end fill
flow, not just extraction (v3.305.0).** Every other session of live
testing documented in this file drove `frame_agent.js`'s own extraction
directly — proving fields get correctly *read and labeled*, never that
they get correctly *answered*. Testing the real thing instead (a genuine
throwaway account, a real, correctly-shaped seeded `CanonicalProfile`,
a real injected session, the actual `autofill()` flow running against a
real live Trakstar application) found that the single most common real
screening question on any US/Canada job application — a bare "Are you
authorized to work in Canada?", no sponsorship clause — had no resolver
at all. The two existing work-authorization resolvers
(`work_authorized_no_sponsorship`, `requires_sponsorship`) both
deliberately require a "without"/"require...sponsorship" clause, kept
strictly separate on purpose since their own v3.265.0 history already
documents a real bug from once sharing one regex across the two opposite
polarities. The embedding fallback correctly, honestly declined too
(0.588 similarity against its closest known example, below threshold) —
not a bug in the matching logic, a sponsorship-qualified question really
isn't the same fact as a bare one. The real bug was upstream: nothing
covered the plain phrasing at all.

Fixed with a new resolver, `work_authorized_plain`, reading the same
`work_authorized_ca`/`work_authorized_us` fields the sponsorship
resolvers already trust, country parsed directly from the real question
text (falling back to "exactly one of the two fields is on file" when
neither or both countries are mentioned — a real, safe inference for a
single-country candidate, never a guess when the underlying fact could
genuinely differ by country). Deliberately excludes any label mentioning
sponsorship at all, checked twice — once in the keyword regex itself (a
negative lookahead), once again unconditionally inside `resolve()`,
since the lookahead alone only inspects text *after* the country match
and a real phrasing can put the word before it ("If you require
sponsorship, are you still authorized to work in Canada in the
meantime?" — confirmed live as the exact case the lookahead alone would
have missed).

**What this means for "how much intelligence has AYN actually gathered
from real testing," asked directly.** Checked the real, live
`form_widget_patterns` table (the AI-classification cache documented
above): 7 real patterns total, `sample_domains` empty across the board
at time of writing — confirming the wave-3 extraction fixes never once
needed to fall through to AI classification, because every real widget
shape encountered (checkboxes, radios, native/custom selects, text
inputs) was already a shape the deterministic scanner recognizes. Real
job-application forms, as a genre, mostly use conventional controls —
census-scanned several already-tested sites directly for exotic widget
signals (sliders, date pickers, star ratings, drag-drop, signature pads)
and found none live. The real, remaining gap wasn't a missing widget
*type* — it was this file, the actual answer-matching intelligence,
which had simply never been exercised end to end before this pass.

**Two more real bugs found batch-testing 20 real question phrasings
(same v3.305.0 pass).** `highest_education` answered `null` despite a
real, complete `education` array on file — it only ever read `derived.
education_level`, an AI-populated summary field the canonical-profile
extraction pipeline sets, with no fallback for a real profile whose
`derived` summary was never computed. Fixed with a disclosed, honest
fallback to `education[0]`'s own degree text — real, never invented,
though not guaranteed to be the person's *highest* degree specifically
if they have more than one on file, since nothing enforces most-recent-
first ordering on that array. More seriously: "What is your desired
hourly rate?" matched `desired_salary` via the embedding-similarity pass
(0.754 similarity, above the 0.72 threshold — semantically close enough
to "salary expectations") and answered with the stored figure verbatim,
which has only ever been an *annual* number — a real, visibly wrong-
scale answer ("$100,000/hr") for a real, common shape (an hourly-paid
role; a live Zoho-hosted posting tested this same session stated its own
pay as "$75/hr"). No separate hourly-rate field exists anywhere in the
schema to answer this correctly, and inventing one via an assumed
hours/week would itself be a fabricated fact — fixed by declining
outright when the label says "hourly"/"per hour"/"/hr". This fix had to
live inside `resolve()` itself, not the keyword regex, since this
specific match happens through the embedding pass, which never calls
`keywords.test()` at all — worth remembering for any future resolver
that also needs to reason about the real question text: the label is
only reliably available inside `resolve(c, label)`, not guaranteed to
have been checked by `keywords` first.
