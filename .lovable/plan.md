## What we're building

A new **Resume Hub** feature inside AYN (no impact on existing Command Center, chat, or intelligence modules) plus a **AYN Autofill** Chrome extension that pairs with the same account.

Inspired by jobright.ai: resume builder + AI rewrite, AI auto-tailor per job, job feed with match scores, application tracker (Kanban), one-click cover letters, and a browser extension that autofills any job application form (LinkedIn Easy Apply, Workday, Greenhouse, Lever, Ashby, iCIMS, etc.).

## Privacy model (non-negotiable)

- Every new table has RLS scoped to `auth.uid()`. No cross-user reads.
- Admins (via `has_role(uid,'admin')`) get **read-only** access *only* when a user opens a support ticket, and every read is written to `security_audit_logs`.
- All AI calls (tailoring, cover letters, match scoring) run inside edge functions with the caller's JWT; user content never enters shared logs.
- Resume files stored in a **private** Supabase Storage bucket `resumes/` with path `{user_id}/...` and an RLS policy that allows only the owner.
- Extension auth uses a per-device token bound to the user (no password storage in the extension).

## Phase 1 — Database (one migration)

New tables (all with `user_id uuid not null`, RLS `auth.uid() = user_id`, GRANTs to authenticated + service_role):

- `resumes` — id, title, is_primary, content jsonb (structured: basics, work, education, skills, projects, certs), pdf_path, ats_score, updated_at
- `resume_versions` — id, resume_id, content jsonb, created_for_job_id, created_at (history of tailored variants)
- `jobs` — id, source ('extension'|'linkedin'|'manual'), source_url, company, title, location, remote, salary_min, salary_max, jd_text, jd_html, posted_at, captured_at, dedupe_hash
- `job_matches` — id, job_id, resume_id, score int, breakdown jsonb (skills_match, experience_match, missing_keywords), generated_at
- `applications` — id, job_id, resume_version_id, status enum('saved','applied','interview','offer','rejected'), notes, applied_at, follow_up_at
- `cover_letters` — id, job_id, resume_id, body text, tone, created_at
- `user_profile_data` — id (= user_id), legal_name, phone, address jsonb, work_auth, links jsonb (linkedin, github, portfolio), demographics jsonb (optional EEO answers), default_answers jsonb (common application questions). This powers extension autofill.
- `extension_tokens` — id, user_id, token_hash, device_label, last_used_at, revoked_at. Issued from the dashboard; extension stores raw token in `chrome.storage.local`.
- `support_admin_reads` (audit) — admin_id, user_id, table_name, row_id, ticket_id, read_at.

Storage bucket: `resumes` (private) with owner-only policies.

## Phase 2 — Edge functions

All call Lovable AI Gateway (`google/gemini-3-flash-preview` default; `gemini-2.5-pro` for resume rewrite quality mode):

