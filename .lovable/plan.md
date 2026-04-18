
## Status check

After B1 + B2a + B2b + dead-import sweep, **14 files** still import `@/integrations/supabase/client`. Let me group what's left.

## Remaining 14 files (estimated split)

**Group C1 — Engineering/Compliance (hidden tools, ~7 files)**
- `useClimateZone.ts`, `useComplianceCheck.ts`, `useComplianceProject.ts`
- `EngineeringPageStandalone.tsx`, plus 2-3 more in `components/engineering/compliance/`

These tools are hidden from the frontend (per memory). Two options:
- **(a) Stub them** — return empty arrays / no-ops. Fastest. Code stays for future revival.
- **(b) Migrate properly** — needs 4 spine endpoints (`/engineering/climate-zones`, `/engineering/building-codes`, `/engineering/compliance-projects`).

**Group C2 — World Dashboard / Agent Society (~3 files)**
- Agent Society sim, country intelligence reads from `ayn_country_intelligence` and `ayn_agent_society_*` tables.
- Needs spine endpoints OR direct REST via `supabaseApi.ts` wrapper (already exists, bypasses the JS client).

**Group C3 — Admin client + leftovers (~4 files)**
- `src/admin-app/adminSupabase.ts` — separate admin Supabase client. Keep or kill?
- DevAgentPanel, leftover chart hooks.

## Plan

### Step 1 — Confirm the exact 14 files
Run `grep -rl "@/integrations/supabase/client" src/` and list them so we make zero guesses.

### Step 2 — Engineering: stub strategy
For C1, replace Supabase calls with empty returns + a `// TODO: spine endpoint` comment. The tools are hidden, so no user-facing regression. Keeps the code compilable without blocking on backend work.

### Step 3 — World/Agent Society
Route through existing `supabaseApi.ts` REST wrapper (already in use elsewhere) since spine has no equivalent endpoints yet. No new infra needed.

### Step 4 — Admin client decision
Ask: keep `adminSupabase.ts` as-is (separate auth, isolated), or migrate the admin panel to spine entirely? Admin panel is a large surface — recommend keeping it on Supabase for now and finishing migration in a later phase.

### Step 5 — Final cleanup (deferred to B5)
Once these 14 are gone, delete `src/integrations/supabase/client.ts`, drop `@supabase/supabase-js` from package.json. Skip until admin panel decision is made.

## Decision needed before I execute

Two choices that change the work:

1. **Engineering files**: stub (fast, no backend) vs. proper migration (needs 4 spine endpoints).
2. **Admin panel**: keep `adminSupabase.ts` for now vs. migrate it too (large extra scope).

I'll ask these as a question, then execute.
