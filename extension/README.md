# AYN Auto-Apply (browser extension)

Autofills a real job application form from your AYN profile, running in
your own real Chrome — not a bot on a server. It fills what it can find,
then stops. You review the real page and click Submit yourself, the
same as any other autofill tool. It never clicks submit for you.

## Why this exists

Auto-apply also runs server-side, through `job-checker/` (an isolated,
headless-browser service). That path works well for most postings, but
some ATS platforms flag it as automated because it genuinely is — a
Playwright browser running on a VPS, not a person's own browser. This
extension is the honest fix for that: it's not a bot pretending to be
you, it's AYN helping you fill a form you're already looking at, in the
same browser and session you'd use anyway.

## What it deliberately does NOT do

It never clicks submit on your behalf, and it never tries to make
itself look more human to defeat a site's own anti-bot system — there's
nothing to defeat, since it runs in a real browser as a real signed-in
person the whole time. It never invents a value: every field it fills
comes from a real `auto_apply_extract` call against your own AYN
profile, the same matching logic the web app's own Jobs tab uses.

## Install (sideload — this isn't published to the Chrome Web Store)

1. `chrome://extensions` → enable "Developer mode" (top right).
2. "Load unpacked" → select this `extension/` folder.
3. On any real job application page, click the AYN icon in your toolbar
   — no need to have saved the job in AYN first.
4. Sign in with your real AYN account the first time — it's your own
   email/password against the same backend the web app uses, nothing
   separate.

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
4. It fills immediately — no extra "review, then click Fill" step.
   Every value it set is checked by reading the field's real value back
   right after writing it, so a field that silently didn't take the
   value is reported as failed, never counted as filled.
5. A short summary shows what filled and what's still empty (nothing
   on file, or the field couldn't be set automatically) — named plainly,
   never a second form to fill inside the extension itself. That's it —
   you review the actual page, fill in anything still empty directly on
   it, and hit its real Submit button yourself.

## Known limits (v1, disclosed rather than hidden)

- **File attachments (resume/cover letter) aren't filled automatically
  yet.** A file field is flagged clearly in the panel; you attach it
  yourself. The web app's own resume/cover-letter PDF generation lives
  in `src/lib/resumeDocs.ts` and needs porting into the extension to
  close this — real, scoped follow-up work.
- **Checkboxes aren't matched.** The backend's own `auto_apply_extract`
  only resolves identity fields, free-text/select Q&A, and single-choice
  radio groups today — the same scope the web app's auto-apply panel
  already has, not a new gap this extension introduces.
- Nothing about Saved Jobs is required or checked — the extension works
  on whatever application page you're actually on.
