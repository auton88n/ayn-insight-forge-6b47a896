# AYN system diagnosis — 28 September 2026

Baseline: `72062ecd`. Read-only application and production inspection; this report is the only file added. No deployment, customer-record changes, payment replay, or exploit testing.

## Scope and evidence limits

Inventory: 200 files under `src`, 49 under `supabase/functions` (including shared libraries and configuration), 321 historical migrations. These are file counts, not coverage percentages. This is a cross-layer diagnosis of selected critical paths, NOT certification that every line, element, policy or customer journey has been tested.

The review covered frontend navigation/data loading, component boundaries, API helpers, AI execution, paid-document completion, Stripe event handling, dependency manifests, crawler entry point, automation inventory, analytics routing, CI and tests. Live checks inspected container resource snapshots, cron names/status aggregates, credit-grant implementation and job/ledger indexes. No customer data was retrieved.

## Prioritized findings

### P1 — Payment persistence failures can be acknowledged as success

`supabase/functions/stripe-webhook/index.ts:125` logs subscription upsert errors but continues to the final HTTP 200. The invoice handler similarly breaks after a failed credit-grant RPC (`:178` onwards), also reaching HTTP 200. Lookup helpers also discard database errors. A temporary database failure can leave a paying customer without the right subscription or credits while acknowledging delivery. Fix persistence failures to be retryable, after implementing atomic idempotency. Prove with fault-injected webhook tests; do not replay real payments to test.

### P1 — Invoice deduplication is outside the credit transaction

`stripe-webhook/index.ts:162` checks for an invoice ledger entry before separately calling `credit_grant`. Two concurrent deliveries can both observe no entry. The live function locks balance updates but always inserts; live ledger indexes contain no invoice uniqueness constraint. This is a code-level race supported by live schema inspection, not an observed double-credit incident. Use a transactionally unique Stripe invoice/event claim coupled to the grant. Preserve legitimate repeated administrative adjustments; do not indiscriminately make every ledger reference unique.

### P1 — Browser release check references a missing configuration

`.github/workflows/ci.yml:59` invokes `playwright.local.config.ts`, absent from this checkout. The configured browser gate cannot execute as written. Add the intended isolated local server/fixture configuration and prove a clean-checkout run. This review did not inspect GitHub branch protection or remote Actions results.

### P2 — AI waits and retries have no overall execution deadline

`resume-hub/lib/ai.ts:126` permits three attempts per model, across fallback models, without an abort deadline for fetch or body reading. `src/lib/resumeHub.ts:35` likewise lacks explicit request timeout/cancellation. Backoff is bounded, total execution time is not. Add a shared deadline budget, bounded retry policy and durable operation status for long work. Retry status must not imply that an earlier paid operation did not complete.

### P2 — Navigation repeatedly discards account data state

`LandingSections.tsx:340` keys tab content by selected tab; `AccountTabs.tsx` recreates its auth state and inner page on mount. Profile and matched jobs use local state/effects rather than consistently sharing the query cache used by public browsing. Return visits can repeat blocking loaders and reads. Introduce user-scoped query keys, mutation invalidation and logout/account-switch clearing. Do not cache authorization decisions indefinitely.

### P2 — Profile loads all resume versions with full document content

`ProfileTab.tsx:278` selects all versions including `content` with no pagination, and the main load waits for profile, identity, resume and auth requests. Retaining versions is correct; repeatedly downloading every version is not necessary. Fetch active content plus paginated historical metadata, loading historical content only for compare/restore. Retain failure recovery and original documents.

### P2 — Filters transfer raw rows and can get stuck after cancellation

`BrowseJobs.tsx:1112–1198` uses per-mount loaded refs and up to 5,000-row reads for location/category/type/seniority/city/title/company. These are lazy on interaction, NOT unconditional initial-page requests. The ref is set before success; closing the UI cancels result acceptance without resetting that ref. Reopening can remain empty. Replace with retryable cached queries and compact distinct/search responses.

### P2 — Job-list payload and query shape need tuning

`BrowseJobs.tsx:58` includes descriptions and skills in list rows; `:1313` requests exact counts and substring search across title/company/location. Live indexes inspected include source/external-id uniqueness and B-trees on date/category/city/employment type; no trigram indexes appeared. This is a tuning candidate, not proof of a slow query. Capture representative EXPLAIN plans and timings, split list/detail payloads, then choose indexes or search changes based on measurements.

### P2 — Job freshness and posting date have conflicting meanings

`ats-direct-sync/index.ts` explicitly defines `posted_at` as last confirmed live, refreshed when a posting remains open. `JobsBrowser.tsx:164` labels the value “Posted”. Old vacancies can therefore appear newly posted. Keep source posting time and last verification time separate; show their actual meanings and use verification time for expiry.

### P2 — Dependency reproducibility is inconsistent across runtimes

The frontend has package-lock.json, but job-checker requirements are unpinned and its Docker image installs them and Chromium during rebuild. Edge imports mix exact npm versions, major-only versions and esm.sh. No tracked Deno lockfile was found. Pin and audit each runtime independently; the npm audit does not cover Python or all edge imports. Package.json also includes testing tools in runtime dependencies. Moving those improves deployment footprint, not automatically browser performance. An old market-prediction script and a health-only backend stub remain; do not delete them solely because they are not part of current app requests.

### P2 — Crawler resource and outbound-network boundary needs hardening

