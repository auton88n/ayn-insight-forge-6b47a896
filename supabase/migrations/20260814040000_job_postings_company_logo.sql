-- v3.135.0 — real company marks for Browse Jobs. freehire's job listings
-- carry no logo field at all (confirmed live against the raw API), but its
-- separate /companies/{slug} endpoint returns a real company website, which
-- resolves to a real favicon via a domain-based lookup. company_slug is the
-- canonical key job-board-sync uses to call that endpoint once per company
-- per run (memoized against rows already resolved in a prior run, via this
-- same column, so a stable company isn't re-queried forever); both columns
-- are nullable and additive — a row with neither still falls back to the
-- client-side monogram avatar BrowseJobs.tsx already renders.
alter table public.job_postings add column if not exists company_slug text;
alter table public.job_postings add column if not exists company_logo_url text;
