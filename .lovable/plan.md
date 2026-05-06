## What I see now (re-walked the live page)

1. **Fonts.** Landing uses Space Grotesk for display + Geist for body. Two issues:
   - They aren't a paired family. Space Grotesk is geometric/quirky, Geist is humanist/neutral. Together they read as "designer picked two trendy fonts" instead of a system.
   - Your project memory already standardizes on **Syne / Inter / JetBrains Mono**, but the landing isn't using them. It's the only page off-system.
   - Body text uses `letter-spacing: -0.005em` everywhere. That's the "muddy small text" feeling — negative tracking belongs on display, not body.

2. **Hero text panel.** Now that the eyebrow + the fake "Connected / Intelligent / Always On" row are gone, the panel is just: H1 + 1 paragraph + 2 CTAs. The vertical rhythm is fine, but the H1 and paragraph are equally loud (both dense, both wide), so the eye has nowhere to land first. There's no scale jump between the headline and the supporting line.

3. **Why AYN section.** One ~600-word block of body copy in a single column. Your viewport is 1000px — that paragraph runs ~600px wide × 8 lines tall. It looks like a Terms of Service page, not a value prop. No scannable structure, no callouts, no proof points pulled out.

4. **Features grid.** Six cards, generally OK. But the section H2 + sub + 6 cards all use the same display font at similar weights, so nothing dominates.

5. **General rhythm.** Every section is `min-height: 100dvh` with `padding: 96px`. That's a lot of vertical air for short content (especially Why AYN, which has body copy but nothing else). Feels empty, not premium.

## Recommendation

### A. Fonts — go with the project standard, used correctly

Pick **one** of these two pairings. Both are premium, both already in `node_modules` via `@fontsource/*`:

**Option 1 (recommended): Inter Tight + Inter + JetBrains Mono**
- Display H1/H2 → **Inter Tight 700**, `letter-spacing: -0.04em`, `line-height: 1.0`
- Body → **Inter 400/500**, 17px, `line-height: 1.6`, `letter-spacing: 0`
- Eyebrows / labels / stat numbers → **JetBrains Mono 500**, 11px, `letter-spacing: 0.18em`, uppercase

Why: this is the Linear / Vercel / Stripe / Arc system. Reads modern, neutral, premium, never dated. Inter Tight gives Apple-style headline density; Inter body is the most legible web font shipped today.

**Option 2 (more brand): Syne + Inter + JetBrains Mono**
- Display → **Syne 700** (already loaded, already in your memory as the brand display font)
- Body → **Inter 400**
- Mono → **JetBrains Mono 500**

Why: keeps the slight personality on headlines while making body text neutral and legible. Matches your global system, so the dashboard and landing finally feel like the same product.

I'll wait for you to pick before writing the swap. Default = Option 1.

In both cases:
- Drop the Geist + Space Grotesk Google Fonts `<link>` tags from `index.html`.
- Update `C.display` and `C.body` in `HeroScroll.tsx`.
- Remove `letter-spacing: -0.005em` from every body `<p>` (kills the muddiness).
- Add `font-feature-settings: 'cv11','ss01','ss03'` on the body for Inter's improved letterforms (free quality bump).

### B. Hero text — clearer hierarchy

Today, H1 and paragraph are visually equal weight. Fix:

1. **H1**: keep "The power to know." — drop the gray on "to know." OR commit to it on a separate line for stronger break:
   ```
   The power
   to know.
   ```
   Stacked, `line-height: 0.95`, both lines black. Reads bigger without growing the font size.
2. **One-line lead** under H1, max 2 lines: **"AYN connects your reports, files, and decisions into one intelligence layer your business can talk to."** Larger than today (18px), lighter weight (400), wider tracking, max-width 460px.
3. CTAs unchanged.

That's it. No third element. Let the helmet do the rest of the work.

### C. Why AYN — break the wall of text

Replace the single 600-word paragraph with this structure:

```text
+---------------------------------------------------------------+
| Why AYN?                          (display, large, left)      |
|                                                               |
| One short lead sentence in 18px, max 540px wide.              |
|                                                               |
| ─────────────────────────────────────────────────────────     |
|                                                               |
| FOR LEADERS WHO NEED      |  WHAT AYN GIVES YOU               |
| · Clarity in noise        |  · One intelligence layer         |
| · Speed of decision       |  · Reports become conversations   |
| · Control of context      |  · Memory across the company      |
| · Confidence to act       |  · Action before the window closes|
+---------------------------------------------------------------+
```

- Two-column grid below the headline, `gap: clamp(48px, 6vw, 96px)`, stacks on mobile.
- Each column has a small mono caps label + 4 short bullets (no icons, just `·`).
- The long paragraph that exists today gets condensed to the lead sentence.
- Section padding reduced from `96px` to `clamp(72px, 10vh, 120px)` and `min-height` removed so the section is sized by its content (no more empty 100dvh).

### D. Features grid — lighter type, stronger hierarchy

- Card title 18px **Inter Tight 600** (currently display 700 — too heavy at small size).
- Card body 14px Inter 400 line-height 1.65.
- Section H2 stays display 700 large; sub goes to **Inter 400 16px** in `inkSub`.
- Card hover: drop the `transform: translateY(-4px)` — replace with `border-color: ink` only. Lifts feel cheap on a clean white page; border darkening reads premium.

### E. Global polish

- Remove `min-height: 100dvh` from sections that don't need it (Why AYN, Final CTA on shorter screens). Use `padding-block: clamp(96px, 14vh, 160px)` instead. Page becomes ~25% shorter and denser.
- Drop the `borderBottom` separators between consecutive white sections. Thin gray lines on white feel like a CMS template; the type rhythm alone should carry.

## Out of scope (will not touch)

- `HELMET_FRAMES`, `cache`, the RAF tick loop, `imgRef`/`floatRef` math, the 600vh sticky structure, the per-chapter scroll mapping. Frames behavior stays byte-identical.

## Files that will change

- `src/components/landing/HeroScroll.tsx` — fonts, hero text restructure, Why AYN 2-col, features card weights, section padding.
- `index.html` — remove Geist + Space Grotesk `<link>` tags.
- `src/main.tsx` — add `@fontsource/inter-tight/600.css` + `@fontsource/inter-tight/700.css` if you pick Option 1.

## Two questions before I implement

1. **Pairing**: Option 1 (Inter Tight + Inter) or Option 2 (Syne + Inter)?
2. **H1 styling**: keep "The power to know." on one line with gray accent, or stack as two lines, both black?
