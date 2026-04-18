
## Yes, we can go fully Supabase-free

Your Railway diagram shows you already have your own Postgres + spine running. So Supabase becomes redundant. Here's the plan.

## What's still using Supabase today

After Phase D, only 3 small things remain:

1. **`src/integrations/supabase/client.ts`** — the SDK client (still imported by 2-3 leftover files)
2. **`src/admin-app/adminSupabase.ts`** — admin auth session (PIN gate uses it for the JWT)
3. **`@supabase/supabase-js`** in `package.json` — the SDK itself
4. **A few `Session` type imports** from `@supabase/supabase-js` in 5 files (just the TypeScript type)

Plus one immediate build error in `EmailBroadcast.tsx` (line 51 references `spineApi` without importing it).

## Plan: Phase E — Full Supabase removal

### E0. Fix build (1 line)
`src/components/admin/EmailBroadcast.tsx`: add `import { spineApi } from '@/lib/spineApi';`

### E1. Move Postgres connection to Railway Postgres
Backend-side (Claude on the spine):
- Update spine env var `DATABASE_URL` to point at the Railway Postgres container instead of Supabase
- Run schema dump from Supabase → restore into Railway Postgres
- Migrate Supabase Storage buckets → Railway volume or S3-compatible (e.g. Backblaze B2)
- Smoke-test all spine routers (auth, chat, admin, etc.)

Frontend: nothing changes — it already only talks to `spine.aynn.io`.

### E2. Migrate admin auth to spine
Replace `adminSupabase.auth.signInWithPassword` with a `fetch('/admin/login')` to spine.
- New spine endpoint `POST /admin/login` (verifies email/password + admin role, returns JWT)
- Store admin token under `ayn_admin_token` localStorage key
- Replace the 3-4 calls to `adminSupabase.auth.getSession()` with reading that token
- Remove `Session` type imports — replace with a local `interface AdminSession { user: { id, email } }`

Files touched (~6):
- `src/admin-app/AdminApp.tsx`
- `src/admin-app/AdminLogin.tsx` (or wherever login lives)
- `src/components/admin/ApplicationDetailModal.tsx`
- `src/components/admin/RateLimitMonitoring.tsx`
- `src/components/admin/ReplyModal.tsx`
- `src/components/admin/ApplicationManagement.tsx`
- `src/components/settings/PrivacySettings.tsx`

### E3. Delete Supabase artifacts
- Delete `src/admin-app/adminSupabase.ts`
- Delete `src/integrations/supabase/client.ts`
- Keep `src/integrations/supabase/types.ts` for now (it's just TypeScript types — harmless, can remove later)
- Remove `@supabase/supabase-js` from `package.json`
- Remove `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` from `.env` (replaced by `VITE_AYN_BACKEND_URL`)
- Delete the `supabase/functions/` folder (everything is on spine now)
- Delete `supabase/config.toml`

### E4. Cancel Supabase project
Once spine + Railway Postgres are confirmed stable for 1-2 weeks, cancel the Supabase subscription. Save the schema dump as backup.

## Final architecture

```text
┌──────────────────────────┐
│  React frontend          │
│  - aynn.io               │
│  - zero Supabase imports │
└────────────┬─────────────┘
             │ HTTPS (REST + SSE)
             ▼
┌──────────────────────────┐         ┌────────────────────┐
│  spine.aynn.io (Railway) │ ──────► │ Railway Postgres   │
│  - all auth              │  asyncpg│ (own container)    │
│  - all data              │         │ - postgres-volume  │
│  - all AI                │         └────────────────────┘
│  - SSE realtime          │
└──────────────────────────┘
```

100% your infrastructure. Zero Supabase. The brand disappears entirely.

## Risks & mitigations

- **Storage migration**: Supabase Storage public URLs (`/storage/v1/object/public/...`) are referenced in DB rows (avatars, generated PDFs, signatures). Need a rewrite script after migration. Spine already has `/storage/upload` — add `/storage/serve` for the read path.
- **RLS policies**: Won't matter once moved — only the spine talks to Postgres with service-role-equivalent access. RLS becomes optional.
- **Realtime**: Already moved to SSE on spine. No change needed.
- **Phase E1 (DB migration)** is backend work — most of it happens on Claude/spine side, not in this Lovable project.

## Order of execution

1. **E0** (1 min, fixes build) — do now
2. **E2** (frontend admin-auth swap) — do in this project
3. **E3** (delete files, remove SDK) — do in this project after E2 verified
4. **E1** (DB + storage migration) — Claude/Railway side, separate task
5. **E4** (cancel Supabase) — manual, after 1-2 weeks of stability

Suggest starting with **E0 + E2 + E3 in one push** so the frontend is 100% Supabase-free immediately. E1 can happen in parallel without breaking anything because the spine env var is the only thing that needs to change.
