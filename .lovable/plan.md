# Plan: Resume Hub v2 — Diff Review + New AYN Extension

## 1. Replace `/extension` with the uploaded side-panel build

Remove old popup-based extension. New `/extension/` directory contains:

- `manifest.json` (MV3, sidePanel, scripting, storage, host_permissions `<all_urls>`)
- `background.js` — opens side panel on icon click, refreshes Supabase token, `safeSendMessage` auto-injects `content.js` when missing
- `content.js` — job text extraction for LinkedIn, Indeed (US/CA), Jobright, Greenhouse, Lever, Ashby, Glassdoor, Workday, SmartRecruiters, plus generic fallback; form field scanning + React-native value setter for autofill; job card scoring overlays on search pages
- `sidepanel.html` + `sidepanel.js` — 6 working tabs:
  1. **Fill Form** — detect form fields, autofill from saved profile
  2. **Job Score** — arc gauge, comparison table, keyword chips
  3. **Contact** — find recruiter (LinkedIn search builder)
  4. **Cover Letter** — AI-generated, copy button
  5. **Tracker** — list of saved applications from `applications` table
  6. **Tailor CV** — 3-step flow with the new diff viewer
- `icons/` — copy the 4 uploaded AYN orange-eye PNGs

### Polish on top of the uploaded version
- Swap purple `#4F46E5` accent → AYN orange `#F97316` / `#FB923C`
- Replace hardcoded SUPABASE keys with `config.js` (still publishable anon keys, but one place to update)
- Fix the "device token" auth path: side-panel signs in via email magic-link OR pastes a device token generated in Resume Hub → Extension tab (matches our existing `extension_tokens` table)
- Inter font via system stack, JetBrains Mono for score numerals
- Add empty/error/loading states for every tab
- Persist last resume + last job per user in `chrome.storage.local`

## 2. Side-by-side diff viewer (web + extension)

New component `src/components/resume-hub/ResumeDiffViewer.tsx`:

```text
┌─────────────────────────┬─────────────────────────┐
│ ORIGINAL                │ IMPROVED                │
├─────────────────────────┼─────────────────────────┤
│ Built dashboards using  │ Built  real-time        │ ← change #1
│ React.                  │ dashboards in React,    │   [Accept] [Reject]
│                         │ cutting load time 40%.  │
├─────────────────────────┼─────────────────────────┤
│ ...unchanged line...    │ ...unchanged line...    │
└─────────────────────────┴─────────────────────────┘
```

- Use `diff` npm package (`diffWordsWithSpace`) to compute hunks
- Group consecutive changed lines into one "change" with stable `id`
- Highlight insertions green, deletions red strikethrough
- Each change row gets **Accept** / **Reject** buttons; Reject reverts that hunk to original text
- Sticky header: `Accept All` · `Reject All` · `Copy Final` · `Download .docx`
- Footer counter: `12 of 18 changes accepted`
- Mobile: stacks to single column, swipe between Original/Improved

### Wire into `ResumeMatch.tsx`
Replace current Step 3 `<pre>{rewriteMarkdown}</pre>` with `<ResumeDiffViewer original={resume} improved={rewriteMarkdown} onConfirm={...}/>`. On Confirm, save the accepted version as a new `resume_versions` row labelled `Tailored for {jobTitle} @ {company}`.

### Update `resume-match` edge function
Return both:
- `improved`: full improved resume text (already returned as `markdown`)
- `changeSummary`: array of `{ section, before, after, reason }` so the UI can show "why" tooltips on each change

## 3. Download link in Resume Hub → Extension tab

In `src/components/resume-hub/ExtensionTab.tsx`:

1. Add a build step that zips `/extension/` → `/public/ayn-extension.zip` (run via existing `nix run nixpkgs#zip` recipe; document in README, the user re-runs when extension changes)
2. New hero card at top of tab:
   - Big AYN icon + "AYN Resume Tailor for Chrome — v1.1.0"
   - **Download Extension** button (fetch+blob pattern, not direct `<a>`)
   - 4 install steps inline (unzip → chrome://extensions → Dev mode → Load unpacked)
3. Below: existing device-token generator + revoke list
4. "What's new in this version" changelog block

## 4. Files touched

**New**
- `extension/` (full rewrite — 8 files)
- `extension/icons/icon{16,32,48,128}.png` (copied from uploads)
- `src/components/resume-hub/ResumeDiffViewer.tsx`
- `public/ayn-extension.zip` (built artifact)

**Modified**
- `src/pages/ResumeMatch.tsx` (Step 3 uses diff viewer)
- `src/components/resume-hub/ExtensionTab.tsx` (download card + install guide)
- `supabase/functions/resume-match/index.ts` (add `changeSummary` to response)
- `package.json` (`bun add diff @types/diff`)

**Untouched**
- Resume parsing, jobs tab, tracker, all other Resume Hub backend
- Auth, RLS, storage buckets
- Any landing page / dashboard code

## 5. Out of scope
- Publishing to Chrome Web Store (still developer-mode load-unpacked)
- Changing the resume parsing pipeline (it works now)
- Editing landing page or dashboard

## Acceptance
- Download button in Extension tab pulls `ayn-extension.zip` and saves locally
- Loaded extension opens side panel, lists 6 tabs, signs in with device token, autofills a LinkedIn application, scores against the detected JD
- After clicking "Improve My Resume", user sees side-by-side diff, can accept/reject each change, sees live count, and confirms to save as a new resume version
