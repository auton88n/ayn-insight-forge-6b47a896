# AYN Auto-Apply (browser extension)

Fills a real job application form from your AYN profile, running in your
own real Chrome — not a bot on a server. You always review the exact
values, and click a real "Submit" button yourself, before anything is
sent.

## Why this exists

Auto-apply also runs server-side, through `job-checker/` (an isolated,
headless-browser service). That path works well for most postings, but
some ATS platforms flag it as automated because it genuinely is — a
Playwright browser running on a VPS, not a person's own browser. This
extension is the honest fix for that: it's not a bot pretending to be
you, it's AYN helping you fill a form you're already looking at, in the
same browser and session you'd use anyway.

## What it deliberately does NOT do

It never tries to make itself look more human to defeat a site's own
anti-bot system — there's nothing to defeat, since it runs in a real
browser as a real signed-in person the whole time. If an employer's own
system still rejects a submission (checked the same way the server-side
path does — see `content.js`'s `findRejectionText`), it reports that
honestly and stops. It never invents a value: every field it offers to
fill comes from a real `auto_apply_extract` call against your own AYN
profile, the same matching logic the web app's own Jobs tab uses.

## Install (sideload — this isn't published to the Chrome Web Store)

1. `chrome://extensions` → enable "Developer mode" (top right).
2. "Load unpacked" → select this `extension/` folder.
3. On a real job application page (a saved job's own apply page), click
   the AYN icon in your toolbar.
4. Sign in with your real AYN account the first time — nothing here uses
   a separate account or a device-linking flow, it's your own
   email/password against the same backend the web app uses.

## How it works, in order

1. You click the toolbar icon → `background.js` injects `content.js`
   into that one tab only.
2. `content.js` reads every real, visible form field on the page
   (labels resolved from `<label for>`, `aria-label`, a wrapping
   `<label>`, or the nearest sibling text — several real shapes, since
   Greenhouse/Lever/Ashby/Workday each do this a little differently).
3. It sends that field list to `resume-hub`'s `auto_apply_extract`
   action, which matches each one against your real profile (name,
   email, phone, and the deterministic Q&A matcher every other AYN
   surface already uses) and returns real values or `null` — never a
   guess.
4. You review every value in the panel (editable) before anything
   touches the real page.
5. On "Fill this form," each field is set via the native property
   setter (required for React/Vue-controlled inputs) and immediately
   read back — a field that didn't actually take the value is reported
   as failed, never silently counted as filled.
6. You review the real page, then click "Submit this application"
   yourself. The script clicks the page's own submit button, waits, and
   checks the resulting page's own text for a real anti-spam rejection
   before ever telling you it worked.

## Known limits (v1, disclosed rather than hidden)

- **File attachments (resume/cover letter) aren't filled automatically
  yet.** A file field is flagged clearly in the review panel; you
  attach it yourself. The web app's own resume/cover-letter PDF
  generation lives in `src/lib/resumeDocs.ts` and needs porting into
  the extension to close this — real, scoped follow-up work, not
  attempted in this first version so the rest could ship correct and
  reviewable now.
- **Checkboxes aren't matched.** The backend's own `auto_apply_extract`
  only resolves identity fields, free-text/select Q&A, and single-choice
  radio groups today — the same scope the web app's auto-apply panel
  already has, not a new gap this extension introduces.
- **Submit-button detection is a text-based heuristic** ("Submit",
  "Apply now", "Send application," etc., or a plain `type=submit`). A
  form using unusual wording is caught honestly (a clear "couldn't find
  a submit button" message), not silently skipped.
- Requires a job you've already saved in AYN (Browse Jobs → save) — the
  extension matches the current page's hostname against your saved
  jobs' own URLs to find the right one.
