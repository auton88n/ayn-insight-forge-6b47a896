-- v3.172.0 — asked directly to bring the same research-driven redesign to
-- the rest of Resume Hub. Checked what the whole "application tracker"
-- competitor category (Huntr, Teal, Simplify) is actually loved for: real
-- pipeline tracking (Saved -> Applied -> Interviewing -> Offer), not just
-- a flat saved-jobs list. Confirmed live against the real schema first --
-- `jobs` had no status column at all, so once a resume was tailored for a
-- job, AYN had no way to record what happened next. This also answers a
-- real, separately-researched complaint (the #1 LinkedIn gripe: unclear
-- application status) the honest way AYN actually can: self-tracked by
-- the candidate, since there's no employer ATS to read a real status
-- from.
alter table public.jobs
  add column if not exists application_status text not null default 'saved'
    check (application_status in ('saved', 'applied', 'interviewing', 'offer', 'rejected', 'withdrawn'));

comment on column public.jobs.application_status is
  'Self-tracked by the candidate, not read from any employer system. saved is the default for every existing and new row.';

create index if not exists jobs_application_status_idx on public.jobs (user_id, application_status);
