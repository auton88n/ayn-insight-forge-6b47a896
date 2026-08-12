# Integration tests

Real accounts, real HTTP calls against the live deployed backend, real cleanup afterward — the same technique this app's entire security history was built on (`docs/map/blueprint.md`: *"confirm a change by making it happen for real... not by reading the code and reasoning that it should work"*), scripted so it's repeatable instead of one-off.

## What's covered

- **`credits.test.ts`** — the credit ledger never double-spends under real concurrent requests (the exact class of bug behind this app's worst-ever vulnerability).
- **`isolation.test.ts`** — one real account can never read or write another real account's resumes or profile via the real API path (not a policy read, an actual attempt).
- **`admin-boundary.test.ts`** — a real, non-admin account is refused by every admin RPC checked.
- **`rate-limit.test.ts`** — a real burst past an action's ceiling gets refused by the deployed backend, not just accepted by the code.
- **`security-definer-sweep.test.ts`** — calls the real `get_admin_security_definer_audit()` RPC and fails if any `SECURITY DEFINER` function shows up granted to `authenticated`/`anon` with no ownership check, beyond the two known-safe ones. This is the single check most likely to catch the next version of this app's worst bug before it ships, not after.

## Running them

```bash
npm run test:integration
```

Needs three environment variables — **never commit these**:

```bash
export SUPABASE_URL="https://dfkoxuokfkttjhfjcecx.supabase.co"
export SUPABASE_ANON_KEY="<the public anon key, already safe to expose — see src/config.ts>"
export SUPABASE_SERVICE_ROLE_KEY="<from the Supabase dashboard → Project Settings → API>"
```

The service role key is required because these tests create and fully erase real throwaway accounts (`erase_account_core`, the same function every account deletion in this app goes through) and need to confirm test-account emails without going through a real inbox. It is never sent to anything except your own Supabase project.

## What this deliberately does NOT cover

- **Real payments.** No test here ever calls Stripe. That's explicitly left for a human to click through with a real card, same standing rule as every manual audit pass in this app's history.
- **The extension.** No tooling here can load an unpacked MV3 extension; extension-side logic is covered only by `node scripts/check-wiring.mjs` and manual review.
- **Every action in `resume-hub`.** This targets money-critical and access-boundary paths specifically — the places where a silent regression costs real money or leaks real data — not full feature coverage. Add a test here when a future fix is exactly this shape (a race condition, an isolation gap, a boundary check) so it can't quietly come back.

## Cost and cadence

Each run creates and deletes a handful of real throwaway accounts and makes a small number of real AI-gateway calls (the credit-concurrency test tailors a resume 1-3 times). Cheap enough to run before a real deploy; not something to wire into a tight loop.
