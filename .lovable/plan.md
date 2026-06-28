# Redesign Plan — Extension Side Panel + Resume Hub

Goal: ship a UI that beats Jobright on clarity, density, and craft. Keep every existing feature and ID/selector wired the same — this is presentation only, no logic or backend changes.

## Design system (locked)

- **Palette**
  - Canvas `#faf8f5`, surface `#ffffff`, raised `#efece6`
  - Ink `#1a1a1a`, muted ink `#5b5751`, hairline `#e6e1d8`
  - Accent orange `#ea580c`, hover `#c2410c`, tint `#fff1e6`
  - Success `#15803d`, warning `#b45309`, danger `#b91c1c`
- **Type**: Space Grotesk (display/headings, tight tracking), DM Sans (body/UI), JetBrains Mono (numbers, scores, micro-labels). Load via `@fontsource/*`.
- **Radii**: 14px cards, 10px controls, 999px pills. **Shadow**: single soft elevation `0 1px 2px rgba(20,18,15,.04), 0 8px 24px -12px rgba(20,18,15,.10)`. **Borders** instead of heavy shadows.
- **Density**: 12px gutter, 16px card padding, 1.45 line-height. No gradients, no glassmorphism, no emojis.

## Extension side panel

Layout becomes a sticky **Job Hero** + segmented tabs + scroll body + sticky primary action.

```text
┌───────────────────────────────────────┐
│  AYN  ·  user pill           ⌃ pin × │  ← compact header, 44px
├───────────────────────────────────────┤
│  [logo] Company · 2d · 25 applicants │
│  Product Owner, Agentic AI           │  ← Job Hero card
│  Toronto · Remote · $140–$170k CAD   │
│  ┌──────┐  Match 86                  │
│  │ ring │  Skills 9/11 · Seniority ✓ │
│  └──────┘  [ View breakdown ]        │
├───────────────────────────────────────┤
│  Fill · Score · Ask · Contacts · Resume · Cover · Tracker │ ← scrollable segmented
├───────────────────────────────────────┤
│  (tab content, generous spacing)     │
├───────────────────────────────────────┤
│  ⚡ Fill This Form Now      ●●●○○    │ ← sticky CTA + progress
└───────────────────────────────────────┘
```

Per-tab refinements:

- **Fill**: replace the giant orange block with a single primary CTA + a calm "Resume attachment" card. Inline progress ring (mono numerals) instead of full-width green bar. "What AYN filled" becomes a checklist with field name, value preview, and an "undo" affordance per row.
- **Score**: hero number 0–100 with ring, then three rubric rows (Skills, Experience, Seniority) using bar + matched/missing chips. "Missing keywords" as removable chips.
- **Ask AYN**: clean chat surface (AI Elements style), suggested prompts as chips, message bubbles use ink-on-paper for assistant, accent pill for user.
- **Contacts**: cards with avatar monogram, name, title, mutual-signal line, LinkedIn icon button. Persona filter chips on top.
- **Resume (Tailor)**: side-by-side diff with additions in accent, deletions struck. ATS ring at top. Action row: Regenerate · Download PDF · Download DOCX · Copy.
- **Cover Letter**: editable card with tone chips (Direct / Warm / Technical), word count in mono.
- **Tracker**: status kanban-as-list (Saved · Applied · Interview · Offer · Closed) with quick status menu.
- **Profile** (entry from header pill): one-screen canonical profile + resume upload area.

Empty/loading: shimmer skeletons matching final shape, never spinners alone. Error: inline neutral card, never red toast for expected states.

## Resume Hub (/resume-hub)

Same tokens, desktop-first three-column structure:

```text
┌───────────────────────────────────────────────┐
│ Resume Hub          [Install extension] [↑]  │
├──────────────┬─────────────────┬──────────────┤
│ Sidebar       │  Active resume  │  Right rail │
│ • Resumes     │  ── preview ──  │ Match stats │
│ • Tracker     │  edit / tailor  │ Activity    │
│ • Saved jobs  │                 │ Tips        │
│ • Profile     │                 │             │
└──────────────┴─────────────────┴──────────────┘
```

- Header: product mark, page title in Space Grotesk, ghost actions.
- Resumes list: cards with name, last edited, ATS score chip, default badge.
- Editor: paper-like canvas, max-width 760px, section anchors on the left rail.
- Tracker: dense table with status pill, salary in `$X to $Y CAD` mono, source icon.
- Extension download card: replace neon block with a quiet "Install AYN for Chrome" card showing version, size, last updated, and `Download .zip` + `View setup steps`.
- Mobile: collapses to single column, sidebar becomes top scroll-chip nav.

## Files touched (presentation only)

- `extension/sidepanel.html` — new shell (header, hero slot, tabs, sticky CTA), link new stylesheet.
- `extension/sidepanel.css` *(new)* — full token system, components, tab styles, skeletons.
- `extension/sidepanel.js` — only DOM template strings updated to new class names; no behavior changes. Keep all element IDs the same.
- `extension/manifest.json` — version bump to `1.9.0`.
- `public/ayn-extension.zip` — rebuilt.
- `src/index.css` — add Warm Off-white tokens scoped to `.resume-hub-theme` so the rest of the dashboard is untouched.
- `src/pages/ResumeHub.tsx` + `src/components/resume-hub/*` — restructure into the three-column layout; reuse existing data hooks and components (`ResumeDiffViewer`, `ProfileTab`, Tracker, etc.).
- `tailwind.config.ts` — register `display` (Space Grotesk), `sans` (DM Sans), `mono` (JetBrains Mono) for the Resume Hub scope.
- `src/main.tsx` — `@fontsource/space-grotesk`, `@fontsource/dm-sans`, `@fontsource/jetbrains-mono` imports.

## Out of scope (explicit)

- No changes to edge functions, DB, autofill logic, scoring, content.js scanners, or auth.
- No changes to dashboard pages outside `/resume-hub`.
- No animation libraries added; CSS transitions only (150–200ms ease-out).

## Acceptance

- Side panel renders new shell on every tab; all existing buttons/inputs keep their IDs and continue to work.
- `/resume-hub` matches the three-column layout on desktop and stacks cleanly on tablet/mobile.
- Lighthouse contrast AA on ink/paper and accent/paper pairings.
- Extension zip rebuilt at `public/ayn-extension.zip` with `1.9.0`.
