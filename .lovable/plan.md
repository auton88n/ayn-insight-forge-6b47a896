
## Where we are

Phase A (build green) is essentially done. The remaining work is **Phase B: migrate the 69 files still importing `@/integrations/supabase/client` to `spineApi`**, then delete the Supabase client.

## What's left, in order

### B1 — User data tables (~25 files)
Profiles, settings, user_memory, pinned_chats, chat_sessions, messages, sessions list.
Replace `supabase.from('table').select/insert/update/delete` with `spineApi.req('/user/...')` calls.

### B2 — Admin data tables (~20 files)
Tickets, custom_orders, contact_submissions, NDAs, applications, system_config, security_events, error_logs.
Replace with `adminApi.req('/admin/...')`.

### B3 — Realtime channels (~12 files)
Files using `supabase.channel(...).on('postgres_changes', ...)`. Spine has no realtime, so:
- Replace with 30s polling (same pattern as `useUsageTracking`), OR
- Wire to spine WebSocket if/when Claude exposes one.
Default: polling.

### B4 — Storage (~8 files)
Avatars, attachments, NDA PDFs, generated documents.
Replace `supabase.storage.from(...).upload/download/getPublicUrl` with `spineApi.storageUpload` / `spineApi.storageDownload` (already used in `useFileUpload` / `useAvatarUpload`).

### B5 — Cleanup (~4 files + deletion)
- Auth callback page, leftover edge function invokes.
- Delete `src/integrations/supabase/client.ts` and the `supabase/` folder references.
- Remove `@supabase/supabase-js` from `package.json`.

## How I'll execute

One batch per turn so you can review after each:
1. List the exact files in the batch.
2. Migrate them.
3. Report which spine endpoints each one needs (so Claude can confirm they exist).

If a spine endpoint is missing for a given table, I'll flag it in the batch report rather than guess — Claude adds it, then we move on.

## Starting point

Begin with **B1 (user tables)** since it touches the most user-facing flows (chat, settings, memory) and unblocks the most testing. Approve and I'll start.
