-- v3.132.0 — error alerting. error_logs previously only ever heard from the
-- frontend ErrorBoundary (1 row in the last 30 days); nothing told anyone
-- when the backend itself started failing repeatedly. This singleton table
-- tracks what error-alert-check (a new edge function, cron-scheduled every
-- 10 minutes) has already checked and last alerted on, so a burst of errors
-- triggers exactly one email, not one per cron tick while the burst lasts.
create table if not exists public.error_alert_state (
  id text primary key default 'singleton',
  last_checked_at timestamptz not null default now(),
  last_alert_sent_at timestamptz,
  last_alert_count int not null default 0,
  constraint error_alert_state_singleton check (id = 'singleton')
);

insert into public.error_alert_state (id) values ('singleton')
on conflict (id) do nothing;

-- Service-role only, same pattern as assessment_rubrics/assessment_results:
-- RLS on, zero policies, so no signed-in user or anon caller can read or
-- write this regardless of any future grant.
alter table public.error_alert_state enable row level security;
