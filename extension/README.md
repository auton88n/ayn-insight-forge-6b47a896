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
- **A field hidden behind a styled label still gets found, for file
  inputs specifically.** The single most common real "Upload your
  resume" pattern is a `display:none` native file input with a styled
  `<label>` as the actual visible trigger — native file-input styling is
  hard to control directly, so most real forms hide the raw input. A
  file input's own invisibility is no longer a reason to skip it, as
  long as a genuinely visible label is linked to it; every other field
  type still correctly stays untouched when truly hidden.
- **A `visibility:hidden` field is treated the same as `display:none`
  now** — both mean "don't touch this," found by a heavy synthetic
  stress pass across ~15 real-world DOM shapes. `opacity:0` and an
  off-screen position are deliberately still findable — both are common,
  legitimate patterns where a real native input sits under a styled
  visual replacement, and the native input is the one that actually
  submits.
- **An application form embedded in an `<iframe>` is now found and
  filled too**, same-origin or cross-origin — `frame_agent.js` (the
  extraction/fill core, shared with the top page) runs in every frame,
  self-reports its own fields through the background script (a content
  script has no way to message a different frame directly — only the
  background script's own frame-targeted messaging can), and a fill
  instruction for one of those fields is relayed back down to the exact
  frame it came from, executed there, and the real result relayed back.
  Verified with a real iframe end to end: extraction, merge, and both a
  text fill and a radio-group fill, each confirmed by reading the
  iframe's own DOM afterward. Deliberately v1-scoped: only the
  deterministic layer (native inputs, ARIA radiogroups, aria-pressed
  toggle groups, `role="combobox"`) runs across frames — the AI-assisted
  Form Intelligence layer stays top-frame-only for now, since that
  deterministic layer alone already accounts for the large majority of
  real fields.
- **A genuine "choose all that apply" multi-select group is now
  recognized as exactly that**, not silently mis-filled as a
  single-choice pick. It's structurally identical to a toggle group, so
  the AI classifier is told explicitly to tell them apart by the real
  question phrasing ("select all that apply," a plural framing over a
  list of skills/tools) — once recognized, it's never clicked at all,
  just named plainly for you to answer yourself, the same honest
  treatment a genuinely unrecognized field already gets. Real
  auto-selection (matching several possible answers against your own
  profile at once) is a different, larger kind of matching this app
  doesn't do yet — flagged, not guessed at.
- **Two same-labeled sibling fields (a real, common shape: a start/end
  date section built as two separate month and year text inputs, the
  actual pattern Workday's own apply forms use) no longer share one
  identical, ambiguous label.** Confirmed against a real, published
  Workday automation script's own DOM shape, not guessed at. Each
  field's own distinguishing placeholder ("MM" vs "YYYY") is now
  appended to its label whenever it would otherwise be indistinguishable
  from a sibling field sharing the same container — closing a real risk
  of the exact same matched value being written into both.
- **A dual-handle ARIA salary/range slider is now recognized and
  disclosed**, the same honest treatment a native `<input type=range>`
  already got — never auto-filled (a slider's value is never a fact a
  profile can answer), but now named plainly in the summary instead of
  being completely invisible, since this is one of the highest-value
  fields on a real application.
- **`role="combobox"` on a real `<input>` no longer registers as two
  separate fields.** A real, increasingly common accessible-combobox
  pattern (the trigger IS the text input, not a separate button next to
  it) was getting picked up once by the generic text-field scan and a
  second time by the dedicated combobox scan, risking a double fill
  attempt and a duplicated line in the after-fill summary.
- **The deterministic label lookup no longer picks up a sibling
  control's own displayed text as if it were a real label.** A phone
  number input sitting right after a country-code selector button was
  being labeled with that button's own text ("+1 US") instead of the
  real "Phone number" label — a confidently wrong result, worse than
  the honest "unlabeled" it now correctly falls back to.
- **A real, per-option-wrapped button group (Ant Design's `Segmented`
  component being the concrete example that surfaced this) is now
  recognized too.** The unrecognized-widget scan used to only look for
  buttons as DIRECT siblings of one shared parent; a component that
  wraps each option in its own individual container (so each button's
  own parent only ever has one button child) was silently invisible to
  it, never even reaching AI classification. It now also checks one
  level up (the wrapper's own parent) and unwraps a container that holds
  exactly one real button, so both shapes resolve the same way.
- **The nearby-text label lookup for an AI-classification candidate no
  longer grabs text from an unrelated ARIA-interactive sibling.** It
  already excluded a sibling containing certain literal HTML tags
  (button, input, a, nav, and the like); it did not exclude one that is
  itself an ARIA-role-based interactive widget with no matching HTML
  tag at all, such as a portal-rendered `role="listbox"` full of
  `role="option"` children sitting right next to an unrelated toggle
  group. Found on a page with two separately portaled widgets placed
  adjacent to each other, where the toggle group's own label lookup
  picked up the whole concatenated text of the listbox next to it
  instead. Now excluded by role, not just by tag.
- **Extraction now prefers a single real `<form>` when the page has more
  than one.** Many real ATS pages (Ashby included) have no `<form>`
  element at all wrapping the actual application, which is why
  extraction has never been scoped to one by default — but when a page
  genuinely does have two or more real forms, and one of them looks like
  the actual application (3+ real fields), extraction now scopes to that
  one instead of the whole page, closing the real risk of a genuinely
  unrelated widget elsewhere (a newsletter signup, say) getting swept in
  too. A form-less page, or a page with only one form, is completely
  unaffected — the exact case this was built for keeps working exactly
  as it always has.
