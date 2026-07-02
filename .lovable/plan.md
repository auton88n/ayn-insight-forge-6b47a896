# v1.9.59 — Kill the remaining skip patterns

Pulled the last 15 fill runs from `autofill_runs`. Three distinct skip patterns are still firing. Nothing else needs code changes.

## Pattern 1 — Yes/No buttongroups on jobs.gem.com (BioRender)
Telemetry (21:05 runs, 3x in a row):
```
skipped: [
  {id: "cXVlc29wdDqb...", label: "Yes", reason: "No matching info in your profile."},
  {id: "cXVlc29wdDr-...", label: "No",  reason: "No matching info in your profile."}
]
fields_total:16, ai_answered:8, filled:6, failed:2
```
The base64 IDs decode to `quesopt:...` — Gem is sending each Yes/No **option** as its own field. The v1.9.52 buttongroup detector only fires on visible checkbox pairs it discovers itself; it does not merge fields the site already presents as individual option nodes.

Fix in `extension/content.js`:
- In `scanForm`, after scanning, group orphan option-shaped fields (`kind:'checkbox'` or button-like, label is exactly `Yes`/`No`/`Oui`/`Non`, sharing the same parent question container) into a synthetic `buttongroup` field with `options:[{label:'Yes',value:<id>},{label:'No',value:<id>}]` and a resolved question from the closest heading/label.
- Send only the merged field to the backend; suppress the raw option children so they aren't counted as skipped.
- On inject, click the option matching the backend's `optionLabel`.

## Pattern 2 — Open-text still not answered on BioRender
Runs at 19:45 and 18:52 skipped:
```
label: "Is there anything you'd like to clarify or expand on regarding your work history..."
reason: "No relevant gaps or transitions mentioned in the resume or profile."
```
And in the 21:13 run, 16 fields but only 13 filled — the "Why are you interested in BioRender?" textarea still empty. v1.9.57 added an inference rule but the model is still refusing.

Fix in `supabase/functions/resume-hub/index.ts` `ext_autofill` system prompt:
- Promote the open-text rule from "inference guidance" to a **hard rule**: for any `kind` in `textarea|richedit|opentext` with label containing `interest|why|motivat|excite|passion|about (this|the) (company|role|position)`, you MUST return a 2–4 sentence answer synthesized from resume highlights + the company name in the label. Never return empty.
- For `gap|clarify|expand|explain` textareas, if the resume shows no gaps, return the exact string `"No gaps to note; continuous progression through the roles listed in my resume."` instead of skipping.
- Add `skip_reason` output rule: if the field is a required textarea, `skip_reason` is forbidden — must always produce a value.

## Pattern 3 — Consent/personal-information checkbox skipped
Latest run skipped: `label: "Personal information/ Informations personnelles" reason: "No matching info in your profile."`
This is a GDPR/consent acknowledgement checkbox, not a data question.

Fix in `resume-hub/index.ts`:
- Extend the consent-checkbox rule to match `personal information|informations personnelles|renseignements personnels|consent|acknowledge|agree|accept` — always return `optionValue:"true"` / check it.

## Pattern 4 — Silent write failures (2 unaccounted at 21:05)
`ai_answered:8, filled:6, failed:2, skipped:2 options` — the 2 that failed to write aren't in `inject_results` skip metadata (v1.9.58 diagnostics only enrich failures, not backend skips vs. write failures).

Fix in `extension/content.js` post-injection enrichment: also emit a `[AYN skip]` group and `skipMeta` entry for backend-returned `skip_reason` fields (currently only DOM write failures get enriched), so the log matches the counter math.

## Delivery
- Bump `extension/manifest.json` + `AYN_BUILD` to `1.9.59`.
- Rebuild `public/ayn-extension.zip`.
- Redeploy `resume-hub` edge function.

## Out of scope
- No changes to scanning of standard label/for fields (already 100% on ashby/lever).
- No UI changes.
