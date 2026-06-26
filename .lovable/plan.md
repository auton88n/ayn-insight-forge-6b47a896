
## What I found (diagnosis)

### 1. Resume upload returns wrong / incomplete data
`supabase/functions/resume-hub/index.ts` action `parse_file`:
- **PDFs**: sends payload as Anthropic-shaped `{ type: "document", source: { type:"base64", media_type, data } }` to the Lovable AI Gateway, which speaks **OpenAI** format. Gemini through this gateway never receives the file, so it hallucinates or returns generic content. That is why uploaded resumes "don't get the correct info".
- **DOCX**: decodes the binary ZIP with `TextDecoder("utf-8")` and regex-greps `<w:t>` tags. This works only by accident and silently fails for most real DOCX files, then falls through to the broken PDF path.
- No OCR fallback for scanned/image PDFs.

### 2. Chrome extension can't do anything
- Extension is token-gated (`x-ayn-ext-token`), but the in-app **Extension tab** (`ExtensionTab.tsx`) tells the user to "sign in with email and password" and has **no Generate Token button**. The options page expects a token starting with `ayn_…` that the UI never produces. Net effect: nobody can connect, so every popup action returns "Not connected".
- `content.js` field detection collects inputs but never scrolls/expands multi-step ATS forms and skips React-rendered comboboxes (Workday/Greenhouse) because it only looks at `<select>`.
- Saved jobs send raw `document.body.innerText` (often nav/footer noise), so JD scoring is poor.

### 3. Misc
- `popup.js` `tailor`/`cover` call `ext_tailor` / `ext_cover_letter` but `ext_ingest_job` only returns `job_id` when it parses successfully; if AI fails, the chain dies with "Could not save job".
- No clear error surfacing in popup; all failures show generic alerts.

## Fix plan

### A. Resume parsing (edge function `resume-hub`, action `parse_file`)
1. Replace the broken DOCX regex path with `mammoth` via `npm:mammoth@1.8.0` → real plain text extraction.
2. Replace the broken Gemini "document" payload with the correct **Gemini-native** call (`generativelanguage.googleapis.com` is not available; instead use the Lovable Gateway OpenAI shape with `image_url` data-URL for PDFs which Gemini-2.5-flash accepts as `input_file`). Concretely: switch to the gateway's documented file input format:
   ```
   { role:"user", content: [
     { type:"text", text:"..." },
     { type:"file", file:{ filename:"resume.pdf", file_data:`data:application/pdf;base64,${b64}` } }
   ]}
   ```
3. Add a two-stage extraction (per Lovable's vision-text pattern): try text extraction first; if extracted text < 50 useful chars, fall back to the vision/file call for OCR.
4. Return both `resume` (structured) and `plainText` (raw text) so downstream match/tailor work on real content.
5. Tighten the system prompt to forbid invention and require empty fields when missing.

### B. Chrome extension authentication (make it actually connect)
1. Add a real **Generate device token** UI to `src/components/resume-hub/ExtensionTab.tsx`:
   - Button → calls existing `resumeHubApi.mintToken("Chrome")` → shows the `ayn_…` token once with copy button.
   - List existing tokens with revoke buttons (uses existing `token_list` / `token_revoke`).
   - Remove the misleading "sign in with email and password" copy.
2. Update `extension/options.html` instructions to match the new flow (already pretty close).
3. Add a "Test connection" button in options that calls `ext_bootstrap` and shows the connected email.

### C. Chrome extension content/runtime
1. `content.js`:
   - Include role=combobox, contenteditable, and custom listbox elements (Workday, Greenhouse).
   - Scroll fields into view and dispatch `focus`/`blur` around the value set so React forms commit.
   - Strip nav/footer when sending JD: use `document.querySelector('main, article, [role=main]')?.innerText` first, fallback to body, capped at 15k chars.
2. `background.js`: surface server error messages verbatim in the popup (no more "unknown").
3. `popup.js`: show a toast row with the last error and a "Reconnect" link when token is invalid.

### D. Edge function `ext_ingest_job` + `ext_autofill`
1. Make `ext_ingest_job` never fail the whole save when AI parsing errors — store the raw URL/text and return `job_id` regardless.
2. `ext_autofill`: include the user's `canadian_profile` row and primary resume `basics` in the prompt so the AI has ground truth to map fields against, not just labels.

### E. Verification
1. Manual upload of a real PDF + DOCX through `/resume-hub` → confirm name/email/work history match the file.
2. Load `extension/` unpacked in Chrome → Generate token in UI → paste in options → Bootstrap shows email.
3. On a Greenhouse/Workday posting: Save job (job_id returned), Autofill (≥70% fields filled), Tailor (markdown downloaded).

### Technical notes
- All edits stay in: `supabase/functions/resume-hub/index.ts`, `src/components/resume-hub/ExtensionTab.tsx`, `extension/{content,background,popup,options}.{js,html}`.
- No DB schema changes — `extension_tokens` and `canadian_profile` tables already exist.
- No new secrets — uses existing `LOVABLE_API_KEY`.
- One edge function redeploy required (already deployed, only an update).
