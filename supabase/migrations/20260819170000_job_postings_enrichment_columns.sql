-- v3.166.0 — capture freehire's own enrichment data instead of leaving it on
-- the floor. job_postings has only ever stored title/company/location/
-- description/posted_at; the real upstream source already returns
-- employment_type, seniority, salary_min/max/currency, category, work_mode,
-- a structured city, a tagged skills array, and a mass_posting_count quality
-- signal on every row (confirmed live against the real API before writing
-- this). All nullable — real coverage in a live sample was ~34% for salary/
-- seniority, ~86% for city, so these are "store what's there," never
-- inferred or fabricated for the rows that don't have them.
--
-- No backfill: job_postings is pruned every 7 days (job-board-sync's own
-- FRESHNESS_DAYS), so the very next sync cycle naturally replaces every row
-- with these fields populated going forward.
alter table public.job_postings
  add column if not exists employment_type text,
  add column if not exists seniority text,
  add column if not exists salary_min integer,
  add column if not exists salary_max integer,
  add column if not exists salary_currency text,
  add column if not exists category text,
  add column if not exists work_mode text,
  add column if not exists city text,
  add column if not exists skills text[],
  add column if not exists mass_posting_count integer;

create index if not exists job_postings_category_idx on public.job_postings (category);
create index if not exists job_postings_city_idx on public.job_postings (city);
create index if not exists job_postings_employment_type_idx on public.job_postings (employment_type);
