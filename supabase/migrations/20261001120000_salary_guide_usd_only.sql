-- Real bug, found by an independent testing pass: job_market_snapshot()'s
-- median salary per category blended every currency in job_postings into
-- one number -- USD dominates (~1,864 of ~2,100 salaried postings) but the
-- catalog genuinely also has CAD, EUR, GBP, AUD, PLN, AED, SEK and DKK rows
-- (confirmed live against production), none converted or excluded. A median
-- across mixed currencies is not a real comparison and reads as one when
-- shown on the public salary guide.
--
-- Fixed by scoping the salary calculation to USD only, normalized
-- case-insensitively (a handful of rows store it lowercase, 'usd'/'cad').
-- A null currency is also treated as USD here: checked directly against
-- production first rather than assumed -- only a single row in the whole
-- catalog has both a null currency and a plausible salary (a Belfast
-- posting), so this is a negligible, not a systematic, inclusion either
-- way. This is the same discipline as the existing 15000-700000
-- plausibility filter right above it in this same function: never guess
-- at a conversion rate (that would be inventing a fact this app has no
-- real source for), exclude what cannot be honestly compared instead.
-- salary_sample_size already told the reader how many postings backed a
-- figure; it now also tells them how many of those were USD-comparable.
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
  cat_salary as (
    select
      category,
      count(*) filter (
        where salary_min is not null and salary_max is not null
          and (salary_min + salary_max) / 2.0 between 15000 and 700000
          and (salary_currency is null or upper(salary_currency) = 'USD')
      ) as salary_n,
      percentile_cont(0.5) within group (
        order by ((salary_min + salary_max) / 2.0)
      ) filter (
        where salary_min is not null and salary_max is not null
          and (salary_min + salary_max) / 2.0 between 15000 and 700000
          and (salary_currency is null or upper(salary_currency) = 'USD')
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
