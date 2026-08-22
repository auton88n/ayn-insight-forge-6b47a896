-- v3.195.0 -- "is this company actually hiring, or just showcasing roles
-- that never really turn over?" A single snapshot can't answer that, only
-- real behavior observed over time can: how many listings has AYN ever
-- seen from this company, and how many of those were genuinely removed
-- (either the closure checker confirmed they closed, or they simply aged
-- out) versus how many just sit there indefinitely. Maintained entirely by
-- triggers on job_postings so no application code has to remember to keep
-- it in sync, and so the aggregate survives even after the underlying
-- listing rows themselves get pruned.
create table if not exists public.company_hiring_stats (
  company_slug text primary key,
  company text,
  listings_tracked_total integer not null default 0,
  listings_confirmed_closed integer not null default 0,
  listings_blind_pruned integer not null default 0,
  oldest_tracked_created_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.company_hiring_stats enable row level security;
drop policy if exists company_hiring_stats_select_all on public.company_hiring_stats;
create policy company_hiring_stats_select_all on public.company_hiring_stats for select using (true);

-- Fires only for genuinely new rows: Postgres's own INSERT ... ON CONFLICT
-- DO UPDATE (what a Supabase .upsert() compiles to) fires the AFTER INSERT
-- trigger only on the no-conflict path, and AFTER UPDATE on the conflict
-- path -- so a re-upsert of an already-known listing (the common case,
-- every 2-hour sync re-confirming a still-live posting) never double-counts.
create or replace function public.job_postings_track_insert() returns trigger as $$
begin
  if new.company_slug is null then
    return new;
  end if;
  insert into public.company_hiring_stats (company_slug, company, listings_tracked_total, oldest_tracked_created_at, updated_at)
  values (new.company_slug, new.company, 1, new.created_at, now())
  on conflict (company_slug) do update set
    listings_tracked_total = company_hiring_stats.listings_tracked_total + 1,
    company = excluded.company,
    oldest_tracked_created_at = least(company_hiring_stats.oldest_tracked_created_at, excluded.oldest_tracked_created_at),
    updated_at = now();
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists trg_job_postings_track_insert on public.job_postings;
create trigger trg_job_postings_track_insert
  after insert on public.job_postings
  for each row
  execute function public.job_postings_track_insert();

-- Distinguishes a real, checker-confirmed closure from a plain elapsed-time
-- prune by reading OLD.closure_status -- job-board-sync's checker path sets
-- it to 'closed' immediately before deleting, specifically so this trigger
-- can tell the two apart. Anything else (null, 'open', 'error') counts as
-- a blind prune: a weaker signal, but still real movement.
create or replace function public.job_postings_track_delete() returns trigger as $$
begin
  if old.company_slug is null then
    return old;
  end if;
  update public.company_hiring_stats
  set
    listings_confirmed_closed = listings_confirmed_closed + (case when old.closure_status = 'closed' then 1 else 0 end),
    listings_blind_pruned = listings_blind_pruned + (case when old.closure_status is distinct from 'closed' then 1 else 0 end),
    updated_at = now()
  where company_slug = old.company_slug;
  return old;
end;
$$ language plpgsql security definer;

drop trigger if exists trg_job_postings_track_delete on public.job_postings;
create trigger trg_job_postings_track_delete
  after delete on public.job_postings
  for each row
  execute function public.job_postings_track_delete();

-- Deliberately requires real history before giving any verdict at all --
-- "not enough data yet" is the honest default, not a guess. Thresholds are
-- plain, fixed arithmetic (code decides, nothing is modeled or invented):
-- at least 3 listings tracked and at least 14 days of observation before
-- any verdict; >=25% of tracked listings actually turning over reads as
-- real hiring activity; <10% turnover after at least 30 days of watching
-- reads as a showcase pattern; anything between the two stays "uncertain"
-- rather than forcing a binary label neither threshold actually supports.
create or replace function public.company_hiring_status(p_company_slug text)
returns text
language sql
stable
as $$
  select case
    when chs.listings_tracked_total is null then 'insufficient_data'
    when chs.listings_tracked_total < 3 then 'insufficient_data'
    when chs.oldest_tracked_created_at > now() - interval '14 days' then 'insufficient_data'
    when (chs.listings_confirmed_closed + chs.listings_blind_pruned)::float / greatest(chs.listings_tracked_total, 1) >= 0.25 then 'active'
    when (chs.listings_confirmed_closed + chs.listings_blind_pruned)::float / greatest(chs.listings_tracked_total, 1) < 0.10
         and chs.oldest_tracked_created_at < now() - interval '30 days' then 'showcase'
    else 'uncertain'
  end
  from public.company_hiring_stats chs
  where chs.company_slug = p_company_slug;
$$;
