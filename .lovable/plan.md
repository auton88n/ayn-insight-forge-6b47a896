

## What's broken

The admin panel at `/manage-bae76e99d97e188b` shows **"Failed to load dashboard — Field required: authorization"** and every tab is broken (UserManagement, Errors, Subscriptions, Conversations, Contact, Beta, Twitter, NDAs, Rate Limits, Notifications, Visitor Analytics, LLM, Email Broadcast, Support, etc.).

## Why

Two **separate token keys** in localStorage:

| App | Login route | Token key |
|---|---|---|
| User dashboard | `/` (LandingPage) | `ayn_access_token` |
| Admin panel | `/manage-...` (AdminApp) | `ayn_admin_token` |

When you log in via the admin entry, only `ayn_admin_token` is set. But the admin components call `adminApi`/`spineApi` exported from **`src/lib/spineApi.ts`**, whose `req()` reads the token via `tokenStore.getAccessToken()` → `ayn_access_token` → empty → no `Authorization` header sent → spine returns **422 "Field required"**.

The PIN screen worked because `AdminApp.tsx` manually attaches `session.access_token` from the admin key. Everything after that breaks.

Confirmed in network logs:
- `POST /admin/verify-pin` → has Bearer → **200 OK**
- `GET /admin/health` → no header → **422**
- `GET /admin/stats` → no header → **422** (retried 4x)

## Fix (one tiny change, repo-wide effect)

In `src/lib/spineApi.ts`, change the token resolver in `req()` to fall back to the admin token when the user token is absent:

```ts
const token =
  tokenStore.getAccessToken() ||
  localStorage.getItem('ayn_admin_token');
```

Same change in the avatar-upload helper inside `spineApi`.

That single fallback re-arms every admin call: `getStats`, `getUsers`, `getHealth`, `getConversations`, `getErrors`, `getSubscriptions`, all twitter/marketing endpoints, NDAs, rate-limits, notifications, contact messages, support tickets, etc.

## Why this is safe

- User-app context: `ayn_access_token` exists → fallback never triggers → behavior unchanged.
- Admin-app context: `ayn_access_token` empty, `ayn_admin_token` valid → calls now authenticated.
- Both tokens are spine JWTs minted by the same `/auth/login` and `/admin/login` flows — the backend validates them identically.

## Verification after fix

Reload `/manage-bae76e99d97e188b`:
1. Dashboard renders user count + today's messages (no error card)
2. Switch through every tab — no more "Failed to load" empty states
3. Network panel: every `/admin/*` request carries an `Authorization: Bearer …` header and returns 200

## Out of scope

- Visual tweaks
- Adding any new endpoints
- Refactoring the dual-token architecture (works fine once the fallback is in place)

## Estimate

5 min code, 5 min verify across tabs.

