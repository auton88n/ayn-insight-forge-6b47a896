## What I verified

Every database function the admin panel calls (`get_admin_overview`, `_employers`, `_candidates`, `_marketplace`, `_money`, `get_admin_accounts`, `_support_tickets`, `_error_monitoring`, `_ai_usage`, `_email_audience`, `_terms_consent`, `_rate_limit_stats`, `admin_employer_approve/decline/override`, `admin_set_pin`, `admin_update_ticket`, `admin_insert_ticket_message`, `admin_unblock_user`, `admin_mark_candidates_stale`, `get_broadcast_recipients`) exists in the database. The data layer is fine.

The edge functions are the broken part:

| Function | Called from | Live status | Source in repo |
|---|---|---|---|
| `verify-admin-pin` | admin login gate | responds (401 without JWT) | missing |
| `set-admin-pin` | Settings pane | responds | missing |
| `admin-pin-alert` | failed PIN alert | returns 500 | missing |
| `admin-ai-assistant` | `adminApi.aiAssistant` | 404, deleted | missing |
| `admin-broadcast` | Email pane | responds | present |

Three of them are running in production with no source in the repository. They cannot be fixed or reviewed, and the next deploy sweep removes them, which would lock the admin panel out entirely at the PIN screen. `admin-pin-alert` is already failing (500) and `admin-ai-assistant` is already gone.

## Part 1 - restore the admin functions as real, reviewable code

Recreate under `supabase/functions/`, each validating the caller's JWT in code and then `has_role(uid,'admin')` before doing anything, with CORS on every response:

- `admin-auth-pin` (one function replacing `verify-admin-pin` + `set-admin-pin` + `admin-pin-alert`, actions `verify` / `set` / handled internally). Verify compares SHA-256 against `app_settings.admin_pin_hash`; wrong PINs are rate limited server side (5 attempts then a 15 minute lock keyed on the admin user id, not localStorage) and logged to `security_logs`, with a Resend alert to the founder address on lockout. Set requires the current PIN and enforces four digits. Keep thin `verify-admin-pin` / `set-admin-pin` shims, or update `AdminApp.tsx` and `adminApi.ts` to the new name (preferred, one call site each).
- Delete the dead `adminApi.aiAssistant` helper, since nothing in the current panel renders an assistant.

## Part 2 - what this admin panel is still missing

Ordered by what actually gets used running a two-sided marketplace:

1. **Impersonate / view as user** (read-only): open any account and see their real Resume Hub state (profile completeness, resume present, index freshness, credits, proposals) without asking them for screenshots. Highest-value support tool and it does not exist today.
2. **Credit and refund controls**: grant credits, reverse a bad charge, and see the ledger per user. The tables exist (`credit_ledger`, `credit_grant`, `apply_credit_topup`), the UI has no write path. Right now a Stripe failure has to be fixed by hand in SQL.
3. **Proposal and assessment moderation**: read a proposal message and revoke it, kill a spammy employer's open proposals, see assessments stuck unsubmitted. The marketplace section only counts them.
4. **Content safety queue**: employer messages and company profiles are free text sent to real people; there is no place to review or take one down.
5. **Kill switches**: per-feature flags in `system_config` (disable employer search, disable AI tailoring, disable signups) so a bad model day or a cost spike is one toggle, not a deploy.
6. **Audit trail of admin actions**: every approve, decline, override, credit grant and PIN change written to one table with the actor, visible as a feed. Partially exists (`security_logs`, `get_admin_activity_log`) but is not surfaced or written consistently.
7. **Cost per user / per action**: the Money section shows AI spend in total. What matters is spend per tailored resume and per employer search, so unit economics are visible before the bill arrives.

## Suggested build order

Part 1 first (it is a live outage risk), then items 1, 2 and 5 in a follow-up release. Items 3, 4, 6, 7 after that.

## Technical notes

- No database migration is needed for Part 1; `app_settings.admin_pin_hash` and `security_logs` already exist.
- New functions go in `supabase/config.toml` with `verify_jwt = false`, since JWT validation happens in code (same pattern as `admin-broadcast`).
- The PIN stays server-side only; no hash or attempt counter is trusted from the client.
