

## Premium World Intelligence Redesign

### Vision
Transform the page from a functional dashboard into an elite, Bloomberg/Palantir-grade intelligence terminal with generous spacing, smooth scroll, immersive map, and glass-tier card hierarchy.

### Key Changes

**1. Layout & Spacing Overhaul**
- Increase map height from `clamp(300px, 50vh, 500px)` to `clamp(400px, 60vh, 640px)` — give the map room to breathe as the hero focal point
- Add consistent `gap-8` between sections instead of `gap-5/6`
- Wrap main content in `scroll-smooth` with `overscroll-behavior: contain` for native-feel scrolling
- Add generous padding: `p-6 sm:p-8 lg:p-10` instead of `p-4 sm:p-6`

**2. Premium Card System**
- Replace flat `bg-card border border-border` cards with glassmorphism: `bg-white/[0.03] backdrop-blur-xl border border-white/[0.06]` + subtle inner top highlight
- Add hover lift effects: `hover:-translate-y-0.5 hover:shadow-[0_16px_48px_rgba(0,0,0,0.3)]` with 300ms transitions
- Round up to `rounded-2xl` consistently, larger cards get `rounded-3xl`
- Use `SpotlightCard` from premium.tsx for the Intelligence Brief and Sentiment cards

**3. Section Headers**
- Replace inline icon+text headers with a structured section header component: uppercase tracking-widest label + large Syne display title + muted description
- Add thin separator lines between major sections

**4. Sidebar Polish**
- Add subtle gradient background to sidebar: `bg-gradient-to-b from-card to-background`
- Active item gets a soft glow: `shadow-[0_0_12px_rgba(14,165,233,0.15)]` with AYN blue accent
- Increase sidebar item padding and add icon-only tooltips when collapsed

**5. Ticker Redesign**
- Increase height to `h-11`, add more breathing room between items
- Add subtle glass background: `bg-white/[0.02] backdrop-blur-sm`
- Larger font for values, better color contrast for up/down indicators
- Add thin dividers between ticker items

**6. Signal Cards**
- Severity indicators become left-border accents (4px colored left border) instead of small dots
- Add impact badges as pill chips below headline
- Stagger entrance animations more dramatically

**7. Predictions Section**
- Graph Intelligence cards get the `SpotlightCard` treatment with cursor-following highlight
- Winners/Losers boxes get frosted glass backgrounds with colored top borders
- "Your Move" box gets a subtle border-beam animation to draw attention
- Category filter pills get more padding and smoother active transitions

**8. Countries Grid**
- Cards become taller with more internal spacing
- Add a subtle country flag emoji or region indicator
- GDP/inflation stats get mini progress bars instead of just numbers
- Hover reveals a "View Dossier →" overlay

**9. Country Dossier Panel**
- Width increases to `sm:w-[520px]`
- Add backdrop overlay with blur when panel is open
- Section dividers with subtle gradients
- Stats cards get mini sparkline-style indicators

**10. Mobile Bottom Nav**
- Increase height, add glass background with blur
- Active tab gets a top-edge accent line
- Slightly larger icons (w-5 h-5)

### Technical Details
- Single file edit: `src/pages/WorldIntelligence.tsx`
- Import `SpotlightCard` from `@/components/ui/premium`
- All changes are CSS/styling — no data logic changes
- Preserve all existing data fetching, voting, filtering logic
- Add custom CSS for smooth scroll behavior via inline `<style>` tag

