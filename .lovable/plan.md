## Goal

Use the uploaded AYN triangle mark as (1) the animated loading indicator and (2) the browser tab icon, background removed, high resolution.

## 1. Prepare the asset

- Take the uploaded mark, remove the white background, and produce a clean transparent PNG at high resolution.
- Store it as a Lovable CDN asset (`src/assets/ayn-mark.png.asset.json`) for in-app use.
- Also write real files in `public/` for the tab icon, since favicons cannot be CDN pointers:
  - `public/favicon.png` (512px, transparent) — replaces the current one
  - `public/apple-touch-icon.png` (180px)
  - `public/ayn-icon-128.png` (128px, used by the extension surface)

## 2. Animated loader component

New `src/components/shared/AynLoader.tsx`:

- The AYN mark centered, at a size prop (`sm` / `md` / `lg`).
- Motion: a slow breathing scale-and-opacity pulse on the mark, plus a thin Ember-orange arc rotating around it, and a soft ember glow that fades in and out. Pure CSS keyframes (no Framer Motion) so it stays cheap during route loads.
- Optional caption line under the mark (e.g. "Loading", or "AYN is reading the pool").
- Respects `prefers-reduced-motion`: static mark with a gentle opacity fade only.

Keyframes added to `src/index.css` alongside the existing animation utilities, using semantic tokens for the arc color.

## 3. Replace the old loading UI

- `src/App.tsx`: `PageLoader` renders `AynLoader` instead of the current spinner.
- Swap the full-screen/blocking spinners that are branded moments for the same component: employer search "AYN is reading the pool" state in `EmployerHub.tsx`, assessment generation in `AssessmentDialog.tsx`, and the Resume Hub initial load.
- Small inline button spinners (`Loader2` inside buttons) stay as they are — a logo mark inside a 32px button would look wrong.

## 4. Verify

Typecheck and build, then screenshot the loader in the preview to confirm the animation and the tab icon.

Note: browsers cache favicons aggressively, so the new tab icon may need a hard refresh to appear.
