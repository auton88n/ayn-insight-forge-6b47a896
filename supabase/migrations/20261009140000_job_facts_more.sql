-- More facts a posting states in its own text (see _shared/jobFacts.ts): a pay range written in the
-- text, how the role is worked, and the standard benefits it names. Read by job-enrich-worker.
-- Kept separate from the feed's own salary_min/max/work_mode so what a source says and what the text
-- says can both be seen and compared.
alter table public.job_postings
  add column if not exists salary_text_min integer,
  add column if not exists salary_text_max integer,
  add column if not exists salary_text_currency text,
  add column if not exists salary_text_period text check (salary_text_period in ('year', 'month', 'hour')),
  add column if not exists salary_text_annual_min integer,
  add column if not exists salary_text_annual_max integer,
  add column if not exists work_mode_text text check (work_mode_text in ('remote', 'hybrid', 'onsite')),
  add column if not exists benefits text[];
