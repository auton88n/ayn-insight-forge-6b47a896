# Question Engine — Phase 3+ Completion Plan

Finish the AYN Universal Question Engine from its current skeleton state to a corpus-gated, production-parity understanding layer, in the exact order the spec's §14 recommends. Every phase is independently shippable, benchmark-gated, and leaves `scanForm` more useful than the phase before. The extension's live `manifest.json` remains untouched until Phase 8.

## Guiding principles (non-negotiable)

- **Only the builder creates `Question` objects.** Adapters, evidence sources, reconstructor all produce `Evidence` or `QuestionGroup` — never a `Question`.
- **Weights are config, not code.** Any tuning goes in `evidence.ts` `WEIGHTS` or `confidence-engine.ts` thresholds. Never a new `if` branch.
- **Every phase adds a fixture + benchmark row before merging.** No phase is "done" until the corpus gate passes on at least one real captured form.
- **File cap 400 lines, function cap 100 lines.** The old 4301-line scanner is what we're escaping.
- **No DOM writes except `data-ayn-fid`.** The engine reads; it never mutates form values.
- **Engine stays decoupled from `manifest.json`** through Phase 7. Only Phase 8 wires it into the live extension behind a flag.

---

## Phase 3 — Evidence extraction (DOM + a11y)

Make the two highest-weighted evidence sources real. This is what unblocks everything downstream.

**`evidence/dom.ts`** — implement `collect(el, root): Evidence[]`:
- Label via `<label for=id>`, wrapping `<label>`, `aria-labelledby` id list, `<legend>` inside enclosing `<fieldset>`.
- `required` from the `required` attribute, `aria-required`, and asterisk-in-label heuristic (tagged with lower confidence).
- `placeholder` from the attribute.
- `options` for `<select>` (iterate `<option>`), for radio/checkbox groups (siblings sharing `name`), and for ARIA `listbox`/`combobox` (`role=option` descendants).
- `validation` from `pattern`, `min`/`max`, `maxLength`, `type=email|url|tel|date`.
- `section` from nearest heading ancestor (`h1..h6`, `[role=heading]`) walking up.
- `bbox` from `getBoundingClientRect()` (used later by the proximity-decay scorer).
- Each `Evidence` built via `makeEvidence('dom', kind, value, sourceConfidence)` so weights come from the config table.

**`evidence/accessibility.ts`** — implement `collect(el, root): Evidence[]`:
- Compute the accessible name per the WAI-ARIA name-computation algorithm (subset that matters for forms): `aria-labelledby` → `aria-label` → associated `<label>` → `title`. Emit as `kind: 'name'` and, when it agrees with a visible label, also `kind: 'label'`.
- `role` from explicit `role` attribute or implicit role of the tag.
- `aria-required` → `required`.
- `aria-describedby` → `description`.
- `aria-invalid`, `aria-errormessage` → `validation` metadata.

**Fixture #1**: capture one Greenhouse standard form via `__corpus__/capture.ts`. It's the simplest ATS and validates the pipeline end-to-end before we touch anything weird.

**Exit criteria**: Running `enrich()` on Fixture #1 produces non-empty `evidence[]` on every control with sensible labels. No builder yet — verified by snapshot test.

---

## Phase 4 — Grouping + Reconstruction

Turn `DetectedField[]` into `QuestionGroup[]`. This is where AYN historically bled bugs (gender-group case, hidden-checkbox proxy, Workday `Select One`), so we build it once, carefully, table-driven.

**`grouping.ts`** — pure clustering helpers:
- Group radios sharing `name` (native) OR sharing `role=radiogroup` container OR sharing `aria-labelledby` target.
- Group checkboxes inside a common `<fieldset>` / `[role=group]` / label-group container **when** they share a common question label above them (avoid over-grouping unrelated consent boxes).
- Standalone controls become singleton groups.
- Emits `GroupingHint`-shaped internal records with reasons (`"shared-name"`, `"fieldset"`, `"aria-radiogroup"`, `"container+shared-label"`) so telemetry can see why.

**`question-reconstructor.ts`** — `reconstruct(fields, root): QuestionGroup[]`:
- Consumes DOM grouping + adapter `groupingHints` (via the active adapter) + native grouping, fuses them.
- **Proximity-decay label scorer**: for each group, score candidate label texts (preceding siblings, ancestor legends, `aria-labelledby` targets, adjacent text nodes) by:
  - Distance in DOM tree (BFS depth from group anchor)
  - Vertical pixel distance (from `bbox` evidence)
  - Whether the candidate is inside another form control (disqualify: prevents picking placeholder or option text as label)
  - Whether the candidate is itself an option label of a sibling group (disqualify)
- Attaches the winning label as `Evidence(source: 'dom' or 'accessibility', kind: 'label', confidence: <scorer output>)` onto `groupingEvidence`.
- `groupConfidence` = weighted agreement across grouping evidence sources.

