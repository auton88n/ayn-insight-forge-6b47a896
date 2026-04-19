

## Diagnosis: admin endpoints return 403 because the DB doesn't say you're admin

The frontend is now sending the correct `Authorization: Bearer …` header (the token contains `is_admin: true`). What's failing is the **server-side admin check in two of the admin routers**.

### Five routers all mount on `/admin`

| Router | Admin check | Returns |
|---|---|---|
| `admin_auth.py` (PIN) | none beyond JWT | 200 ✅ |
| `admin_routes.py` (users, stats, tickets, rate-limits, ndas, llm, contact-messages, orders, notification-log) | **none** — only requires login | 200 ✅ |
| `admin_api.py` (conversations, health, subscriptions, beta-feedback, support-tickets, custom-orders, errors) | `SELECT is_admin FROM users WHERE id = $1` → must be true | **403 ❌** |
| `admin.py` (scheduler/status, scheduler/run, llm/usage, credits, config, contacts, feedback) | `SELECT role FROM user_roles WHERE user_id = $1` → must be admin/super_admin | **403 ❌** |
| `admin_db.py`, `admin_fn.py` | their own checks | varies |

`admin_routes.py` works for you only because it skipped the admin check entirely (anyone logged in can hit it — that's also a security bug we'll fix). The other two routers correctly enforce admin status, but the DB row for `ghazi@aynn.io` is missing `is_admin = true` and there's no row in `user_roles`.

The endpoints already returning 200 (`/admin/users`, `/admin/stats`, `/admin/tickets`, `/admin/rate-limits`) prove the auth header itself is fine. The 403s prove the DB row is missing.

### Root cause

Your account `ghazi@aynn.io` (id `681d1f77-c5b6-4d30-9b14-1b3cee13408b`):
- has `is_admin=true` in the **JWT** (set when you logged in via `/admin/login`)
- but does NOT have `is_admin=true` in the `users` table
- and has NO row in `user_roles`

So both DB-backed admin checks fail.

## Fix — 3 small backend changes

### 1. Promote your account in the database
Run a one-shot Railway SQL that:
- `UPDATE users SET is_admin = true WHERE email = 'ghazi@aynn.io'`
- `INSERT INTO user_roles (user_id, role) VALUES ('681d1f77-…', 'super_admin') ON CONFLICT DO NOTHING`

This unblocks `/admin/health`, `/admin/conversations`, `/admin/subscriptions`, `/admin/beta-feedback`, `/admin/scheduler/*`, `/admin/llm/usage`, `/admin/errors`, `/admin/contacts`, `/admin/feedback`, `/admin/support-tickets`, `/admin/custom-orders`.

### 2. Make `require_admin` trust the JWT claim too
In both `admin_api.py` and `admin.py`, update `require_admin` so it accepts admin status from EITHER:
- the JWT payload `is_admin: true` (already in your token), OR
- the DB row (`users.is_admin` or `user_roles.role`)

This way, anyone who logged in through `/admin/login` (which only mints `is_admin: true` after verifying the password against an admin account) is trusted without a second DB lookup. Defense in depth, but no false 403s.

### 3. Add the missing admin guard to `admin_routes.py`
Right now `admin_routes.py` endpoints (users, stats, tickets, rate-limits, ndas, etc.) only require **any** logged-in user. That's a real security hole — any free-tier user with a valid JWT could call `/admin/users` and list everyone. Add the same `require_admin` dependency to every route in that file.

### 4. Fix the misrouted error log
`POST /errors` is hitting 404 because the actual route is `POST /admin/errors/log` (or similar). Update the client error reporter in `src/lib/errorReporter.ts` (or wherever `/errors` is posted) to use the correct path so unhandled errors stop spamming 404s.

## Verification after fix

Reload `/manage-bae76e99d97e188b` and walk every tab:

| Tab | Endpoint | Expected |
|---|---|---|
| Dashboard | `/admin/stats`, `/admin/health` | 200, numbers populate |
| Users | `/admin/users` | 200, table renders |
| Conversations | `/admin/conversations` | 200 |
| Subscriptions | `/admin/subscriptions` | 200 |
| Errors | `/admin/errors` | 200 |
| Beta | `/admin/beta-feedback` | 200 |
| Support | `/admin/tickets`, `/admin/support-tickets` | 200 |
| Cron Control | `/admin/scheduler/status` | 200, jobs list |
| LLM | `/admin/llm`, `/admin/llm/usage` | 200 |
| Contact | `/admin/contact-messages`, `/admin/contacts` | 200 |
| Rate Limits | `/admin/rate-limits` | 200 |
| Notifications | `/admin/notification-log` | 200 |
| NDAs | `/admin/ndas` | 200 |
| Custom Orders | `/admin/custom-orders`, `/admin/orders` | 200 |
| Config | `/admin/config` | 200 |

Network panel: zero 403s, zero 404s on `/admin/*` and `/errors`.

## Out of scope
- Consolidating the 5 overlapping `/admin` routers (real cleanup, but separate refactor)
- UI redesign of any admin tab
- New admin features

## Estimate
~25 min: 5 min DB promotion + JWT trust patch, 10 min add `require_admin` to `admin_routes.py`, 5 min fix `/errors` path, 5 min verify every tab.

