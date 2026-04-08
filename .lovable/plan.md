

# Premium Visual Upgrade — GlinUI-Inspired Design System for AYN

## What GlinUI Does Well (and AYN Can Adopt)

GlinUI's standout quality is its **glass physics system** — layered blur, refraction borders (brighter top edge), luminance-aware surfaces, and smooth motion presets. AYN already has a `premium.tsx` file with GlinUI-inspired components (SpotlightCard, GlassCard, BorderBeam, etc.) but they are **only used on the World Intelligence page**. The rest of the app — landing page, header, footer, dashboard cards, feature cards — uses plain shadcn/ui defaults.

The upgrade focuses on **six high-impact areas** without changing AYN's monochrome brand identity.

---

## Plan

### 1. Glass Navigation Bar
**File:** `src/components/shared/Header.tsx`

Replace the current `bg-background/80 backdrop-blur-xl` with a proper glass surface:
- Increase backdrop saturation (`saturate(180%) blur(20px)`)
- Add a faint top-edge refraction border (`border-b border-white/[0.08]` in dark, `border-black/[0.06]` in light)
- Add a subtle bottom shadow (`shadow-[0_1px_3px_rgba(0,0,0,0.08)]`)
- Make the "Get Started Free" CTA a `ShimmerButton` with shimmer-on-hover

### 2. Hero Section — Liquid Glass Eye Container
**File:** `src/components/landing/Hero.tsx`

- Wrap the eye circle in a `GlassCard` surface with `blur="lg"` instead of plain `bg-card`
- Add a soft `BorderBeam` orbiting the eye circle (monochrome white, 8s duration)
- Add a subtle radial gradient glow behind the eye that pulses slowly (using existing `pulse-glow` keyframe)
- Make the headline use a subtle text gradient shimmer on load (pure CSS, white-to-gray sweep)

### 3. Feature Cards — SpotlightCard + Glass Surface
**File:** `src/components/LandingPage.tsx`

The three feature cards (Business, Market, Predictions) currently use plain `bg-card` with a basic shadow. Upgrade:
- Wrap each in `SpotlightCard` so a radial light follows the cursor
- Apply glass border physics: faint top-edge refraction, subtle inner shadow
- Keep the existing hover lift (`whileHover={{ y: -4 }}`) but add a `transition: box-shadow 0.5s` for smoother shadow transitions

### 4. Value Prop Icons — Glass Surface Circles
**File:** `src/components/LandingPage.tsx`

The six "About AYN" icons (Brain, Sparkles, Shield, etc.) sit in plain `bg-muted/50` circles. Upgrade:
- Apply glass background (`bg-white/[0.06] backdrop-blur-sm border border-white/[0.08]`)
- Add a subtle inner glow on hover

### 5. Dashboard Cards — GlassCard Upgrade
**File:** `src/components/ui/card.tsx`

The base `Card` component is used across the entire dashboard. Add an optional `glass` variant:
- Add a `variant` prop: `default` (current) and `glass` (GlassCard physics)
- Glass variant applies: backdrop-blur, saturation boost, refraction top border, refined shadow
- This automatically upgrades every dashboard card that opts in without touching each usage

### 6. Footer — Refined Glass Border
**File:** `src/components/shared/Footer.tsx`

- Replace `border-t border-border/50` with a glass-style separator: gradient line from transparent -> white/10 -> transparent
- Add subtle backdrop blur to footer background

### 7. CSS Token Additions
**File:** `src/index.css`

Add glass surface tokens to both light and dark themes:
```css
--glass-surface-light: rgba(255,255,255,0.06);
--glass-surface-dark: rgba(255,255,255,0.04);
--glass-border-top: rgba(255,255,255,0.14);
--glass-border-side: rgba(255,255,255,0.08);
```

Add a utility class `.glass-surface` that combines blur + saturation + surface + border in one class for easy reuse.

---

## What Does NOT Change
- Color palette (monochrome black/white stays)
- Typography (Inter + Syne stays)
- Layout structure
- Existing premium.tsx components (they stay, just get used more)
- World Intelligence page (already using premium components)

## Summary of Files Changed
| File | Change |
|------|--------|
| `src/index.css` | Glass surface CSS tokens + utility class |
| `src/components/ui/card.tsx` | Add `glass` variant prop |
| `src/components/shared/Header.tsx` | Glass nav bar + shimmer CTA |
| `src/components/landing/Hero.tsx` | Glass eye container + border beam + gradient text |
| `src/components/LandingPage.tsx` | SpotlightCard feature cards + glass icon circles |
| `src/components/shared/Footer.tsx` | Gradient separator + subtle blur |

