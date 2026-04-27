# Phase 5 Distributed Hardening Audit

## Phase A — Distributed blockers

| Subsystem | Current limitation (before this pass) | Severity | Files | Impact | Fixable now |
|---|---|---|---|---|---|
| Rate limiting | in-memory counters per instance | High | `core/rate_limit.py` | bypass limits by instance hopping | Yes |
| Websocket fanout | broadcast only to local process connections | High | `routers/realtime.py` | admin/chat events inconsistent across replicas | Yes |
| Async email side effects | `asyncio.create_task(send_email(..))` in request handlers | High | `routers/auth.py`, `routers/support.py`, `routers/email_router.py`, `routers/admin_edge.py`, `routers/applications.py` | message loss on crash/redeploy; no retry | Yes |
| Shared coordination dependency | no central shared infra contract | High | `main.py`, `core/runtime.py` | hidden degraded behavior in prod | Yes |

## Phase C — Revised subsystem classification

| Subsystem | Class after Phase 5 | Notes |
|---|---|---|
| Auth/session/token | Partially multi-instance safe | unchanged; DB+JWT shared truth |
| Admin auth | Partially multi-instance safe | unchanged |
| Payments/webhooks | Partially multi-instance safe | idempotent but still request-coupled side effects |
| Scheduler/cron | Partially multi-instance safe | role-isolated; still in-process scheduler |
| Websocket realtime | Partially multi-instance safe | Redis pub/sub cross-instance fanout added |
| SSE | Partially multi-instance safe | still polling model; no distributed event stream |
| Rate limiting | Partially multi-instance safe | Redis distributed state + local fallback |
| Queue/async jobs | Partially multi-instance safe | Redis queue + retry + DLQ for email tasks |
| Background workers | Partially multi-instance safe | `worker|all` roles can run queue workers |
| Startup/migrations | Partially multi-instance safe | prior advisory lock + role controls |
| Logging/error reporting | Partially multi-instance safe | DB sink; no durable outbox yet |

## Remaining blockers

- Full multi-instance websocket correctness still requires stronger session/topic partitioning and replay strategy.
- SSE still uses periodic polling instead of shared streaming backbone.
- Payments webhooks still execute core side effects inline (not fully queue-driven).
- Rate limit fallback remains local when Redis unavailable (intended degrade mode).
