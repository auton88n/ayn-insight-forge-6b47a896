-- v3.315.0 -- Skills to Learn tracker. When a person confirms adding a
-- JD-required skill they don't have yet onto their tailored resume (a real,
-- deliberate, confirm-first choice, never automatic), the same skill also
-- lands here so there's a real, honest follow-through mechanism: not just a
-- claim on a document, but a concrete "go learn this" checklist grouped by
-- the job it came from. job_id/job_title/company are all denormalized (no
-- FK, matching resume_versions.created_for_job_id's own existing loose
-- convention) so this page still reads correctly even if the underlying
-- saved job is later removed.
create table if not exists public.skills_to_learn (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  job_id uuid,
  job_title text,
  company text,
  skill text not null,
  added_at timestamptz not null default now(),
  learned_at timestamptz
);

alter table public.skills_to_learn enable row level security;

create policy "owner full access" on public.skills_to_learn
  for all
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create index if not exists skills_to_learn_user_id_idx on public.skills_to_learn (user_id);
