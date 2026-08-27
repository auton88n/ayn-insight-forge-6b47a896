-- v3.265.0 -- auto-apply is a paid feature (COST_AUTO_APPLY, see
-- lib/billing.ts). A real application naturally goes through auto_apply_fill
-- twice (a preview fill, then a confirm-and-submit fill, since each call is
-- a fresh, stateless browser session with no persistent state to resume
-- from) -- this column is what stops the second call on the same job from
-- being charged again for what is really one paid action, not two.
alter table public.jobs
  add column if not exists auto_apply_charged_at timestamptz;

comment on column public.jobs.auto_apply_charged_at is
  'Set the first time auto_apply_fill successfully runs for this job. Later calls for the same job (the confirm-and-submit step) are not charged again.';
