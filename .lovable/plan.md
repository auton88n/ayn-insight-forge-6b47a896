

## My honest critique as a senior designer

I looked at your landing page carefully. **The orange is not the problem. The orange is the only thing giving your brand a soul.** Don't remove it. What's "off" is something else, and once I name it you'll feel it too.

## What's actually wrong (3 real issues)

### 1. The eye glow is too aggressive — orange is leaking everywhere
The hero eye has a giant orange radial blur (`-inset-8 blur-2xl` at 35% opacity). It's not the orange itself that's loud, it's the **halo size**. The orange should feel like a *pupil*, not a *sunset*. Reduce the glow radius and opacity by ~60% and the orange will feel intentional, jewel-like, premium — not garish.

### 2. The headline "Meet AYN" is competing with the eye
You have two heroes fighting for attention: a massive 8xl Syne headline AND a giant glowing eye directly below it. Both are screaming. In premium design (Apple, Linea, Palantir), the hero has **one focal point**. Either:
- Shrink the headline (text-4xl → text-6xl max) and let the eye lead, OR
- Keep the headline big and shrink the eye to a compact mark

I recommend **eye leads, headline supports** because the eye is your differentiator. Nobody else has it.

### 3. Inconsistent typography hierarchy
You're mixing `font-serif` (Syne) on section headings with `font-display` (also Syne) on the hero, and `font-mono` for labels. That's fine — but the **weights and sizes are too similar across sections**. Every H2 is `text-3xl md:text-5xl lg:text-6xl font-bold`. That means "About AYN", "AYN Capabilities", and "Meet AYN" all carry equal visual weight. Nothing feels like THE moment. Premium sites vary scale dramatically: hero is huge, section heads are restrained.

## What's right (don't touch)

- **Black/white/orange palette** — exactly correct for a premium AI brand. Linear, Stripe, Vercel all use 2-color + 1-accent. Don't dilute it.
- **Orange anchored to AYN wordmark** — narratively perfect now. Orange has a reason.
- **Flat orange CTAs** — clean, modern, confident.
- **Grey feature cards with orange micro-accents** — restrained and elegant.
- **Syne + Inter pairing** — premium choice.

## My recommended changes (4 small surgical edits)

### Edit 1: Calm the eye glow (`Hero.tsx`)
- `-inset-8 blur-2xl` → `-inset-4 blur-xl`
- Glow opacity `0.35` → `0.18` (light), `0.25` → `0.15` (dark)
- `Brain` icon `drop-shadow` opacity `0.6` → `0.35`

Result: orange becomes a focused jewel inside the eye, not a flare around it.

### Edit 2: Tighten hero headline (`Hero.tsx`)
- `text-5xl sm:text-6xl md:text-7xl lg:text-8xl` → `text-4xl sm:text-5xl md:text-6xl lg:text-7xl`
- Add more breathing room above the eye: `mb-4 md:mb-6` → `mb-8 md:mb-12`

Result: clear hierarchy. Eye = star. Headline = supporting cast.

### Edit 3: Restrain section H2s (`LandingPage.tsx`)
- Section headlines `text-3xl md:text-5xl lg:text-6xl` → `text-3xl md:text-4xl lg:text-5xl`
- Keep them `font-serif font-bold` but smaller — that creates a clear scale: Hero (big) > Sections (medium) > Cards (small).

### Edit 4: Add ONE more orange anchor to "ground" the color
Right now orange appears in 3 places: AYN logo, eye, CTAs. Add a **single subtle orange underline accent** under the active nav link in the header. Just a 2px orange bar under "Home" / "Pricing" etc when active. This makes the navigation feel alive AND ties orange to "where you are" — another piece of identity.

## What I am NOT recommending

- ❌ Removing orange (it's your only differentiator from every other "AI startup")
- ❌ Adding a second accent color (kills the discipline)
- ❌ Changing fonts (Syne + Inter is correct)
- ❌ Changing the layout structure (it's solid)

## Files to change (2)

1. `src/components/landing/Hero.tsx` — calm eye glow + tighten headline
2. `src/components/LandingPage.tsx` — restrain section H2 sizes
3. `src/components/shared/Header.tsx` — add 2px orange underline on active nav link

## The result

Your page will feel **quieter but more confident** — like a luxury watch shop instead of a tech expo. The orange will land like a single perfect note instead of background music. Same color, same brand, but it will breathe.

