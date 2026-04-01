

# Fix Build Errors + Admin Panel Review

## Current State

The admin panel (`AdminPanel.tsx`) is already well-structured — lazy loading, React Query caching, sidebar navigation, error boundaries, and skeleton fallbacks are all in place. No architectural issues found there.

The **only blockers** are 4 TypeScript build errors in the World Intelligence files. Everything else compiles and runs.

---

## Step 1: Fix `WorldSimulator.tsx` — line 122-124

**Error**: `data[0].id` — TypeScript can't infer types for `ayn_world_simulations` (not in generated types).

**Fix**: Cast `data` to `any[]` immediately after the query:
```typescript
const results = (data || []) as any[];
if (results.length) {
  setSimulations(results);
  setActiveSimId(results[0].id);
}
```

---

## Step 2: Fix `WorldIntelligence.tsx` — lines 78, 139 (remove `speed`)

**Error**: `speed` does not exist on `MapPoint`.

**Fix**: Delete line 78 (`speed: i.speed,`) and line 139 (`speed: i.speed_knots ?? i.speed,`).

---

## Step 3: Fix `WorldIntelligence.tsx` — line 373 (calibration data)

**Error**: `c.asset` fails because the query result type is `SelectQueryError`.

**Fix**: Cast the array:
```typescript
for (const c of (calibData || []) as any[]) calibMap[c.asset] = c;
```

---

## Step 4: Fix `WorldIntelligence.tsx` — line 153 (`generated_by` type)

**Error**: `generated_by` returns `string | null` from DB but interface only accepts `string | undefined`.

**Fix**: Change line 153 in the `Prediction` interface:
```typescript
generated_by?: string | null;
```

---

## Files Modified
- `src/components/dashboard/world/WorldSimulator.tsx` — 1 change (cast data to `any[]`)
- `src/pages/WorldIntelligence.tsx` — 4 changes (remove `speed` x2, cast calibData, fix `generated_by` type)

## Admin Panel Assessment
The admin panel code is solid — already uses lazy loading for all 27 tabs, React Query for data fetching, proper error boundaries, and skeleton loading states. No changes needed there.

