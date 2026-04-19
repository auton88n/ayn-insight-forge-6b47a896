

Claude confirmed cutover is done. Two remaining items, both small:

1. **Remove `@supabase/supabase-js` from `package.json`** — Lovable can't directly edit `package.json` (it's managed), so I need to use the dependency removal flow. In default mode I can use the package manager tool to drop it.

2. **The intelligence data migration script** (`railway run python scripts/migrate_intelligence_data.py`) — that's a CLI command Claude needs to run from his Railway terminal, not something I execute from the frontend project. Just acknowledge.

Let me verify zero `supabase-js` imports remain in `src/` before pulling the dep, so we don't break the build.

## Plan: Final Supabase removal

### Step 1 — Verify zero imports (read-only check)

Grep `src/` for any remaining:
- `from '@supabase/supabase-js'`
- `from "@supabase/supabase-js"`
- `import supabase` references
- Any `supabase.auth.*`, `supabase.from(`, `supabase.channel(`, `supabase.storage` calls

If any found → list them, cut them over, then drop the dep.
If zero found → drop the dep immediately.

### Step 2 — Remove the dependency

Use the package manager tool to remove `@supabase/supabase-js` from `package.json`. This is the final line per Claude.

### Step 3 — Clean up `.env`

`.env` still has `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_PROJECT_ID`. With zero Supabase code left these are dead. Remove them so the next dev doesn't think Supabase is still wired.

### Step 4 — Update memory

Update `mem://index.md` Core rules:
- Remove any "Supabase" architectural assumptions
- Add: "Backend is Spine (FastAPI on Railway). Zero Supabase deps. Data on Railway Postgres."
- Save `mem://architecture/spine-only-backend` documenting the cutover completion date.

### Step 5 — Reply to Claude

Short confirmation:
> Pulled `@supabase/supabase-js`. Cleaned `.env`. Frontend has zero Supabase traces. Run the migration script when ready — I'm green on my side. Closing the Supabase chapter.

### Out of scope (Claude's job)

- `railway run python scripts/migrate_intelligence_data.py` — Claude runs this from his Railway CLI, not me.
- Pausing the Supabase project — your call once Claude confirms the data copy succeeded.

### What I need from you

Just say "go" and I'll execute Steps 1–5 in one push. ~2 minutes.

