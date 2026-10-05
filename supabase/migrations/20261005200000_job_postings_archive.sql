-- Permanent history of every job posting AYN has ever held. job_postings is a live
-- catalog that prunes after the freshness window; this keeps what was removed so it
-- can be analysed later (turnover, time-to-fill, salary trends, hiring by company/city).
-- A trigger copies each row on delete, so every removal path is covered (the 7-day
-- prune, a confirmed closure, a scam purge) without touching any function code.
create table if not exists public.job_postings_archive (
  archive_id bigserial primary key,
  job_posting_id uuid not null,
  source text,
  company text,
  company_slug text,
  title text,
  location text,
  category text,
  posted_at timestamptz,
  first_seen_at timestamptz,
  archived_at timestamptz not null default now(),
  removal_reason text not null,          -- closed | scam | pruned
  days_live numeric,
  data jsonb not null                    -- the full row, minus the embedding vector
);

alter table public.job_postings_archive enable row level security;  -- no policies: service role / admin RPC only
revoke all on public.job_postings_archive from anon, authenticated;

create index if not exists job_postings_archive_company_idx on public.job_postings_archive (company_slug);
create index if not exists job_postings_archive_archived_idx on public.job_postings_archive (archived_at desc);
create index if not exists job_postings_archive_category_idx on public.job_postings_archive (category);

create or replace function public.job_postings_archive_on_delete() returns trigger as $$
declare j jsonb := to_jsonb(old) - 'embedding';
begin
  insert into public.job_postings_archive
    (job_posting_id, source, company, company_slug, title, location, category,
     posted_at, first_seen_at, removal_reason, days_live, data)
  values (
    old.id,
    j->>'source',
    coalesce(j->>'company', j->>'company_name'),
    j->>'company_slug',
    j->>'title',
    j->>'location',
    j->>'category',
    nullif(j->>'posted_at','')::timestamptz,
    nullif(j->>'created_at','')::timestamptz,
    case when j->>'closure_status' = 'closed' then 'closed'
         when j->>'scam_suspected' = 'true' then 'scam'
         else 'pruned' end,
    extract(epoch from (now() - nullif(j->>'created_at','')::timestamptz)) / 86400,
    j
  );
  return old;
exception when others then
  return old;   -- archiving must never block a delete
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists trg_job_postings_archive on public.job_postings;
create trigger trg_job_postings_archive
  before delete on public.job_postings
  for each row execute function public.job_postings_archive_on_delete();
