## What I found

The extension is not just missing polish, it has a real wiring bug: the Autofill event listener is currently nested inside the Auto attach click handler. That means the main Fill button can appear in the UI but not actually be connected until after another button is clicked. This explains why you keep seeing the same broken behavior even after updates.

Some console errors you pasted are from Greenhouse and other installed extensions, but AYN still needs stronger Greenhouse handling and better visible error states.

## Plan

### 1. Fix the extension wiring first
- Move all Fill tab event listeners out of the Auto attach handler.
- Make every tab button register exactly once on startup.
- Add visible diagnostic states inside the side panel so it says what failed: no page access, no fields found, no resume, AI failed, upload blocked, backend error.
- Bump extension version so Chrome clearly shows a new build.

### 2. Rebuild Greenhouse detection
- Add Greenhouse specific selectors for:
  - hosted Greenhouse job pages
  - embedded Greenhouse application forms
  - application iframes
  - file upload fields
  - radio groups and Yes or No questions
- Improve company and job title extraction when Greenhouse hides them or puts them in document title.
- Make Scan show exactly how many text fields, dropdowns, radio groups, checkboxes, and file uploads were detected.

### 3. Make Autofill smarter and safer
- Replace basic injection with a field resolver that uses stable selectors, label proximity, name, id, aria attributes, and frame prefix.
- Handle:
  - first name, last name, email, phone, address, city, province, postal code
  - LinkedIn, portfolio, website
  - work authorization
  - sponsorship
  - relocation
  - salary expectation
  - start date
  - years of experience calculated from resume dates
  - required Yes or No questions
  - EEO questions with safe defaults or skip when sensitive
- Show a result row for every field: filled, skipped, blocked, already filled, or needs manual review.

### 4. Fix resume upload UX
- Keep both buttons visible as requested:
  - Try auto attach
  - Download my AYN resume
- Make auto attach more reliable by dispatching drag, input, change, and React compatible events where possible.
- If Greenhouse blocks programmatic upload, show a clear one line reason and keep manual upload ready.
- Stop promising impossible browser behavior. Chrome and job sites can block file assignment, but AYN should still automate everything else.

### 5. Repair Score, Contacts, Cover Letter, Tracker, Resume
- Score tab: always extract current job context, show loading, score, must have match, nice to have match, matched skills, missing keywords, salary estimate, and verdict.
- Contacts tab: work even if company extraction is weak by using job URL/title fallback, and show generated LinkedIn search links plus cold outreach.
- Cover tab: use saved AYN resume from the backend, not only local cache, so it does not fail after reinstall.
- Tracker tab: add better save/update error handling and refresh after save.
- Resume tab: auto load current job description, generate ATS score, change notes, keyword list, and copy/download actions.

### 6. Package the extension correctly
- Rebuild `public/ayn-extension.zip` from the updated `extension/` folder.
- Update the dashboard download card version from old `v1.3.1` to the new version so you can confirm you downloaded the latest package.
- Add a short “latest version loaded” note in the extension header.

### 7. Verify with Greenhouse
- Use a real Greenhouse job page in the browser test.
- Confirm:
  - content script loads
  - Scan detects form fields
  - Autofill button is wired before Auto attach is clicked
  - Score tab renders instead of staying empty
  - Contacts and Cover generate output
  - Tracker loads without silently failing
  - Resume tab loads the job description and generates tailored output

## Technical notes

Files to update:
- `extension/sidepanel.js`
- `extension/content.js`
- `extension/background.js`
- `extension/sidepanel.html`
- `extension/manifest.json`
- `src/components/resume-hub/ExtensionTab.tsx`
- `public/ayn-extension.zip`

No new database tables are needed for this fix. The existing extension token privacy model remains per user, so accounts stay isolated.