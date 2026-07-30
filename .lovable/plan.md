## 1. Error screen on AYN ember orange branding

`src/components/shared/ErrorBoundary.tsx` currently renders a grey card with a black button because the global `--primary` is near black.

- Rebuild the fallback card in the ember language: warm off white surface, soft ember tinted border, ember gradient icon badge with the AYN brain mark, and an ember filled "Let's try again" button.
- Use the existing landing ember tokens (`--lp-ember`, `--lp-gradient-ember`) exposed as a small reusable class so no colors are hardcoded in the component.
- Keep the message copy, dev only error text, and the reload versus retry behavior exactly as they are.
- Same treatment for the smaller inline fallbacks that share the card, so a snag always looks like AYN.

## 2. Hero centered

In `src/components/landing/LandingSections.tsx` the hero is a left column with the mockup beside it.

- Center the hero: audience switch, pill, headline, lead, CTA and note all centered in a single column with a max width around 820px.
- The mockup moves below, centered, at full shell width, keeping the existing crossfade when the audience switches.
- Headline and lead get `text-wrap: balance` so the centered lines break evenly.

## 3. Remove language switching, English only

- Delete `src/components/shared/LanguageSwitcher.tsx` and remove it from `src/components/shared/index.ts`, `Header.tsx` and `Support.tsx` (that removes the "EN" control in the top bar).
- Remove the language selector row from settings, and the footer language links.
- `LanguageContext` stays as a thin shim that always reports `en` and forces `dir="ltr"`, so the ~25 files that read `language` keep compiling while every ternary resolves to the English branch. No user visible way to change it, no Arabic or French output anywhere.
- Strip the `ar` / `fr` branches from the landing, hero and auth copy so the source reads as plain English rather than three way ternaries in the files touched by this change.
- Remove the AR/FR hreflang tags and any `/ar` `/fr` route hints from the landing SEO head.

## 4. Fits every platform

A responsive pass, presentation only:

- Landing: hero type scale down to 360px wide, switch wraps to two full width buttons on small screens, bento and split sections collapse to one column, mockups scroll horizontally inside their frame instead of overflowing the page, tap targets at least 44px.
- Employer Hub: the icon rail becomes a bottom bar on phones, dialogs go full screen below the small breakpoint with the fixed header and footer preserved, candidate cards stack.
- Resume Hub: tab rail scrolls horizontally on phones, profile groups and job cards stack.
- Global: add `dvh` based heights where `vh` is used so mobile browser chrome does not clip content, and confirm no horizontal scroll at 360, 768, 1024 and 1440.

## Verification

Screenshot the landing hero (both audiences), the error card, Employer Hub and Resume Hub at 360, 768 and 1440 in the browser, and confirm the EN control is gone from every header.
