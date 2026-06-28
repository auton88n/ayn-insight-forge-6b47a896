# Extension polish: company info, user identity, design pass

Three focused changes inside `extension/` only. Keep all logic, tabs, and frame structure intact.

## 1. Job hero cards (Fill, Score, Cover, Resume tabs)

Today: `fill-job-sub`, `score-job-company`, and `cover-job-sub` fall back to `tab.url` (the long Ashby URL the user screenshot-ed). The logo slot shows a single character (e.g. "P").

Change in `extension/sidepanel.js`:
- Replace every `tab.url` fallback in those subtitle assignments with the company name only. If no company name is detected, show "Unknown company" instead of the raw URL.
- Strip URLs from any subtitle string before render (defensive `.replace(/https?:\/\/\S+/g, '').trim()`).
- Add a small helper `setCompanyLogo(elId, companyName)` that:
  - Sets the element to `<img src="https://logo.clearbit.com/{slug}.com" onerror="..."/>` where slug = company name lowercased, spaces removed, non-alphanum stripped.
  - On image error, falls back to the current single-letter initial inside the same square (keeps current `.job-hero-logo` styling so the frame doesn't move).
- Call `setCompanyLogo` wherever `$('fill-job-logo').textContent = ...`, `$('score-job-logo').textContent = ...`, and the Cover/Resume hero logos are set.

No edge function or backend changes; Clearbit's logo endpoint is keyless and CORS-open for `<img>`.

## 2. Header shows the user's name, not their email

In `extension/sidepanel.js` `displayEmail(resp)`:
- Prefer, in order: `resp.profile.full_name` → `resp.profile.first_name` → derive from email local-part (before `@`, replace `.`/`_` with space, title-case) → `"Signed in"`.
- Rename the function to `displayUser` for clarity. The element id `user-email` stays (no HTML id churn) but its visible text becomes the user's name. Keep the email in the `title` attribute for hover tooltip.

## 3. Visual refresh of the side panel (no frame/motion changes)

In `extension/sidepanel.html` `<style>` only:
- Header pill: tighter padding, 999px radius, subtle border `rgba(0,0,0,.06)`, name in 12px/600, no underline.
- Job hero card: increase logo box to 44x44, white background with 1px border, 10px radius, subtle shadow; title 15px/700; company line 13px/500 muted; remove orange link styling from the company line entirely.
- Tabs: keep current pill row but raise contrast of active pill (white bg, soft shadow) and reduce inactive opacity.
- Cards: unify radius to 14px, border `rgba(0,0,0,.06)`, shadow `0 1px 2px rgba(15,23,42,.04), 0 8px 24px -16px rgba(15,23,42,.08)`.
- Empty states: smaller icon box (40px), tighter copy block, single muted CTA.
- Buttons: primary stays orange `#F97316` with hover `#EA580C`; add a quieter ghost variant for secondary actions in headers.

All token tweaks are CSS-only inside `sidepanel.html`. No new fonts. Inter stays.

## 4. Packaging

- Bump `extension/manifest.json` version to `1.9.3`.
- Update label in `src/components/resume-hub/ExtensionTab.tsx` (auto via `manifest.version` import — already wired).
- Rebuild `public/ayn-extension.zip` from `extension/` using the nix zip command.

## Out of scope

No changes to backend, edge functions, tab logic, autofill, scoring, or any motion/animation. Frames stay as-is.
