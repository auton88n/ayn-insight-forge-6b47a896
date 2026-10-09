-- Public catalog receipts only. Feed sightings are not application-page checks.
alter table public.job_postings add column if not exists closure_last_open_at timestamptz;
create index if not exists idx_job_archive_posting_time
  on public.job_postings_archive(job_posting_id, archived_at desc);
update public.job_postings set closure_last_open_at = closure_checked_at
where closure_status = 'open' and closure_last_open_at is null;

create or replace function public.job_postings_keep_successful_check() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.closure_status = 'open' and new.closure_checked_at is not null then
    new.closure_last_open_at := new.closure_checked_at;
  elsif tg_op = 'UPDATE' then
    new.closure_last_open_at := old.closure_last_open_at;
  end if;
  return new;
end;
$$;
drop trigger if exists trg_job_postings_successful_check on public.job_postings;
create trigger trg_job_postings_successful_check before insert or update of closure_status, closure_checked_at
on public.job_postings for each row execute function public.job_postings_keep_successful_check();

-- The existing archive embeds the complete public row; it automatically retains
-- the last successful check without granting clients access to the archive table.
create or replace function public.job_posting_evidence(p_job_id uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  with live as (
    select to_jsonb(p) - 'embedding' as j, null::timestamptz as removed_at, null::text as reason
    from public.job_postings p where p.id = p_job_id and p.scam_suspected is not true
  ), archived as (
    select a.data as j, a.archived_at as removed_at, a.removal_reason as reason
    from public.job_postings_archive a where a.job_posting_id = p_job_id
      and coalesce(a.data->>'scam_suspected', 'false') <> 'true'
      and a.removal_reason <> 'scam' and not exists (select 1 from live)
    order by a.archived_at desc limit 1
  ), posting as (select * from live union all select * from archived limit 1)
  select jsonb_build_object(
    'source', j->>'source', 'first_seen_at', j->>'first_seen_at',
    'last_seen_at', j->>'last_seen_at', 'repost_count', j->'repost_count',
    'closure_status', j->>'closure_status', 'closure_checked_at', j->>'closure_checked_at',
    'closure_last_open_at', j->>'closure_last_open_at',
    'removed_at', removed_at, 'removal_reason', reason,
    'changes', coalesce((select jsonb_agg(to_jsonb(c) order by c.changed_at desc, c.id desc) from (
      select id, field, left(old_value, 300) as old_value, left(new_value, 300) as new_value, changed_at
      from public.job_posting_changes where job_posting_id = p_job_id
        and field in ('title', 'location', 'salary', 'description')
      order by changed_at desc, id desc limit 30
    ) c), '[]'::jsonb)
  ) from posting;
$$;
revoke all on function public.job_posting_evidence(uuid) from public;
grant execute on function public.job_posting_evidence(uuid) to anon, authenticated, service_role;
-- No direct archive/change-log grants, no personal tables and no write RPC.

-- Reuse the existing batched, owner-scoped saved-job lookup. No per-card RPC.
create or replace function public.saved_jobs_status() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'job_id', j.id,
    'status', case when lv.id is not null then 'live' when ar.archive_id is not null then 'taken_down' else 'not_listed' end,
    'posting_id', coalesce(lv.id, ar.job_posting_id),
    'match_basis', case when lv.id is not null then lv.match_basis when ar.archive_id is not null then 'url' end,
    'taken_down_at', ar.archived_at,
    'receipt', case when lv.id is not null then lv.receipt
      when ar.archive_id is not null then ar.receipt end)), '[]'::jsonb)
  from public.jobs j
  left join lateral (
    select p.id, case when lower(split_part(p.apply_url, '?', 1)) = lower(split_part(j.source_url, '?', 1)) then 'url' else 'company_title' end as match_basis,
      jsonb_build_object('source', p.source, 'first_seen_at', p.first_seen_at,
      'last_seen_at', p.last_seen_at, 'repost_count', p.repost_count,
      'closure_status', p.closure_status, 'closure_checked_at', p.closure_checked_at,
      'closure_last_open_at', p.closure_last_open_at) as receipt
    from public.job_postings p where p.scam_suspected is not true and (
      lower(split_part(p.apply_url, '?', 1)) = lower(split_part(j.source_url, '?', 1))
      or (lower(p.company) = lower(j.company) and lower(p.title) = lower(j.title)))
    order by (lower(split_part(p.apply_url, '?', 1)) = lower(split_part(j.source_url, '?', 1))) desc,
      p.last_seen_at desc nulls last, p.id limit 1
  ) lv on true
  left join lateral (
    select a.archive_id, a.archived_at, a.job_posting_id,
      jsonb_build_object('source', a.data->>'source', 'first_seen_at', a.data->>'first_seen_at',
        'last_seen_at', a.data->>'last_seen_at', 'repost_count', a.data->'repost_count',
        'closure_status', a.data->>'closure_status', 'closure_checked_at', a.data->>'closure_checked_at',
        'closure_last_open_at', a.data->>'closure_last_open_at',
        'removed_at', a.archived_at, 'removal_reason', a.removal_reason) as receipt
    from public.job_postings_archive a where lv.id is null
      and coalesce(a.data->>'scam_suspected', 'false') <> 'true' and a.removal_reason <> 'scam'
      and lower(split_part(a.data->>'apply_url', '?', 1)) = lower(split_part(j.source_url, '?', 1))
    order by a.archived_at desc limit 1
  ) ar on true
  where j.user_id = (select auth.uid()) and j.source_url is not null;
