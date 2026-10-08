-- More facts from the posting text, one normalized pay view, and the public functions behind the
-- salary check, company insights and company pages, plus detection of saved jobs that were taken down.
alter table public.job_postings
  add column if not exists remote_region text,
  add column if not exists apply_by date;

create index if not exists job_postings_company_lower_idx on public.job_postings (lower(company_slug));
create index if not exists job_postings_company_title_idx on public.job_postings (lower(company), lower(title));
create index if not exists job_postings_apply_norm_idx on public.job_postings (lower(split_part(apply_url, '?', 1)));
create index if not exists job_postings_archive_apply_norm_idx on public.job_postings_archive (lower(split_part(data->>'apply_url', '?', 1)));

-- One pay figure per job, per year, in one currency: the feed's own range when it looks like a yearly
-- figure, otherwise the range read from the posting text. Not exposed directly; the functions below read it.
create or replace view public.job_pay as
select jp.id, jp.company_slug, jp.company, jp.category, jp.city, jp.location, jp.title, jp.seniority,
       case when lst.ok then jp.salary_min else jp.salary_text_annual_min end as annual_min,
       case when lst.ok then jp.salary_max else jp.salary_text_annual_max end as annual_max,
       case when lst.ok then coalesce(upper(jp.salary_currency), 'USD') else jp.salary_text_currency end as currency,
       case when lst.ok then 'listed' else 'text' end as pay_source
  from public.job_postings jp
 cross join lateral (select (jp.salary_min is not null and jp.salary_max is not null
                             and (jp.salary_min + jp.salary_max) / 2.0 between 15000 and 1500000) as ok) lst
 where jp.scam_suspected is not true
   and (lst.ok or jp.salary_text_annual_min is not null);
revoke all on public.job_pay from anon, authenticated;

-- The salary guide and the article engine now use every job that shows pay, not only the feed's own field.
create or replace function public.job_market_snapshot() returns jsonb language sql stable security definer set search_path = public as $function$
  with base as (select * from job_postings where scam_suspected is not true),
  cat_counts as (select category, count(*) as n from base where category is not null group by category),
  cat_salary as (
    select category, count(*) as salary_n,
           percentile_cont(0.5) within group (order by ((annual_min + annual_max) / 2.0)) as median_salary
      from job_pay
     where currency = 'USD' and category is not null and (annual_min + annual_max) / 2.0 between 15000 and 700000
     group by category
  ),
  work_mode_counts as (select coalesce(work_mode, work_mode_text, 'unspecified') as mode, count(*) as n from base group by 1),
  city_counts as (select city, count(*) as n from base where city is not null group by city order by count(*) desc limit 10),
  totals as (select count(*) as total_open, count(*) filter (where posted_at > now() - interval '24 hours') as posted_last_24h from base)
  select jsonb_build_object(
    'generated_at', now(),
    'total_open', (select total_open from totals),
    'posted_last_24h', (select posted_last_24h from totals),
    'categories', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'category', ranked.category, 'open_roles', ranked.n,
        'median_salary', round(coalesce(ranked.median_salary, 0))::int,
        'salary_sample_size', coalesce(ranked.salary_n, 0)) order by ranked.n desc), '[]'::jsonb)
      from (select c.category, c.n, s.median_salary, s.salary_n from cat_counts c left join cat_salary s using (category)
             where c.n >= 20 order by c.n desc limit 14) ranked),
    'work_mode', (select coalesce(jsonb_object_agg(mode, n), '{}'::jsonb) from work_mode_counts),
    'top_cities', (select coalesce(jsonb_agg(jsonb_build_object('city', city, 'open_roles', n) order by n desc), '[]'::jsonb) from city_counts)
  );
$function$;

create or replace function public.article_source_data(p_kind text, p_category text, p_city text default null) returns jsonb
language sql stable security definer set search_path = public as $function$
  with base as (
    select * from public.job_postings
     where scam_suspected is not true and category = p_category and (p_city is null or city = p_city)
  ),
  salary_base as (
    select jp.annual_min, jp.annual_max from job_pay jp join base b on b.id = jp.id
     where jp.currency = 'USD' and (jp.annual_min + jp.annual_max) / 2.0 between 15000 and 700000
  ),
  work_mode_counts as (select coalesce(work_mode, work_mode_text, 'unspecified') as mode, count(*) as n from base group by 1),
  top_companies as (select company, count(*) as n from base where company is not null group by company order by count(*) desc limit 8)
  select jsonb_build_object(
    'generated_at', now(), 'kind', p_kind, 'category', p_category, 'city', p_city,
    'open_roles', (select count(*) from base),
    'posted_last_24h', (select count(*) from base where posted_at > now() - interval '24 hours'),
    'posted_last_7d', (select count(*) from base where posted_at > now() - interval '7 days'),
    'median_salary', (select round(coalesce(percentile_cont(0.5) within group (order by (annual_min + annual_max) / 2.0), 0))::int from salary_base),
    'p25_salary', (select round(coalesce(percentile_cont(0.25) within group (order by (annual_min + annual_max) / 2.0), 0))::int from salary_base),
    'p75_salary', (select round(coalesce(percentile_cont(0.75) within group (order by (annual_min + annual_max) / 2.0), 0))::int from salary_base),
    'salary_sample_size', (select count(*) from salary_base),
    'work_mode', (select coalesce(jsonb_object_agg(mode, n), '{}'::jsonb) from work_mode_counts),
    'top_companies', (select coalesce(jsonb_agg(jsonb_build_object('company', company, 'open_roles', n) order by n desc), '[]'::jsonb) from top_companies)
  );
