## Answer first: what is "Auto-score job cards"?

It is a browsing toggle, not a hidden feature. When it is on, `content.js` walks the job cards on a search results page (LinkedIn, Indeed, and similar) and pins a small AYN badge next to each card title showing a 1 to 10 fit number, so you can triage a results list without opening every posting. When it is off, nothing is injected. It is read only, same as the rest of the extension. The 1 to 10 number is a quick page level fit check and is deliberately coarser than the 0 to 100 match score on aynn.io.

## What I will change

### 1. White surface instead of cream
In `extension/sidepanel.html` design tokens:
- `--ayn-bg` moves from `#f5f2ec` to `#ffffff`.
- Because cards were white on cream, cards get a faint separation again: `--ayn-card` stays white and card borders step up slightly, plus subtle surface tint `--ayn-surface: #FAFAFA` used for the tab rail, the header bar and inset blocks so the panel does not read as one flat sheet.
- Header and tab rail backgrounds re-pointed to the new tokens, dividers unchanged.

### 2. Real AYN mark in the header
The header logo is currently a CSS circle with an orange dot, which is not the brand. Replace it with the actual AYN mark:
- Add `extension/icons/ayn-mark.svg` (the triangle with the ember eye, same artwork as `public/ayn-mark.svg`, transparent).
- `.logo-eye` becomes a plain transparent box that renders that SVG at 26px, no ring, no dot, no background circle. Remove the `::after` pupil rule and the `img { display: none }` rule.
- Same mark used on the sign in screen hero in place of the current ring and dot, sized larger with a soft ember glow behind it so the welcome screen still has a focal point.
- Wordmark stays "AYN Resume Tailor" in the display font.

### 3. Remove the Email formats block
- Delete the `Email formats for <domain>` label and `#email-fmts` container from `extension/sidepanel.html` (around lines 964 to 965) and the `.email-fmt` styles.
- Delete the format building loop in `renderContacts` in `extension/sidepanel.js` and drop `emailFormats` and `companyDomain` from the destructured args where they are no longer used. The rest of the Contacts tab (people, LinkedIn search links, subject line, outreach draft) stays as is.

### 4. Ship it
- Bump `extension/manifest.json` and the `AYN_BUILD` fallback in `extension/content.js` to 3.2.3.
- Run `node extension/build.mjs` to regenerate `public/ayn-extension.zip` and `public/ayn-extension-version.json`.
- Add the v3.2.3 line to `docs/map/extension.md` in the same commit.
- Verify the rendered panel with a headless screenshot so I can confirm the white surface and the mark before reporting done.

No copy uses em dashes or en dashes.
