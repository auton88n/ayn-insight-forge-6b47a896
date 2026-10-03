-- Admin SEO tab: one place to see how the site shows up in search and to
-- steer the article engine without asking for a code change.
--
-- seo_topic_blocks   topics the article engine must never write about
-- seo_snapshots      point-in-time readings (Search Console, PageSpeed)
--                    written by service role, shown read-only in admin
-- RLS is on with no policies for both: only the SECURITY DEFINER functions
-- below (admin gated) and service_role can touch them.

create table if not exists public.seo_topic_blocks (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('salary_report', 'hiring_trend')),
  category text not null,
  city text,
  reason text,
  created_at timestamptz not null default now()
);
create unique index if not exists seo_topic_blocks_unique
  on public.seo_topic_blocks (kind, category, coalesce(city, ''));
alter table public.seo_topic_blocks enable row level security;

create table if not exists public.seo_snapshots (
  id uuid primary key default gen_random_uuid(),
  source text not null check (source in ('search_console', 'pagespeed')),
  taken_at timestamptz not null default now(),
  data jsonb not null
);
create index if not exists seo_snapshots_source_taken on public.seo_snapshots (source, taken_at desc);
alter table public.seo_snapshots enable row level security;

-- Topic selection now skips anything an admin has blocked.
create or replace function public.article_topic_candidates(p_limit integer default 4)
returns table(kind text, category text, city text, sample_size bigint)
language sql
stable
security definer
set search_path to 'public'
as $function$
  with base as (
    select * from public.job_postings where scam_suspected is not true
  ),
  cat_city as (
    select category, city, count(*) as n
    from base
    where category is not null and city is not null
    group by category, city
    having count(*) >= 20
  ),
  cat_only as (
    select category, count(*) as n
    from base
    where category is not null
    group by category
    having count(*) >= 20
  ),
  all_candidates as (
    select 'salary_report'::text as kind, cc.category, cc.city, cc.n as sample_size
    from cat_city cc
    union all
    select 'hiring_trend'::text as kind, co.category, null::text as city, co.n as sample_size
    from cat_only co
  ),
  ranked as (
    select
      ac.kind, ac.category, ac.city, ac.sample_size,
      row_number() over (
        partition by ac.kind
        order by (a.id is null) desc, a.refreshed_at asc nulls first, ac.sample_size desc
      ) as rn
    from all_candidates ac
    left join public.articles a
      on a.kind = ac.kind
      and a.category = ac.category
      and coalesce(a.city, '') = coalesce(ac.city, '')
    where (a.id is null or a.status = 'published')
      and not exists (
        select 1 from public.seo_topic_blocks b
        where b.kind = ac.kind and b.category = ac.category
          and coalesce(b.city, '') = coalesce(ac.city, '')
      )
  )
  select kind, category, city, sample_size
  from ranked
  order by rn asc, kind asc
  limit p_limit;
$function$;

create or replace function public.get_admin_seo()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  job_id bigint;
begin
  if not has_role((select auth.uid()), 'admin'::app_role) then
    raise exception 'Admin access required';
  end if;
  select jobid into job_id from cron.job where jobname = 'content-engine';
  return jsonb_build_object(
    'engine', jsonb_build_object(
      'active', (select active from cron.job where jobid = job_id),
      'schedule', (select coalesce((select value from app_settings where key = 'content_engine_schedule'), '0 14 * * 2,5')),
      'articles_per_run', (select coalesce((select value from app_settings where key = 'content_engine_articles_per_run'), '2')::int),
      'last_manual_run', (select value from app_settings where key = 'content_engine_last_manual_run')
    ),
    'recent_runs', coalesce((
      select jsonb_agg(jsonb_build_object('started_at', start_time, 'status', status) order by start_time desc)
      from (select start_time, status from cron.job_run_details where jobid = job_id and command = (select command from cron.job where jobid = job_id) order by start_time desc limit 6) r
    ), '[]'::jsonb),
    'articles', jsonb_build_object(
      'published', (select count(*) from public.articles where status = 'published'),
      'archived', (select count(*) from public.articles where status = 'archived'),
      'words', (select coalesce(sum(word_count), 0) from public.articles where status = 'published'),
      'cost_cents', (select coalesce(sum(generation_cost_cents), 0) from public.articles),
      'last_published_at', (select max(published_at) from public.articles where status = 'published'),
      'salary_reports', (select count(*) from public.articles where status = 'published' and kind = 'salary_report'),
      'hiring_trends', (select count(*) from public.articles where status = 'published' and kind = 'hiring_trend')
    ),
    'coverage', jsonb_build_object(
      'hiring_topics_eligible', (select count(*) from (select category from public.job_postings where scam_suspected is not true and category is not null group by category having count(*) >= 20) c),
      'salary_topics_eligible', (select count(*) from (select category, city from public.job_postings where scam_suspected is not true and category is not null and city is not null group by category, city having count(*) >= 20) c)
    ),
    'pages', jsonb_build_object(
      'job_pages', (select count(*) from public.job_postings where scam_suspected is not true),
      'insight_pages', (select count(*) from public.articles where status = 'published')
    ),
    'next_up', coalesce((select jsonb_agg(jsonb_build_object('kind', kind, 'category', category, 'city', city, 'sample_size', sample_size)) from public.article_topic_candidates(8)), '[]'::jsonb),
    'blocks', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'kind', kind, 'category', category, 'city', city, 'reason', reason) order by created_at desc) from public.seo_topic_blocks), '[]'::jsonb),
    'search_console', (select jsonb_build_object('taken_at', taken_at, 'data', data) from public.seo_snapshots where source = 'search_console' order by taken_at desc limit 1),
    'pagespeed', (select jsonb_build_object('taken_at', taken_at, 'data', data) from public.seo_snapshots where source = 'pagespeed' order by taken_at desc limit 1),
    'generated_at', now()
  );
