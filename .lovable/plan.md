

## What Claude is asking for

Replace every `@/lib/supabaseApi` import with either `adminApi` (admin pages) or `spineApi` (user pages) so no frontend code touches the legacy `supabaseApi` shim — then delete that shim file entirely.

## Current state (what I already verified)

I previously rewrote `supabaseApi.ts` to proxy through `${SPINE}/admin/db/...` instead of hitting Supabase REST. So technically zero frontend code touches Supabase directly anymore — Claude's stated goal ("zero frontend code touches Supabase directly") is already met.

**However**, Claude's deeper point is still valid:
1. The shim is dead weight — same code path as `adminApi.from()`.
2. It always uses the **admin token**, which means the user-facing call sites (Engineering tools, PredictionGraph) only work for admins. If a normal user ever opens `/engineering`, those calls silently 401.
3. Two source-of-truths for "how to talk to spine" is a maintenance trap.

So the cleanup is worth doing.

## Files to migrate

Per Claude's list + my earlier search:

**Admin-only callers → `adminApi`**
- `src/components/admin/AYNActivityLog.tsx`
- `src/components/admin/AYNMindDashboard.tsx`
- `src/components/admin/ApplicationManagement.tsx`
- `src/components/admin/SupportManagement.tsx`
- `src/components/admin/CommandCenterPanel.tsx`

**User-facing callers → `spineApi`** (need user JWT, not admin token)
- `src/hooks/usePredictionGraph.ts`
- `src/hooks/useEngineeringHistory.ts`
- `src/hooks/useEngineeringAIAgent.ts`
- `src/components/engineering/EngineeringPortfolio.tsx`
- `src/components/engineering/SaveDesignDialog.tsx` (also imports it)

(Per memory: Engineering/Compliance tools are hidden from frontend nav but kept in codebase, currently admin/internal only — so `adminApi` would also work for these. I'll use `spineApi` to future-proof them in case they're ever re-exposed to users, falling back to admin token automatically since `spineApi` reads from the user token store.)

## Migration mapping

```
supabaseApi.get(`table?filter=eq.x&order=...`, token)
  → adminApi.from('table').select('*').eq('filter', 'x').order(...).execute()

supabaseApi.post('table', token, { ...row })
  → adminApi.from('table').insert([{ ...row }])

supabaseApi.patch(`table?id=eq.X`, token, { ...patch })
  → adminApi.from('table').update({ ...patch }).eq('id', 'X')

supabaseApi.delete(`table?id=eq.X`)
  → adminApi.from('table').delete().eq('id', 'X')

supabaseApi.rpc('fn_name', token, params)
  → adminApi.rpc('fn_name', params)
```

For the user-facing files I'll first verify `spineApi` exposes the same `from()` builder; if it only supports specific endpoints, I'll keep `adminApi` for now (admin tools work either way per current scope) and note the limitation.

## Steps

1. Open `src/lib/spineApi.ts` and `src/lib/adminApi.ts` to confirm the exact builder API for each.
2. Migrate the 5 admin components → `adminApi.from()`.
3. Migrate the 5 engineering/graph files → `adminApi.from()` (since these are admin-gated per current product scope; revisit if exposed to users).
4. Delete `src/lib/supabaseApi.ts`.
5. Run a final grep for `@/lib/supabaseApi` to confirm zero references.
6. Update memory: remove `mem://architecture/direct-rest-api-wrapper` (no longer accurate).

## Verification

- TypeScript build succeeds (no broken imports).
- Reload `/manage-bae76e99d97e188b` and walk every admin tab — same behavior as before (200s).
- Open `/engineering` (as admin) — calculation history loads, save works.
- Network panel: every request still hits `spine.aynn.io/admin/db/...` (no change in wire traffic, just one less indirection in code).

## Out of scope

- Refactoring `adminApi.from()` builder itself.
- Adding user-facing routes for engineering tools.
- Any backend/spine changes.

## Estimate

~20 min: 5 min verify builder APIs, 10 min mechanical migration across 10 files, 5 min delete shim + verify build.

