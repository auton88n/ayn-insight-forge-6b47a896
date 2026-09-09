-- Sept 2026 security review. security_logs already has a real-time trigger
-- (notify_security_alert -> admin-notifications) for individual high/
-- critical rows, but a single-row trigger cannot see a pattern across many
-- rows -- "50 failed logins from one place in ten minutes" is invisible to
-- it even though every individual row might only be medium severity. This
-- is the same singleton-state pattern error_alert_state already uses for
-- error_logs, applied to security_logs instead.
create table if not exists public.security_alert_state (
  id text primary key default 'singleton',
  last_checked_at timestamptz,
  last_alert_sent_at timestamptz,
  last_alert_count integer
);

insert into public.security_alert_state (id) values ('singleton')
on conflict (id) do nothing;

alter table public.security_alert_state enable row level security;
-- Zero policies, deny-by-default -- service_role bypasses RLS and is the
-- only caller, same shape as assessment_rubrics/assessment_results.
