# Three-part upgrade: close the loop, remember, see

Goal: turn the current "scan-continuous / decide-once / retry-same-answer" engine into "scan-continuous / decide-with-feedback / remember-across-forms / see-what-DOM-misses." Each part ships independently and produces measurable improvement on the Ashby URL and other ATSes.

Order matters. Ship in this sequence — each part unlocks the next.

---

## Part 1 — Close the AI decision loop (~2 days)

Right now: user clicks Fill → one AI call → inject → verify → retry the same answer. If the AI produced a bad answer, we retry the bad answer.

**What we build:**

1. New module `extension/question-engine/decision-loop.ts` — orchestrates AI calls per question, not per form.
2. New failure classifier in `content.js` after `aynPostInjectVerify`: for each unverified field, tag it as one of:
   - `injection_failed` (DOM write didn't stick, React reverted, wrong selector)
   - `option_not_found` (AI answer didn't match any option label)
   - `validation_rejected` (input pattern/required rejected the value)
   - `field_became_visible` (a new required field appeared after fill — very common on Ashby/Workday)
3. Second AI call (`ext_fill_form_retry` edge function) receives: original field, original answer, failure class, current DOM options snapshot, sibling context. Returns a re-planned answer.
4. Cap: max 2 re-plan rounds per field, max 8 seconds total. Then hand off to vision fallback (already exists).
5. Every retry gets logged to `autofill_runs` table (already exists) with columns `retry_count`, `failure_class`, `resolved_by` so we can measure lift.

**Files touched:**
- new: `extension/question-engine/decision-loop.ts`
- new: `supabase/functions/ext_fill_form_retry/index.ts`
- edit: `extension/content.js` — replace `aynRetryUnverified` inner loop with decision-loop call
- edit: `extension/background.js` — route retry messages
- migration: add `retry_count`, `failure_class`, `resolved_by` to `autofill_runs`

**Success metric:** on the Ashby URL, unverified field count after fill drops by ≥40%.

---

## Part 2 — Turn on the learning interface (~3 days)

Right now: `question-engine/learning/interface.ts` defines `remember/lookup/promote` but only `noopLearning` ships. Every form is the first form.

**What we build:**

1. New table `ext_answer_memory` in Supabase:
   ```
   user_id, question_signature (hash of label+kind+options),
   canonical_label, semantic_type, answer_value, answer_option_label,
   ats_hint, times_used, last_used_at, verified_ok_count, verified_fail_count
   ```
   RLS: user reads/writes own rows only.
2. New adapter `extension/question-engine/learning/supabase-store.ts` implementing `LearningEngine`:
   - `lookup(question)` → hash the question, query top match by signature + semantic_type, return if `verified_ok_count > verified_fail_count`.
   - `remember(question, answer)` → upsert on successful verification only.
   - `promote(question, answer)` → increment `verified_ok_count`.
3. Wire it in `content.entry.js`: call `setLearningEngine(supabaseLearning)` on init.
4. New step in fill flow, **before** the AI call: for each question, `learning.lookup()`. If hit, use the memorized answer as the AI's default suggestion (AI can still override if confidence low). This preserves AI judgment while eliminating "asked this same question 30 times."
5. After successful `aynPostInjectVerify`, `learning.remember()` writes the answer.
6. UI in `src/components/resume-hub/ExtensionTab.tsx`: "Learned answers" table so the user can view, edit, or forget any stored answer (privacy control — required by your existing memory rules).

**Files touched:**
- new: migration for `ext_answer_memory` table + GRANTs + RLS
- new: `extension/question-engine/learning/supabase-store.ts`
- new: `supabase/functions/ext_answer_memory/index.ts` (proxies through spine.aynn.io if that's the current pattern — needs confirmation)
- edit: `extension/content.entry.js` — register learning engine
- edit: `extension/content.js` — call `lookup` pre-AI, `remember` post-verify
- edit: `src/components/resume-hub/ExtensionTab.tsx` — memory management UI

**Success metric:** second fill of the same ATS uses ≥60% memorized answers, AI call latency drops proportionally.

---

## Part 3 — Wire vision into the question layer (~4 days)

Right now: `evidence/vision.ts` + `setVisionProvider` exists but is dormant. Vision only runs post-injection to click stray options. It never *discovers* fields the DOM scanner missed.

**What we build:**

1. New gate in `question-engine/index.ts:scanForm`: after `build()` produces `Question[]`, check for **visual dead zones** — form regions that contain visible text nodes suggesting a question (`?`, question mark, keywords like "Select", "Choose", "How", "Are you", "Do you") but produced zero detected fields.
2. New evidence source `evidence/vision.ts` gets a real provider (`vision-provider.ts`): screenshots each dead zone with `html2canvas` (already loaded), sends to `ext_vision_discover` edge function (Gemini 2.5 Flash multimodal), receives back structured question descriptors:
   ```
   { label, kind: 'text'|'single_choice'|'multi_choice'|'boolean',
     options?: string[], anchor_selector: string }
   ```
3. Vision-discovered questions are merged into `__AYN_QUESTIONS__` with `evidence.source: 'vision'` and reduced confidence (`labeling: 0.7`, `typing: 0.6`). They flow through the same AI decision + injection pipeline.
4. For injection, vision provides an `anchor_selector` + expected label. The filler uses proximity matching from the anchor to find the actual interactive element (button, div-role-combobox, etc.). If it can't, it falls back to click-at-coordinates via `chrome.debugger` API (already permission-approved in manifest via `activeTab`).
5. Gated by `confidence.visionGate: 0.7` threshold that's already defined — only fire vision when DOM confidence for the region is below 0.7. Prevents wasted screenshots on well-structured forms.
6. Cache screenshots per URL hash for 30 minutes so repeated fills don't re-vision.

**Files touched:**
- new: `extension/question-engine/vision-provider.ts` (real implementation)
- new: `supabase/functions/ext_vision_discover/index.ts` (Gemini multimodal via Lovable AI Gateway)
- edit: `extension/question-engine/index.ts` — dead-zone detection + `setVisionProvider(realProvider)`
- edit: `extension/question-engine/evidence/vision.ts` — accept and merge vision-discovered questions
- edit: `extension/filler.js` — anchor+label resolver, optional coordinate-click fallback
- edit: `extension/manifest.json` — add `debugger` permission (only if coordinate-click needed)

**Success metric:** on 5 previously-failing forms (Ashby + 4 others), vision layer discovers ≥3 fields per form that DOM missed, and ≥70% of those get filled.

---

## Foundation for all three: capture real forms first (~half day, done in Part 1)

Currently `extension/question-engine/__corpus__/` has scaffolding but no captured forms. Before any of this ships, we snapshot the Ashby URL and 4 other failing ones into `__corpus__/fixtures/*.html` via `capture.ts`. This gives us:

- A regression benchmark: `benchmark.ts` runs the engine against fixtures, asserts expected question counts and labels.
- A way to unit-test the decision loop (Part 1), learning store (Part 2), and vision layer (Part 3) without hitting live ATS pages.
- Honest measurement of "did we improve?" instead of vibes.

Every part above adds its own benchmark assertions.

---

## Technical shape (for reference)

```text
                       ┌────────────────────────────────────┐
                       │  Continuous scan loop (existing)   │
                       │  observeForm → __AYN_QUESTIONS__   │
                       └────────────────┬───────────────────┘
                                        │
                        [NEW Part 3] vision dead-zone pass ─┐
                                        │                    │
                                        ▼                    │
                       ┌────────────────────────────────────┐│
                       │  User clicks Fill                  ││
                       └────────────────┬───────────────────┘│
                                        │                    │
                        [NEW Part 2] learning.lookup() ──────┤
                                        │                    │
                                        ▼                    │
                       ┌────────────────────────────────────┐│
                       │  AI call (with memory suggestions) ││
                       └────────────────┬───────────────────┘│
                                        │                    │
                                        ▼                    │
                       inject → verify → classify failures ──┤
                                        │                    │
                        [NEW Part 1] decision-loop re-plan ──┤
                                        │                    │
                                        ▼                    │
                        vision-fallback clicks (existing) ◄──┘
                                        │
                        [NEW Part 2] learning.remember()
```

---

## Order of implementation

1. **Corpus capture + benchmark** (half day) — measurement floor
2. **Part 1: decision loop** (2 days) — biggest immediate lift on Ashby
3. **Part 2: learning store** (3 days) — compounding value over time
4. **Part 3: vision discovery** (4 days) — catches the "invisible custom widget" class

Total: ~10 working days. Each part is shippable independently — we don't need to wait for all three to see improvement.

Approve this plan and I'll start with corpus capture + Part 1.
