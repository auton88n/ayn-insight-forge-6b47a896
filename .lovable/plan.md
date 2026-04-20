

## Your insight is sharp

You're right — orange currently appears in the eye and on buttons but has **no narrative anchor**. The brain (Brain icon inside the eye) is orange, but the wordmark "AYN" is black. So orange feels decorative rather than *meaningful*.

By coloring the **"AYN" wordmark itself orange**, orange becomes a brand identifier, not a decoration. Then everywhere orange appears (eye iris, CTAs, accents) it visually "belongs to AYN" — same color as the name = same color as the brand.

## The rule

> Orange = the AYN brand mark (logo wordmark + eye + primary CTAs).
> Everything else stays black/white/grey.

## Where to apply orange to "AYN" text

**Apply (logo/brand contexts):**
1. **Header logo** — `<span>AYN</span>` next to the Brain icon → orange
2. **Mobile sheet logo** — same wordmark in the slide-out menu → orange
3. **Footer logo** (if present) — orange
4. **Auth modal logo** (if shows AYN wordmark) → orange

**Do NOT apply (editorial/copy contexts):**
- "Meet AYN" headline → stays black/white. The headline is editorial typography, not a logo. Coloring "AYN" inside a sentence breaks the reading flow and looks like a hyperlink.
- "About AYN" / "AYN Capabilities" section labels → stays grey. These are navigational/structural labels, not the logo.
- Body text that mentions AYN → stays foreground. Same reason.

The distinction: **the logo is a mark, the headline is a sentence**. Only the mark gets the brand color.

## Files to change

1. **`src/components/shared/Header.tsx`** — change the two `<span className="...font-bold">AYN</span>` instances (desktop nav line 84, mobile sheet line 137) to add `text-orange-500`.
2. **`src/components/shared/Footer.tsx`** — if the footer renders an AYN wordmark logo, color it orange. (need to verify file exists / structure)
3. **`src/components/auth/AuthModal.tsx`** — if a wordmark appears in the modal header, color it orange. (need to verify)

I'll verify Footer/AuthModal during implementation and only edit if they have a logo wordmark.

## What stays the same

- Eye iris orange ✓
- LiquidButton orange ✓
- Feature icon badges + bullet dots orange ✓
- "Meet AYN" headline → black/white ✓
- All section labels → grey ✓

## Result

Orange now has a story: *"orange is the color of AYN"*. Logo, eye, and buttons all share it because they all represent the brand directly. Headlines and copy stay neutral because they're communication, not identity.

