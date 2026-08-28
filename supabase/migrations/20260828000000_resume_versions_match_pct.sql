-- v3.269.0 — persists the real, output-side ATS match percentage
-- (computeGap re-run against the actual tailored resume text, not just the
-- profile) and the genuinely-missing requirement list alongside each
-- tailored resume, so the person sees an honest, explained score every time
-- they come back to this job, not only in the few seconds right after
-- generating it. Both nullable: an older resume_versions row generated
-- before this shipped has neither, and the frontend treats that as "no
-- score on file" rather than a false zero.
alter table public.resume_versions
  add column if not exists match_pct integer,
  add column if not exists still_missing jsonb not null default '[]'::jsonb;

comment on column public.resume_versions.match_pct is
  'Percentage of this job''s real, required items the tailored resume''s own output text evidences -- computed deterministically (computeGap), never a model''s self-report.';
comment on column public.resume_versions.still_missing is
  'The job''s own required items that are genuinely not evidenced anywhere in this person''s background. Never auto-added; shown honestly so the person can decide.';
