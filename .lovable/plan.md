## What the security fixes touched

Most fixes were safe (admin tables, anon revokes that nothing depended on). But a few changes broke real flows that the app actively uses. Here is the honest assessment.

### Broken by the fixes (need attention)

1. **Client contract signing page** (`src/pages/ClientSign.tsx`)
   - Reads/updates `custom_orders` by `signing_token` as an anonymous visitor.
   - Uploads signature image to the `generated-files` bucket and calls `getPublicUrl`.
   - Now fails because: anon SELECT/UPDATE on `custom_orders` was revoked, the `generated-files` bucket is private, and only authenticated users can write to `signatures/`.

2. **NDA signing page** (`src/pages/NDASign.tsx`)
   - Same pattern against `nda_agreements` and the same bucket. Same breakage.

3. **FAQ helpful/view counters** (`src/components/support/FAQBrowser.tsx`)
   - Calls `supabase.rpc('increment_faq_view')` and `increment_faq_helpful`.
   - EXECUTE was revoked from authenticated, so both RPCs now return permission errors.

4. **Device fingerprint recording** (`src/hooks/useDeviceTracking.ts`)
   - Calls `record_device_fingerprint` RPC. EXECUTE revoked, so device tracking writes fail silently.

5. **System settings admin tab** (`src/components/admin/SystemSettings.tsx`)
   - Reads `system_config` directly via `.from('system_config').select(...)`. It already uses an admin RPC for some reads, but other paths still hit the table. Will work only for users whose `has_role(..., 'admin')` returns true, otherwise empty.

### Unaffected

- `app_settings` writes (admin only)
- `ayn_sales_pipeline` (admin only; the revoke was defensive)
- `floor-plans` uploads from logged-in users uploading to their own folder
- Everything that already runs through edge functions with the service role key

## Recommended restoration plan

Restore the user-facing flows without re-opening the original holes.

1. **Move contract + NDA signing to edge functions**
   - New edge function `sign-document` (service role, `verify_jwt = false`) that:
     - Accepts `{ token, action: 'view' | 'sign', signatureBase64?, fields? }`
     - Looks up the record by `signing_token`, validates it exists and is not already signed
     - On view: updates `client_viewed_at`/`status`
     - On sign: uploads the signature PNG to `generated-files/signatures/<token>.png`, creates a signed URL, writes it back to the row
   - `ClientSign.tsx` and `NDASign.tsx` call this function instead of touching the table or the bucket directly. No anon DB access required.

2. **Restore the two FAQ RPCs as `SECURITY INVOKER`**
   - Drop and recreate `increment_faq_view` and `increment_faq_helpful` as `SECURITY INVOKER` (they only bump a counter on a public FAQ row, so they don't need definer rights).
   - Grant EXECUTE to `authenticated` (and `anon` if FAQ is shown to logged-out users).
   - This satisfies the linter and unblocks the UI.

3. **Restore `record_device_fingerprint` safely**
   - Either: convert it to `SECURITY INVOKER` and tighten its RLS-touched tables so the caller can only write their own row, or move the call into the existing `useAuth`/session edge function.
   - Cleanest option: convert to `SECURITY INVOKER`, grant EXECUTE to `authenticated`. Definer privileges aren't required since the row is keyed to `auth.uid()`.

4. **Leave `system_config` admin-only**
   - The admin SystemSettings tab should fetch everything via the `get_admin_system_config` RPC (which is already used for one read) and the existing `admin_upsert_system_config` for writes. Remove the direct `.from('system_config')` calls so non-admins never hit a permission error.

## Technical details

- Edge function new file: `supabase/functions/sign-document/index.ts`. Reuses CORS pattern from existing functions. Returns 404 for unknown tokens, 409 if already signed, 200 with `{ status, signedSignatureUrl }` on success.
- Storage: keep `generated-files` private. The edge function returns a 7-day signed URL for the signature image; the page just renders it.
- SQL migration only needs:
  - `CREATE OR REPLACE FUNCTION ... SECURITY INVOKER` for the three RPCs
  - `GRANT EXECUTE ... TO authenticated` (and anon for FAQ view if needed)
- No new tables, no policy reopening on `custom_orders` / `nda_agreements`.
- `SystemSettings.tsx` swap: replace direct table reads with the RPC; no schema change.

## Out of scope

- Re-opening anon access to any of the locked tables or buckets.
- Touching `has_role` / `has_duty_access` (still required by RLS).
- The Supabase Auth dashboard toggle for leaked-password protection (still manual).
