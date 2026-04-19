

The Railway logs reveal two real problems on the backend, plus one frontend symptom. Good news: the boot is clean, all 9 cron jobs are registered, migrations are applied, and the scheduler is alive. Bad news: there's a tight loop hammering Supabase every ~3 seconds with a 406, and one Spine endpoint is missing.

## Issue 1 — Spine is calling Supabase in a 3-second loop (CRITICAL)

Every 3.17 seconds Spine fires:
```
GET https://dfkoxuokfkttjhfjcecx.supabase.co/rest/v1/user_ai_limits?... → 406 Not Accepted
```

This is the opposite of what we wanted. Supabase was supposed to be retired from data path. Something inside Spine (likely the SSE `/sse/user` heartbeat or a `user_ai_limits` polling task spawned per connected user) is still wired to the old Supabase REST endpoint instead of Railway Postgres. The 406 means Supabase is rejecting the request shape (probably stale anon key / missing `Accept: application/vnd.pgrst.object+json` header), so it never succeeds — it just retries forever.

Impact:
- Burns Supabase egress + Railway CPU 24/7
- Keeps Supabase alive (you can't pause it)
- User limits in the UI are coming from `/user/limits` which works (200 OK) — so the loop is unused output, just waste

Fix: find the Spine module still pointing at Supabase for `user_ai_limits` and repoint it at Railway Postgres. Most likely candidates: `services/usage.py`, `routers/sse.py`, or a background task in `core/limits.py`.

## Issue 2 — `/system/config` returns 404 (HIGH)

Frontend `Dashboard.tsx` calls `GET /system/config?keys=maintenance_mode,...` every 60s and gets **404 Not Found**. This means:
- Maintenance mode toggle doesn't work
- Beta mode toggle doesn't work
- Frontend silently falls back to defaults (so it doesn't crash, but admins can't toggle maintenance)

Fix: add a `GET /system/config` endpoint to Spine that reads from a Railway `system_config` table (or whatever holds these keys post-migration) and returns `[{key, value}, ...]`.

## Issue 3 — Frontend console noise

```
warning: Unknown message type: RESET_BLANK_CHECK
```
Comes from `cdn.gpteng.co/lovable.js` — that's the Lovable preview iframe internals, not your code. Ignore.

## Plan

### Step 1 — Read the Spine source to find the Supabase loop

Open these files to locate the `user_ai_limits` call:
- `ayn-backend/routers/sse.py`
- `ayn-backend/services/usage.py` (if exists)
- `ayn-backend/core/limits.py` (if exists)
- `ayn-backend/routers/user.py`

Grep for `user_ai_limits` and `supabase.co` across `ayn-backend/`.

### Step 2 — Repoint that call to Railway Postgres

Replace the Supabase REST call with a direct query against Railway's `user_ai_limits` table (which already exists per migration `005_missing_tables.sql` / `007_data_migration_from_supabase.sql`). Use the existing `db` connection pool.

### Step 3 — Add `GET /system/config` endpoint to Spine

In `ayn-backend/routers/system.py` (create if missing):
```python
@router.get("/system/config")
async def get_system_config(keys: str = ""):
    key_list = [k.strip() for k in keys.split(",") if k.strip()]
    rows = await db.fetch(
        "SELECT key, value FROM system_config WHERE key = ANY($1)",
        key_list
    )
    return [{"key": r["key"], "value": r["value"]} for r in rows]
```

Public endpoint (no auth) since it's just maintenance/beta flags, same as the original Supabase version.

### Step 4 — Verify with one redeploy

After Spine redeploys, confirm in Railway logs:
- ✅ Zero `dfkoxuokfkttjhfjcecx.supabase.co` requests
- ✅ `/system/config` returns 200 instead of 404
- ✅ All 9 cron jobs still alive

### Step 5 — Then (and only then) Supabase can actually be paused

Once the loop is dead and `/system/config` works, Supabase has zero remaining traffic from Spine. You can pause it.

## Out of scope

- The `RESET_BLANK_CHECK` warning — Lovable preview noise, not your code.
- Cron job logic — already working per Step 1 of last session.
- Frontend changes — none needed; both `/user/limits` and `/system/config` are already called correctly from `useUsageTracking` and `Dashboard.tsx`.

## What I need from you

Just say "go" and I'll execute Steps 1–4 in one push (Step 5 is your call afterward). About 30 min of work.

