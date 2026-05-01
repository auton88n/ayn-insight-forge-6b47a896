## Why AYN is slow / not working on tablet & iPhone

After reading the chat pipeline (`useMessages.ts`, `useSSEStream.ts`, `useChatSession.ts`, `ChatInput.tsx`, edge logs), here's what's actually going on. There is **no mobile-specific gate** that disables sending — the chat input works the same on every viewport. So the symptoms you're seeing have three real causes, and we can fix them.

### Root causes

1. **The response is non‑streaming on mobile in practice.**
   `useMessages.ts` requests `stream: true`, but on iOS Safari + many tablet browsers, `fetch` does **not** expose `response.body` as a readable stream. When that happens, `parseSSEStream` waits for the *entire* response before showing anything — so the user sees a blank "typing" bubble for 15–40s, then everything appears at once. On desktop Chrome, chunks appear progressively, which is why it feels fast there.

2. **The 90s client timeout + retry loop hides errors as "slowness".**
   `fetchWithRetry` retries up to 2× with a 1s gap, and the per-attempt timeout is 90s. If `ayn-unified` cold-starts (~30s warm-up the first call after idle, visible in your edge logs: `booted (time: 31ms)` after `shutdown`) or the upstream Gemini call stalls, the user waits a full attempt before retry. Worst case: ~90s before any feedback.

3. **Two Supabase clients are competing on mobile.**
   The console shows: *"Multiple GoTrueClient instances detected in the same browser context."* `src/integrations/supabase/client.ts` and `src/admin-app/adminSupabase.ts` both initialize GoTrue against the same storage key. On iOS Safari (where storage is more restricted and writes are serialized), this causes auth-token races — the request sometimes goes out with a stale token, gets a 401-style failure inside the function, and the retry path kicks in. That alone can add 5–15s.

A secondary contributor: every send does an extra `supabase.auth.getSession()` round-trip (lines 86–90 of `useMessages.ts`) before calling `ayn-unified`. On a slow mobile connection that's another ~300–800ms per message.

### What to change

**1. Make streaming actually work on iOS / Safari / older tablets**
- In `useSSEStream.ts` / `useMessages.ts`: detect `response.body == null` (Safari fallback) and switch to reading `response.text()` once, then surface the full message as a single update with `isTyping: false`. Today this case silently "hangs" because `getReader()` throws and the catch block shows the generic error.
- Add an explicit `Accept: text/event-stream` header so Safari doesn't try to buffer as JSON.
- Show the typing indicator *immediately* (already done) but also add a soft "Still thinking…" hint after 8s so the user knows the request is alive.

**2. Tighten timeouts and give visible feedback**
- Drop the per-request timeout from **90s → 45s** (matches the upstream limit you have documented in memory).
- Reduce `fetchWithRetry` retries from 2 → 1 for streaming requests (retrying a half-streamed response is wasteful and doubles perceived latency).
- On `AbortError`, replace the silent failure path in `useMessages.ts` (lines 218–223) with a user-visible message: *"That took too long — tap to retry."*

**3. Fix the duplicate Supabase auth client**
- In `src/admin-app/adminSupabase.ts`: pass a different `storageKey` (e.g. `'ayn-admin-auth'`) and `auth: { persistSession: false }` so the admin client stops fighting the main client for the same `localStorage` slot. This eliminates the GoTrue warning and the auth-token race that mobile users hit.

**4. Skip the redundant `getSession()` call on every send**
- The `session` prop already comes from `useAuth` which Supabase keeps refreshed via its own listener. Remove lines 86–90 of `useMessages.ts` (the extra `getSession()` round-trip) and just use `session.access_token` directly. If a 401 comes back, *then* refresh and retry once.

**5. Warm `ayn-unified` to kill cold starts**
- Add a fire-and-forget `OPTIONS` ping to `ayn-unified` when the dashboard mounts (in `Dashboard.tsx`). This costs nothing but keeps the function warm so the first real message doesn't pay the 30s boot cost shown in the edge logs.

### Files to change

- `src/hooks/chat/useSSEStream.ts` — Safari fallback + Accept header
- `src/hooks/useMessages.ts` — timeout 45s, drop redundant getSession, visible timeout message, "still thinking" hint
- `src/admin-app/adminSupabase.ts` — unique `storageKey`, `persistSession: false`
- `src/components/Dashboard.tsx` — warm-up ping to `ayn-unified` on mount

### Out of scope (won't touch)
- The `ayn-unified` edge function itself (lives outside the repo on Supabase) — these client-side fixes resolve the reported symptoms without it.
- The 225-agent simulator work from the previous turn — unrelated.
- Any chat feature behavior, persistence, memory tags, rate limits, or 100-message cap — all preserved exactly as they are.

### Expected result
- iPhone & iPad: messages arrive in one clean chunk in 3–8s instead of "hanging" then dumping after 30s+.
- Desktop: noticeably faster first token (no cold start, no duplicate auth contention).
- All devices: clear error message if the backend genuinely times out, instead of a frozen typing dot.