**Fixture #2**: Greenhouse gender radio group (historically the "gender-group case"). Must group all three radios, must pick "Gender" as label, must not pick "Male" (an option) as label.

**Exit criteria**: Fixtures #1 and #2 both produce correct `QuestionGroup[]`. Groups have `groupConfidence >= 0.85`.

---

## Phase 5 — Confidence engine + Builder + Semantic types

Now — and only now — do we mint `Question` objects.

**`confidence-engine.ts`** — implement the math:
- `agreement(evidence[], kind)`: fused value = weighted-highest; confidence = `(top_weight × top_source_confidence) / Σ weights`, penalized by disagreement mass from dissenters.
- "Top weight ≥ 2× next → wins outright; otherwise overall confidence reduced" — the explicit §5.4 rule.
- `computeQuestionConfidence(groupingEv, labelingEv, typingEv)` returns `{ grouping, labeling, typing, overall: min(...) }`.
- Threshold constants exported (`0.90 / 0.70 / 0.40`) so downstream layers reference one source.

**`semantic-types.ts`** — table-driven pattern matcher:
- One data table: `[{ pattern: RegExp | string[], semanticType: string, kind: QuestionKind }]`.
- Namespaced types: `eeo.gender`, `eeo.race`, `eeo.veteran`, `eeo.disability`, `logic.work_auth`, `logic.sponsorship`, `logic.relocation`, `open.motivation`, `open.why_company`, `contact.email`, `contact.phone`, etc.
- Ports the current `classifyField()` patterns from `extension/` verbatim, then adds the ones the corpus reveals it misses.
- Returns `unknown` when nothing matches (spec §2.1: "unknown is valid and must be handled downstream rather than guessed").

**`evidence/merge.ts`** — pure fusion:
- `(evidence[]) → Map<kind, FusedValue>`, deterministic, testable in isolation.
- Losing evidence retained on the `Question.evidence` array (spec §5.4).

**`question-builder.ts`** — the only creator of `Question`:
1. Fuse evidence per kind via `merge.ts`.
2. Resolve `label`, `required`, `options`, `section`, `description`, `placeholder`, `validation`.
3. Classify `semanticType` and `kind` via `semantic-types.ts`.
4. Compute `confidence` via `confidence-engine.ts`.
5. Mint `id` via `mintId(idKindFor(control, grouped, isCustom), anchorFid, frame)` — the load-bearing injector-compatible id.
6. Dedup groups that resolve to the same anchor fid.
7. `freezeQuestion(q)`.

**Exit criteria**: `scanForm` on Fixtures #1 and #2 returns `Question[]` with correct labels, semantic types, and `confidence.overall ≥ 0.85` on every question. First real benchmark row lights up green.

---

## Phase 6 — Adapters (real logic) + Corpus expansion

Adapters produce evidence + grouping hints only. Never construct questions.

Build in this order (matches AYN production volume):

1. **`adapters/generic.ts`** — port current container/proximity heuristics from the live scanner. This is the fallback and must be strong on its own.
2. **`adapters/workday.ts`** — `detect()` via `data-automation-id` presence and Workday host patterns; `collectEvidence()` reads `data-automation-id` for canonical labels; `groupingHints()` handles `Select One` dropdowns and repeating work-history sections; `verify()` checks the question is reconstructable post-mutation.
3. **`adapters/ashby.ts`** — Ashby-specific class patterns and hidden-checkbox proxy handling (the historical failure case).
4. **`adapters/greenhouse.ts`** — standard form conventions.
5. **`adapters/lever.ts`** — standard form conventions.
6. **`adapters/icims.ts`** — standard form conventions.

**`evidence/adapter.ts`** — becomes real: calls active adapter's `collectEvidence` per field, tags evidence with `source: 'adapter'`.

**Corpus expansion** — capture the priority fixtures listed in `__corpus__/fixtures/README.md`:
- `workday/accenture-questions.json`, `workday/accenture-workhistory.json`
- `ashby/gender-group.json`, `ashby/hidden-checkbox-proxy.json`
- `greenhouse/standard.json`, `lever/standard.json`, `icims/standard.json`
- Each fixture stamped with `capturedAt` so drift is visible.

**`__corpus__/benchmark.ts`** — implement `score()`:
- For each fixture: run `scanForm` against the reconstructed DOM (jsdom in Node), compare produced `Question[]` to fixture `expected: ExpectedQuestion[]`.
- Detection = fraction of expected controls detected.
- Grouping = fraction of expected groups matching produced groups (by member fid sets).
- Label = fraction of matched groups with the correct resolved label (normalized whitespace/case).
- Classification = fraction with correct `semanticType`.
- `passesGate()` already implemented — becomes the real CI gate.

**Exit criteria**: Every fixture meets its `TARGETS` row. CI gate fails on any regression. Adapter selection is auto: `selectAdapter` picks the right one per document.

---

## Phase 7 — Mutation observability + Vision (gated)

