-- Real, live hiring-market snapshot computed from job_postings, for a public
-- content page (a genuine content-marketing asset, not on-page decoration).
-- Anon-executable, matching the existing job_postings_select_anon RLS policy's
-- own scam-exclusion filter, so an anonymous reader gets the same honest,
-- non-flagged catalog the public /jobs page already shows.

create or replace function public.job_market_snapshot()
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
  with base as (
    select *
    from job_postings
    where scam_suspected is not true
  ),
  cat_counts as (
    select category, count(*) as n
    from base
    where category is not null
    group by category
  ),
  -- Salary figures below 15000 are almost always an hourly rate landing in
  -- an annual field, not a real annual salary; above 700000 is far enough
  -- outside a plausible base-salary range to be a data error rather than a
  -- real outlier. Both are excluded here, at the source, so nothing
  -- downstream ever has to guess whether a number is trustworthy.
  cat_salary as (
    select
      category,
      count(*) filter (
        where salary_min is not null and salary_max is not null
          and (salary_min + salary_max) / 2.0 between 15000 and 700000
      ) as salary_n,
      percentile_cont(0.5) within group (
        order by ((salary_min + salary_max) / 2.0)
      ) filter (
        where salary_min is not null and salary_max is not null
          and (salary_min + salary_max) / 2.0 between 15000 and 700000
      ) as median_salary
    from base
    where category is not null
    group by category
  ),
  work_mode_counts as (
    select coalesce(work_mode, 'unspecified') as mode, count(*) as n
    from base
    group by coalesce(work_mode, 'unspecified')
  ),
  city_counts as (
    select city, count(*) as n
    from base
    where city is not null
    group by city
    order by count(*) desc
    limit 10
  ),
  totals as (
    select
      count(*) as total_open,
      count(*) filter (where posted_at > now() - interval '24 hours') as posted_last_24h
    from base
  )
  select jsonb_build_object(
    'generated_at', now(),
    'total_open', (select total_open from totals),
    'posted_last_24h', (select posted_last_24h from totals),
    'categories', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'category', ranked.category,
        'open_roles', ranked.n,
        'median_salary', round(coalesce(ranked.median_salary, 0))::int,
        'salary_sample_size', coalesce(ranked.salary_n, 0)
      ) order by ranked.n desc), '[]'::jsonb)
      from (
        select c.category, c.n, s.median_salary, s.salary_n
        from cat_counts c
        left join cat_salary s using (category)
        where c.n >= 20
        order by c.n desc
        limit 14
      ) ranked
    ),
    'work_mode', (
      select coalesce(jsonb_object_agg(mode, n), '{}'::jsonb)
      from work_mode_counts
    ),
    'top_cities', (
      select coalesce(jsonb_agg(jsonb_build_object('city', city, 'open_roles', n) order by n desc), '[]'::jsonb)
      from city_counts
    )
  );
$$;

revoke all on function public.job_market_snapshot() from public;
grant execute on function public.job_market_snapshot() to anon, authenticated;
