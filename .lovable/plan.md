

## Make the Dashboard EmotionalEye Match the Landing Page Eye Design

The landing page Hero eye has concentric rings creating a layered "tunnel" depth effect, while the dashboard's EmotionalEye uses a flat gradient background. You want them to look the same.

### What Changes

**File: `src/components/eye/EmotionalEye.tsx`**

Replace the current simple background container (the `rounded-full bg-gradient-to-b from-white to-neutral-100 dark:from-neutral-900 dark:to-neutral-950` div around line 440-452) with concentric ring layers matching the Hero design:

- Add the same layered ring structure from the Hero: outer ring with inner shadow, then rings at `inset-[8%]`, `inset-[16%]`, `inset-[24%]`, and `inset-[32%]` with progressively deeper background shades
- Keep the existing emotional color ring (`inset-[15%]`) — it will sit on top of the concentric rings, blending the emotional glow with the depth effect
- Keep all existing SVG/Brain icon, animation logic, particles, breathing, and gaze tracking unchanged
- Adapt the ring colors so they work in both light and dark mode, matching the Hero's approach (`bg-[hsl(var(--muted)/0.3)]` through to `bg-muted`)

This is a visual-only change to the container layers — no behavioral or animation logic is modified.

### Technical Detail

In `EmotionalEye.tsx` around lines 440-454, the current structure is:
```
<div className="relative rounded-full bg-gradient-to-b from-white to-neutral-100 dark:from-... flex items-center justify-center overflow-hidden">
  <div className="absolute inset-2 rounded-full shadow-[inset_...]" />  <!-- inner shadow -->
  <motion.div className="absolute inset-[15%] ..." />  <!-- emotional color ring -->
  <motion.svg ... />  <!-- pupil + brain -->
</div>
```

It will become:
```
<div className="relative rounded-full flex items-center justify-center overflow-hidden">
  <!-- Concentric rings (same as Hero) -->
  <div className="absolute inset-0 rounded-full bg-[hsl(var(--muted)/0.3)] shadow-[inset_0_4px_24px_rgba(0,0,0,0.15)] dark:bg-[hsl(0,0%,12%)] ..." />
  <div className="absolute inset-[8%] rounded-full bg-[hsl(var(--muted)/0.5)] dark:bg-[hsl(0,0%,14%)]" />
  <div className="absolute inset-[16%] rounded-full bg-[hsl(var(--muted)/0.7)] dark:bg-[hsl(0,0%,16%)]" />
  <div className="absolute inset-[24%] rounded-full bg-card shadow-[inset_0_4px_16px_rgba(0,0,0,0.06)] ..." />
  <div className="absolute inset-[32%] rounded-full bg-muted" />
  <!-- Emotional color ring (kept) -->
  <motion.div className="absolute inset-[15%] ..." />
  <!-- SVG pupil + brain (unchanged) -->
  <motion.svg ... />
</div>
```

