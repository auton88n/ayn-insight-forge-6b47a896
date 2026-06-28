## Goal
Fix Resume Hub visuals (white background + previous orange tone) and actually modernize the Chrome extension side panel UI. No backend/logic changes.

## 1. Resume Hub — visual reset
File: `src/styles/resume-hub.css`
- Replace warm off-white tokens with white:
  - `--rh-canvas: #ffffff`, `--rh-surface: #ffffff`, `--rh-raised: #f5f5f5`, `--rh-hair: #ececec`, `--rh-tint: #fff4ea`
  - Keep orange accents matching dashboard: `--rh-accent: #f97316`, `--rh-accent-2: #ea580c` (the previous tone the user liked)
  - Ink/muted tuned for white bg: `#0a0a0a` / `#6b7280` / `#9ca3af`
- Remove the cream off-white shell feel; keep shadows subtle.

## 2. Left sidebar — vertical icon rail
File: `src/styles/resume-hub.css` + `src/pages/ResumeHub.tsx`
- Replace 220px nav column with a 64px vertical icon rail (sticky, full height, white, 1px border-right).
- Each item: 40×40 rounded square, icon-only, tooltip on hover showing the label.
- Active state: orange tint background + orange icon + 2px left orange indicator.
- Top of rail: small AYN mark. Bottom: Install extension icon button.
- Mobile (≤760px): convert to horizontal scrollable icon row at top.
- Update `rh-grid` to `64px minmax(0,1fr) 280px`.

## 3. Top bar
- Slim it down; remove duplicated "Install extension" (now in rail). Keep Back + title + "New resume" primary.

## 4. Chrome extension — real side panel UI refresh (v1.9.1)
Files: `extension/sidepanel.html` (+ inline styles), `extension/manifest.json`
- New visual system in the side panel:
  - White background (`#ffffff`), ink `#0a0a0a`, muted `#6b7280`, hairlines `#ececec`, orange accent `#f97316`.
  - Typography: Inter (system stack fallback), JetBrains Mono for numbers/scores.
- Header block: compact brand row (AYN mark + "Resume Tailor" + version chip), job hero card below with company logo, title, match ring (mono number).
- Tabs: switch from text tabs to a segmented icon+label pill bar with active orange underline; sticky under header.
- Cards: rounded-xl (14px), 1px hairline border, no heavy shadows; consistent 14px padding.
- Score ring: refined SVG ring (stroke 6, soft track, orange progress, mono % in center).
- Buttons: primary orange solid, secondary white with hairline; 36px height, 10px radius.
- Empty states: centered icon + 1 sentence + single CTA.
- Field-fill progress: thin 4px orange bar with mono "x / y" label.
- Keep all existing element IDs and JS hooks intact — pure CSS/markup polish so logic continues to work.
- Bump `manifest.json` version to `1.9.1`.
- Rebuild `public/ayn-extension.zip`.

## 5. Verification
- View `/resume-hub` at mobile + desktop widths to confirm white bg, orange accents, icon rail behavior.
- Confirm zip rebuilt and version string updated in ExtensionTab download card.

## Out of scope
- No changes to edge functions, content.js logic, autofill behavior, or DB.
- No changes to landing/dashboard.
