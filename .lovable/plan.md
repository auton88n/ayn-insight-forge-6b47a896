## Goal

The extension icon should be the AYN mark alone, the same shape the loader spins, with nothing behind it. No rounded square, no tile, no background colour.

## What is there now

`extension/icons/icon16/32/48/128.png` were rebuilt from `public/ayn-mark.svg` last release. The 128 already has a transparent background, but the mark itself is drawn with a thick 24px round join stroke, so the triangle reads as a fat rounded black slab that fills the frame and looks like a square tile at small sizes. That is the square the screenshot shows.

## The change

1. Re-render all four sizes from `public/ayn-mark.svg` with:
   - fully transparent background, alpha channel preserved at every size
   - the artwork scaled to fit the canvas with a small even margin, so the triangle silhouette is readable as a triangle and not cropped into a block
   - the ember eye kept at the mark's own colour, no recolouring
2. Keep the manifest paths unchanged, so nothing else needs touching.
3. Bump `extension/manifest.json` to 3.2.1 and the `AYN_BUILD` fallback in `extension/content.js` to match, since an installed copy only picks up new icons on a reinstall of a new version.
4. Run `node extension/build.mjs`, which reruns the wiring check and rewrites `public/ayn-extension.zip` and `public/ayn-extension-version.json`.
5. Add the version line to `docs/map/extension.md` in the same commit.

## Verification

Render each PNG on both a white and a dark checkerboard and inspect them at true 16px, 32px, 48px and 128px to confirm the background is transparent and the shape still reads at the smallest size.

## Technical notes

Files changed: `extension/icons/*.png`, `extension/manifest.json`, `extension/content.js` (version literal only), `docs/map/extension.md`, plus the two generated files in `public/`. No backend, no schema, no web surface.
