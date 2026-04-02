

# Admin Panel Production Fix Plan

## Assessment

The admin panel has a **solid architectural foundation**: separate Supabase client, Login → Role check → PIN verification flow via edge function, React.lazy for all 27 tabs, React Query for data fetching, and centralized query keys. The issues are specific and fixable.

## What's Actually Wrong

1. **Performance drag from Framer Motion + backdrop-blur**: `AdminDashboard.tsx` wraps every card in `motion.div` with stagger animations. `AdminSidebar.tsx` uses `motion.div` for collapse animation. Multiple `backdrop-blur-xl` layers on cards force GPU recompositing every frame.

2. **Dashboard overview loads 3 RPC queries on mount regardless of active tab**: `useAdminDashboard()`, `useAdminApplications()`, and `useAdminSystemConfig()` all fire immediately in `AdminPanel.tsx` (lines 92-94), even when user is on a different tab.

3. **AnimatedCounter causes continuous re-renders**: The counter component in `AdminDashboard.tsx` runs `requestAnimationFrame` loops that trigger `setState` on every frame (lines 53-75).

4. **`backdrop-blur-xl` on card elements**: Lines 152 and 186 in `AdminDashboard.tsx` apply heavy blur effects on metric cards and activity cards.

---

## Step 1: Remove Framer Motion from AdminDashboard

**File**: `src/components/admin/AdminDashboard.tsx`

- Remove `motion` import and all `motion.div` wrappers (lines 1, 77-92, 137-142, 148-151, 179, 185, 254, 258, 261)
- Replace with plain `<div>` elements with CSS `animate-fade-in` class for subtle entry
- Replace `AnimatedCounter` with a simple `{value}` render — the counter animation causes frame-by-frame re-renders for no real benefit
- Remove all `backdrop-blur-xl` classes, replace with solid `bg-card`
- Remove radial gradient overlays (line 157) — pure visual noise

## Step 2: Optimize AdminSidebar animation

**File**: `src/components/admin/AdminSidebar.tsx`

- Replace `motion.div` sidebar collapse with CSS `transition-[width]` — Framer Motion is overkill for a width transition
- Remove `framer-motion` import

## Step 3: Defer parent-level queries to active tab

**File**: `src/components/AdminPanel.tsx`

- Move `useAdminDashboard()` call inside `AdminDashboard` component (it's the only consumer)
- Move `useAdminApplications()` inside `ApplicationManagement` (pass query invalidation via callback)
- Keep `useAdminSystemConfig()` in parent only if `SystemSettings` tab needs it from parent; otherwise move it too
- This eliminates 2-3 RPC calls on every admin panel mount

## Step 4: Remove backdrop-blur from header

**File**: `src/components/AdminPanel.tsx` line 193

- Change `bg-background/80 backdrop-blur-sm` to `bg-background` — the header doesn't scroll over content, blur is unnecessary

## Step 5: Verify data flow is working

The React Query hooks in `useAdminQuery.ts` are correctly structured with proper stale times. The data flow relies on Supabase RPC functions (`get_admin_dashboard_stats`, `get_admin_applications`, etc.). If these RPCs exist and return data, the stats will update. No code changes needed in the query layer — it's well built.

- Add error display in `AdminDashboard` when `dashboardQuery.isError` is true (currently silently shows 0s)
- Add loading skeleton when `dashboardQuery.isLoading`

---

## Technical Details

**Files modified**:
- `src/components/admin/AdminDashboard.tsx` — Remove framer-motion, AnimatedCounter, backdrop-blur; add error/loading states; receive data via React Query directly instead of props
- `src/components/admin/AdminSidebar.tsx` — Replace motion.div with CSS transition
- `src/components/AdminPanel.tsx` — Remove parent-level dashboard/applications queries, remove header backdrop-blur

**No database or edge function changes needed.** The security layer (Login → Role check → PIN via edge function) is already properly implemented. The admin route is NOT publicly accessible — it requires authentication + admin role + PIN verification.

