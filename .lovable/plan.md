

## What's actually in Railway right now (from the live `/intelligence/all` response)

- `world_signals`: 12 rows, all from 2026-04-19, with `title=null, category=null, impact_level=null, affected_regions=null, market_impact=null` but rich `summary`, `countries_involved`, `confidence_impact`, `ancient_parallel`. **The data IS real Gemini output, sourced from real market prices (Gold $4879, Bitcoin $75k, Copper -3.26%, Oil $90, OFAC SDN 18,758 entities). It is NOT dummy.** The writer just doesn't fill the legacy columns the frontend keys off.
- `market_snapshot`: null — pulse-engine never wrote a row, OR write failed
- `world_predictions`: populated (per earlier check)
- `ayn_mind`: populated
- `country_intelligence`: empty — no job writes here
- `market_prices`: unknown, need to check

So "dummy" is the wrong word. The data is real and timely. The dashboard is hiding it because of a column mismatch + 2 jobs not running.

## Why it feels fake

1. Cards filter on `title` → all 12 signals get dropped → "No active signals"
2. Market Sentiment can't render without `market_snapshot` → empty bar
3. Country panel has nothing to render → "No country data"

## Plan (do it for real, not patched)

### Step 1 — Investigate (read-only, 10 min)

Confirm before changing anything:
- Read `ayn-backend/services/intelligence.py` — exact INSERT columns for each job
- Read the frontend signal/snapshot/country card components — exact fields they read
- `psql` row counts on all 8 ayn_* tables + check `pulse-engine` and `world-signals` `last_error` from scheduler
- Confirm whether the signal Gemini prompt CAN produce title/category/impact_level (it should — those are basic fields)

### Step 2 — Fix the writer, not the reader

The right fix is to make Gemini output the missing fields, because:
- `title` (≤80 chars) is what humans scan first
- `category` (geopolitical/macro/commodity/crypto/fx) drives filtering
- `impact_level` (low/medium/high/critical) drives the severity badge color
- `affected_regions` drives the country flags

Patch `world-signals` job in `services/intelligence.py`:
- Add these 4 fields to the Gemini JSON schema prompt
- Add them to the INSERT statement
- Backfill existing 12 rows with a one-shot Gemini call that derives `title`/`category`/`impact_level` from existing `summary` + `confidence_impact`

This way the data stays real (sourced from live prices + OFAC + sanctions), and the dashboard renders it properly.

### Step 3 — Fix `pulse-engine` (Market Snapshot + Fear & Greed)

- Pull its `last_error` from `/admin/scheduler/status`
- If it's a code bug (likely — never written a row), fix it
- If it's a schema bug (singleton_key constraint, missing column), fix the upsert
- Trigger via Cron Control, verify a row lands in `ayn_market_snapshot`

### Step 4 — Add `country-intel` job (real data, not filler)

New job in `services/intelligence.py`:
- Pulls FRED indicators (GDP, CPI, unemployment, policy rate) for top 20 economies
- Pulls GDELT event tone for last 7 days per country
- Writes to `ayn_country_intelligence`: `country_iso3`, `gdp_growth`, `inflation`, `unemployment`, `policy_rate`, `event_tone`, `risk_score`, `summary` (Gemini-derived 2-sentence brief)
- Schedule every 12h
- Trigger once via Cron Control to backfill

### Step 5 — Verify it's real, not dummy

After the above, the user should see:
- 12+ signals, each with a real headline like "Gold surges to $4,879 as central banks abandon USD reserves" (Gemini-derived from actual price action)
- Market Sentiment bar showing actual Fear & Greed value (computed from VIX, put/call ratio, junk bond spreads)
- Country cards for USA, China, Japan, Germany, etc. with real FRED macro numbers
- Every card has a `created_at` timestamp visible so user can see freshness

Each piece traces back to a real source (FRED, GDELT, OFAC, market prices, Gemini reasoning over real inputs). No mocked numbers, no Lorem Ipsum.

## Out of scope

- Adding more sophisticated sentiment models (existing pulse logic is fine once it runs)
- UI polish on signal cards
- Historical backfill beyond what crons produce naturally

## Estimate

~45 min: 20 min code (writer schema + pulse fix + country job), 25 min verifying jobs fire and dashboard renders.

