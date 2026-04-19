

User is on `/world-intelligence` and reports things still missing. Console shows a real error:

```
AccuracyScoreboard.tsx:32 → API error 401: Empty JWT
  at supabaseApi.ts:143
```

This is the smoking gun. There are still legacy components on the World Intelligence page calling **Supabase directly** instead of Spine — violating the "Spine-only backend" core rule. They throw 401 and render empty.

Let me investigate before planning.

## Investigation needed

1. `src/components/dashboard/world/AccuracyScoreboard.tsx` — confirm it calls supabaseApi
2. `grep src/components/dashboard/world/` for other components still importing supabaseApi or @/integrations/supabase
3. `src/pages/WorldIntelligence.tsx` — list every child component rendered, cross-reference which ones are wired to Spine vs. Supabase
4. `ayn-backend/routers/intelligence.py` — confirm what endpoints exist (we already have `/intelligence/all`, but accuracy/calibration/agent-society may need their own)

## Likely root causes

**Cause A — Multiple legacy Supabase calls.** `AccuracyScoreboard` is one; there are probably 3-6 more (AgentSociety panel, calibration chart, prediction resolver feed, master predictions, market-prices ticker). Each throws 401 silently and renders blank.

**Cause B — Some Spine endpoints exist but components don't use them.** `/intelligence/all` already returns `predictions`, `accuracy`, `master_predictions`, `consensus_predictions` aliases — components just need to be re-wired to read from the page-level fetch instead of making their own Supabase calls.

**Cause C — A few sub-features have no Spine endpoint at all** (agent-society messages, prediction resolver history). Need to add those.

## Plan

### Step 1 — Audit (read-only, 5 min)

- Grep `src/components/dashboard/world/` and `src/pages/WorldIntelligence.tsx` for `supabaseApi`, `@/integrations/supabase`, `.from(`
- List every offending component
- For each, identify which Spine endpoint should feed it (existing or new)

### Step 2 — Re-wire components to Spine

Convert each legacy Supabase call to either:
- Read from the parent's `/intelligence/all` payload (preferred — no extra round-trip)
- Or call a dedicated Spine endpoint (`/intelligence/accuracy`, `/intelligence/agent-messages`, `/intelligence/master-predictions`)

Components to fix (confirmed/suspected):
- `AccuracyScoreboard.tsx` → use `accuracy[]` from /intelligence/all (already returned, currently empty array — separate fix)
- `AgentSociety` panel → use `/intelligence/agent-messages`
- Master predictions feed → use `master_predictions[]` from /intelligence/all
- Any market-prices ticker → use `market_prices` from /intelligence/all
- Prediction resolver / accuracy calibration → /intelligence/accuracy

### Step 3 — Populate empty Spine arrays

`/intelligence/all` returns `accuracy: []` hardcoded. Wire it to actually query `ayn_accuracy_calibration`. Same for any other legacy alias returning empty.

### Step 4 — Trigger missing data jobs via Cron Control

Once components stop crashing, fire `pulse-engine` (still missing → market_snapshot null) and verify country-intel job exists. If country-intel job isn't registered yet, add it.

### Step 5 — Verify

Reload `/world-intelligence`:
- No 401s in console
- AccuracyScoreboard renders (or shows clean "no data yet" state)
- Agent Society shows messages
- Market Snapshot card filled
- Country Intelligence populated

## Out of scope

- Visual polish on cards
- Re-architecting World Intelligence layout
- Adding new intelligence sources (FRED expansion etc.)

## Estimate

~40 min: 15 min audit + rewire, 15 min add missing Spine endpoints + populate empty arrays, 10 min verify after Cron Control trigger.

