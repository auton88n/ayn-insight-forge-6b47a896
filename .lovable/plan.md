## Goal
Make Resume Hub and the Chrome Extension fully working, end-to-end, with no broken tabs. Ship in small, verifiable steps so you can confirm each one before moving on.

## Guiding rules
- One step = one shippable change you can test.
- Every step has a clear "how you verify it works".
- Per-user privacy enforced at DB (RLS) and edge function (JWT) on every call.
- Single source of truth: `user_profile_canonical` (already created).
- Single backend: `resume-hub` edge function (delete dead handlers as we go).
- Extension version bumps on every step so you know you have the new build.

---

## PART A — Resume Hub (dashboard)

### Step 1. Profile tab is the foundation
- Confirm `ProfileTab.tsx` loads, extracts from resume, and saves to `user_profile_canonical`.
- Add a visible "Profile completeness" meter (skills, experience, education, work auth, preferences).
- Verify: upload resume, click "Extract", edit fields, save, reload page, data persists.

### Step 2. Resume upload + storage
- One private bucket `resumes/<user_id>/...`, RLS owner-only.
- On upload: store file, parse to text, run canonical extraction, save both.
- Verify: upload PDF/DOCX, see parsed text + canonical profile filled.

### Step 3. Resume list + versions
- List user's resumes, set "primary", delete, rename.
- Verify: two resumes uploaded, switch primary, extension picks the primary one.

### Step 4. AI Improve resume (with diff)
- Show before/after side-by-side with accept / reject per section.
- Save accepted version as a new `resume_versions` row.
- Verify: run improve, see diff, accept some, reject others, new version saved.

### Step 5. Cover letter generator
- Inputs: job title, company, JD paste, tone. Uses canonical profile.
- Save to `cover_letters`, list + copy + download.
- Verify: generate, edit, save, reopen later.

### Step 6. Job tracker
- Table of saved jobs from extension + manual add. Status pipeline (Saved → Applied → Interview → Offer → Rejected).
- Verify: save from extension, appears in tracker; status change persists.

### Step 7. Download Extension card
- Always points to latest `public/ayn-extension.zip` with visible version + changelog.
- Verify: version on card matches `manifest.json` version.

---

## PART B — Chrome Extension

### Step 8. Auth via "Sign in with AYN" (one-click)
- Side panel shows signed-in user email pulled from server, not local cache.
- Sign out wipes all extension storage.
- Verify: sign in as user A, see A everywhere; sign out, sign in as B, see only B.

### Step 9. Page reader (reliable JD extraction)
- Full JD with "See more" auto-expand, SPA navigation re-read, iframe-safe.
- Cache JD server-side keyed by URL hash so Score/Tailor/Cover Letter share the same text.
- Verify: on LinkedIn + Greenhouse + Lever + Workday, JD length > 1000 chars and matches page.

### Step 10. Fill tab
- Reads form labels, maps to canonical profile, fills text + selects + radios + checkboxes.
- Shows list of filled fields with field name + value + "undo".
- Resume file: clear message "Chrome blocks auto-attach, click here to open file picker with AYN resume preselected".
- Verify: on a Greenhouse form, 10+ fields filled, list shown, undo works.

### Step 11. Score tab
- Calls `ext_job_score` with canonical profile + cached JD.
- Returns: match %, matched skills, missing skills, salary estimate, seniority fit.
- Circular ring UI + chips.
- Verify: same JD scored twice returns same score; different JD returns different score.

### Step 12. Contacts tab
- Returns recruiter / hiring manager personas for the company with suggested outreach message.
- Verify: company name detected, 3+ personas with titles, copyable message.

### Step 13. Cover Letter tab
- Uses canonical + cached JD, fact-grounded (no hallucinated employers).
- Edit + copy + "save to Resume Hub".
- Verify: generated letter only references real experiences from profile.

### Step 14. Resume (Tailor) tab
- ATS score ring, missing keywords, "Apply suggestions" produces a tailored version saved to Resume Hub.
- Verify: tailored resume increases ATS score on re-check.

### Step 15. Tracker tab
- "Save this job" writes to job tracker (Part A Step 6) with company, title, url, JD.
- Auto-detect "Application submitted" pages and mark as Applied.
- Verify: save job, appears in dashboard tracker instantly.

### Step 16. Ask AYN chat
- Sidebar chat with context = current JD + canonical profile.
- Verify: ask "Am I a fit?", "What salary should I ask?", answers reference profile + JD.

### Step 17. Answer memory
- Custom answers (work auth, sponsorship, salary expectation, notice period) saved once, reused across sites.
- Verify: answer once on Greenhouse, same answer auto-fills on Lever.

---

## PART C — Cleanup + reliability

### Step 18. Delete dead code
- Remove duplicate handlers, old endpoints, unused tabs.
- Verify: grep returns zero references; build passes.

### Step 19. Diagnostics panel (hidden behind shift-click on version)
- Shows: signed-in user, JD chars detected, last AI call latency, last error.
- Verify: trigger an error on purpose, see it in panel.

### Step 20. Final QA pass on 3 ATS
- LinkedIn Easy Apply, Greenhouse, Workday. All 6 tabs must work end-to-end.
- Bump to `v1.5.0`, update changelog, rebuild zip.

---

## Where I will start
Step 1 (Profile tab verification + completeness meter), then Step 2 (upload + storage wired to canonical extraction). Those two unblock every extension tab because they fill the canonical profile that everything else reads from.

Approve and I will start with Step 1.