end;
$$;

-- Pause or resume the scheduled job (the schedule itself stays as set).
create or replace function public.admin_article_set_active(p_active boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare job_id bigint;
begin
  if not has_role((select auth.uid()), 'admin'::app_role) then
    raise exception 'Admin access required';
  end if;
  select jobid into job_id from cron.job where jobname = 'content-engine';
  if job_id is null then raise exception 'Scheduled job not found'; end if;
  perform cron.alter_job(job_id, active := p_active);
  return jsonb_build_object('ok', true, 'active', p_active);
end;
$$;

-- Run the engine now, using exactly the command the schedule runs (same
-- credentials, same per-run article count). Guarded so a double click or a
-- second admin cannot start two paid runs within ten minutes.
create or replace function public.admin_article_run_now()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  cmd text;
  last_run timestamptz;
begin
  if not has_role((select auth.uid()), 'admin'::app_role) then
    raise exception 'Admin access required';
  end if;
  select value::timestamptz into last_run from app_settings where key = 'content_engine_last_manual_run';
  if last_run is not null and last_run > now() - interval '10 minutes' then
    raise exception 'A run was started less than ten minutes ago. Wait for it to finish.';
  end if;
  select command into cmd from cron.job where jobname = 'content-engine';
  if cmd is null then raise exception 'Scheduled job not found'; end if;
  execute cmd;
  insert into app_settings (key, value) values ('content_engine_last_manual_run', now()::text)
    on conflict (key) do update set value = excluded.value, updated_at = now();
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.admin_seo_block_topic(p_kind text, p_category text, p_city text, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not has_role((select auth.uid()), 'admin'::app_role) then
    raise exception 'Admin access required';
  end if;
  if p_kind not in ('salary_report', 'hiring_trend') then raise exception 'Unknown kind'; end if;
  if coalesce(trim(p_category), '') = '' then raise exception 'Category required'; end if;
  insert into public.seo_topic_blocks (kind, category, city, reason)
    values (p_kind, p_category, nullif(trim(coalesce(p_city, '')), ''), nullif(trim(coalesce(p_reason, '')), ''))
    on conflict do nothing;
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.admin_seo_unblock_topic(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not has_role((select auth.uid()), 'admin'::app_role) then
    raise exception 'Admin access required';
  end if;
  delete from public.seo_topic_blocks where id = p_id;
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.get_admin_seo() from public, anon;
revoke all on function public.admin_article_set_active(boolean) from public, anon;
revoke all on function public.admin_article_run_now() from public, anon;
revoke all on function public.admin_seo_block_topic(text, text, text, text) from public, anon;
revoke all on function public.admin_seo_unblock_topic(uuid) from public, anon;
grant execute on function public.get_admin_seo() to authenticated, service_role;
grant execute on function public.admin_article_set_active(boolean) to authenticated, service_role;
grant execute on function public.admin_article_run_now() to authenticated, service_role;
grant execute on function public.admin_seo_block_topic(text, text, text, text) to authenticated, service_role;
grant execute on function public.admin_seo_unblock_topic(uuid) to authenticated, service_role;
