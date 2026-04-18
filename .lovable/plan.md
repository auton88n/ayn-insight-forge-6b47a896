
Claude rewrote `spineApi.ts` cleanly. The new build errors confirm it: no more syntax errors, but now real type/reference errors are surfacing. Let me categorize them.

## What I see in the build errors

**Group 1 — Missing methods on `spineApi`/`adminApi` (Claude's rewrite dropped some):**
- `getAdminStats` (used in AdminAIAssistant, SystemSettings) — exists as `adminApi.getStats`, callers use wrong name
- `verifyAdminPin` (AdminPinGate) — exists in `adminApi.verifyAdminPin`, caller imports from wrong object
- `getAdminUsers` (UserDetailPage) — exists as `adminApi.getUsers`

**Group 2 — Frontend-only bugs from the half-done sweep (real code mistakes):**
- `AdminPanel.tsx:151` — undefined `body`
- `AdminAIAssistant.tsx:274` — orphan `userId` shorthand
- `CreditGiftModal.tsx:58` — orphan `userId`/`credits` shorthand
- `ReplyModal.tsx:65` — orphan `applicationId`/`replyText`/`email`
- `TicketDetailModal.tsx:142,184` — orphan `ticketId`/`replyContent`/`userEmail`/`message`
- `TwitterMarketingPanel.tsx` — duplicate `spineApi` import + leftover `supabase` refs
- `ContentPipeline.tsx:161` — leftover `supabase` ref
- `AuthModal.tsx:111` — wrong arg count + `error.message` typing

**Group 3 — Marketing endpoints return wrong type (Claude needs to fix backend):**
- `CreativeEditor.tsx` and `MarketingCoPilot.tsx` expect discriminated unions (`{type:'brand_dna', brand_dna:...}`, `{type:'image', image_url:...}`, etc.) but `spineApi.brandDna/brandScan/creativeChat/generatePlan/generateThread` are typed as `{success, message}`.

**Group 4 — Auth type mismatch (Claude needs to extend SpineSession/SpineUser):**
- `Dashboard.tsx:217` — `SpineSession` missing `expires_in`, `token_type`; `SpineUser` missing `aud`, `created_at`, `user_metadata`

## Plan

### Step 1 — I fix the frontend (Groups 1 & 2) in default mode
1. Rename callers in `AdminAIAssistant.tsx`, `SystemSettings.tsx`, `UserDetailPage.tsx`, `AdminPinGate.tsx` to use the correct `adminApi.getStats / getUsers / verifyAdminPin` (and import `adminApi` where needed).
2. Repair the 8 frontend files with orphaned variables and stray `supabase` refs:
   - `AdminPanel.tsx`, `AdminAIAssistant.tsx`, `CreditGiftModal.tsx`, `ReplyModal.tsx`, `TicketDetailModal.tsx`, `TwitterMarketingPanel.tsx`, `ContentPipeline.tsx`, `AuthModal.tsx`
   - For each: read context, restore the missing local vars from props/state, replace `supabase.from(...)` with the correct `spineApi`/`adminApi` call, fix duplicate imports.
3. Tighten marketing call sites in `CreativeEditor.tsx` and `MarketingCoPilot.tsx`:
   - Type the response with `as any` temporarily and add runtime guards (`if ('brand_dna' in res)`) so the build is green even before Claude fixes the backend types.
   - Leave a `// TODO: tighten once spine returns discriminated union` comment.
4. Fix `Dashboard.tsx:217` SpineSession assignment by widening the local cast (`as any` on the session shim) until Claude extends the type.

This makes the build green without waiting for Claude.

### Step 2 — Hand Claude the backend type fix list

I'll generate `/mnt/documents/SPINE_TYPE_FIXES.md` with exactly two items for Claude:

**A. Extend auth types in `spine/models/auth.py`:**
```python
class SpineUser(BaseModel):
    id: str
    email: str
    aud: str = "authenticated"
    created_at: str
    user_metadata: dict = {}
    app_metadata: dict = {}

class SpineSession(BaseModel):
    access_token: str
    refresh_token: str
    expires_in: int = 3600
    token_type: str = "bearer"
    user: SpineUser
```

**B. Make marketing endpoints return discriminated unions:**
```python
# /marketing/brand-dna  → {"type":"brand_dna","brand_dna":{...}}  or  {"type":"error","error":"..."}
# /marketing/brand-scan → {"type":"scan_url","scan_url":"https://..."}  or error
# /marketing/creative-chat → {"type":"image","image_url":"...","message":"..."}  or  {"type":"text","message":"..."}
# /marketing/generate-plan → {"type":"plan","plan":{...}}
# /marketing/generate-thread → {"type":"thread","thread":["tweet1","tweet2"]}
```

Once Claude ships, I remove the temporary `as any` casts.

### Step 3 — Phase B (after build green)

Migrate the 69 files still importing `@/integrations/supabase/client` in 5 batches: B1 user tables, B2 admin tables, B3 realtime, B4 storage, B5 cleanup.

### Order
1. Step 1 first (frontend fixes → build green) — **next message**.
2. Step 2 doc handed off.
3. Step 3 Phase B starts.

Approve and I'll execute Step 1.