$$;
revoke all on function public.saved_jobs_status() from public, anon;
grant execute on function public.saved_jobs_status() to authenticated;

create or replace function public.company_profile(p_company_slug text) returns jsonb
language sql stable security definer set search_path = public as $$
  with jobs as (
    select * from job_postings where lower(company_slug) = lower(p_company_slug) and scam_suspected is not true
  )
  select case when (select count(*) from jobs) = 0 then null else jsonb_build_object(
    'slug', lower(p_company_slug),
    'name', (select company from jobs order by posted_at desc limit 1),
    'logo_url', (select company_logo_url from jobs where company_logo_url is not null order by posted_at desc limit 1),
    'insights', public.company_insights(p_company_slug),
    'relisted_roles', (select count(*) from jobs where repost_count > 0),
    'edits_30d', (select count(*) from job_posting_changes where lower(company_slug) = lower(p_company_slug) and changed_at > now() - interval '30 days'),
    'sponsorship', jsonb_build_object(
      'offered', (select count(*) from jobs where sponsorship = 'offered'),
      'not_offered', (select count(*) from jobs where sponsorship = 'not_offered')),
    'work_mode', (select coalesce(jsonb_object_agg(m, n), '{}'::jsonb) from (select coalesce(work_mode, work_mode_text) as m, count(*) n from jobs where coalesce(work_mode, work_mode_text) is not null group by 1) w),
    'top_categories', (select coalesce(jsonb_agg(jsonb_build_object('category', category, 'open_roles', n) order by n desc), '[]'::jsonb) from (select category, count(*) n from jobs where category is not null group by 1 order by 2 desc limit 4) c),
    'common_benefits', (select coalesce(jsonb_agg(jsonb_build_object('benefit', b, 'roles', n) order by n desc), '[]'::jsonb) from (select unnest(benefits) as b, count(*) n from jobs where benefits is not null group by 1 order by 2 desc limit 6) bb),
    'jobs', (select coalesce(jsonb_agg(row_to_json(r)), '[]'::jsonb) from (
      select j.id, j.title, j.location, j.posted_at, j.first_seen_at, j.seniority, j.work_mode, j.apply_by,
        j.source, j.last_seen_at, j.repost_count, j.closure_status, j.closure_checked_at, j.closure_last_open_at
      from jobs j order by j.posted_at desc limit 40) r)
  ) end;
$$;
revoke all on function public.company_profile(text) from public;
grant execute on function public.company_profile(text) to anon, authenticated, service_role;
notify pgrst, 'reload schema';
