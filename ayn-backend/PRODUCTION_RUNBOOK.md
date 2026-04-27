# AYN Backend Production Runbook (Railway)

## 1) Deployment topology (role-based)

- **Web API** (`spine-web`)
  - `APP_ROLE=web`
  - `ENABLE_SCHEDULER=false`
  - `RUN_MIGRATIONS_ON_BOOT=false`
- **Realtime service** (`spine-realtime`, optional split)
  - `APP_ROLE=realtime`
  - `ENABLE_SCHEDULER=false`
  - `RUN_MIGRATIONS_ON_BOOT=false`
- **Scheduler service** (`spine-scheduler`)
  - `APP_ROLE=scheduler`
  - `ENABLE_SCHEDULER=true`
  - `RUN_MIGRATIONS_ON_BOOT=false`
- **Worker service** (`spine-worker`)
  - `APP_ROLE=worker`
  - runs Redis-backed queue workers (email retries/DLQ)
- **Migration job** (one-shot release task)
  - `APP_ROLE=migrate`
  - `RUN_MIGRATIONS_ON_BOOT=true`
  - run to completion before scaling traffic

This avoids mixed responsibilities and reduces accidental duplicate cron execution.

## 2) Required environment variables

Must be set in Railway before deploy:

- `DATABASE_URL`
- `AYN_JWT_SECRET`
- `APP_ROLE` (`web|realtime|scheduler|migrate|all`)
- `REDIS_URL`
- `REDIS_REQUIRED=true` (recommended in production)
- `RUN_MIGRATIONS_ON_BOOT` (`true|false`)
- `ENABLE_SCHEDULER` (`true|false`)
- `STRICT_ENV_VALIDATION=true`
- `INTERNAL_SERVICE_KEY`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `RESEND_API_KEY`
- `GEMINI_API_KEY`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_KEY`
- `AYN_PROXY_SECRET`
- `APP_ENV=production`

## 3) Health checks and smoke tests

- Railway liveness: `GET /health/live`
- Railway readiness: `GET /health/ready`
- Manual checks after deploy:
  - `GET /health/ready`
  - `GET /health`
  - `GET /health/llm`
  - login + `/auth/me`
  - one `/chat` request
  - one Stripe webhook test event

## 4) Backup and restore

- Enable daily PostgreSQL backups at provider level.
- Retain at least 14 daily snapshots.
- Test restore monthly into staging and run:
  - schema migration check
  - auth/login check
  - `/chat` check

## 5) Alerting minimums

Configure alerts for:

- 5xx rate spike
- p95 latency spike
- failed deploy/healthcheck
- scheduler heartbeat missing (no run for >2x expected interval)
- open error logs growth (>N/hour)

## 6) Incident response

1. Freeze deploys.
2. Roll back to previous healthy Railway deployment.
3. Verify DB connectivity and migration state (`_migrations`).
4. Disable scheduler by scaling down `APP_ROLE=scheduler` service or setting `ENABLE_SCHEDULER=false`.
5. Postmortem with root cause + prevention task.