**`evidence/mutation.ts`** + `observeForm` in `index.ts`:
- Wrap `MutationObserver` at `root`. On each batch:
  - Call `nextGeneration()`.
  - Determine affected controls (added, removed, attribute changes on tracked fids).
  - Re-detect + re-enrich only the affected subtree.
  - Diff produced questions against previous set by `id`; emit `QuestionDelta { added, changed, removedIds }`.
- Never re-scans the whole form. Delta only.

**`evidence/vision.ts`** — gated, evidence-only:
- Public `collect(el, root): Evidence[]` stays synchronous and returns `[]` when not gated.
- Async `collectGated(el, root, needed: EvidenceKind[]): Promise<Evidence[]>` invoked by the builder **only** when fused confidence for a needed property is `< 0.70` AND `dom`+`accessibility` are the only sources present (the §5.5 gate).
- Returns `label` / `options` evidence tagged to element refs with `weight: 0.4`. Never actions, never coordinates.
- Vision provider abstracted behind an injected function — engine doesn't know it's calling Gemini/GPT/etc. Ships with a no-op default.

**Exit criteria**: `observeForm` fires deltas correctly on a Workday reveal-flow fixture. Vision gate never fires when DOM+a11y already produced `confidence ≥ 0.70`.

---

## Phase 8 — Wire into live extension (Stage B → C of §11)

Only now does the live extension see the engine.

**Stage B** — additive, flag-gated:
- Add `QUESTION_ENGINE_V1` flag in `extension/constants.js`.
- In `extension/dom.js` / `extension/filler.js`, when flag is on: call `scanForm` alongside the existing scanner, project results via `projectToLegacy`, feed both to a diff logger. Existing scanner still drives fills. **Zero behavior change.**
- Ship for internal dogfood. Diff logs go to telemetry. Any divergence is a bug in the engine, not a regression in production.

**Stage C** — swap the reader:
- Rule engine reads `Question` directly (accepts either shape during transition).
- Executor consumes `Question.controls[]` refs via `resolveRef()` instead of parsing id prefixes.
- Legacy scanner disabled behind flag inversion.

**Stage D** (later, separate PR):
- Delete `extension/question-engine/legacy.ts`.
- Delete the old scanner code.
- `Question` is the sole model end to end.

**Exit criteria**: Stage B ships with zero user-visible change and produces divergence logs. Stage C ships only after 30 days of Stage B logs show < 0.5% divergence on real user forms.

---

## What I will NOT do (spec discipline)

- Will not put reconstruction logic in adapters. Adapters emit hints, builder decides.
- Will not add answering, filling, AI calls, or profile reads inside the engine. Boundary is `projectToLegacy` / `withAnswer`.
- Will not let vision override a confident DOM/a11y reading. The 0.70 gate is a contract, not a suggestion.
- Will not add fields to `Question` without a fixture that requires them. Model bloat is the failure mode.
- Will not modify `manifest.json` before Phase 8. The engine stays quarantined until it beats the current scanner on the corpus.
- Will not skip capturing a fixture "because the code obviously works." A phase without a fixture is not done.

---

## Technical section (for future me / other engineers)

**Test infrastructure**: `__corpus__/run.ts` uses `jsdom` to rehydrate fixture DOM, calls `scanForm`, returns `Question[]`. `benchmark.ts` diffs against `fixture.expected`. Runs in Node, no browser needed. Add `bun test extension/question-engine/__corpus__/benchmark.test.ts` to CI.

**Accessible-name computation**: implement the subset of https://www.w3.org/TR/accname-1.2/ that covers form controls. Skip the tree-walking recursion for `aria-labelledby` chains deeper than 2 levels — diminishing returns, and the corpus will tell us if we need more.

**Adapter registration order**: `registerAdapter(generic)` happens in `index.ts` module init. Others register themselves at module load. `selectAdapter` iterates in registration order but skips `generic` until fallback — order among non-generic adapters doesn't matter because their `detect()` predicates are disjoint (Workday host ≠ Ashby host, etc.).

**Id minting invariants**: `mintId` output must round-trip through the existing injector's prefix parser. Add a test that asserts every id produced by the builder is parseable by `extension/filler.js` id dispatcher.

**Confidence math corner case**: when only one evidence source exists for a kind, `agreement()` returns that source's confidence unweighted — no "agreement" bonus, no dissent penalty. Prevents single-source overconfidence.

**MutationObserver scope**: observe `subtree: true, childList: true, attributes: true, attributeFilter: ['aria-hidden', 'hidden', 'disabled', 'required', 'aria-required', 'aria-labelledby', 'aria-label']`. Don't observe `characterData` — too noisy, and labels are usually re-parented rather than text-mutated.

**File-size discipline**: if `question-builder.ts` approaches 400 lines, extract per-kind resolvers (`resolveLabel.ts`, `resolveOptions.ts`) rather than inlining branches. If `evidence/dom.ts` approaches 400, split by kind (`dom/label.ts`, `dom/options.ts`).
