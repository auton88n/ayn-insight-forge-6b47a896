

# Redesign Agent Society — Better Design, Mobile/Tablet Support, Auto-Activate

## Problem
1. The current layout is desktop-only (side-by-side globe + panel), broken on mobile/tablet
2. The 3D globe doesn't render on mobile (blocked by `MobileBlockScreen`)
3. Users must manually click "Activate" — no auto-generation on first load
4. Text is extremely small (7-9px), low contrast, hard to read
5. Inline styles everywhere make it hard to maintain

## Design Direction
CIA operations center aesthetic (matching the rest of World Intelligence), with cleaner typography, better spacing, and a stacked layout for smaller screens.

## Plan

### 1. Auto-activate on first load
- In the `loadData` callback, if `conversations` comes back empty, automatically call `generate()` — no manual "Activate" button needed
- Show a premium loading state during first generation ("INITIALIZING AGENT NETWORK...")

### 2. Responsive layout — mobile & tablet support
- **Mobile (<768px)**: Hide the 3D globe entirely. Show a compact agent grid + conversation feed in a single column. Use a bottom sheet for agent chat
- **Tablet (768-1024px)**: Show a smaller globe (40% width) + panel, or allow toggling between globe view and conversation view via tabs
- **Desktop (1024+)**: Keep current side-by-side layout but with better proportions
- Replace `grid-cols-1 lg:grid-cols-[1fr_400px]` with proper responsive breakpoints
- Remove the `MobileBlockScreen` dependency for this component

### 3. Improve typography and readability
- Increase base font sizes: agent names 12→14px, messages 10.5→13px, labels 7-8→10px
- Use `font-mono` (JetBrains Mono) consistently for the CIA feel
- Improve contrast ratios — text opacity from 0.2-0.3 → 0.5-0.7 minimum
- Add proper spacing between message bubbles

### 4. Better visual hierarchy and design polish
- Add a status bar at top showing: Active Agents count, Tension Level gauge, Panic alerts
- Redesign category filter pills — larger touch targets (min 40px height for mobile)
- Message bubbles: increase padding, add left accent border by agent category color
- Agent cards: increase height, show flag emoji larger, better emotion intensity bars
- God's Eye input: make it a proper modal on mobile instead of inline
- Conversation tabs: larger, scrollable horizontally with clear active state

### 5. Mobile-specific optimizations
- Agent list becomes a horizontally scrollable avatar strip on mobile
- Tap agent avatar to filter messages + show detail card
- Swipe-friendly conversation navigation
- Full-screen chat modal on mobile (already partly done)

## Files to Edit
- `src/components/dashboard/world/AgentSociety.tsx` — main redesign (layout, typography, responsiveness, auto-activate)

## Technical Notes
- Use Tailwind responsive prefixes (`sm:`, `md:`, `lg:`) instead of inline styles where possible
- Use `useIsMobile()` hook for conditional rendering (globe vs no-globe)
- Keep 3D globe code intact but conditionally render only on lg+ screens
- Auto-activate triggers once via a `useRef` flag to prevent repeated calls

