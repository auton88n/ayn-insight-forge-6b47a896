# AYN Backend Production Runbook (Railway)

## 1) Deployment topology

- **Web service** (`spine-web`): serves FastAPI API traffic.
  - `ENABLE_SCHEDULER=false`
- **Worker service** (`spine-worker`): runs the same image, no public traffic.
  - `ENABLE_SCHEDULER=true`

This guarantees scheduler jobs run on exactly one instance.

## 2) Required environment variables

Must be set in Railway before deploy:

- `DATABASE_URL`
- `AYN_JWT_SECRET`
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

- Railway healthcheck: `GET /health`
- Manual checks after deploy:
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
4. Disable scheduler (`ENABLE_SCHEDULER=false`) if jobs are causing incident.
5. Postmortem with root cause + prevention task.
