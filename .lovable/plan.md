## Goal

Polish the landing page (`src/components/landing/HeroScroll.tsx` + supporting CSS / `Hero.tsx`):
- Replace the yellow/gold accent with the dashboard orange tone.
- Fix structural issues so it looks clean and professional on desktop, tablet, and phone.
- Keep the existing design language (dark sections, glass cards, ambient glows, ASK→ANALYZE→EXECUTE row, stats, footer). No new layouts, no removed sections, no copy/text changes, no functional changes.

## Color migration (yellow/gold → dashboard orange)

Dashboard uses Tailwind `orange-400` / `orange-500` (`#FB923C` / `#F97316`). Migrate:
- `G = '#e2b769'` → `G = '#FB923C'` (primary accent), with a darker `#F97316` used for gradients/shadows.
- All inline `rgba(226,183,105, x)` occurrences → `rgba(251,146,60, x)` (matches `#FB923C`), preserving the same alpha values so glow intensity stays identical.
- `linear-gradient(to right, ${G}, #a07830)` → `linear-gradient(to right, #FB923C, #F97316)`.
- `box-shadow ... rgba(212,160,23, …)` → `rgba(251,146,60, …)`.
- In `src/index.css`:
  - `.gold-glow-btn` background/shadow → orange equivalents (keep class name to avoid breaking refs, just swap colors).
  - `.text-gold-glow` gradient `#e2b769 → #9c7839` → `#FB923C → #F97316`.
- `Hero.tsx` Brain icon already uses `text-orange-400` — leave as is (matches new palette).

## Structural / responsive fixes (no design change)

`HeroScroll.tsx` currently hard-codes desktop-only layouts (fixed widths, `gridTemplateColumns: '1fr 1fr'`, absolutely positioned 480px geometry, 3-column service grid, footer flex row). Issues on tablet/phone: content overlaps the right-side rings, glass cards collide, services squish, footer links wrap badly.

Fixes per section, keeping the same visuals:

1. Section 1 (MEET AYN)
   - Make right-side rings + orbital geometry hide on `<lg` (they currently overlap text on tablet/phone). Use a CSS media query via a small `<style>` block or inline conditional with `window.matchMedia` is not SSR-safe — instead, wrap the decorative block in a `<div className="hidden lg:block">` style equivalent (add `className` and use Tailwind utilities; the file already mixes inline + tailwind elsewhere).
   - Stats row: switch from `gap: 40` flex to `flex-wrap` with `gap: 24px 40px` so it wraps cleanly on phones.
   - Reduce hero `padding` on mobile via `clamp` already in place; tighten headline `clamp(48px, 12vw, 130px)` so it never overflows on 360px screens.
   - Buttons row already wraps; ensure both buttons are `min-width: 0` and full-width-ish on phones (`flex: 1 1 200px`).

2. Section 2 (Intelligence, evolved)
   - Right-side abstract geometry (480×480) overlaps headline on tablet. Hide below `lg` and center-align text block on small screens (`maxWidth: 520` already works).
   - Headline `clamp(48px, 7vw, 100px)` is fine; add `word-break: break-word` for AR.

3. Section 3 (Your business, understood)
   - Replace `gridTemplateColumns: '1fr 1fr'` with responsive: single column on `<md`, two columns on `≥md`. Use a CSS class with media query (add to `index.css`) e.g. `.landing-two-col`.
   - Right-column glass cards use absolute positioning inside a 440px box — on phones, switch to a stacked flex layout (3 cards in column, no absolute) via the same media query class.

4. Section 4 (Services + ASK→ANALYZE→EXECUTE)
   - 3-column services grid → `repeat(auto-fit, minmax(260px, 1fr))` so it becomes 2-up on tablet and 1-up on phone naturally.
   - ASK/ANALYZE/EXECUTE row: line connector positioned at `top: 22px` works only when icons are 52px in a row. Wrap correctly on phones by allowing flex-wrap and hiding the connector line below `sm`.

5. Section 5 (Build with intelligence + Footer)
   - Footer flex `space-between` breaks on phones. Switch to `flex-wrap`, `gap: 16px`, center on small screens. Reduce link letter-spacing on small widths.
   - Decorative concentric rings (600/450/320) overflow on phones — clamp their sizes with `min(80vw, 600px)` etc.

## Implementation approach

- Edit `src/components/landing/HeroScroll.tsx`:
  - Replace the `G` constant + every `rgba(226,183,105,…)` / `#a07830` / `#d4a017` occurrence with the orange palette.
  - Add minimal Tailwind `className` props (`hidden lg:block`, `flex-wrap`, etc.) to the decorative wrappers and rows that need responsive behavior. Inline styles stay; we only add classes where needed.
  - Switch the two hard-coded grids (Section 3 two-column, Section 4 three-column) to either `repeat(auto-fit,minmax(...,1fr))` (Section 4) or a tiny utility class added to `index.css` (Section 3 + the absolute-positioned cards on phone).

- Edit `src/index.css`:
  - Recolor `.gold-glow-btn`, `.text-gold-glow`, and any `.stitch-glass*` border colors that reference gold.
  - Add `.landing-two-col` responsive grid + `.landing-glass-stack` rule that converts the absolute-positioned card cluster to a stacked column on `max-width: 768px`.

- Leave `Hero.tsx` untouched (already orange) and do not touch any other page.

## What is NOT changing

- No copy, headings, stats numbers, icons, section order, animations, or framer-motion timings.
- No removal of sections or visual elements.
- No font changes (Bebas Neue / DM Sans stay).
- No backend, routing, or component API changes.
- `src/pages/services/AIEmployee.tsx` `text-yellow-400` and `Support.tsx` status badge colors are out of scope (not landing).

## Files to edit

- `src/components/landing/HeroScroll.tsx`
- `src/index.css` (gold-glow + small responsive helpers)
