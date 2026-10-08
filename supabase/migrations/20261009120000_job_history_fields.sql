-- What AYN knows about each job's life, so the site can say "first seen 47 days ago" and "listed 3
-- times" without relying on the date a company or feed chooses to show.
--   first_seen_at  when AYN first saw this role. If the same role (company, title, location) was
--                  removed earlier and has come back, this carries the earliest sighting forward.
--   last_seen_at   the last time a sync saw the posting still listed (set by the sync functions).
--   repost_count   how many earlier lives of this same role AYN has archived.
alter table public.job_postings
  add column if not exists first_seen_at timestamptz,
  add column if not exists last_seen_at timestamptz,
  add column if not exists repost_count integer not null default 0;

update public.job_postings set first_seen_at = created_at where first_seen_at is null;
update public.job_postings set last_seen_at = greatest(posted_at, created_at) where last_seen_at is null;

alter table public.job_postings
  alter column first_seen_at set default now(),
  alter column last_seen_at set default now();

-- Finding earlier lives of a role: the archive keeps every removed posting.
create index if not exists job_postings_archive_role_idx
  on public.job_postings_archive (lower(company_slug), lower(title), lower(coalesce(location, '')));

create or replace function public.job_postings_carry_history() returns trigger as $$
declare h record;
begin
  if new.company_slug is null or new.title is null then
    return new;
  end if;
  select min(a.first_seen_at) as first_seen, count(*) as n
    into h
    from public.job_postings_archive a
   where lower(a.company_slug) = lower(new.company_slug)
     and lower(a.title) = lower(new.title)
     and lower(coalesce(a.location, '')) = lower(coalesce(new.location, ''));
  if h.n > 0 then
    new.first_seen_at := least(coalesce(h.first_seen, now()), coalesce(new.first_seen_at, now()));
    new.repost_count := h.n;
  end if;
  return new;
exception when others then
  return new;   -- history must never block a new posting
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists trg_job_postings_carry_history on public.job_postings;
create trigger trg_job_postings_carry_history
  before insert on public.job_postings
  for each row execute function public.job_postings_carry_history();
