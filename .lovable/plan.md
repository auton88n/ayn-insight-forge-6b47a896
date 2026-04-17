
You picked **B1 — Pure spine**. Here is the concrete execution plan to fix the build, finish the migration, and get the app working end-to-end against `spine.aynn.io`.

## Scope summary (from prior audit)
- 9 pages have hard syntax errors from leftover `/* spine migration pending */;` stubs.
- `src/lib/spineApi.ts` has ~30 orphan methods sitting outside the object literal (lines ~121-154+).
- ~15 files destructure `{ data, error }` from `spineApi.req()` which returns raw JSON.
- ~5 files have dangling `const fnError = null` + `if (fnError)` dead branches.
- ~76 files still import `@/integrations/supabase/client`; ~359 calls to `supabase.from()` / `.channel()` / `.storage`.
- `.env` missing `VITE_AYN_BACKEND_URL`.
- Spine CORS doesn't include the current Lovable preview domain pattern.
- Edge-function build errors in the `supabase/functions/**` tree are noise from a half-migrated repo — under B1 these functions will be deleted from the frontend codebase since spine replaces them.

## Execution plan

### Phase A — Make the build compile (1 message)
1. **Rewrite `src/lib/spineApi.ts`** as a single, clean object with every method (auth, chat, sessions, limits, admin, engineering, trading, email, image, memory, scheduler, intelligence, simulation) properly typed. All Phase 4-6 orphans go inside the object.
2. **Fix the 9 broken pages** (`AdminCustomOrders`, `Contact`, `Pricing`, `PredictionControlPanel`, `services/AIEmployee`, `services/AIEmployeeApply`, `services/Automation`, `services/Ticketing`, `services/TicketingApply`) — replace each `/* spine migration pending */;` with the correct `spineApi` call.
3. **Sweep the broken patterns** across the repo:
   - Replace `const { data, error } = await spineApi.req(...)` with `const data = await spineApi.req(...); ` (no error var).
   - Remove dangling `const fnError = null; if (fnError) throw fnError;` lines.
4. **Add `VITE_AYN_BACKEND_URL=https://spine.aynn.io`** to `.env`.

After Phase A: app builds and core flows (login, chat) work.

### Phase B — Migrate remaining Supabase calls to spine (3-4 messages, batched)
Goal: zero `import { supabase } from '@/integrations/supabase/client'` in `src/`.

Approach — group the 76 files by domain and migrate one batch per message:

**Batch B1: Reads/writes for user-scoped tables** (~25 files)
`profiles`, `user_settings`, `user_preferences`, `user_memory`, `user_subscriptions`, `favorite_chats`, `pinned_sessions`, `saved_responses`, `saved_insights`, `calculation_history`, `engineering_projects`, `engineering_portfolio`, `grading_projects` → spine endpoints under `/user/*`, `/engineering/*`, `/grading/*`.

**Batch B2: Admin-scoped tables** (~20 files)
`support_tickets`, `custom_orders`, `contact_messages`, `nda_signatures`, `usage_logs`, `api_rate_limits`, `notification_log`, `system_config`, `test_results`, `ayn_activity_log` → spine endpoints under `/admin/*`.

**Batch B3: Realtime channels** (~12 files)
Replace `supabase.channel(...).on('postgres_changes', ...)` with spine WebSocket (`/ws/*`) or polling via `useQuery` + `refetchInterval` where realtime isn't critical. Affected: AgentSociety, PredictionGraph live feeds, chat session live updates, admin notifications.

**Batch B4: Storage** (~8 files)
Replace `supabase.storage.from(...).upload/download/getPublicUrl` with spine `/storage/upload`, `/storage/download`, `/storage/url`. Affected: avatars, file uploads in chat, generated images, contract PDFs, NDA PDFs.

**Batch B5: Misc / leftovers** (~11 files)
Sweep anything remaining: edge function invokes still using `supabase.functions.invoke`, auth-adjacent reads, etc.

### Phase C — Audit + add missing spine endpoints (1 message)
Cross-reference `spineApi` method list against `ayn-backend/routers/*.py`. For each missing route, either:
- Add a thin FastAPI endpoint in `ayn-backend/`, OR
- Mark the spine method as TODO with a clear error if backend work is out of scope for this Lovable session (you'll need to deploy backend changes to Railway separately).

Likely-missing endpoints to verify/add: `/admin/verify-pin`, `/admin/set-pin`, `/email/contact`, `/email/ticket-reply`, `/email/application`, `/email/nda`, `/engineering/dxf`, `/engineering/pdf`, `/analyze/floor-plan`, `/analyze/chart`, `/trading/klines`, `/admin/add-credits`, `/admin/unblock-user`, `/admin/contact-messages`, `/admin/tickets`, `/admin/orders`, `/admin/llm`, `/admin/test-results`, `/admin/rate-limits`, `/admin/notification-log`, `/admin/ndas`, `/admin/config`, `/analytics/summary`, `/intelligence/vote`, `/user/memory`, `/user/pinned-chats`, `/user/avatar`, `/storage/*`, `/ws/*`.

### Phase D — Cleanup (1 message)
1. **Delete `supabase/functions/**`** from the frontend repo (spine replaces them). This eliminates all the TS build errors in your build log.
2. **Delete `src/integrations/supabase/`** (client + types) once Batch B5 confirms zero imports.
3. **Remove `@supabase/supabase-js`** from `package.json`.
4. **Update spine CORS** in `ayn-backend/core/config.py` to allow `*.lovable.app` and `*.lovableproject.com` preview patterns (you'll deploy this to Railway).

### Phase E — Verify (1 message)
End-to-end smoke checklist:
- Login + signup
- Send chat message + receive response + load history
- Admin PIN gate
- Contact form submission
- File upload in chat
- Engineering compliance check (floor-plan analyze)
- Trading chart analyze
- Stripe checkout redirect
- Email send (contact reply)

## What you need to do outside Lovable
- **Deploy `ayn-backend/` changes to Railway** after Phase C and Phase D step 4. Lovable can edit the Python files but cannot deploy them.
- Confirm `spine.aynn.io` is reachable and CORS-updated before Phase E.

## Order of operations for the next messages
1. Message 1: Phase A (build green).
2. Message 2: Phase B1 + B2 (user + admin tables).
3. Message 3: Phase B3 + B4 (realtime + storage).
4. Message 4: Phase B5 + Phase C (cleanup imports + endpoint audit).
5. Message 5: Phase D + Phase E (delete supabase/ tree, verify).

Approve this and I'll start with Phase A in the next message.
