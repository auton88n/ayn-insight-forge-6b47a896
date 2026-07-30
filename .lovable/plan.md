## Goal

Retire the 3D scroll-canvas hero and ship a modern, high-conversion landing page for AYN: charcoal base with ember accents, Outfit headings + Figtree body, bento-grid composition, and an animated product mockup instead of the canvas.

Note: this overrides the stored brand fonts (Syne/Inter) with Outfit/Figtree per your pick.

## What gets removed

- The scroll-scrubbed canvas, frame preloading, scroll chapters, and their listeners in `src/components/landing/HeroScroll.tsx` (the file is replaced by a new composition).
- The `/frames` image sequence references in markup (files stay on disk, unused).
- Dead 3D perspective/scroll utilities in `src/index.css` that nothing else uses.

## New page structure

```text
Header (sticky, blurred charcoal)
1  HERO            copy left, animated fill mockup right, Start free + Add to Chrome
2  PROOF STRIP     ATS logos as text marks: Greenhouse, Ashby, Lever, Workday, iCIMS
3  BENTO GRID      6 tiles, mixed sizes, reusing the existing SVG illustrations
                   [ big: fill in progress ][ match score ]
                   [ provenance ][ one-page doc ][ run summary ]
4  HOW IT WORKS    3 compact steps, numbered, one line each
5  FOR EMPLOYERS   #employers anchor, EmployerMatchIllustration, waitlist CTA
6  TRUST           short paragraph + 3 assurance chips
7  CLOSING CTA     full-width ember band, Start free
Footer
```

All existing copy is preserved as-is (no em dashes, no en dashes, ranges use "to"). Only layout, colour, and type change; small trims where a bento tile needs a shorter line.

## Hero animation (replaces the 3D)

Pure CSS/SVG, no canvas, no new dependency:
- A browser-chrome card showing a job application form.
- Fields fill in sequence with a typing caret, a green verified tick lands on each, and a small "verified by AYN" badge slides in.
- Loop is CSS keyframes only, respects `prefers-reduced-motion`, and pauses off-screen via `content-visibility`.

## Design system

In `src/index.css` and `tailwind.config.ts`, as semantic HSL tokens (no hardcoded colours in components):
- background `#1a1a1a`, card `#2d2d2d`, border/muted `#4a4a4a`, primary/accent ember `#e85d3a`
- gradient and glow tokens for the ember accent, soft elevation shadows
- `--font-display: Outfit`, `--font-body: Figtree`, loaded via Google Fonts in `index.html`; `.font-display` remapped to Outfit

## Marketing and SEO

- Single H1 in the hero, semantic `section` + `h2` per band, descriptive alt/aria labels on every illustration.
- `index.html`: title under 60 chars with the primary keyword, meta description under 160, matching `og:*` and `twitter:card`, canonical to `https://ayn-insight-forge.lovable.app/`.
- JSON-LD: `SoftwareApplication` for the extension plus `FAQPage` for a short 4-question FAQ added above the footer (also good marketing content).
- Lazy-load below-fold illustrations, keep the hero critical path free of images.

## Files touched

- Rewrite `src/components/landing/HeroScroll.tsx` (renamed to `LandingSections.tsx`) and update the import in `src/components/LandingPage.tsx`
- New `src/components/landing/HeroFillMockup.tsx` (animated hero)
- Extend `src/components/landing/ProductIllustrations.tsx` only if a bento tile needs a variant size
- `src/index.css`, `tailwind.config.ts`, `index.html`
- `src/components/shared/Header.tsx` / `Footer.tsx` restyled to the new tokens

Dashboard, resume hub, extension, and backend are untouched.

## Verification

Build check, then Playwright screenshots at 390px, 826px, and 1440px to confirm no overflow and that the bento reflows to a single column on mobile.
