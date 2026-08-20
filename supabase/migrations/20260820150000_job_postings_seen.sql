-- v3.183.0 — real, persistent "have I seen this job before" tracking.
-- Reported directly: swipe mode repeats cards across a reload (it has no
-- memory at all today, confirmed live), and list-view cards should show a
-- "seen" badge once opened. One table answers both: seen_at is written the
-- moment a card is opened (list) or reaches the front of the deck (swipe),
-- and both surfaces read the same set.
--
-- Scoped to (user_id, job_posting_id) with real ownership RLS, not
-- localStorage — the whole point is this survives a reload/new device,
-- unlike the deliberately session-local swipe-pass tracking that already
-- existed before this (v3.167.0's own design, left as-is for the "pass"
-- gesture itself; this table is additive, not a replacement).
--
-- on delete cascade from job_postings keeps this table naturally bounded:
-- job_postings itself prunes every 7 days (job-board-sync's own freshness
-- policy), so a seen-row for a since-pruned posting disappears with it
-- rather than accumulating forever.
create table if not exists public.job_postings_seen (
  user_id uuid not null references auth.users(id) on delete cascade,
  job_posting_id uuid not null references public.job_postings(id) on delete cascade,
  seen_at timestamptz not null default now(),
  primary key (user_id, job_posting_id)
);

alter table public.job_postings_seen enable row level security;

create policy "job_postings_seen_select_own" on public.job_postings_seen
  for select using (auth.uid() = user_id);

create policy "job_postings_seen_insert_own" on public.job_postings_seen
  for insert with check (auth.uid() = user_id);

create index if not exists job_postings_seen_user_idx on public.job_postings_seen (user_id);
