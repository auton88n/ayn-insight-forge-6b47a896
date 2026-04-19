

User confirmed: spine has `/chat`, `/generate/suggestions`, `/generate/eye-behaviors`, `/upload` ✅ and `/sse/user` is now deployed (the diff shows it). Time to execute all phases.

Let me check the current state quickly to ground the plan: spineApi.ts shape, useMessages.ts current routing, useUsageTracking.ts polling loop, and inventory the 22 legacy callers. I have enough context from prior turns — proceeding to plan.

## Plan: Full cutover + realtime upgrade

Spine has everything we need. Executing all 5 phases in one push.

### Phase 1 — Kill regressions (2 files + 1 dep)

- Delete `src/integrations/supabase/client.ts` (auto-recreated, unused)
- Delete `supabase/config.toml` (auto-recreated, only contains `project_id`)
- Remove `@supabase/supabase-js` from `package.json` (zero imports remain after Phase 2)

### Phase 2 — User chat onto spine

- `src/config.ts`: change `AYN_BACKEND_URL` default from `''` to `'https://spine.aynn.io'`
- Audit `src/hooks/useMessages.ts` and `src/lib/spineApi.ts` — confirm `chat()`, `getSuggestions()`, `getEyeBehaviors()`, `upload()`, `supportBot()` route to spine when `AYN_BACKEND_URL` is set. Wire up any that still fall back to `supabase.functions.invoke('ayn-unified')`.
- Same audit for the orb (eye behaviors), suggestion chips, file upload modal, support widget.

### Phase 3 — Sweep the ~22 legacy callers

I'll grep `${SUPABASE_URL}/functions/v1/` and `supabase.functions.invoke(` and `${SUPABASE_URL}/storage/v1/` to get the exact list, then for each:
- If spine route exists → replace with `spineApi.<method>()` or direct fetch to `https://spine.aynn.io/...`
- If spine route missing → list as a blocker for Claude (don't break anything — leave the Supabase call in place with a `// TODO: spine route missing` comment)

Domains expected:
- **Email** (contact, application, ticket-notification, ticket-reply, reply) → spine `/email/*`
- **Stripe** (create-checkout, customer-portal) → spine `/payments/*`
- **Engineering** (analyze, chat, agent, pdf, dxf) → spine `/engineering/*`
- **NDA / custom orders / command center / admin AI assistant / track-visit / auth-send-email** → check spine `/admin/fn/*` and `/fn/*`

Storage URLs (`${SUPABASE_URL}/storage/v1/object/public/...`) → swap to `https://spine.aynn.io/storage/serve/<bucket>/<path>`.

### Phase 4 — Realtime usage via `/sse/user`

Rewrite `src/hooks/useUsageTracking.ts`:
- Remove the 30s `setInterval` polling
- Open `EventSource('https://spine.aynn.io/sse/user?token=' + accessToken)` once on mount
- Listen for `limits` events → update state instantly with `{ daily_messages, current_daily_messages, bonus_credits, monthly_messages }`
- Listen for `reconnect` event → close and reopen (the spine cycles connections every 4min)
- On `error` → exponential backoff reconnect (1s, 2s, 4s, max 10s)
- Keep a 60s safety poll only as a fallback when SSE has been disconnected for >30s
- Token refresh: if `spineAuth.refreshSession()` fires, tear down and reopen SSE with the new token

Also add SSE-based refresh to:
- Sidebar chat list (when a new message lands → refresh)
- Any place currently polling that has a server-side state change

### Phase 5 — Final cleanup (only after Phases 1–4 verified working)

- Delete `src/integrations/supabase/types.ts` if zero imports remain
- Remove `SUPABASE_URL` and `SUPABASE_ANON_KEY` from `src/config.ts` if zero references remain
- Delete `src/lib/supabaseApi.ts` if zero imports remain (admin uses `adminApi.ts` now, users should use `spineApi.ts`)
- Update memory: deprecate `mem://architecture/supabase-api-proxy`, `mem://architecture/direct-rest-api-wrapper`, `mem://architecture/edge-function-deployment-standards` — replace with a single `mem://architecture/spine-backend` entry describing the new shape

### Order of operations in the next message

1. Inventory pass (grep + list) — establishes the exact scope
2. Phase 1 deletions
3. Phase 2 chat cutover
4. Phase 4 realtime SSE (highest user-visible win)
5. Phase 3 sweep (mechanical replacements)
6. Phase 5 cleanup if everything compiles clean

### Risk + rollback

- If a spine route 404s in production, the swapped call breaks. Mitigation: I'll add a tiny `spineFetch()` helper in `spineApi.ts` that logs failures and (optionally, off by default) falls back to the Supabase URL via `?fallback=1` query param. Easy to flip if something breaks.
- `EventSource` doesn't support custom headers — token has to go in the query string. Spine already accepts that pattern (per the diff). Fine.
- Browser EventSource limit is 6 connections per origin. We'll have 1 (`/sse/user`) for normal users, +1 (`/sse/admin`) for admins. Well under limit.

### What ships after this push

- Zero `@supabase/supabase-js` imports
- Zero direct `${SUPABASE_URL}` calls in user-facing code (admin panel already done)
- Realtime usage counter (instant, not 30s lag)
- Smaller bundle (SDK dropped)
- Single backend (spine.aynn.io) for everything except the Postgres database itself

