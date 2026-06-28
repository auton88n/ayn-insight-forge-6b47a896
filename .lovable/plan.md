# Extension Side Panel Redesign (v1.9.4)

Match the Jobright reference structure while keeping AYN's white + orange identity. Scope is `extension/sidepanel.html`, `extension/sidepanel.js`, and `extension/manifest.json` only. No logic changes — pure visual/structural polish.

## Layout structure (top → bottom)

```text
┌─────────────────────────────────────────┐
│ [AYN logo]  AYN          [⚙]  [→ out]   │  ← clean header, 56px
├─────────────────────────────────────────┤
│ ╭─ Job Hero Card ───────────────────╮   │
│ │ [logo] Company                58% │   │  ← big circular score ring (right)
│ │        Company subtitle           │   │
│ │ Product Owner, Agentic AI         │   │  ← bold job title
│ │ 5 days ago · 25 applicants        │   │
│ │ ─────────────────────────────     │   │
│ │ Your Insider Connections  L R L > │   │  ← contacts row (chips)
│ ╰───────────────────────────────────╯   │
│                                         │
│ ╭─ Primary CTA ─────────────────────╮   │
│ │          ✨  Autofill              │   │  ← full-width orange pill button
│ ╰───────────────────────────────────╯   │
│   🍃 AI-powered · Smart fields           │  ← subtle helper banner
│                                         │
│ ╭─ Row item ────────────────────► ╮     │
│ │ 📇  Your Autofill Information     │   │
│ ╰───────────────────────────────────╯   │
│ ╭─ Row item ────────────────────► ╮     │
│ │ 📄  Upload Resume                 │   │
│ │     GhaziAldhyaei_Resume.docx     │   │
│ │     [ ✨ Generate Custom Resume ] │   │
│ ╰───────────────────────────────────╯   │
│ ╭─ Row item ────────────────────► ╮     │
│ │ ✉️  Cover Letter                  │   │
│ │     [ ✨ Generate Cover Letter ]  │   │
│ ╰───────────────────────────────────╯   │
│                                         │
│       Autofill for Another Job          │  ← muted underlined link
└─────────────────────────────────────────┘
```

Bottom tab bar stays (Fill / Score / Resume / Cover / Contacts / Tracker / Profile) but restyled as icon+label pills, sticky bottom.

## Visual tokens

- Background: `#ffffff`, card surface `#ffffff` with `border: 1px solid #f1eee8`, radius `16px`, shadow `0 1px 2px rgba(15,15,15,.04), 0 4px 16px rgba(15,15,15,.04)`.
- Primary CTA: solid orange `#F97316`, hover `#EA580C`, text white, radius `14px`, height `52px`, font-weight `600`, subtle drop shadow `0 8px 20px rgba(249,115,22,.25)`.
- Secondary action buttons (Generate Resume / Cover Letter): light surface `#FAF7F2` with orange icon + dark text, radius `12px`, height `44px`.
- Score ring: 56px circular SVG, stroke `#F97316`, track `#FDE8D4`, bold number inside.
- Typography: Inter; sizes — header 14/600, job title 18/700, body 13/500, helper 12/500 muted `#6B7280`.
- Row items: 56px tall, left icon in soft orange tinted square (32px, bg `#FFF4E8`, icon `#F97316`), chevron right.
- Bottom tabs: pill background `#F8F5F0`, active pill `#FFFFFF` with orange dot indicator + label.

## Component-level changes

**Header (`sidepanel.html`)**
- Slim to single row: logo + "AYN" wordmark left, name pill removed from top — moved into a small profile chip inside the settings menu (keeps identity, declutters).
- Two icon buttons right: settings (gear) + sign-out (arrow-right-from-bracket).

**Job hero card**
- Restructure: logo (40px rounded) + company stack left, big score ring right.
- New job title row (bold, 18px), meta row (posted date · applicants when available).
- Divider, then "Your Insider Connections" row with up to 5 avatar chips + chevron → opens Contacts tab.

**Primary CTA block**
- Single full-width Autofill button (currently this is buried). Tapping triggers existing `runAutofill()`.
- Helper strip beneath: "AI-powered field detection" with leaf/spark icon.

**Action rows**
- Convert the Fill tab body to a vertical list of 3 elevated rows: Autofill Info, Resume, Cover Letter.
- Each row uses the icon tile pattern; Resume row shows current filename + inline "Generate Custom Resume" secondary button; Cover Letter row has inline "Generate Cover Letter".

**Bottom tab bar**
- Replace the horizontal pill row at top with a sticky bottom nav (Jobright pattern). 7 tabs → group as 5 visible (Fill, Score, Resume, Contacts, Tracker) + "More" overflow holding Cover Letter & Profile. Or keep all 7 if width allows with icon-only + label-on-active.

**Empty / loading states**
- Keep orange icon squares; tighten copy; use the same 16px radius + soft shadow language.

## Files touched

1. `extension/sidepanel.html` — new markup for header, hero card, CTA, action rows, bottom nav. Inline `<style>` overhaul using tokens above.
2. `extension/sidepanel.js` — wire new DOM ids (`#aynHeroScore`, `#aynHeroTitle`, `#aynHeroMeta`, `#aynHeroConnections`, `#aynPrimaryAutofill`, `#aynRowResume`, `#aynRowCover`); reuse existing handlers (`runAutofill`, `runScore`, `generateResume`, `generateCoverLetter`). No behavior changes.
3. `extension/manifest.json` — bump `version` to `1.9.4`.
4. Rebuild `public/ayn-extension.zip` (overwrite).
5. `src/pages/ResumeHub.tsx` — update download label to `v1.9.4` and short "What's new" line.

## Out of scope
- No edge-function changes.
- No tab logic / autofill behavior changes.
- No dashboard layout changes beyond version label.

## Acceptance check
- Side panel visually mirrors the reference: hero card with score ring, prominent orange CTA, clean action rows, sticky bottom nav.
- All existing buttons still trigger the same handlers (verified by id mapping).
- `node --check` passes on `sidepanel.js`; zip rebuilt and downloadable from Resume Hub.