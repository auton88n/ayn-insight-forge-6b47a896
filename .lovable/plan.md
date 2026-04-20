
The user (via Claude) is suggesting to replace all `supabaseApi.*` calls with `adminApi.from()` because Supabase is retired and everything must go through spine. Let me verify this claim before planning.

Key facts from memory:
- "Backend is Spine (FastAPI on Railway Postgres). Zero live Supabase calls in src/."
- `supabaseApi.ts` still hits `SUPABASE_URL/rest/v1/...` directly — that's the old Supabase REST endpoint.
- `adminApi.ts` correctly proxies through `spine.aynn.io/admin/db/...`.
- A user-facing `spineApi.ts` exists that handles user-token routing through spine.

So Claude's claim is correct in principle, but the choice of replacement matters:
- **Admin pages** (`/manage-*`) → use `adminApi`
- **User-facing pages** (dashboard, chat, intelligence, etc.) → use `spineApi`, NOT `adminApi` (admin token won't be present for normal users)

Let me explore which files import `supabaseApi` to scope the work.
