

User is on `/world-intelligence` and every section is empty: Intelligence Brief says "populates on next data sweep", Signals shows "No active signals", AYN Predictions shows 0, Market Forecasts shows "No predictions for this filter", Country Intelligence shows "No country data available". Plus Fear & Greed bar is empty and Market Sentiment label is red.

This is the predictable consequence of the migration: the cron jobs are registered in Spine but haven't fired yet (they're on 4-6h schedules), and the historical Supabase data was never migrated to Railway Postgres. So Railway tables are empty → frontend shows empty states.

Let me verify before planning fixes.

## Investigation needed

Read these in parallel:
1. `ayn-backend/services/intelligence.py` — confirm jobs write to the right tables
2. `ayn-backend/main.py` — confirm scheduler intervals + admin endpoints
3. `ayn-backend/routers/intelligence.py` — confirm `/intelligence/all` queries match table names actually being written
4. `src/pages/WorldIntelligence.tsx` (or equivalent) — confirm frontend expects the data shape Spine returns
5. Check for an admin scheduler endpoint to manually trigger jobs

I'll also check via psql if the Railway intelligence tables have any rows.

## Root causes (high confidence based on context)

**Cause 1 — Tables are empty.** Spine cron jobs run every 2-6h. The Spine container only booted ~20 min ago per logs. None have fired yet. There's also no historical data because the Supabase → Railway migration script for intelligence data was never run.

**Cause 2 — Possible field/table name drift.** `routers/intelligence.py` queries `ayn_market_snapshot`, `ayn_world_signals`, `ayn_world_predictions`, `ayn_mind`, `ayn_opportunity_alerts`, `ayn_market_prices`, `ayn_predictions`, `ayn_country_intelligence`. If `services/intelligence.py` writes to slightly different table/column names, the dashboard will stay empty even after crons fire.

**Cause 3 — Market Sentiment / Fear & Greed.** This card likely reads `ayn_market_snapshot.snapshot.sentiment.fear_greed_index`. If `pulse-engine` hasn't run, the card renders an empty bar with a red placeholder.

## Plan

### Step 1 — Investigate (read-only, 5 min)

- Read `ayn-backend/services/intelligence.py`, `services/predictions.py`, `services/pulse.py` (whatever holds the cron job bodies) → list every table + column they write
- Read `ayn-backend/routers/intelligence.py` → list every table + column the dashboard reads
- Diff the two lists → flag any drift
- Query Railway Postgres row counts for all 8 intelligence tables to confirm "empty" theory
- Check if `/admin/scheduler/run/{job_id}` endpoint exists

### Step 2 — Fix any table/column drift (if found)

If a job writes to `ayn_signals` but dashboard reads `ayn_world_signals`, fix one side. Same for column names like `headline` vs `title`, `severity` vs `level`, etc.

### Step 3 — Add a one-shot backfill endpoint

If `/admin/scheduler/run/{job_id}` doesn't exist yet, add it to `ayn-backend/routers/admin.py`:
```python
POST /admin/scheduler/run/{job_id}
```
Calls the underlying job function directly (not through APScheduler) so we get instant execution + error visibility.

### Step 4 — Fire all 5 intelligence jobs immediately

After deploy, hit:
- `POST /admin/scheduler/run/pulse-engine` → fills Market Sentiment + Fear & Greed
- `POST /admin/scheduler/run/world-intel` → fills Intelligence Brief + AYN Mind
- `POST /admin/scheduler/run/world-signals` → fills Live World Signals
- `POST /admin/scheduler/run/predictions-daily` → fills AYN Predictions + Price Predictions
- `POST /admin/scheduler/run/agent-society` → fills Agents tab
- Add a `country-intel` job if missing → fills Country Intelligence

Each call will take 30-90s (LLM-heavy). I'll run them sequentially and verify row counts after each.

### Step 5 — Add a "Refresh Now" admin button (optional polish)

In the admin panel, add 6 buttons (one per job) that POST to the scheduler endpoint, so you can re-fire data without waiting 4h. Useful when you redeploy or want fresh signals for a demo.

### Step 6 — Verify on /world-intelligence

After backfill, the dashboard should show:
- Intelligence Brief: real summary
- Market Sentiment: colored bar with Fear & Greed value
- US Macro: Fed rate, CPI, unemployment
- Live World Signals: 5-15 cards
- AYN Predictions: 8-15 graph predictions
- Price Predictions: 8 assets × 3 horizons = 24 cards
- Country Intelligence: 10-20 country cards

## Out of scope

- Re-architecting the cron schedule (4h cadence is correct for production)
- Re-running the Supabase → Railway historical migration (not needed; live data will accumulate fast once jobs fire)
- Cosmetic empty-state polish

## What I need from you

Just say "go". Estimated 60 min total: 10 min code, 50 min waiting for the 5 LLM-heavy jobs to populate the dashboard.

