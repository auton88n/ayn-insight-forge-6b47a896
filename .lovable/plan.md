# Autofill: Rich-Editor Detection + Select Verification

Two surgical changes in `extension/content.js`. No backend change. Bump manifest to `1.9.35` and rebuild `public/ayn-extension.zip`.

## 1. Broader rich-editor detection → route to `aynFillTextbox`

Today only `contenteditable` elements are re-routed to the textbox path. Many editors (ProseMirror, TipTap, Slate, Draft, Quill, Lexical, Monaco, CodeMirror) don't set `contenteditable` on the outer target or expose it via ARIA/data attributes instead.

In `aynFillField` (and the scan classifier), treat an element as a rich textbox when ANY of these is true:
- `contenteditable` is `""`, `"true"`, or `"plaintext-only"` (existing)
- `getAttribute('role') === 'textbox'`
- Matches any of: `[data-editor]`, `[data-slate-editor="true"]`, `[data-lexical-editor="true"]`, `.ProseMirror`, `.tiptap`, `.ql-editor`, `.DraftEditor-root`, `.public-DraftEditor-content`, `.cm-content`, `.monaco-editor .view-lines`
- Ancestor (closest, up to 4 levels) matches one of the selectors above — in which case resolve the actual editable descendant (`[contenteditable]`, `.ql-editor`, `.cm-content`, `.public-DraftEditor-content`, etc.) and fill that.

Add a small helper `aynResolveRichEditor(el)` that returns the true editable node (or `null`), and use it in both:
- `scanFormFields` — so these fields are emitted as `kind:'text'` with `accRole:'textbox'` and `labelSource` populated (fixes the null tags for editor fields too).
- `aynFillField` — routes to `aynFillTextbox(editable, value)` instead of the generic setter path.

Telemetry: log `richEditor: true` and the detector that matched (e.g. `prosemirror`, `role-textbox`, `data-editor`) on each such field's result entry.

## 2. Verify-and-retry after `aynFillSelect`

After setting a `<select>` value, confirm the DOM actually landed on the intended option. If not, try a second strategy before giving up.

New flow inside `aynFillSelect(el, value)`:
1. **Strategy A (current):** find option by lenient match on `value`/`text` using `aynOptionMatches`, set `el.value = option.value`, dispatch `input` + `change` (bubbles).
2. **Verify:** read back `el.value` and `el.options[el.selectedIndex]?.text`. Pass if either matches the intended option under `aynOptionMatches`.
3. **Strategy B (retry) if verify fails:**
   - Set `el.selectedIndex = option.index` directly.
   - Dispatch `pointerdown`/`mousedown`/`focus`/`change`/`blur`/`input` in that order (some React-Select style wrappers listen on focus/blur).
   - Re-verify.
4. **Strategy C (last resort) if still failing and the element is a native select wrapped by a custom UI:** dispatch a `keydown`+`keyup` for each character of the option text to trigger native type-ahead selection, then `change`.
5. Return a structured result to the caller: `{ ok, strategy: 'A'|'B'|'C', reason }` and surface `reason: 'value did not stick after retries'` when all fail, so telemetry shows exactly which strategy worked.

Update the injection telemetry per field to include `selectStrategy` and `selectVerified` booleans.

## 3. Version + build

- `extension/manifest.json`: bump `version` to `"1.9.35"`.
- Rebuild `public/ayn-extension.zip` from `extension/`.

## Files touched
- `extension/content.js` (both changes, helpers, telemetry fields)
- `extension/manifest.json` (version bump)
- `public/ayn-extension.zip` (rebuild artifact)

## Out of scope
- No backend / edge function changes.
- No changes to Ashby, Gem, or vision-fallback paths.
- No changes to radio/checkbox handlers.
