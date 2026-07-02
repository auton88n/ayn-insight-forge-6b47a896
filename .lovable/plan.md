Diagnosis: those boxes are most likely custom large text editors or textarea wrappers where the visible question sits outside the actual editable node. AYN currently detects many inputs, but it can still lose the question text or not pass captured context to the backend, so the AI either skips them or returns no usable value.

Plan:

1. Strengthen open text question detection
   - Add a dedicated recovery pass for large visible free-text fields: `textarea`, `role=textbox`, `contenteditable`, ProseMirror, Slate, Draft, Quill, Lexical and wrapper based editors.
   - Resolve the question from the nearest visible prompt above the box, not only from `label`, `aria-label`, `name`, or placeholder.
   - Preserve prompts like:
     - “Why are you interested in working at BioRender?”
     - “Clarify or expand on work history, gaps, transitions”

2. Improve label and required detection
   - Treat a nearby red/star marker as required.
   - Allow longer question labels up to a safe limit instead of dropping multi-line application prompts.
   - Prefer question-shaped text above the field before falling back to placeholder or generated names.

3. Send full field context to the backend
   - Forward `section`, `helperText`, `placeholder`, `siblingLabels`, `labelSource`, `kind`, and `name` in both first pass and second pass autofill requests.
   - This fixes cases where the scan knows the context but the AI never receives it.

4. Backend answer rules for these exact fields
   - Update `ext_autofill` rules so open-ended application questions with clear prompts are answered, even if optional.
   - Generate 2 to 3 sentence company-specific motivation answers using job title, company, resume, and profile.
   - Generate a safe, professional answer for work-history clarification fields when there are no gaps, instead of leaving them empty.

5. Make writing into custom editors more reliable
   - Reuse the existing rich-editor map for recovered fields.
   - Fill via native setter, input/change events, paste event, execCommand, and page-world fallback.
   - Verify after fill and reapply if React wipes the value.

6. Version and package
   - Bump the Chrome extension to v1.9.57.
   - Rebuild `public/ayn-extension.zip` after implementation.