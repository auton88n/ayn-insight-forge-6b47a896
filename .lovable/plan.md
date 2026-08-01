## Goal

Make the Chrome extension side panel look like the AYN landing mockups (paper and ember, modern and futuristic), remove what the panel no longer needs, and use the loader mark as the extension icon.

## 1. New look for the side panel

`extension/sidepanel.html` currently uses a white and orange token set from v1.9.1 (`#f97316`, gray borders, Inter Tight). Retune it to the mockup palette used in `src/components/landing/AppMockups.tsx`:

- Surfaces: paper `#f5f2ec` background, white `#ffffff` cards, hairline borders `rgba(0,0,0,0.09)` and `rgba(0,0,0,0.14)`.
- Ink: `#0B0C0F` headings, `#3D3F45` body, `#6E7076` muted.
- Accent: ember `#e85d3a`, deep ember `#c2410c`, positive green `#3f9d6a`.
- Type: Outfit for headings and numbers, Inter for body, keeping the mono numerals for scores.

Structural moves, all presentation only:

- Header becomes a quiet paper bar with the eye mark rendered as a real ring plus pupil (same construction as the mockup) instead of a black rounded image tile.
- Tabs become a single inset pill rail on paper with an ember sliding indicator, sticky under the header.
- The score turns into the mockup's ring gauge: full circle track, ember arc drawn to the score, big number in the middle, one line of context underneath.
- Matched and missing skills adopt the mockup's chip treatment: soft ember tint for gaps, soft green for matched, no heavy fills.
- Cards get 14px radius, 1px hairline border, and a very soft shadow rather than the current three shadow levels.
- Buttons: one solid ember primary, one hairline outline secondary, both 36px, no gradients.
- Motion stays light: a 180ms tab indicator slide, an 800ms score arc draw, a subtle ember glow behind the mark while loading. Pure CSS keyframes, reduced motion respected.

Everything above is CSS and markup inside `sidepanel.html`, plus small class or label touch ups in `sidepanel.js` where the score gauge and chips are rendered.

## 2. What is not right or not needed today

Findings from reading the extension, and what I propose to do with each:

1. **Fonts and icons load from the internet.** `sidepanel.html` pulls Tabler icon webfont from jsDelivr and Inter, Inter Tight and JetBrains Mono from Google Fonts. In an MV3 panel that means the UI depends on network access, breaks offline, adds a third party request on every open, and is a Chrome Web Store review flag. Fix: bundle the two font files locally and replace the 44 `ti ti-*` icon uses with inline SVG. This also removes the `\ea7d` private use glyph hack on the sign out button.
2. **Contacts tab.** You chose to remove it. I will delete the tab, its panel markup, the `ext_find_contacts` call in `sidepanel.js`, and drop the action from the extension's action list. The backend action stays in `resume-hub` unused unless you want it removed too.
3. **Tracker leftovers.** The Tracker tab was deleted in v3.0.1 but `ext_save_application`, `ext_get_applications` and `ext_update_application` are still registered as extension actions and `docs/map/extension.md` still lists a Tracker tab. I will fix the doc, and flag the three dead actions rather than deleting backend surface in a UI change.
4. **`extension/README.md` says v2.3.0** while the manifest says 3.1.1, and it still describes finding recruiters. Correct both.
5. **Vendor weight.** `vendor/docx.min.js` (743 KB) and `vendor/jspdf.umd.min.js` (366 KB) are both genuinely used by `resumeFormat.js` for PDF and Word export, so they stay. Noting it so it is not mistaken for dead weight.
6. **`web_accessible_resources` exposes `vendor/*` to every https page**, including `http://*/*` which no longer matches any host permission. The panel loads those scripts itself, so the entry can be narrowed or dropped. Low risk, worth doing while we are here.

## 3. The icon

`extension/icons/*.png` are the old art. Rebuild all four sizes from `public/ayn-mark.svg`, the same mark the loader spins, rendered on the paper background with the ember eye so it reads at 16px. Replace `icon16/32/48/128.png` and keep the manifest paths unchanged.

## 4. Ship and document

- Bump `manifest.json` to 3.2.0 and the `AYN_BUILD` fallback in `content.js`, then run `node extension/build.mjs`, which reruns `scripts/check-wiring.mjs` and rewrites `public/ayn-extension.zip` and `public/ayn-extension-version.json`.
- Update `docs/map/extension.md` in the same commit: new palette and local assets, Contacts removed, tab list corrected, icon source, version history entry.
- Copy stays within the house rules: no em dashes, no en dashes, ranges written "to".

## Technical notes

No backend, no schema, no seeker or employer web surface is touched. Files changed: `extension/sidepanel.html`, `extension/sidepanel.js`, `extension/manifest.json`, `extension/content.js` (version literal only), `extension/README.md`, `extension/icons/*`, new `extension/fonts/*`, `docs/map/extension.md`, and the two generated files in `public/`.

I cannot load an unpacked extension in this sandbox, so I will verify the panel by opening `sidepanel.html` in a headless browser at the real 400px panel width and screenshotting the signed out state, the score state and the tailor state.
