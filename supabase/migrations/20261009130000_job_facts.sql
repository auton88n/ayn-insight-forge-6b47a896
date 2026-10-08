-- Facts a posting states in its own text (see _shared/jobFacts.ts), extracted by job-enrich-worker.
alter table public.job_postings
  add column if not exists years_required integer,
  add column if not exists sponsorship text check (sponsorship in ('offered', 'not_offered')),
  add column if not exists facts_extracted_at timestamptz;

create index if not exists job_postings_needs_facts_idx
  on public.job_postings (created_at desc) where facts_extracted_at is null;
