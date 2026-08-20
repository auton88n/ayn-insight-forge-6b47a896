-- v3.182.0 — the "status silence" nudge needs to know when a job actually
-- flipped to 'applied', not just that it's 'applied' now: application_status
-- (v3.172.0) has no timestamp of its own, so there was no honest way to
-- compute "how long has it been quiet." Defaults to now() rather than
-- backdating existing rows to created_at -- an existing 'applied' job's
-- real apply date isn't known, and claiming a false "applied 40 days ago"
-- would be a worse dishonesty than starting its silence clock today.
alter table public.jobs
  add column if not exists application_status_changed_at timestamptz not null default now();

comment on column public.jobs.application_status_changed_at is
  'When application_status last changed. Drives the "still no word?" nudge — never backdated for existing rows since the real date isn''t known.';