$function$;

-- "How does my pay compare?" Advertised ranges for similar roles, not what people are actually paid.
create or replace function public.salary_market_check(
  p_category text default null, p_title_query text default null, p_city text default null,
  p_currency text default 'USD', p_amount numeric default null
) returns jsonb language sql stable security definer set search_path = public as $$
  with q as (
    select nullif(lower(btrim(left(coalesce(p_title_query, ''), 60))), '') as t,
           nullif(lower(btrim(left(coalesce(p_city, ''), 60))), '') as c,
           upper(coalesce(nullif(btrim(p_currency), ''), 'USD')) as cur
  ), sel as (
    select (jp.annual_min + jp.annual_max) / 2.0 as mid
      from job_pay jp, q
     where jp.currency = q.cur
       and (p_category is null or jp.category = p_category)
       and (q.t is null or position(q.t in lower(jp.title)) > 0)
       and (q.c is null or lower(coalesce(jp.city, '')) = q.c or position(q.c in lower(coalesce(jp.location, ''))) > 0)
       and (jp.annual_min + jp.annual_max) / 2.0 between 15000 and 1500000
  ), stats as (
    select count(*) as n,
           percentile_cont(0.10) within group (order by mid) as p10,
           percentile_cont(0.25) within group (order by mid) as p25,
           percentile_cont(0.50) within group (order by mid) as p50,
           percentile_cont(0.75) within group (order by mid) as p75,
           percentile_cont(0.90) within group (order by mid) as p90
      from sel
  )
  select case when s.n >= 20 then jsonb_build_object(
      'enough', true, 'sample', s.n, 'currency', (select cur from q),
      'p10', round(s.p10)::int, 'p25', round(s.p25)::int, 'median', round(s.p50)::int, 'p75', round(s.p75)::int, 'p90', round(s.p90)::int,
      'your_percentile', case when p_amount between 1000 and 5000000 then round(100.0 * (select count(*) from sel where mid <= p_amount) / s.n)::int end,
      'vs_median_pct', case when p_amount between 1000 and 5000000 and s.p50 > 0 then round(100.0 * (p_amount - s.p50) / s.p50)::int end
    ) else jsonb_build_object('enough', false, 'sample', s.n) end
  from stats s;
$$;
grant execute on function public.salary_market_check(text, text, text, text, numeric) to anon, authenticated, service_role;

-- A company's pay openness and hiring speed, shown on its job pages.
create or replace function public.company_insights(p_company_slug text) returns jsonb
language sql stable security definer set search_path = public as $$
  with p as (
    select (salary_min is not null or salary_max is not null or salary_text_min is not null) as has_pay
      from job_postings where lower(company_slug) = lower(p_company_slug) and scam_suspected is not true
  )
  select jsonb_build_object(
    'open_roles', (select count(*) from p),
    'pay', case when (select count(*) from p) >= 5 then jsonb_build_object(
              'postings', (select count(*) from p), 'with_pay', (select count(*) filter (where has_pay) from p),
              'pct', (select round(100.0 * count(*) filter (where has_pay) / count(*))::int from p)) end,
    'speed', public.company_hiring_speed(p_company_slug)
  );
$$;
grant execute on function public.company_insights(text) to anon, authenticated, service_role;

-- Everything AYN knows about one company, for its public page.
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
        select j.id, j.title, j.location, j.posted_at, j.first_seen_at, j.seniority, j.work_mode, j.apply_by
          from jobs j order by j.posted_at desc limit 40) r)
  ) end;
$$;
grant execute on function public.company_profile(text) to anon, authenticated, service_role;

-- Which of my saved jobs are still listed? A job counts as live if the same link, or the same company
-- and title, is in the feed. "taken_down" when AYN has watched it leave (history only exists from the day
-- it was switched on); "not_listed" when it is simply no longer in the feed and left before that.
create or replace function public.saved_jobs_status() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'job_id', j.id,
      'status', case when lv.id is not null then 'live' when ar.archive_id is not null then 'taken_down' else 'not_listed' end,
      'taken_down_at', ar.archived_at)), '[]'::jsonb)
    from public.jobs j
    left join lateral (
      select p.id from public.job_postings p
       where lower(split_part(p.apply_url, '?', 1)) = lower(split_part(j.source_url, '?', 1))
          or (lower(p.company) = lower(j.company) and lower(p.title) = lower(j.title)) limit 1) lv on true
    left join lateral (
      select a.archive_id, a.archived_at from public.job_postings_archive a
       where lv.id is null and lower(split_part(a.data->>'apply_url', '?', 1)) = lower(split_part(j.source_url, '?', 1))
       order by a.archived_at desc limit 1) ar on true
   where j.user_id = (select auth.uid()) and j.source_url is not null;
$$;
revoke all on function public.saved_jobs_status() from public, anon;
grant execute on function public.saved_jobs_status() to authenticated;
