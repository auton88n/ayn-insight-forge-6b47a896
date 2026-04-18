
## Where we stand

Phase C is done. The only remaining consumer of `@/integrations/supabase/client` is `src/integrations/supabase/client.ts` itself. The admin app still uses its own isolated `src/admin-app/adminSupabase.ts`.

Per your earlier decision ("Migrate admin too"), the final phase is **Phase D: Admin migration + final cleanup**.

## Phase D scope

Admin panel uses `adminSupabase` from `src/admin-app/adminSupabase.ts`. I need to confirm the actual surface before estimating.

Quick estimate (to confirm in step 1):
- ~20-30 admin components reading dashboards, users, logs, applications, tickets, LLM usage, marketing posts, etc.
- Admin auth flow (PIN gate already uses `verify-admin-pin` edge function — auth itself is fine).
- Real-time subscriptions on a few tables (Telegram sync, ticket updates).

## Plan

### Step 1 — Inventory
List every file importing `adminSupabase` and group by concern:
- **Reads** (dashboards, lists, charts) → migrate to `supabaseApi.get()` REST wrapper
- **Writes** (status updates, deletes, config changes) → need spine endpoints OR use REST wrapper with service-role-protected RPCs
- **Realtime subscriptions** → these CANNOT use REST. Must keep a Supabase client OR switch to polling.
- **Auth (sign-in/session)** → already isolated, low risk to keep

### Step 2 — Decide the realtime story
This is the blocker. Options:
- **(a)** Keep `adminSupabase` ONLY for realtime channels, migrate everything else to REST. Smallest risk.
- **(b)** Replace realtime with polling (every 5-10s). Eliminates the SDK entirely but adds load.
- **(c)** Build a server-sent-events spine endpoint. Most work, cleanest end state.

### Step 3 — Migrate in batches
- D1: Read-only dashboards (~10 files)
- D2: Write actions (~10 files)
- D3: Realtime decision applied
- D4: Auth flow (last, since it's the riskiest)

### Step 4 — Final cleanup (only after D1-D4 green)
- Delete `src/integrations/supabase/client.ts`
- Delete `src/admin-app/adminSupabase.ts` (if fully migrated)
- Remove `@supabase/supabase-js` from `package.json`
- Remove `src/integrations/supabase/types.ts` references where dead
- Verify `npm run build` clean

## Decision needed before I start

**Realtime strategy** — this changes the entire shape of the admin migration:

1. Keep `adminSupabase` ONLY for realtime (pragmatic, ships fast, ~5% SDK surface remains)
2. Replace realtime with polling (full SDK removal, slight UX latency)
3. Build SSE spine endpoint (cleanest, most backend work)

Recommend **option 1**: it gets you 95% of the way (no main app SDK, isolated admin-only realtime client) without backend changes. Final cleanup then drops the main `client.ts` and keeps only the slim admin realtime client.

I'll ask this as a question, then start D1.
