## Goal
Fix the "page not found" when going back from `/world-intelligence` (the "Sphere" / World Simulator), and remove the inter-page lag/loader flashes — without touching any feature behavior.

## Findings

**1. "Page not found" when going back to dashboard (root cause)**
In `src/pages/WorldIntelligence.tsx` line 38 the back-arrow does:
```
navigate('/dashboard')
```
But `/dashboard` is **not registered** in `src/App.tsx`. The dashboard is rendered at `/` (via `Index.tsx`, which mounts `<Dashboard>` when a session exists). So router falls through to `<Route path="*" element={NotFound}/>`. That's the 404 you see.

There is exactly one offender (verified with ripgrep) — only this one button is broken. Other in-app links to the dashboard already use `/`.

**2. Lag / "loading for a while" / having to refresh between pages**
Three independent contributors:

a. `AnimatePresence mode="wait"` in `App.tsx` makes React Router wait for the *outgoing* page's exit animation before mounting the new one. But `PageTransition` was already stripped down to a plain `<div>` (no animation). So we pay the wait with zero visual benefit — every navigation feels delayed by one frame batch + a Suspense fallback flash.

b. Almost every route is `lazy(...)` but only 5 are preloaded after 2s (`PreloadRoutes` in `App.tsx`). First click on any other route triggers a network fetch + the `<PageLoader />` flash ("Loading…" with brain). That's the "loading for a while" you described.

c. `/` is `<Index>` which conditionally mounts `<Dashboard>` only after `supabase.auth.getSession()` resolves. Every time you return from `/world-intelligence` → `/`, `Dashboard` and all its children (sidebar, query subscriptions, realtime channel, maintenance config fetch) **fully unmount and remount**, replaying their loaders. That's why a refresh "fixes" it visually — it's the same cold-start either way.

## Changes (no feature changes, no UI changes)

### A. Fix the broken back navigation
- `src/pages/WorldIntelligence.tsx`: change `navigate('/dashboard')` → `navigate('/')`. One-line fix.
- Add a guard in `App.tsx`: register `/dashboard` as `<Navigate to="/" replace />` so any future stray link (or external bookmark) lands on the real dashboard instead of 404.

### B. Remove the wasted page-transition wait
Since `PageTransition` is already a no-op div, drop the `AnimatePresence mode="wait"` wrapper in `AnimatedRoutes` and the `<PageTransition>` wrappers around routes. Render `<Routes>` directly. Net effect: navigations commit immediately; no animation is removed because there isn't one.
- File: `src/App.tsx` (only `AnimatedRoutes`).
- `PageTransition.tsx` and the `framer-motion`/`AnimatePresence` import stay (used elsewhere, e.g. the agent chat drawer).

### C. Cut the Suspense flash on common navigations
Expand `PreloadRoutes` in `App.tsx` to also warm:
`Services`, services subpages (`AIAgents`, `Automation`, `Ticketing`, `AIEmployee`), `Contact`, `Terms`, `Privacy`, `SubscriptionSuccess`, `SubscriptionCanceled`, `ResetPassword`. Still done after 2s on idle, so first paint stays fast. This eliminates the "Loading…" brain flash on the routes you actually use.

### D. Stop re-mounting the Dashboard on every return-to-root
In `src/pages/Index.tsx`:
- Cache the resolved auth result in module scope so a re-mount of `<Index>` after navigating back doesn't restart the `getSession()` promise from zero (no UX flicker).
- Keep behavior identical for signed-out users (still see landing page) and for signed-in users (still see Dashboard) — only the loading flash on return navigation goes away.

In `src/components/Dashboard.tsx`:
- The `system_config` fetch + realtime subscription currently run on *every* mount. Move the realtime channel subscription out so it survives within the session (lift to module-level singleton or to `App.tsx` where session lives). If lifting is too invasive, at minimum gate the fetch with `sessionStorage` so the second mount uses cached config and skips the network round-trip.

### E. Sanity sweep
- `rg -n "navigate\(['\"]\/dashboard"` to confirm no other broken targets after the fix.
- Verify there are no `<Link to="/dashboard">` or `href="/dashboard"` anywhere (already checked: none).

## What is explicitly NOT changing
- No feature logic changes (auth, chat, simulator, admin, billing untouched).
- No visual redesign. Same fonts, same colors, same layout.
- No removal of routes or pages.
- No router type swap (still `BrowserRouter`).
- World Simulator engine behavior and `engine.aynn.io` wiring are untouched.

## Files to edit
1. `src/pages/WorldIntelligence.tsx` — fix back nav target.
2. `src/App.tsx` — add `/dashboard` redirect, drop `AnimatePresence`/`PageTransition` wrappers from routes, expand `PreloadRoutes` list.
3. `src/pages/Index.tsx` — cache initial auth resolution to avoid re-mount flash.
4. `src/components/Dashboard.tsx` — cache `system_config` per-session, dedupe realtime subscription on remount.

## Expected result
- Back arrow on World Simulator returns to the dashboard, not 404.
- No more `<PageLoader>` brain flash when moving between previously-visited pages.
- Returning to the dashboard from another route is instant (no "Loading Dashboard…" flicker), no manual refresh needed.
- Zero behavioral changes to any feature.