`job-checker/server.py:313` creates an AsyncWebCrawler per authorized check. The request URL is a plain string; the endpoint has no explicit application-level concurrency semaphore, overall deadline or private-network/redirect validation. The secret gate is real, and the deployed container had a 1.5 GiB memory limit. Treat this as an internal hardening risk, not a proven public SSRF exploit. Trace trusted feed URL provenance and outbound network controls before testing; add bounded work and public-destination validation where needed.

### P2 — Validation does not cover all backend boundaries

Frontend tsc covers `src` only. The wiring script scans literal action names in one API wrapper and matching source branches; it does not validate payloads, response contracts, authorization, dynamic callers or deployment. CI lint is non-blocking. SQL/security integration tests exist but were not run in this pass. Add backend runtime/type checks, schema/contract tests, transactional concurrency tests and staging journeys.

### P2 — Employer search waits for a burst of maintenance work

`resume-hub/index.ts:2256` uses Promise.allSettled to reindex up to 25 candidates before retrieval proceeds when their embedding model is stale. This is bounded by count, but can still create 25 simultaneous indexing jobs per request and holds up the user-facing search. Use the existing bounded-concurrency utility, establish a request budget and move catch-up work to a durable maintenance queue where feasible. Preserve the current prohibition on comparing embeddings from incompatible models.

### P3 — Component and design ownership is inconsistent

Public JobsBrowser imports shared helpers directly from the large account BrowseJobs feature module. This is a source-level boundary leak; actual bundle impact requires built import-graph analysis. Shared Button uses foreground/background styling and broad interaction effects while feature surfaces override branding. Loading treatments still differ. Extract neutral job-formatting components/helpers, consolidate tokens and loading primitives, and preserve accessible focus/keyboard behavior. Do not equate file length with runtime cost.

### P3 — Analytics cannot distinguish hash-based workspace tabs

VisitorTracker observes pathname only, deliberately excluding fragments. Home tabs such as `/#help` and `/#pricing` are therefore not distinct page views in first-party visitor reporting. This is consistent with its documented privacy-limited route measurement, but insufficient for tab-level product conversion analysis. If needed, use an explicit allowlist of non-sensitive screen names under consent; do not start recording arbitrary hashes or queries.

### P3 — Current architecture is mixed with stale history

Blueprint still claims no rate limiting, while current dispatcher calls rateLimitGate in many action paths. Historical map sections describe deleted extension modules and prior deployment topology. Separate current facts from history and verify live topology before proposing regional migrations. Rate-limit database errors currently fail open; monitor this explicitly and choose a cost-protection policy for paid/expensive endpoints.

## Verified strengths

- Route/feature lazy loading already exists; AYN is not a single eagerly loaded application bundle.
- Public job browsing uses React Query and paginated summary reads.
- Stripe signature verification is present before event handling.
- Paid document completion uses database transactions and locks; do not replace this with client-side credit accounting.
- AI context uses AsyncLocalStorage rather than a shared mutable cross-request context.
- Internal scheduled functions check service-role authorization.
- Visitor collection is consent-gated; account authorization and RLS remain essential independent controls.

## Runtime snapshot

VPS container CPU was generally low at the moment sampled; imgproxy was about 7%, most others below 1%. Postgres used about 423 MiB and edge functions about 111 MiB. Job checker used about 179 MiB against a 1.5 GiB limit. This is NOT a load test or proof that the server never saturates.

Live schema metadata showed 88 public tables, with no ordinary public table lacking RLS. RLS being enabled is not proof that individual policies are correct. Largest inspected public tables included job_postings (67 MB), security_logs (16 MB) and messages (about 7 MB). Database size alone does not explain navigation latency. A security-definer marker scan returned six functions, including trigger functions and public aggregate helpers; missing a textual auth marker is not by itself a vulnerability. No new access-control exploit is claimed from that scan.

Live cron: ats-direct-sync and job-board-sync every two hours; error-alert-check and security-alert-check every ten minutes. Last seven days recorded 84 successful executions each for the two sync jobs and 1,008 each for the alert jobs. PostgreSQL cron success can mean the HTTP request was enqueued successfully; it does not establish downstream application success or data freshness. HTTP response outcomes, sync counts and last-success alarms remain to be correlated.

Recent validation on this same baseline: 51 unit tests passed, frontend typecheck passed, 16 literal wrapper actions passed wiring check. Production npm audit returned zero known vulnerabilities in the earlier pass. Python/edge dependency vulnerabilities, live RLS isolation, full UI coverage, backend typecheck and end-to-end payments were NOT verified by those results.

## Completion criteria for the remaining audit

1. Inventory live tables, grants, functions, triggers, indexes and retention jobs; compare with migrations, without exporting customer records.
2. Measure authenticated page transitions and database query plans under realistic synthetic volume in staging.
3. Test payment duplicates, out-of-order events, database failure and retry in Stripe test mode.
4. Run owner/non-owner/anonymous/admin authorization matrix in staging, including erasure and export.
5. Exercise generated PDF/DOCX, paid-result recovery, AI timeout and cancellation, and account switching.
6. Inspect built chunk graph, dead imports, mobile/desktop keyboard navigation, loading and error states.
7. Audit Python and edge dependencies, deployed function inventory, backup/restore procedure and migration/deployment rollback.
8. Correlate cron dispatch with HTTP outcomes, worker errors, freshness and alert delivery; verify secrets are never included in audit artifacts.

Recommendation: retain React/Vite/Postgres and the existing shared security/billing boundary. First fix payment correctness and release gates, then execution deadlines and data loading, then modularization and design consistency. No evidence currently justifies a wholesale framework rewrite.
