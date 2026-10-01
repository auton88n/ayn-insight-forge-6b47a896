# AYN release workboard

Status: implemented batch deployed on 25 September 2026 at revision `f1abd5bb`. The full approved scope remains in progress; unchecked items are not completed.

## Customer workflow
- [x] Atomic primary-resume save with retained versions; isolated PostgreSQL tests.
- [x] Mounted-page retry recovery; version download and restore-copy UI.
- [x] Base generation/optimization: atomic saved document + debit, UUID-only remount recovery, isolated database tests.
- [ ] Tailoring/cover-letter durable completion; staging validation of all paid-result recovery.
- [x] Profile text preview and previous-version comparison (final document layout still requires review).
- [ ] Complete factual-change enforcement across all writing actions. Numeric/gap-claim rejection is implemented and tested, not full semantic verification.
- [x] Public checker remains text-only with limited evidence-based observations.
- [ ] Signup continuity across reload and confirmation redirects.
- [ ] Shared before/after evaluation and improvement reporting.

## Experience
- [ ] Complete desktop/mobile journey preview preserving the brand.
- [x] Home-tab refresh/Back navigation, local Chromium verified.
- [ ] Job browsing filter/selection continuity.
- [ ] Job relevance and filter verification.
- [ ] Benefit-led content, clearly labelled demonstrations, PR material.
- [ ] Consent-gated conversion measurement without resume or application content.

## Engineering and release
- [x] Frontend typecheck clean; required CI checks configured locally (remote CI not run yet).
- [x] Bounded scoring concurrency and request-isolated AI attribution, unit tested.
- [x] Deno-runtime verification: context isolation passed in the exact production image, supabase/edge-runtime:v1.74.0. Complete new hub also booted and answered the public checker in an isolated container without production secrets.
- [x] Fail-closed webhook handling; live secret presence verified without exposing values.
- [ ] Customer/payment staging journeys verified.
- [ ] Reviewed changes, migration-first deployment, live smoke test and rollback plan.

Do not deploy this partial workboard as if the scope is complete. Existing build success is not equivalent to typecheck or end-to-end success. Production data must not be used as disposable fixtures.

Latest local verification: 36 unit tests, full frontend typecheck, wiring check, production build, and three external-network-blocked Chromium smoke tests pass. Real staging signup/payment verification is awaiting identification of the isolated environment. No production code or data has been changed during this release pass.

25 September: base-resume durable completion added locally. Expanded SQL fixture verifies transaction rollback, same-result retry, late replay and cross-user identifier collisions. 38 unit tests, full frontend typecheck, wiring check and production build pass. No migration has been applied to production.

The founder subsequently requested deployment of the implemented batch. This is a limited release, not completion of the unchecked scope above. Payment/signup staging journeys remain unverified; this batch does not change Stripe checkout or webhook billing code. Dependency audit: zero reported vulnerabilities at the release check.

Production verification: both resume migrations applied transactionally before the official deployment; frontend and backend revision confirmed. Public checker page and new bundle respond successfully. Live synthetic checker request returned Python/PostgreSQL matched, Kubernetes missing, 67% alignment. Edge container is healthy. Private rollback artifacts are recorded in the deployment map. Earlier “local/not applied” paragraphs above describe pre-deployment checkpoints.

Remote CI for `f1abd5bb` failed at browser smoke tests: the CI development server lacked the mandatory frontend configuration key. The local Playwright server now supplies synthetic credentials and an `.invalid` endpoint; external requests remain intercepted. CI rerun verification is pending. Real authenticated signup/payment journeys are still unverified.
