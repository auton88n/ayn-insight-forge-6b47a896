# Smarter AI for AYN Chrome Extension

Goal: every tab (Fill, Score, Contacts, Cover Letter, Tracker, Resume) uses a smarter, context-aware AI pipeline instead of shallow pattern matching. The AI reads the actual page, reasons about the job and the user's profile, and produces tailored output.

## What changes

### 1. Smarter page reader (`extension/content.js`)
- Extract a richer **PageContext** payload, not just form fields:
  - Detected page kind: `application | job_post | company_page | search_results | unknown`
  - Job: title, company, location, salary, employment type, seniority, full JD text (cleaned, deduped, capped)
  - Form fields: label (resolved from `<label for>`, `aria-label`, surrounding text, placeholder), input type, required, options, current value, group (e.g. "Work Authorization", "EEO")
  - ATS detected: Greenhouse / Lever / Workday / iCIMS / Cornerstone / Ashby / SmartRecruiters / LinkedIn Easy Apply
- Add label resolver that walks DOM/ARIA so "Are you authorized to work in the US?" is understood instead of `input#q_42`.

### 2. New unified AI router on the backend (`supabase/functions/resume-hub/index.ts`)
One smarter action per tab, all sharing the same profile+resume context loader:

```text
ext_smart_autofill   → reads PageContext + profile + resume, returns per-field {value, confidence, reasoning, source}
ext_smart_score      → reads JD + resume, returns {score 0-100, skills_match[], gaps[], salary_estimate, verdict}
ext_smart_contacts   → reads JD + company, returns recruiter/HM personas, LinkedIn search URLs, email patterns, 80-word outreach
ext_smart_cover      → reads JD + resume + tone, returns ≤280 word letter grounded in real experience
ext_smart_tailor     → reads JD + resume, returns keywords[{text,inResume}], rewritten resume (no fabrication), ATS score, change log
ext_smart_tracker    → normalizes saved jobs (company, title, salary parse, status, next action)
```

Shared rules baked into the system prompt:
- Never invent facts, dates, employers, or numbers.
- Yes/No questions answered from profile logic (work auth, sponsorship, relocation).
- Years-of-experience computed from `work[]` dates, not asked.
- Education level mapped to the closest dropdown option.
- Salary expectation pulled from profile, else inferred range from JD + location.
- Short open-ended answers ("Why this role?") composed from resume highlights matching the JD.

### 3. Smarter Fill UX (`extension/sidepanel.js` + `sidepanel.html`)
- Show each filled field as a card with: label, value, confidence bar, why this answer, edit button.
- Highlight low-confidence (<60%) for user review before submit.
- "Refill only this field" and "Refill all" actions.
- Real progress bar driven by streamed field results.

### 4. Smarter Score UX
- Top: ATS-style ring score + verdict (Strong / Good / Fair / Poor).
- Skills matched (green chips) vs missing (grey chips).
- Salary estimate + 3 reasons.
- "Improve my match" button → jumps to Resume tab pre-loaded with this JD.

### 5. Smarter Contacts
- 3 persona cards: Recruiter, Hiring Manager, Team Lead.
- Each card: LinkedIn search URL (filtered to company + title), likely email pattern for the domain, ready-to-send 80-word message personalized to the user and role.

### 6. Smarter Cover Letter
- Tone selector (Professional / Confident / Enthusiastic / Executive).
- Generated letter grounded in resume bullets that match JD keywords.
- "Copy" and "Save to tracker" inline.

### 7. Smarter Tracker
- AI auto-fills company, title, salary range, location, source on save.
- Status cycles Saved → Applied → Interview → Offer → Rejected.
- Sort by furthest stage, then date.

### 8. Smarter Resume (Tailor)
- Auto-pulls JD from current page if present.
- Keyword chips: green = in resume, grey = missing.
- One-click tailor rewrites resume weaving in only supported keywords; shows change log.
- ATS Match Score ring before/after.

## Privacy & reliability
- All AI calls go through `BG_FUNC` with the per-user device token; no cross-user data.
- Each AI call wrapped with timeout + clear user-facing error (rate limit, credits, network).
- Diagnostic logs in side panel console behind a debug flag.

## Files touched
- `extension/content.js` — richer PageContext + label resolver + ATS detection
- `extension/background.js` — route new `ext_smart_*` actions
- `extension/sidepanel.html` — new Fill cards, Score ring, Contacts personas, Resume diff
- `extension/sidepanel.js` — call new actions, render confidence/edit UI, streaming progress
- `extension/manifest.json` — bump to v1.4.0
- `supabase/functions/resume-hub/index.ts` — add 6 `ext_smart_*` actions, shared loader, hardened prompts
- `src/components/resume-hub/ExtensionTab.tsx` — version label v1.4.0
- `public/ayn-extension.zip` — repacked

Frames/motion on the landing page are not touched.

## Out of scope
- No new tabs, no UI redesign of the side panel chrome.
- No changes to dashboard pages other than the extension version label.