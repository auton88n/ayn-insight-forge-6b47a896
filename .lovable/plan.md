## Goal

Bring the site header fully onto the new AYN ember orange brand, stop the nav from overlapping itself on iPad, make the mobile bar read clearly, and remove the small badge cards sitting under the audience switcher.

## 1. Mobile menu panel is off-brand (image 1)

`src/components/shared/Header.tsx`, the `SheetContent` panel:

- The brand block still uses the old black rounded square with the Brain glyph. Replace it with the ember mark: orange gradient tile, white glyph, "AYN" in the landing heading font.
- Nav links get more breathing room and a larger touch target, with the active item marked by an ember tint rather than a grey `bg-muted`.
- "Start Free" becomes the same ember gradient pill used on desktop, not the default black shadcn button. Same for the signed-in "Sign Out" (outline in ember).
- Panel width goes from 280px to a comfortable ~320px with proper top padding under the notch (`pt-[max(2rem,env(safe-area-inset-top))]`).

## 2. Mobile bar sits too high and reads unclearly (image 2)

- Increase the vertical padding floor so the bar is not pinned to the very top edge, and respect `env(safe-area-inset-top)`.
- Give the mobile row a defined presence: the AYN wordmark on the left and a hamburger on the right, both sitting on a soft translucent surface so they stay legible over the warm hero gradient. The hamburger becomes a properly bordered round button in ember ink instead of a bare ghost icon.

## 3. Nav pill overlaps "Start Free" on iPad (image 3)

Cause: the centered nav pill is centered on the full viewport width while "Start Free" is absolutely positioned on the right, so at tablet widths they occupy the same space.

Fix: rebuild the bar as a single flex row with three cells (brand, nav pill, CTA) instead of absolute positioning, so the pill can never sit under the button. The full pill plus CTA layout only appears at `lg` and above; between `md` and `lg` the iPad gets the compact layout (wordmark plus menu button), which is where that width actually belongs. The CTA keeps the ember gradient.

## 4. Remove the small cards under the switcher (images 4 and 5)

In `src/components/landing/LandingSections.tsx`, drop the `lp-pill` badge row from the hero for both audiences ("Free to start, no credit card" and "Employer access, onboarded one at a time") and remove the now-unused `pill` entries from the `HERO` record. The headline moves up directly under the switcher, and the switcher spacing is retuned so the hero stays balanced.

## Technical notes

- Work is limited to `src/components/shared/Header.tsx`, `src/components/landing/LandingSections.tsx`, and a small amount of ember token CSS in `src/index.css`. No behaviour or backend changes.
- Ember values reuse the existing landing tokens (`--lp-ember`, the `#e85d3a` to `#f2833f` gradient), so the header matches the hero CTA exactly.
- Verified afterwards at phone, iPad portrait, iPad landscape and desktop widths with the menu open and closed.
