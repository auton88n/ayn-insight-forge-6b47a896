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

- **Resume attachment works, on nearly every file field.** Any file
  field gets a real "Attach my resume" button — builds a real one-page
  PDF from your primary AYN resume (`resumeDocs.js`, a direct port of
  the web app's own builder) and attaches it via the DataTransfer API,
  verified by reading the file back off the input afterward — except a
  field whose own label clearly asks for something else (cover letter,
  portfolio, writing sample, transcript, references, a photo/video/ID),
  which stays "attach yourself" since your resume would be a real,
  wrong guess there. A plain "Attachment" or genuinely unlabeled file
  field gets the button too, on the same reasoning as everything else
  this tool fills: it's a real file you actually have, and you still
  review the real page before you submit.
- **Cover letters still aren't attached automatically.** They're
  job-specific (the extension deliberately has no jobId context — see
  v3.278.0), so there's no single "the" cover letter to attach the way
  there's one primary resume. Real, separate follow-up work if wanted.
- Nothing about Saved Jobs is required or checked — the extension works
  on whatever application page you're actually on.
- Handles real `<select>` dropdowns, native radio groups, ARIA-based
  radiogroups, plain `aria-pressed` toggle-button pairs with no
  radiogroup wrapper at all (a Yes/No question rendered as two buttons,
  common enough on real ATS forms to need its own detection), checkboxes,
  Radix/react-select-style custom comboboxes, and a location/city/
  school/employer-style typeahead that only shows its own suggestion
  list once you've typed into it — all scoped by diffing what actually
  changed on the page (a new `role="listbox"`, an actual click and
  read-back), never a bare, page-wide search. A genuinely closed shadow
  root (`mode: "closed"`) stays unreachable by design, the one real,
  disclosed exception to the shadow-DOM support below it.
- **Form Intelligence**: whatever the deterministic scan above still
  doesn't recognize (a Yes/No pair with zero ARIA state at all, a custom
  dropdown trigger that never declared `role="combobox"`) gets one real
  shot at an AI classification, cached server-side by structural shape
  so the same widget on any company using the same ATS platform is only
  ever classified once, for every AYN user. The model only ever picks
  one of five fixed types — never code, a selector, or a value — and
  the actual fill still runs through the same read-back-verified
  mechanisms as everything else here. Full design in
  `docs/map/extension.md`.
