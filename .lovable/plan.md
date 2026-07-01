
# Make AYN Autofill Truly Universal

Goal: AYN understands every form on every ATS and fills every question correctly. Ship in two phases so we can measure the win after each.

## Phase A — Universal DOM understanding (v1.9.37)

Rewrite the scanner in `extension/content.js` so the field list AYN sees matches what a human sees.

1. **Walk fieldsets, legends, and ARIA trees, not just individual inputs.**
   - Group by nearest `<fieldset>`, `role="group"`, `role="radiogroup"`, `aria-labelledby`, or a preceding heading (h2/h3/h4/label/legend).
   - Use each group's accessible name as the question, its children as options.
   - Works across Workday, Greenhouse, Lever, Ashby, Gem, Taleo, iCIMS, SAP SuccessFactors, BambooHR — no per-site adapters needed beyond the existing Gem one.

2. **True control-kind detection.** For every group decide: text, textarea, richEditor, select (native), combobox (typeahead), radioGroup, checkboxGroup (multi vs singleChoice), datePicker, phone-with-country, file. Kind drives the injector; today too many things get miscalled `text`.

3. **Sibling context capture.** For each field record: section heading, preceding sibling label, following helper text, `aria-describedby`, placeholder, and up to 3 sibling field labels. This is the context Phase B feeds to the model.

4. **Dedupe + ordering.** Preserve DOM order, dedupe by group id, and drop hidden/decorative controls.

5. **Diagnostic panel (in the extension).** After Fill, show a collapsible list of every field AYN saw: label, kind, classifier tag, chosen answer, source (profile key or "AI"), and skip reason. This is how we prove Phase A works and drive Phase B fixes.

Deliverables: `extension/content.js` scanner rewrite, `extension/sidepanel.js` diagnostic panel, telemetry writes the new fields to `autofill_runs`. Bump to `1.9.37`, rebuild `public/ayn-extension.zip`.

## Phase B — Smarter AI answering + self-check (v1.9.38)

Upgrade `supabase/functions/resume-hub/index.ts` `ext_autofill`.

1. **Richer field payload to the model.** Send `{ id, label, kind, options, section, sibling_labels, helper_text, classifier, dependsOn, priorAnswers }` per field. Priors let the model keep dependent answers consistent (e.g. "Which agency" only if prior was Yes).

2. **Structured answer schema.** Model returns `{ id, value | optionLabel | optionLabels, source, confidence, reasoning, skip?, suggestion? }`. Reject any field that doesn't fit; ask the model to redo just those.

3. **Self-check pass.** After the first answer set, run a lightweight second call: "Given these answers and the user profile, list any that contradict the profile, misuse an option, or violate a dependency." Replace flagged answers.

4. **Second-pass repair for skipped fields.** For everything skipped, retry once with the full JD + siblings included, and label truly unanswerable ones with a clear "add X to your profile" suggestion (already wired to the UI in 1.9.17).

5. **Widened rules.** Add rules for common gaps still missed today: sponsorship (now vs future), start date, notice period, current/expected salary currency, gender/ethnicity self-ID (default "Prefer not to say" unless profile says otherwise), disability/veteran self-ID (same), reference name/email/phone triples, portfolio/GitHub/LinkedIn URLs, availability days/hours, security clearance, driver's license, willingness to travel %.

6. **Confidence gating.** Only inject answers with `confidence >= 0.6`; lower-confidence answers become suggestions in the diagnostic panel so the user can approve them.

Deliverables: `supabase/functions/resume-hub/index.ts` updated `ext_autofill`, diagnostic panel shows confidence + reasoning per field, injector honors confidence gate. Bump to `1.9.38`, rebuild zip, redeploy edge function.

## Out of scope

No changes to Ashby, Gem site adapter, vision fallback, or the option-matching normalizer. No new profile fields. No changes to Score/Cover/Contacts/Tailor tabs.

## Files touched

- `extension/content.js` — scanner rewrite (Phase A)
- `extension/sidepanel.js` — post-fill diagnostic panel (Phase A + B)
- `extension/manifest.json` — version bumps
- `public/ayn-extension.zip` — rebuild each phase
- `supabase/functions/resume-hub/index.ts` — richer prompt, structured schema, self-check, second-pass repair, widened rules (Phase B)
