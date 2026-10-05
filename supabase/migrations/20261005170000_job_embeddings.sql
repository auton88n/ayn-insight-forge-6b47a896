-- Semantic vectors for live job postings, so "Match me" can rank by how close a job is to a
-- person's real background instead of by exact wording overlap. Filled in by job-embed-worker.
-- Same 768-dimension space as candidate_index, so the two are never mixed with a different model:
-- embedding_model records which model produced each vector.
alter table public.job_postings
  add column if not exists embedding vector(768),
  add column if not exists embedding_model text,
  add column if not exists embedded_at timestamptz;

-- Rows still waiting for a vector; the worker reads this.
create index if not exists job_postings_needs_embedding_idx
  on public.job_postings (created_at desc) where embedding is null;
