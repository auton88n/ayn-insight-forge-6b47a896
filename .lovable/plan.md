## Root cause

The extension is still treating some visible Yes/No option controls as text fields, so generated answers are routed to the wrong DOM element. This creates two bad outcomes:

1. **Wrong answer routing** — option labels like `Yes` and `No` become fake `__textfield__` fields.
2. **Missing answers** — EEO groups like `Disability Status` can be scanned with a generic label such as `Question` because the scanner picks nearby helper text or option text instead of the real question heading.

The latest reliable fix is not another backend prompt patch. The browser scanner must send the backend the correct question + correct field type first.

## Fix plan for v1.9.61

1. **Stop checkboxes/radios from ever becoming text fields**
   - Harden `registerTextField()` so `radio`, `checkbox`, `file`, `hidden`, `submit`, `button`, `image`, and `reset` inputs cannot receive `__textfield__` IDs.
   - Add the same guard to the supplemental text-input recovery pass.

2. **Add anonymous checkable grouping**
   - Group visible idless/nameless checkboxes/radios by nearest shared question container.
   - Emit one `radio`/`buttongroup` field with options instead of separate fake text fields.
   - Store the grouped DOM elements in a map for injection, similar to `__AYN_STRUCTRADIO_MAP__`.

3. **Fix question-heading detection for EEO and Gem forms**
   - Add an `aynFindOptionGroupQuestion()` resolver.
   - Prefer real headings/labels above the option row.
   - Reject option text (`Yes`, `No`, `Decline to self-identify`, etc.) and long explanatory helper paragraphs.
   - Use this resolver in shared-name radios, structural radios, custom radios, label groups, and Yes/No merge.

4. **Protect EEO answer correctness**
   - Ensure `Gender`, `Race/Ethnicity`, `Veteran Status`, and `Disability Status` classify correctly even when the raw scanned label is imperfect.
   - Keep EEO answers conservative: choose `Decline to self-identify` / `Prefer not to answer` when present.

5. **Improve diagnostics**
   - Log the final field type, resolved selector, question label, label source, and selected option for every EEO / Yes-No / open-text field.
   - If a field is skipped, log whether the failure came from scan, backend answer, option match, or DOM injection.

6. **Version and package**
   - Bump extension from `1.9.60` to `1.9.61` in manifest, constants, content, and download UI.
   - Rebuild the extension zip.

## Expected result

- BioRender-style EEO questions scan as the actual questions, not `Question`.
- Yes/No pairs are grouped and answered as one question.
- Textarea answers are no longer confused with checkbox/radio controls.
- The sidepanel count reflects real filled fields, not generated answers that failed to inject.