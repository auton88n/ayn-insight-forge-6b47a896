## What is actually broken

Recent telemetry shows AYN is no longer mainly failing because the AI skips answers. The latest run answered all 16 fields, but 2 textareas failed during injection:

- `Why are you interested in working at BioRender?`
- `Is there anything you would like to clarify or expand on regarding your work history...`

Both had generated values, but the injector treated them like checkbox or radio fields and returned `no native group`. That means the DOM resolver is selecting the wrong element for ids like `f11` and `f12`, or the index based resolver is becoming stale after the page renders.

## Plan

1. **Replace fragile `f11` index ids for textareas**
   - Generate stable synthetic ids for unlabeled or idless text fields and textareas.
   - Store a live DOM reference in a map during scan.
   - Resolve by that map first during injection, before falling back to document index.

2. **Make injection type safe**
   - Pass the scanned field `kind`, `type`, and label into the fill dispatcher.
   - If backend says `kind: textarea`, never route the target through radio or checkbox filling even if the resolved DOM node is wrong.
   - If resolved node type conflicts with the expected kind, force a question text rematch instead of clicking the wrong element.

3. **Improve question matching for open text**
   - Match by normalized question text and proximity, not raw index.
   - Prefer `TEXTAREA`, `[role=textbox]`, and contenteditable when the AI field is open text.
   - Add a minimum score threshold so AYN does not fill the wrong field.

4. **Record better diagnostics**
   - Add skip metadata for `expectedKind`, `resolvedTag`, `resolvedType`, `labelSource`, and whether index fallback was used.
   - Log when a field was rejected because the resolved element did not match the expected kind.

5. **Keep backend rules, but reduce dependency on prompting**
   - Keep the hard open text backend rule from v1.9.59.
   - Do not add another prompt patch as the primary fix, because the latest data proves the AI answered these fields and the browser write failed.

6. **Package and deploy**
   - Bump extension to `v1.9.60`.
   - Rebuild `public/ayn-extension.zip`.
   - Redeploy `resume-hub` only if backend code changes are needed after the injector fix.

## Validation

- Recheck recent `autofill_runs` after the fix.
- Confirm the BioRender textareas fill successfully and no longer show `no native group`.
- Confirm filled count includes open text fields and diagnostics show the final selector or stable synthetic id used.