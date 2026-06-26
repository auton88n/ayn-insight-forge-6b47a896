## What Jobright actually does (that we don't)

After reviewing their product + your screenshot, here is the honest gap:

| Capability | Jobright | AYN today |
|---|---|---|
| **Autofill** reads the JD, the page, AND the candidate's resume — fills 50-100+ fields including long open-text answers | Yes, with reasoning shown per field | Fills, shows reasoning + confidence ✅, but only ~6/11 fields on most ATS because it doesn't probe Workday/Greenhouse multi-step screens, doesn't open hidden sections, and doesn't fill repeating sections (work history, education) |
| **Resume attach** | Uploads the actual PDF for you (when the input is reachable) and stores a Jobright-generated PDF | Only offers a `.txt` download — user must manually attach |
| **AI Orion (chat assistant inside the extension)** | Conversational copilot: "rewrite this bullet", "make this more senior", "explain the gap" | Missing entirely |
| **Insider / Connections** | Returns real recruiter names + verified profile links + alumni angle | Returns search-URL templates only — no real names |
| **JD insights** | "Why you got 78/100", "must-have you're missing", "salary verified vs estimated", company growth signals | We return score + 3 reasons + missing keywords — no growth signals, no must-have vs nice-to-have split |
| **Resume tailor** | Side-by-side diff + accept/reject per change + downloads as PDF/DOCX | We return plain-text only, no diff, no PDF/DOCX |
| **Tracker** | Auto-detects when you submit on the ATS and logs status automatically | User must click "Save to tracker" manually |
| **Cover letter** | Multiple tones + saved templates + per-paragraph regenerate | One-shot generate only |

## What I will build to close the gap (v1.4.0)

### 1. Smarter Autofill engine
- **Multi-pass fill**: re-scan after each click — Workday/Greenhouse reveal new fields once earlier ones are answered.
- **Expand-and-fill**: auto-click "Add another", "Show more", and accordion toggles for Work History / Education / Languages so repeating sections actually get populated row-by-row from `resume.work[]` and `resume.education[]`.
- **Resume file attach (real upload)**: generate a proper PDF server-side (not just .txt), then use `DataTransfer` + `input.files = …` to programmatically attach it to the form's file input. Falls back to the current download/attach flow only when the site blocks it (rare; mostly Workday).
- **Address parser**: split "123 Main St, Toronto, ON M5V 2K7" into street/city/state/postal/country across separate inputs.
- **Custom-question memory**: when AYN generates an open-text answer (e.g. "Why this company?"), save it to `user_answers` keyed by question hash so the next similar question is instant and consistent.

### 2. AI Orion-style copilot tab ("Ask AYN")
- New 7th tab "Ask" with a chat surface inside the side panel.
- Knows the current page (JD + scraped fields), the user's resume, and the last fill/score result.
- Common intents: rewrite bullet, draft an answer for a question on this form, explain the score, suggest a salary ask, write a follow-up email.
- Uses `google/gemini-3-flash-preview` via Lovable AI Gateway (streamed). Conversation kept in memory per tab session; cleared on sign-out.

### 3. Score tab upgrades
- Split into **Must-haves you meet / Must-haves you're missing / Nice-to-haves** instead of 3 generic reasons.
- Add **Salary** badge: "verified" (pulled from JD) vs "estimated".
- Add **Company signals** mini-card: industry, size band, recent growth/layoff signal (best-effort from JD + url heuristics; never invented).

### 4. Contacts tab upgrades
- Replace "search URL templates" with **real names** by calling `google/gemini-3-flash-preview` with the company + role to surface 3 likely-named contacts (LinkedIn-public titles), each with: name (if confident), exact title, verified LinkedIn search URL, "shared signal" line (alumni / same prior company / same skill).
- Add **email permutation tester** UI: shows the 3 likely email formats and a one-click "copy all" so the user can BCC them.

### 5. Resume tab upgrades
- **Side-by-side diff** (original vs tailored) with green inserts / red deletes per line, accept/reject per change.
- Server returns the same ATS plain text we already produce + a generated PDF/DOCX download.
- ATS Score becomes **Match Score** with the same must-have breakdown used on the Score tab — one consistent number across the extension.

### 6. Cover letter tab upgrades
- Add per-paragraph **Regenerate** buttons.
- Persist generated letters to `cover_letters` table, list the last 5 in a dropdown for reuse.

### 7. Tracker auto-capture
- Content script listens for `submit` events on detected application forms.
- On submit, auto-saves the job + status="applied" + the fields AYN filled, so the user never has to click "Save to tracker" again.

### Technical notes (for the engineer reading)

- Edge function `resume-hub` gets 4 new actions: `ext_ask` (streaming chat), `ext_company_signals`, `ext_generate_resume_pdf`, `ext_save_answer` / `ext_lookup_answer`.
- New table `ext_answers (user_id, question_hash, question_text, answer_text, updated_at)` with RLS scoped to `auth.uid()`; reused across applications.
- New table `ext_chat_messages (user_id, session_id, role, content, created_at)` for the Ask tab, RLS scoped to `auth.uid()`.
- Resume PDF generated server-side via a lightweight Deno PDF builder (no headless browser); DOCX via `docx` npm shim.
- All AI calls keep using Lovable AI Gateway. Default model `google/gemini-3-flash-preview`; `google/gemini-2.5-pro` reserved for tailor + cover letter where reasoning depth matters.
- Privacy is unchanged: every new table scoped to `auth.uid()`, no cross-account data, extension token still single-account.
- Extension version bumps to **v1.4.0**; zip repacked at `public/ayn-extension.zip`.

### Out of scope (tell me if you want them)
- Job aggregator inside the extension (Jobright's "Job Finder"). You said earlier you don't want to replace LinkedIn/Indeed browsing.
- AI Mock Interviews (separate product).
- Auto-apply on Easy Apply without user click (Chrome will eventually flag the extension).
