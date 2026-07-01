
# Broader Autofill Coverage (Workday / Plus Company style forms)

The screenshot is a bilingual EN/FR Workday-style form. Telemetry from these forms typically fails because:

1. **Bilingual labels** ("Are you legally entitled to work in Canada?/Êtes-vous légalement autorisé…") break the English-only regex classifiers, so questions come back as `logic.unknown` and the AI has no rule to apply.
2. **City preference is a checkbox group used as a single-choice picker** ("What city is your preferred office location?"). The current classifier tags this as `logic.preferred_location`, but the injector expects `optionLabels` for checkboxes AND the answer rule doesn't know it should pick exactly one city.
3. **Salary is two side-by-side number inputs** (min $ – max $). Today each input is scanned as a separate `text` field with a `$` label and no classifier tag, so neither gets filled.
4. **Languages is a multi-checkbox** ("English/Anglais", "French/Français", "Other/Autre"). Backend has `logic.languages` for text answers, but there's no rule for checkbox-group language selection.
5. **"Are you currently employed by / a past employee of Plus Company"** are company-history radios with no matching rule — backend leaves them blank.
6. **Free-text follow-ups** ("Which agency or BU") depend on a prior "Yes" — should be skipped with a clear suggestion when the prior answer is No/unknown.

All fixes are in two files (`extension/content.js` classifier, `supabase/functions/resume-hub/index.ts` rules) plus a version bump. No changes to Ashby, Gem, or vision paths.

## 1. Bilingual label normalization (content.js)

Add a helper `aynStripBilingual(label)` that:
- Splits on `/`, `|`, `·`, or newline, and returns the first non-empty half whose characters are mostly ASCII-Latin (heuristic: >80% chars in `A-Za-z0-9 ,.'?()-`).
- Falls back to the original label when no clean half is found.

Call it once at the top of `classifyLabel(l)` so every downstream regex sees the English half. Also feed the stripped version into the label sent to the backend (`field.label`) while keeping the raw label as `field.labelRaw` for telemetry.

## 2. New / widened classifiers (content.js `classifyLabel`)

Add these tags — all evaluated against the bilingual-stripped label:

- `logic.preferred_city` — matches `/preferred\s*(office|work)?\s*(city|location)|which city.*(work|office)|preferred\s+office\s+location/`. Used when the field is a **checkbox or radio group of city names**.
- `logic.salary_min` / `logic.salary_max` — when the surrounding fieldset label contains `salary|compensation|expectation` AND the field is a number/text input whose visible prefix is `$`, `€`, `£`, `C$`, `CAD`, `USD`, and the adjacent sibling is another number input separated by `–`/`-`/`to`/`à`. Detect the pair in a pre-pass that groups two number inputs sharing a parent row.
- `logic.languages_multi` — when the field is a `checkbox` group AND the label matches `/languages?\s+(you\s+)?(are\s+)?(fluent|speak|proficient)|which\s+languages?/`.
- `logic.company_current_employee` — matches `/currently\s+employed\s+by\s+.+|current\s+employee\s+of\s+/`.
- `logic.company_past_employee` — matches `/(past|former|previous)\s+employee|previously\s+worked\s+(at|for)\s+/`.
- `logic.dependent_followup` — text field whose label matches `/which agency|which BU|please specify|if (yes|so)/i`. Emit `dependsOn: <id of previous field in same section>` so the backend can decide to skip.

## 3. Field-shape pre-pass (content.js `scanFormFields`)

Before dedupe, run:
- **Currency-pair grouping** — for every `<input type="number|text">` with a `$/€/£` currency prefix, look one sibling to the right (or in the same flex row) for another currency input with `–`, `-`, `to`, `à`, or nothing between them. When found, tag left as `logic.salary_min` and right as `logic.salary_max` and set both fields' `group` to a shared `salaryRange:<sectionHash>`.
- **Single-choice-by-checkbox heuristic** — for checkbox groups where the question label contains `preferred` or `which one` and the option count is between 3 and 12 short strings that look like place/office names, mark `singleChoice: true` on the field.

## 4. Backend answer rules (`supabase/functions/resume-hub/index.ts`, `ext_autofill` system prompt)

Add these rules right after the existing residence/location block. Keep the "return exact optionLabel/optionValue" contract.

- `logic.preferred_city` — Match user's `mergedBasics.city` (case-insensitive, accent-insensitive) against the option labels. Emit as **optionLabels array of length 1** when the field is a checkbox group with `singleChoice:true` (injector already ticks all labels in `optionLabels`); as `optionLabel/optionValue` when it's a radio. If no match and relocation is allowed (`preferences.open_to_relocation === true`), pick the top listed Canadian office (Toronto → Montréal → Vancouver in that order) and mark `reasoning:"nearest office (relocation enabled)"`. If the user is explicitly "not interested in working in Canada" (needs an option like "I am not interested in working in Canada") only when `authorized_ca === false && open_to_relocation === false`.
- `logic.salary_min` — If `canonical.preferences.salary_min_usd` exists, emit that number (converted only if the field's currency prefix differs and a rate is on the JD; otherwise use the raw number and let the user adjust). Otherwise skip with `suggestion:"Add a salary expectation to your profile"`.
- `logic.salary_max` — Emit `salary_min + 20%` rounded to the nearest 5,000 when only min is known; emit the profile's max when available; otherwise skip.
- `logic.languages_multi` — Emit `optionLabels` = `["English"]` plus any language from `profile.default_answers.other_languages` that matches an option label. If "Other" is an option AND the user has languages beyond the listed ones, include "Other". Never include a language that isn't in the profile.
- `logic.company_current_employee` / `logic.company_past_employee` — Answer "No" by default (safe legal answer for an outside applicant) UNLESS the user's resume has a work entry whose company name matches the company in the question. This uses the JD company + profile work history. Return exact optionLabel from the Yes/No options.
- `logic.dependent_followup` — If the referenced parent field's chosen answer was "No" or was skipped, `skip:true` with `suggestion:"Only needed if you answered Yes above"`. Otherwise leave for the AI to fill from profile.

Update the top-of-prompt legend to list the new tags so the AI dispatches to the correct rule.

## 5. Injector (content.js `aynFillField`)

- Route `logic.salary_min` / `logic.salary_max` values through the existing rich-text/number entry path so React-controlled inputs (Workday's `$` masked inputs) get the native-setter → execCommand → keystroke → paste retry ladder already added in 1.9.34.
- For checkbox groups flagged `singleChoice:true`, before ticking the chosen label, uncheck any already-checked sibling so the "pick one" contract holds.

## 6. Telemetry

On every result, add: `classifier` (the tag string), `labelStripped` (bilingual-stripped), `groupKey` (for salary pairs), and `dependsOn` (for follow-ups). Existing `richEditor` / `selectStrategy` fields remain.

## 7. Version + build

- `extension/manifest.json` → `"version": "1.9.36"`.
- Rebuild `public/ayn-extension.zip` from `extension/`.
- Deploy `resume-hub` edge function.

## Out of scope

- No changes to Ashby, Gem, vision fallback, radio matching, or the select verify-and-retry logic.
- No new profile fields; all data reads from existing `mergedBasics`, `canonical.preferences`, `profile.default_answers`, and resume `work[]`.

## Files touched

- `extension/content.js` — bilingual helper, classifiers, salary-pair pre-pass, single-choice-checkbox flag, injector uncheck-siblings, telemetry fields.
- `supabase/functions/resume-hub/index.ts` — new answer rules in `ext_autofill` system prompt.
- `extension/manifest.json` — version bump.
- `public/ayn-extension.zip` — rebuild artifact.
