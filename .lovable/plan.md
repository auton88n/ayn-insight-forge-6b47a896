# Chrome Web Store assets rebuilt from the real product UI

The current store screenshots were drawn from scratch in HTML. They look like AYN but they are not AYN, so they show layouts, labels and controls that do not exist in the shipped extension or in Resume Hub. Replace all of them with captures of the real interfaces.

## What changes

Every screenshot becomes a real capture:

1. Match score, captured from the real `extension/sidepanel.html` Home tab with a real score result rendered.
2. Tailored resume, captured from the real sidepanel Resume tab after a tailor run.
3. Cover letter, captured from the real sidepanel Cover tab.
4. Ask AYN, captured from the real sidepanel Ask tab with a real question and answer.
5. Resume Hub, captured from the real running app at `/resume-hub` (Jobs tab), signed in.

The two promo tiles keep the AYN brand frame but the product imagery inside them is swapped to crops of the real captures above, not drawn panels.

## How the captures are produced

- Load `extension/sidepanel.html` directly in Playwright from the local file path, at the real sidepanel width, with the extension's own bundled fonts and CSS. No Chrome APIs are available in that context, so a small throwaway shim (in `/tmp` only, never in the repo) stubs `chrome.storage`, `chrome.runtime` and `chrome.tabs` and feeds the panel the same message shapes `background.js` already sends, so the panel renders its own real markup rather than a copy of it.
- Content shown is realistic sample data for a single job posting, consistent across all four sidepanel shots (same job title, same company, same candidate), so the five images read as one story.
- Resume Hub is captured against the running dev server with a real session restored, so the shot is the actual page, not a redraw.

## Store framing

Each raw capture is composited onto the 1280x800 canvas already used: white page, ember accent, AYN full logo lockup, one short headline per shot, no invented UI outside the frame. Promo tiles stay 440x280 and 1400x560. All exports stay 24 bit PNG with no alpha so the store accepts them.

## Verification

Every generated file is opened and inspected before delivery: correct dimensions, no alpha channel, no clipped or overlapping text, fonts rendering, logo sharp, and each product panel visibly matching the real UI it came from. Files are written as a new version alongside the existing ones rather than overwriting them.

## Technical notes

- Output directory: `/mnt/documents/ayn-chrome-store/` (new `-v2` filenames).
- No repo files are modified. The shim, HTML frames and screenshots all live under `/tmp/store/`.
- If the sidepanel cannot be driven far enough by the shim for a given tab, that tab's panel is captured from the live extension state instead of being redrawn, and if neither is possible the shot is dropped rather than faked.
