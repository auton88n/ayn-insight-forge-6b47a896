## What I verified first

- Every RPC the panel calls exists in the database: the six section functions (`get_admin_overview`, `_employers`, `_candidates`, `_marketplace`, `_money`), the eight System pane readers (`get_admin_accounts`, `_support_tickets`, `_error_monitoring`, `_rate_limit_stats`, `_ai_usage`, `_email_audience`, `_terms_consent`, `_system_config`) and the mutations (`admin_employer_approve/_decline/_override`, `admin_mark_candidates_stale`, `admin_insert_ticket_message`, `admin_update_ticket`, `admin_unblock_user`, `admin_set_pin`, `admin_upsert_system_config`). Argument names and defaults all match the calls in the frontend.
- `send-email` is deployed but rejects what the admin Email pane sends: the pane posts `{to, subject, html}` and the function answers `Missing required fields: to, emailType`, then `Unknown email type` for anything not in its internal template list. **The broadcast pane cannot send a single email today.** This is the one confirmed dead button.
- The Errors pane calls `useMemo` after early `return` statements for loading and error. That is a conditional hook: the pane will throw a React hook-order error the moment it transitions from loading to loaded. Confirmed by reading the file, not yet observed in the browser.
- I could not execute the admin RPC bodies from here (the query role is denied EXECUTE on them), so "the function exists with the right signature" is confirmed but "the function returns without a SQL error" is not. That gets verified by a live run, below, exactly the way the Candidates `consented_at` crash was found.

## Plan

### 1. Real broadcast email (replaces the dead pane)
New repo-owned edge function `supabase/functions/admin-broadcast/index.ts`:
- Validates the caller's JWT in code and requires the `admin` role via `has_role`, otherwise 403.
- Accepts `{audience, subject, body}` where audience is all / seekers / employers / discoverable, resolves the recipient list server side from the same source as `get_admin_email_audience` (so the browser never carries the address list).
- Sends through Resend with `RESEND_API_KEY`, in batches, plain AYN-branded HTML wrapper, and returns `{sent, failed, errors}`.
- Writes one row per send to `email_logs` so the pane can show history.

Email pane rewrite: one call instead of a per-user client loop, a confirmation step showing the exact recipient count, a test-send-to-me button, and a "recent broadcasts" list read from `email_logs`.

### 2. Fix the Errors pane hook order
Move the grouping `useMemo` above the loading and error returns, computed from a safe empty array. Also make "Where" clickable and add a copy-message action.

### 3. Live smoke test of every pane, then fix whatever breaks
Sign in as the admin, pass the PIN, and drive all six sections plus all eight System panes in a headless browser, capturing console and network. For each pane, confirm the RPC returns 200 and the pane renders real numbers rather than the "Could not load this section" block. Then exercise the write paths against real rows where safe:
- Employers: approve, decline with note, plan change, trial extension.
- Candidates: select and reindex (bounded to 25).
- System > Support: reply, resolve, close.
- System > Rate limits: unblock.
- System > Settings: maintenance toggle save, PIN change validation path.

Anything that errors gets fixed at the source: a SQL fix through a migration if the RPC body is wrong, a frontend fix if the shape is wrong.

### 4. Close the remaining gaps
- Employer approve and decline currently only refresh the Employers and Overview queries; they also change Accounts and Money, so widen the invalidation.
- Overview and Marketplace are read only. Add the actions the numbers imply: from Overview, the pending-employer callout jumps into the queue; from Marketplace, open an employer or candidate in place rather than being a dead end.
- Support pane shares one `reply` state across all tickets, so typing in one row leaks into another when a second row is expanded. Scope the draft per ticket.

### 5. Ship
Typecheck, `check-wiring`, build, version v3.23.0, and a short note in CLAUDE.md recording that the admin broadcast now runs through `admin-broadcast` rather than `send-email`.

## Technical notes

- New secret usage: none. `RESEND_API_KEY` is already configured.
- No table schema changes are planned. A migration will only be issued if the smoke test proves an RPC body is wrong.
- The admin PIN gate, the `/manage-bae76e99d97e188b` route and the `has_role` guard on every RPC stay exactly as they are.
