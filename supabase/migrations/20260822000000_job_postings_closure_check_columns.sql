-- v3.195.0 -- real closure verification before pruning. freehire's own
-- posted_at was live-tested and found unreliable: it gets kept looking
-- recent even for listings freehire's own "reality" classification calls
-- weeks old. Rather than trust it, job-board-sync now visits a listing's
-- real apply_url (via a headless-browser + AI checker) before deleting it
-- past FRESHNESS_DAYS. These columns track that verification per row.
alter table public.job_postings
  add column if not exists closure_checked_at timestamptz,
  add column if not exists closure_status text;
