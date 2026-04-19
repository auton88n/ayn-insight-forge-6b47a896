

Yes — Python, on Railway, via the existing Spine. No Supabase edge functions, no new infra.

## Why Python (not edge functions)

The Spine already runs Python (FastAPI + APScheduler) on Railway. The cron jobs are just Python functions in `services/intelligence.py` that fire on a schedule. Claude already wired the AI plumbing — the `_ai()` helper now calls `core/llm.py` which routes to Lovable AI Gateway (key stays in Supabase) with Gemini direct as fallback.

So: **same language, same process, same database**. I just need to fill in the 5 cron functions that are still stubs.

## What runs where

```text
Railway (Python)                    Supabase (only holds the key)
─────────────────                   ──────────────────────────────
APScheduler ticks every 4-6h
  └─ services/intelligence.py
       └─ _ai() helper
            └─ core/llm.py lovable() ──► ayn-ai-proxy edge fn
                                              │ (uses LOVABLE_API_KEY)
                                              ▼
                                         Lovable AI Gateway → Gemini
            └─ on failure: gemini() ────► Gemini direct (GEMINI_API_KEY on Railway)
       └─ writes results ──► Railway Postgres (ayn_world_signals, etc.)
```

No new env vars. No edge functions to deploy. Just Python.

## The 5 stubs to port

All in `ayn-backend/services/intelligence.py`:

1. `run_world_intelligence` — pulls market snapshot + signals → Gemini → writes `ayn_mind` (world brief)
2. `run_world_signals` — fetches GDELT + Firecrawl headlines → Gemini classifies → writes `ayn_world_signals`
3. `run_prediction_engine` — reads last 7d of signals → Gemini predicts → writes `ayn_world_predictions`
4. `run_prediction_resolver` — checks matured predictions vs reality → marks hit/miss → writes `ayn_prediction_outcomes`
5. `run_agent_society_trigger` — multi-agent sim (80 personas) → writes `ayn_agent_messages`

Each one is ~50-100 lines of Python. Same logic as the original Supabase edge functions, just translated.

## Plan

**Step 1** — Read the 5 original Supabase edge functions in `supabase/functions/` to copy their exact logic (prompts, API calls, output schema).

**Step 2** — Port each to Python in `services/intelligence.py`. Each uses the existing `_ai()` helper and writes to Railway via the existing `db` connection.

**Step 3** — Add 2 small admin endpoints to Spine:
- `GET /admin/scheduler/status` — last-run / next-run / last-error per job
- `POST /admin/scheduler/run/{job_id}` — manual trigger so you can backfill the dashboard immediately instead of waiting 6 hours

**Step 4** — Give you the SQL to disable the now-redundant Supabase pg_cron jobs (so they stop double-running and burning credits).

**Step 5** — Manually trigger each job once after deploy → World Intelligence dashboard fills with fresh data within minutes.

## Out of scope

- Frontend — already wired correctly to `/intelligence/all`, no UI changes needed.
- New env vars — none required, the proxy chain Claude built handles it.

## What I need from you

Just say "go" and I'll execute Steps 1-5 in one push. About 60 min of work.

