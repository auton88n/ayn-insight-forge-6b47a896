# Phase 4 Operational Truth & Rollout Readiness Audit

## Safety classification by subsystem

| Subsystem | Safety class | Why | Fix status | Remaining dependency |
|---|---|---|---|---|
| Auth/session/token handling | **Partially multi-instance safe** | JWT is stateless and refresh tokens are in Postgres; session revocation is shared. Runtime now hard-fails in strict mode if `AYN_JWT_SECRET` missing on API-serving roles. | Improved in Phase 4 (env validation + role checks). | Secret rotation strategy, centralized key management.
| Admin auth | **Partially multi-instance safe** | DB-backed admin checks are shared; no process-local admin cache. | Already improved in prior pass; unchanged this phase. | None urgent.
| Payments/webhooks | **Partially multi-instance safe** | DB idempotency for Stripe events reduces duplicate processing; still executed in app process without queue isolation. | Prior pass + retained. | Queue/worker for exactly-once side effects under retries/spikes.
| Scheduler/cron jobs | **Single-instance only unless isolated deployment** | APScheduler in-process + in-memory job stats (`JOB_STATS`) are process-local. | Improved with role isolation (`APP_ROLE=scheduler` + `ENABLE_SCHEDULER=true`) and startup gating. | External scheduler/queue or distributed lock per job.
| Realtime WebSockets | **Single-instance only** | Connection registries are in-memory and per-process; broadcasts don't cross instances. | Partial isolation via `APP_ROLE=realtime`. | Redis pub/sub or websocket broker.
| SSE | **Partially multi-instance safe** | Streams poll DB (shared truth) but each process independently polls and emits events; no cross-instance coordination. | Isolatable with `APP_ROLE=realtime`. | Shared event bus or CDC stream.
| Rate limiting | **Single-instance only** | Middleware counters are in-memory (`_hits`) and per-process. | Documented truth; no fake horizontal guarantee added. | Redis/distributed limiter.
| In-memory caches/state | **Single-instance only** | scheduler stats + ws registries + limiter counters are process-local. | Explicitly isolated by role in startup model. | Shared state store (Redis).
| File handling | **Multi-instance safe** (for current behavior) | Endpoint returns base64 data URL directly, no local disk persistence. | Unchanged. | Object storage for larger payload workflows.
| Background jobs | **Single-instance only unless dedicated role** | Run inside app process via APScheduler. | Role split with dedicated scheduler role. | Worker queue and idempotent job orchestration.
| Analytics/dashboard refresh | **Partially multi-instance safe** | Writes/reads in DB are shared; refresh channels (SSE/ws) remain process-local fanout. | Role split helps load isolation. | Shared pub/sub for dashboard push consistency.
| Startup and migration flow | **Partially multi-instance safe** | Advisory lock prevents concurrent migration execution; migration role separation removes default racey migration-on-every-web-instance. | Improved in Phase 4. | Dedicated migration pipeline step in CI/CD.
| Logging/error reporting | **Partially multi-instance safe** | DB-backed error logging shared across instances; async fire-and-forget can still drop logs on hard crash. | Unchanged this phase. | Durable queue/outbox for guaranteed delivery.

## Process separation summary

Implemented role-based boot model via `APP_ROLE`:
- `web`: API routers only
- `realtime`: ws/sse routers only
- `scheduler`: cron only, no business routers
- `migrate`: migration runner mode
- `all`: legacy combined mode

## Deployment hardening summary

- strict env validation in production-style deployments (`STRICT_ENV_VALIDATION=true`)
- required envs enforced per role
- readiness/liveness split (`/health/live`, `/health/ready`)
- migration advisory lock in Postgres to prevent concurrent migration races
- graceful scheduler stop on shutdown

## Honest rollout recommendation

- **Safe for single-instance production:** yes
- **Safe for controlled beta (multi-service with role isolation):** yes, with deployment discipline
- **Safe for unconstrained horizontal scale:** no
- **Blocked pending:** Redis (rate limit + ws pubsub), queue/worker architecture for jobs/webhooks, shared event bus