- `resume-parse` — input: PDF/DOCX upload → parsed structured JSON (uses `document--parse_document` style flow + AI cleanup).
- `resume-rewrite` — input: resume json + optional jd → improved bullets, ATS suggestions, score.
- `resume-tailor` — input: resume_id + job_id → writes new `resume_versions` row tailored to that JD, returns PDF.
- `resume-export-pdf` — renders the resume json to a clean ATS-friendly PDF (reportlab in a Deno-compatible alt or a JS renderer; we'll use `pdf-lib` via `npm:`).
- `job-ingest` — receives job from extension (URL + raw HTML/text + parsed meta), dedupes, stores, kicks off `job-match` for primary resume.
- `job-match` — scores a job vs a resume, writes `job_matches`.
- `cover-letter-generate` — JD + resume + tone → letter.
- `extension-auth` — POST { token } → validates against `extension_tokens.token_hash`, returns short-lived JWT for subsequent extension calls.
- `extension-autofill-profile` — returns `user_profile_data` + primary resume summary for autofill (requires extension JWT).

## Phase 3 — Frontend (Dashboard)

New route group under `/dashboard/resume`:

- **Overview** — primary resume card, ATS score, recent matches, application funnel counts.
- **Resume Builder** — left: structured form (basics, experience, education, skills, projects). Right: live preview. Top actions: Import PDF, AI Improve, Tailor to Job, Export PDF, Set as Primary.
- **Jobs** — filter/search feed of saved jobs (from extension or manual add). Each card: match score badge, company, title, location, "Tailor & Apply" button.
- **Job Detail** — JD on left, match breakdown + missing keywords on right, buttons: Generate Tailored Resume, Generate Cover Letter, Move to Applied.
- **Tracker** — Kanban: Saved → Applied → Interview → Offer / Rejected. Drag to update status. Notes drawer.
- **Extension** — "Install AYN Autofill", token generation panel (one-click create, copy, revoke), connected devices list, profile data form that powers autofill (legal name, phone, work auth, EEO defaults, links).

Aesthetic: matches AYN dark premium tokens (Syne headings, Inter body, JetBrains Mono for scores). No purple/indigo defaults.

Sidebar gets one new entry: **Resume Hub** with sub-items.

## Phase 4 — Chrome Extension (Manifest V3)

Lives in `/extension/` in the repo. Built as a downloadable ZIP served from `/public/ayn-autofill.zip` via a fetch+blob link on the Extension page.

Structure:

```
extension/
  manifest.json   (MV3, host_permissions: <all_urls>, permissions: storage, activeTab, scripting, contextMenus)
  background.js   (service worker — auth, message routing)
  content.js      (injected on every page — field detection + autofill)
  popup.html/js   (status, "Fill this form", "Save this job", "Tailor resume", "Generate cover letter")
  options.html/js (paste token from dashboard, pick primary resume)
  site-adapters/  (linkedin.js, workday.js, greenhouse.js, lever.js, ashby.js, icims.js, generic.js)
```

Capabilities:

1. **Autofill** — content script scans the page for input/select/textarea, classifies each field with a heuristic + label-text matcher, falls back to AI (calls `extension-autofill-fill` edge fn with field labels → returns value map). Site adapters override for known ATS forms (Workday's stepper, LinkedIn Easy Apply iframes, Greenhouse's custom selects).
2. **Save job** — popup "Save this job" sends URL + cleaned page text to `job-ingest`. Works on LinkedIn, Indeed, Glassdoor, company career pages.
3. **Inline resume tailor** — when on a job posting (detected by site adapter or AI), popup shows match score and a "Tailor & Download" button → calls `resume-tailor`, downloads the PDF.
4. **Cover letter** — same popup → calls `cover-letter-generate`, opens a side panel with the result, copy to clipboard.

Auth: user generates a token in dashboard → pastes in extension Options → extension calls `extension-auth` and stores short-lived JWT, auto-refreshes.

LinkedIn note: extension reads pages the user is viewing (no background crawling) to stay within reasonable use; we don't store LinkedIn cookies or scrape at scale.

## Phase 5 — QA & ship

- Unit edge function tests for parse, rewrite, tailor, match, ingest.
- Manual extension test matrix: LinkedIn Easy Apply, Workday, Greenhouse, Lever, Ashby, iCIMS, plain HTML form.
- Visual QA of generated PDF (render to image, inspect spacing/clipping per pdf skill).
- Verify admin cannot read another user's resume via Supabase REST without a ticket.

## Out of scope (v1)

- Email interview reminders, calendar sync.
- Background scraping of LinkedIn/Indeed (only user-visited pages via extension).
- Recruiter-side features, team/org sharing.
- Mobile app autofill.

## Technical notes

- Models: `google/gemini-3-flash-preview` for autofill/match/cover letters; `google/gemini-2.5-pro` for resume rewrite quality mode.
- PDF rendering: `pdf-lib` (npm: in Deno edge function) for ATS-friendly export.
- Parsing uploaded PDFs/DOCX: edge function delegates to a single call to Gemini multimodal with the file bytes (no separate OCR pipeline needed for v1).
- Dedupe jobs by sha256 of (company + title + normalized URL).
- Extension token: 32-byte random, stored as bcrypt hash; raw value shown once.
- All new tables use the standard `update_updated_at_column()` trigger.
- No native foreign keys (per project rule); referential integrity in app/edge functions.

Once you approve, I'll start with Phase 1 (the migration), then move through the phases in order.