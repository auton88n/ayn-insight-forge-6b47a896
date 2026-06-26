# AYN Extension v1.3.0 — "Beat Jobright" UI Overhaul

Goal: make every tab feel as obvious and scannable as Jobright's panel — clear hero card, one primary action, soft helper card, never a wall of text.

## What changes (UI/UX only — backend stays as-is)

### 1. Universal "Job Hero" card (top of every tab)
Mirror Jobright's company card but cleaner:
- Company favicon (auto-fetched from job URL domain) in a rounded square
- Company name (small, muted) + Job title (bold, 2 lines max)
- Right side: circular Match Score ring (e.g. `78%`) — green/amber/red based on score
- Below: small meta row → posting age · location · salary estimate
- If no job detected: collapse hero to a soft "Open a job posting to begin" empty state

### 2. Primary action button (orange, full width)
One bold orange CTA per tab, exactly like Jobright's green "Autofill":
- Fill tab → `⚡ Autofill This Application`
- Score tab → `📊 Score This Job`
- Contacts tab → `🔍 Find Recruiters`
- Cover tab → `✉ Generate Cover Letter`
- Resume tab → `✦ Tailor My Resume`
- Tracker tab → `+ Save Current Job`

Below the CTA: tiny usage line (e.g. "Unlimited on Pro") — matches Jobright's "4 Credits Left" pattern but cleaner.

### 3. Result cards (replace raw text blocks)
Each result becomes a labeled card with an icon header, not a paragraph dump:
- **Fill results**: "✓ 14 fields filled" hero + collapsible "See what was filled" list grouped by section (Identity, Work Auth, Experience, Questions)
- **Score results**: big number ring + 3 reason chips ("Strong skill match", "Salary fit", "Location match") + salary range card
- **Contacts**: 3 stacked contact cards (Recruiter / HRBP / Hiring Manager) each with LinkedIn-search button + email pattern + "Copy outreach" button
- **Cover letter**: preview card with tone selector pills on top, Copy + Save-to-tracker buttons on bottom
- **Resume tailor**: keyword chips (green=present, grey=missing) + ATS score ring + Copy tailored resume button
- **Tracker**: vertical timeline cards sorted by stage, status pill click-to-cycle

### 4. Resume attachment card (keep, but polish)
Current amber card is good but make it match Jobright's soft style:
- Light orange tinted background, single rounded card
- Numbered steps with monospaced numbers
- Big orange "Download AYN resume (.txt)" button
- Only show this card when page has a file input AND user is on Fill tab

### 5. Tab bar polish
- Underline-style active tab (already done) but tighten spacing
- Add subtle icon-only mode on narrow widths
- Remove "Sign out" link from header; move to a small ⚙ menu

### 6. Empty + error states
Every tab gets a friendly empty state with:
- Soft icon
- One sentence what this tab does
- One sentence what to do next

Errors get a red-tinted inline card (not toast) with retry button.

### 7. Typography & spacing
- Switch panel font stack to `Inter, system-ui` with `font-feature-settings: "cv11"`
- 14px base, 13px meta, 16px headings
- Consistent 16px card padding, 12px gap between cards
- Card radius `10px`, shadow `0 1px 2px rgba(0,0,0,0.04)`

### 8. Color tokens (extension-local CSS vars)
```text
--ayn-orange: #F97316
--ayn-orange-soft: #FFF4EC
--ayn-green: #16A34A
--ayn-amber: #F59E0B
--ayn-red: #DC2626
--ayn-ink: #0F172A
--ayn-muted: #64748B
--ayn-border: #E2E8F0
--ayn-card: #FFFFFF
--ayn-bg: #F8FAFC
```

## Files touched
- `extension/sidepanel.html` — restructure each tab into Hero + CTA + Result-cards
- `extension/sidepanel.css` (new) — extract styles, add tokens above
- `extension/sidepanel.js` — render new card components, no logic changes
- `extension/manifest.json` — bump to v1.3.0
- `public/ayn-extension.zip` — repack
- `src/components/resume-hub/ExtensionTab.tsx` — version label v1.3.0

## What does NOT change
- Backend (`supabase/functions/resume-hub/index.ts`) — no edits
- `content.js` / `background.js` logic — no edits (only messaging stays the same)
- Auth flow, token storage, privacy model — untouched
- All existing feature behavior — only presentation improves

## Out of scope
- New backend actions
- New tabs
- Pricing/credits system (Jobright's "4 Credits" is just visual reference, not copied)

Ready to implement on approval.