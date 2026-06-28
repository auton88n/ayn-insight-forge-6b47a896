## Root cause (two bugs, one prompt file)

1. **Yes/No questions are answered as checkbox ticks.** v1.8.6 already gets the scanner to emit these Ashby fields as `kind: "buttongroup"` with explicit `Yes`/`No` options. But the `ext_autofill` system prompt in `supabase/functions/resume-hub/index.ts` lists kinds as `text|textarea|select|radio|checkbox|typeahead` — `buttongroup` isn't there, so the model degrades to checkbox-style "should I tick this?" guessing and never runs the work-auth reasoning.
2. **Work-auth rules are hardcoded to one user (Canadian citizen).** That's wrong: every other user has different citizenship/authorization. The model must derive the answer from THIS user's own `canonical.work_auth` and profile location, not a baked-in fact.
3. **LinkedIn field gets the portfolio URL.** The merged payload passes `linkedin_url` even when the only available URL is a portfolio/personal site, so the model fills it.

## Fix — `supabase/functions/resume-hub/index.ts`, ext_autofill branch only

No scanner or extension JS changes. Edit only the prompt + the merged payload.

### A. Add buttongroup as a first-class single-choice kind
- Add `buttongroup` to the kind enum in the prompt and instruct: treat exactly like `radio` — pick from `options[]` and return `optionValue` + `optionLabel` verbatim, never `value`.

### B. Replace the hardcoded Canadian-citizen block with profile-driven rules
Rewrite the "WORK AUTHORIZATION & SPONSORSHIP" section to read everything from the data the model already has:

- Inputs the model uses: `canonical.work_auth.{citizenship, work_authorized_us, work_authorized_ca, needs_sponsorship_now, needs_sponsorship_future, visa_type}`, `profile.country`, `profile.city`, `profile.default_answers.open_to_relocate`, plus the role's country inferred from `context.url`, `context.company`, JD text, and any locations listed in the field's own `options[]`.
- Generic decision rules (no country hardcoded):
  1. Determine the role's eligible countries.
  2. "Are you authorized to work in COUNTRY(s)?" → Yes only if `work_authorized_<country>` is true for any listed country, OR `citizenship` matches any listed country. Otherwise No. If neither field is set → `skip:true`.
  3. Combined-country phrasing ("X or Y", "one of: …") → Yes if the user is authorized in ANY listed country by the same logic above.
  4. "Will you require visa sponsorship?" → No if the user is authorized in at least one of the role's eligible countries (by the same fields). Yes if the user is not authorized in any of them and `needs_sponsorship_*` is true. Skip if unknown.
  5. "Do you currently reside in [list]?" → Yes only if `profile.country` or `profile.city` matches any option in the list. Otherwise No, or skip if the option list is unclear. Never guess.
  6. "Open to relocating?" → Use `profile.default_answers.open_to_relocate` only; else skip.
- Forbid inferring citizenship or authorization from name, language, or resume location alone.

### C. Add a BUTTONGROUP YES/NO routing note
Right above the work-auth block: when a buttongroup's options reduce to Yes/No (case-insensitive), apply the rules in this section (work-auth, sponsorship, residence, education, EEO) and return the exact `optionLabel`/`optionValue` from `options[]`. If the rule says skip, return `skip:true` — do NOT default to No.

### D. Lock down LinkedIn vs portfolio in the payload AND the prompt
- Payload: build `merged.linkedin_url` only if the candidate string contains `linkedin.com/`; otherwise omit the key entirely. Build `merged.portfolio_url` only if the candidate does NOT contain `linkedin.com`. This removes the easy wrong shortcut.
- Prompt: restate that `link.linkedin` requires a URL containing `linkedin.com/`. If `merged.linkedin_url` is absent, `skip:true`. Never substitute portfolio/personal site into a LinkedIn field. `link.portfolio` / `link.website` must never contain `linkedin.com`.

### E. Packaging
- Bump `extension/manifest.json` to `1.8.7` (keeps installed users in sync after reload; no extension code change).
- `node --check` extension/*.js.
- Rebuild `public/ayn-extension.zip` from `extension/`.
- Deploy `resume-hub`.

## Verification

For the current user (whose canonical has Canadian citizenship + Canada auth):
- "Are you legally authorized to work in the U.S. or Canada?" → Yes (Canada is in the list, user authorized in Canada).
- "Will you require visa sponsorship?" → No (Canada is in the list, user authorized there).
- "Do you live in [US states list]… or Ontario?" → Yes if `profile.country = Canada` and `profile.city/region` matches Ontario; otherwise rely on `open_to_relocate`; otherwise skip.
- "LinkedIn Profile URL" → skipped (left empty) since no `linkedin.com` URL exists in profile/canonical/resume.

For a different user (e.g. US citizen, US-only authorized): the same prompt produces No on Canada-only roles, Yes on US roles, sponsorship handled from their own `needs_sponsorship_*`. Nothing is hardcoded.

Console check after Fill: `[AYN-BG] injecting … buttongroups= 3` and `[AYN-BG] proxyClick yes verified= true` for the questions the rules say Yes to.
