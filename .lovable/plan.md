## What I found

The screenshot shows Fill is working for normal text fields, but Resume/CV upload is not handled because browser extensions cannot safely attach local files to website file inputs. The extension currently fills text inputs only and skips file fields. That is why Greenhouse still asks you to attach the resume.

Several other tabs are only partially wired:
- Score can overlay cards, but there is no clear state when the current page is not a supported job board.
- Contacts and Cover depend on job text extraction and can fail if company/title detection is weak.
- Cover only uses resume text saved inside the extension Tailor tab, not automatically the primary resume saved in AYN.
- Tailor uses the same action name as a dashboard action, which can break through extension auth.
- Upload parsing in Resume Hub needs better fallback and error messaging for PDFs/DOCX files that the AI/file path cannot parse.

## Build plan

### 1. Fix Resume Hub resume upload
- Harden `parse_file` in `supabase/functions/resume-hub/index.ts`.
- Add safer AI output limits and better JSON/tool response handling so uploads do not fail silently when responses are truncated.
- Improve PDF/DOCX fallback messaging so the user knows if the file is image based, corrupted, too large, or unsupported.
- Update `ResumeUpload.tsx` to show the real failure reason and offer paste text as the fallback.

### 2. Make resume attachment work in application forms
- Keep secure browser behavior: do not fake a file upload or bypass Chrome restrictions.
- Add a dedicated Resume/CV detection result in Fill when the page has file inputs.
- If AYN cannot attach automatically, show an exact prompt: “Click Attach and select your downloaded AYN resume.”
- Add a “Download AYN Resume” button in the extension Fill tab when a primary resume exists, so the user can immediately upload it to Greenhouse/Workday/LinkedIn.
- Generate the download from the user’s saved primary resume as ATS plain text for now, with a stable filename.

### 3. Make Fill stronger on ATS forms
- Improve field scanning for Greenhouse, Workday, Lever, iCIMS, Cornerstone, and LinkedIn dialogs.
- Detect file, dropdown, radio, checkbox, and custom combobox fields more clearly.
- Report skipped fields separately, including “file upload requires manual attach,” instead of claiming 100% if only text fields were counted.
- Keep partial profile support, filling whatever saved info exists.

### 4. Fix Cover Letter, Contacts, Tracker, and Tailor tabs
- Cover Letter: load the primary resume from AYN during bootstrap, not only extension local storage.
- Contacts: improve company/domain detection and allow generation from the current job title plus URL even if the page has short JD text.
- Tracker: make “Save current job” work from any detected posting, and show a helpful error only when no title/company/url can be found.
- Tailor: add a dedicated extension action for smart tailoring so it no longer conflicts with dashboard auth actions.

### 5. Fix Score tab behavior
- Add a page detector for supported job board result pages.
- Show “Open LinkedIn/Indeed/job board search results first” when not on a supported page.
- Keep the “Get My Best Job Titles” button working from the primary AYN resume.
- Improve score badge injection and hover reasons so it behaves like Jobright-style browsing.

### 6. Repack and version the extension
- Bump the extension to v1.2.3.
- Repack `public/ayn-extension.zip`.
- Update `ExtensionTab.tsx` so the downloadable zip label matches the real version.

## Acceptance checks

- Uploading a resume in Resume Hub either saves it as primary or shows a clear reason with paste fallback.
- On the Greenhouse page in your screenshot, Fill shows text fields filled and separately says Resume/CV must be manually attached, with a Download AYN Resume button.
- Cover Letter works without pasting resume into the Tailor tab first.
- Contacts works on Greenhouse/LinkedIn/Indeed postings with title/company detected.
- Tracker saves the current job with title, company, and URL.
- Tailor analyzes keywords and rewrites without action name conflicts.
- Score shows clear guidance on unsupported pages and overlays badges on supported job board result cards.
- The downloaded extension zip is v1.2.3.