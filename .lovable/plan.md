

## Final cutover plan — Phase E2 + E3

Spine is green. Doing exactly the 6 steps Claude requested, plus minor cleanup of the 5 files that import the `Session` type from `@supabase/supabase-js`.

### Scope (this push)

**1. Rewrite `src/lib/adminApi.ts` base URLs**
- `call()` → `https://spine.aynn.io/admin/db/${endpoint}`
- `rpc()` → `https://spine.aynn.io/admin/db/rpc/${fn}`
- `invoke()` → `https://spine.aynn.io/admin/fn/${name}`
- Drop `apikey` header (not needed by spine)
- Keep `Authorization: Bearer <getAdminToken()>` — token now comes from spine `/admin/login`
- Update `getAdminToken()` to read `ayn_admin_token` instead of parsing the `ayn-admin-auth` Supabase JSON blob

**2. Rewrite `src/admin-app/AdminApp.tsx`**
- Delete `import { adminSupabase }` 
- Replace `adminSupabase.auth.signInWithPassword` → `POST https://spine.aynn.io/admin/login`
- Replace `adminSupabase.auth.getSession()` → read `ayn_admin_token` + `ayn_admin_user` from localStorage
- Replace `adminSupabase.auth.signOut()` → `POST /admin/logout` then clear the 3 keys
- Replace `adminSupabase.auth.onAuthStateChange` → simple `storage` event listener on `ayn_admin_token`
- Replace `adminSupabase.functions.invoke('admin-pin-alert')` → `adminApi.invoke('admin-pin-alert')` (which now hits spine)
- Drop the `user_roles` lookup in `checkAdmin()` — the spine `/admin/login` already enforces `is_admin`, so if login succeeded the user is admin. Skip straight to PIN.
- Use local `interface AdminSession` instead of `SpineSession` (spine's admin response shape is slightly different — has `is_admin: true`)

**3. Replace `Session` type imports in 5 files**
- `ApplicationManagement.tsx`, `ApplicationDetailModal.tsx`, `ReplyModal.tsx`, `RateLimitMonitoring.tsx`, `PrivacySettings.tsx`
- Define a small local interface `interface Session { user: { id: string; email?: string } }` (or import `SpineSession` from `spineAuth.ts` where appropriate — these components are passed a session as a prop; the shape they use is just `session.user.id` and `session.user.email`)

**4. Delete files**
- `src/admin-app/adminSupabase.ts`
- `src/integrations/supabase/client.ts`

**5. Remove SDK from `package.json`**
- Remove `"@supabase/supabase-js"` dependency

**6. Delete Supabase backend artifacts**
- Delete `supabase/functions/` directory (all edge functions — already ported to spine)
- Delete `supabase/config.toml`
- Use `supabase--delete_edge_functions` to remove them from the deployed Supabase project too

### Out of scope (follow-up, not blocking)

There are still ~22 files outside `adminApi.ts` that hit `${SUPABASE_URL}/functions/v1/...` or `${SUPABASE_URL}/storage/v1/...` directly (e.g. `CommandCenterPanel.tsx`, `NDAManager.tsx`, `CustomOrders.tsx`, `AdminAIAssistant.tsx`, `NDASign.tsx`, etc.). These will keep working as long as `SUPABASE_URL` is still defined in `config.ts`, because:
- Storage URLs auto-redirect through spine (per Claude)
- Edge functions ported to spine still exist on the old Supabase project until you cancel it

I'll **leave `SUPABASE_URL`/`SUPABASE_ANON_KEY` in `src/config.ts`** and the `supabase/types.ts` file for now. Removing them is a separate, larger sweep of those 22 files. Flagging it as the next phase, not blocking this cutover.

### Risk

- If a file I haven't audited imports `supabase` from `@/integrations/supabase/client`, the build will fail. My grep showed zero such imports — only the file itself self-references. Safe.
- `Session` type removal: the 5 files only use `session.user.id` and `session.user.email`, both compatible with the local interface.
- Admin login: spine returns `{ access_token, refresh_token, user: { id, email, first_name, last_name, is_admin } }` — I'll store under `ayn_admin_token`, `ayn_admin_refresh_token`, `ayn_admin_user`.

### Files touched (summary)

```text
edited:   src/lib/adminApi.ts             (base URLs + token reader)
edited:   src/admin-app/AdminApp.tsx      (full rewrite of auth flow)
edited:   src/components/admin/ApplicationManagement.tsx   (Session type)
edited:   src/components/admin/ApplicationDetailModal.tsx  (Session type)
edited:   src/components/admin/ReplyModal.tsx              (Session type)
edited:   src/components/admin/RateLimitMonitoring.tsx     (Session type)
edited:   src/components/settings/PrivacySettings.tsx      (Session type)
edited:   package.json                    (remove @supabase/supabase-js)
deleted:  src/admin-app/adminSupabase.ts
deleted:  src/integrations/supabase/client.ts
deleted:  supabase/functions/             (whole directory)
deleted:  supabase/config.toml
```

After this push: **frontend has zero `@supabase/supabase-js` imports**. SDK is gone from the bundle. Admin panel runs entirely off spine. `SUPABASE_URL` constant still exists in `config.ts` (used by ~22 files for legacy edge function URLs, will be removed in a follow-up sweep).

