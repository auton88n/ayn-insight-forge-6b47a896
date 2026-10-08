-- Public aggregate only. Never compare across currencies, locations or levels,
-- never include the selected posting in its own benchmark, and never silently
-- broaden a cohort to manufacture a result.
create or replace function public.job_salary_comparison(p_job_id uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  with target as (
    select * from public.job_pay where id = p_job_id
      and category is not null and nullif(trim(city), '') is not null
      and nullif(trim(seniority), '') is not null
      and currency in ('USD','CAD','GBP','EUR','AUD','AED','SAR','SGD','CHF','INR')
      and annual_min > 0 and annual_max >= annual_min
      and (annual_min + annual_max) / 2.0 between 15000 and 1500000
  ), cohort as (
    select (p.annual_min + p.annual_max) / 2.0 as midpoint
    from public.job_pay p join target t on p.category = t.category
      and lower(trim(p.city)) = lower(trim(t.city))
      and lower(trim(p.seniority)) = lower(trim(t.seniority)) and p.currency = t.currency
    where p.id <> t.id and p.annual_min > 0 and p.annual_max >= p.annual_min
      and (p.annual_min + p.annual_max) / 2.0 between 15000 and 1500000
  ), stats as (
    select count(*) as n,
      percentile_cont(0.25) within group(order by midpoint) as p25,
      percentile_cont(0.5) within group(order by midpoint) as median,
      percentile_cont(0.75) within group(order by midpoint) as p75 from cohort
  )
  select jsonb_build_object('enough', s.n >= 20, 'sample', s.n,
    'currency', t.currency, 'category', t.category, 'city', t.city, 'seniority', t.seniority,
    'annual_min', t.annual_min, 'annual_max', t.annual_max,
    'median', case when s.n >= 20 then round(s.median::numeric) end,
    'p25', case when s.n >= 20 then round(s.p25::numeric) end,
    'p75', case when s.n >= 20 then round(s.p75::numeric) end,
    'vs_median_pct', case when s.n >= 20 then round((((t.annual_min + t.annual_max)/2.0/s.median)-1)::numeric*100) end)
  from target t cross join stats s;
$$;
revoke all on function public.job_salary_comparison(uuid) from public;
grant execute on function public.job_salary_comparison(uuid) to anon, authenticated, service_role;
