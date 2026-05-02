## Fix: Apple-style scroll-driven helmet animation

### What's wrong today

`src/components/landing/HelmetHero.tsx` currently renders **two stacked image-sequence layers** inside the hero at the same time:

1. A "brain" layer that starts visible (`src={TRANSITION_FRAMES[0]}`).
2. A "helmet" layer in the same absolute container that begins to fade in around 33% scroll.

It also uses a 3-phase scrub (brain → helmet assemble → features → CTA) over a `3600vh` spacer. Visually this reads as "two different visuals opening in the hero," not one continuous product reveal. The hero never just shows the assembled helmet on its own, and the transition is brain→assembled rather than the requested **assembled → exploded** scroll reveal.

The asset files are frame sequences (not `<video>`s), but the requested architecture is identical — `currentTime` becomes "current frame index," driven by scroll progress.

### Target behavior

```text
[ HeroIntro (100dvh, normal scroll) ]
   - Headline + subcopy + LandingChatInput
   - ONE visual: assembled helmet, centered, static

[ ScrollAnimationSection (~300vh, sticky inner) ]
   - Sticky pinned canvas/img shows the helmet
   - Scroll progress 0 → 1 scrubs assembled → exploded
   - Section copy ("World Intelligence", feature blurbs) reveals
     in a side column as progress advances

[ RestOfPage (normal flow) ]
   - About / features / footer continue as today
```

No second visual ever appears in the hero. The helmet image element is rendered exactly once.

### Implementation plan

1. **Split `HelmetHero` into two siblings in `LandingPage.tsx`:**
   - `<HeroIntro />` — replaces the current first 100dvh of `HelmetHero`. Renders headline, subcopy, the `LandingChatInput`, and a single static `<img>` of the **assembled** helmet (`HELMET_FRAMES[FRAME_COUNT - 1]`). No scroll logic. Height `100dvh`.
   - `<HelmetScrollReveal />` — a new sticky scrub section. Outer wrapper `height: 300vh` (clamped to `200vh` on mobile). Inner `position: sticky; top: 0; height: 100dvh` with the single helmet `<img>` whose `src` is updated by the scroll RAF loop.

2. **Single image element, frame-scrubbed by scroll** (in `HelmetScrollReveal`):
   - Preload all `HELMET_FRAMES` once via `new Image()` into a ref array.
   - `onScroll` (passive) writes the latest progress (0..1) into a ref.
   - One `requestAnimationFrame` loop reads the ref, computes `idx = round((1 - p) * (FRAME_COUNT - 1))` so progress 0 = assembled (last frame) and progress 1 = exploded (frame 0), and assigns `imgRef.current.src` only when `idx` changes.
   - Pause the RAF loop on `document.visibilitychange` hidden (battery/CPU).
   - Cleanup scroll listener and `cancelAnimationFrame` on unmount.

3. **Reveal copy alongside the scrub** (inside `HelmetScrollReveal`'s sticky child):
   - A right-column stack of 3 short feature blurbs (World Intelligence / Market Signals / AI Agents) using the existing `FEATURES` text. Each blurb's opacity/translateY is driven from the same scroll progress with non-overlapping windows (e.g. 0.10–0.35, 0.40–0.65, 0.70–0.95). No framer-motion needed; plain inline `style` to stay cheap.
   - Mobile: stack copy below the helmet, smaller type, single column.

4. **Remove the brain phase entirely.** `TRANSITION_FRAMES` and the brain `<img>` are no longer rendered in the hero. (Keep the asset file in place; just stop importing it from this component. Safe to delete the import.)

5. **Reduced motion + perf:**
   - At top of `HelmetScrollReveal`, check `window.matchMedia('(prefers-reduced-motion: reduce)').matches`. If true, render only a static assembled helmet image and skip the sticky scrub entirely (collapse outer height to `auto`).
   - Cap DPR-related work by relying on plain `<img>` (browser handles); no canvas needed.
   - Lazy-mount `HelmetScrollReveal` via the existing `LazyLoad` component used elsewhere in the landing page so frame preloads don't block hero paint.

6. **Wire-up in `src/components/LandingPage.tsx`:**
   - Replace `<HelmetHero />` with:
     ```tsx
     <HeroIntro />
     <LazyLoad debugLabel="HelmetScrollReveal" minHeight="100dvh">
       <HelmetScrollReveal />
     </LazyLoad>
     ```
   - Keep the rest of the page (`#about`, value props, footer) unchanged.

7. **File changes:**
   - **New:** `src/components/landing/HeroIntro.tsx` — static hero (headline, subcopy, single assembled helmet, `LandingChatInput`).
   - **New:** `src/components/landing/HelmetScrollReveal.tsx` — sticky scroll-scrubbed helmet + side copy.
   - **Edit:** `src/components/LandingPage.tsx` — swap `HelmetHero` for the two new components.
   - **Delete:** `src/components/landing/HelmetHero.tsx` (no other importers — confirmed via ripgrep).
   - **Untouched:** `src/assets/helmet-frames.ts`, `transition-frames.ts`, `Hero.tsx` (legacy, not used on `/`), the rest of the landing page.

### Acceptance checks

- Hero shows exactly one visual on load: the assembled helmet. No brain. No second stacked image.
- Scrolling past the hero pins a single helmet that smoothly disassembles into the exploded view, then unpins and the page continues.
- No layout jump between hero and scroll section (sticky inner is `100dvh`, matching hero).
- `prefers-reduced-motion: reduce` → static assembled helmet, no pin, no scrub.
- Mobile (≤768px) keeps a shorter pin (`200vh`) and stacks copy under the helmet.
- No console errors; scroll listener and RAF are cleaned up on unmount.
