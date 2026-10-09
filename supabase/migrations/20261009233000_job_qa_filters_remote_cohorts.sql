-- Public catalog reads only; no private account data or pay-view grants.
create or replace function public.job_employment_kind(v text) returns text
language sql immutable set search_path = public as $$
 select case
 when v in ('full_time','full_time_employee','employee_full_time','full_time_salary','full_time_hybrid') then 'full_time'
 when v in ('part_time','employee_part_time','part_time_employee') then 'part_time'
 when v in ('contract','contractor','contract_salary') then 'contract'
 when v in ('intern','internship') then 'internship'
 when v in ('temporary','temp','seasonal','freelance') then v else null end
$$;

create or replace function public.browse_job_postings(p_min_annual numeric default 0, p_currency text default 'USD', p_employment_type text default null)
returns setof public.job_postings language sql stable security definer set search_path = public as $$
 select j.* from public.job_postings j
 where j.scam_suspected is not true
 and (p_employment_type is null or public.job_employment_kind(j.employment_type) = p_employment_type)
 and p_min_annual between 0 and 10000000
 and (p_min_annual = 0 or exists (select 1 from public.job_pay p where p.id = j.id
   and p.currency = p_currency and p.annual_min >= p_min_annual and p.annual_max >= p.annual_min))
$$;
revoke all on function public.browse_job_postings(numeric,text,text) from public;
grant execute on function public.browse_job_postings(numeric,text,text) to anon, authenticated, service_role;

create or replace function public.job_filter_options() returns jsonb
language sql stable security definer set search_path = public as $$
 select jsonb_build_object(
 'categories', coalesce(jsonb_agg(distinct category) filter (where category is not null), '[]'::jsonb),
 'seniorities', coalesce(jsonb_agg(distinct seniority) filter (where seniority is not null), '[]'::jsonb),
 'employment_types', coalesce(jsonb_agg(distinct public.job_employment_kind(employment_type)) filter (where public.job_employment_kind(employment_type) is not null), '[]'::jsonb))
 from public.job_postings where scam_suspected is not true
$$;
revoke all on function public.job_filter_options() from public;
grant execute on function public.job_filter_options() to anon, authenticated, service_role;

-- Eligibility must be explicit. Never infer a remote country from the HQ city.
-- Unrecognized explicit restrictions stay separate rather than being widened.
create or replace function public.job_remote_cohort(region text, location text) returns text
language sql immutable set search_path = public as $$
 select case
 when nullif(trim(region),'') is not null then case
   when lower(trim(region)) in ('us','usa','united states','united states only','us only') then 'United States'
   when lower(trim(region)) in ('uk','united kingdom','uk only') then 'United Kingdom'
   when lower(trim(region)) in ('canada','canada only') then 'Canada'
   else lower(trim(region)) end
 when location ~* '\m(united states|usa)\M' then 'United States'
 when location ~* '\m(united kingdom|uk)\M' then 'United Kingdom'
 when location ~* '\mcanada\M' then 'Canada'
 else null end
$$;

create or replace function public.job_salary_comparison(p_job_id uuid)
returns jsonb language sql stable security definer set search_path = public as $$
 with pay as (
   select p.*, coalesce(j.work_mode,j.work_mode_text,'') = 'remote' or coalesce(j.location,'') ~* '\mremote\M' as remote,
     public.job_remote_cohort(j.remote_region,j.location) as remote_geo
   from public.job_pay p join public.job_postings j on j.id=p.id
 ), target as (
   select * from pay where id=p_job_id and category is not null
   and nullif(trim(seniority),'') is not null
   and ((remote and remote_geo is not null) or (not remote and nullif(trim(city),'') is not null))
   and currency in ('USD','CAD','GBP','EUR','AUD','AED','SAR','SGD','CHF','INR')
   and annual_min > 0 and annual_max >= annual_min
   and (annual_min+annual_max)/2.0 between 15000 and 1500000
 ), cohort as (
   select (p.annual_min+p.annual_max)/2.0 midpoint from pay p join target t
   on p.category=t.category and lower(trim(p.seniority))=lower(trim(t.seniority)) and p.currency=t.currency
   and p.remote=t.remote and case when t.remote then p.remote_geo=t.remote_geo else lower(trim(p.city))=lower(trim(t.city)) end
   where p.id<>t.id and p.annual_min>0 and p.annual_max>=p.annual_min
   and (p.annual_min+p.annual_max)/2.0 between 15000 and 1500000
 ), stats as (
   select count(*) n, percentile_cont(0.25) within group(order by midpoint) p25,
     percentile_cont(0.5) within group(order by midpoint) median,
     percentile_cont(0.75) within group(order by midpoint) p75 from cohort
 ) select jsonb_build_object('enough',s.n>=20,'sample',s.n,'currency',t.currency,'category',t.category,
   'city',case when t.remote then t.remote_geo else t.city end,'cohort_scope',case when t.remote then 'remote' else 'local' end,
   'cohort_location',case when t.remote then t.remote_geo else t.city end,'seniority',t.seniority,
   'annual_min',t.annual_min,'annual_max',t.annual_max,
   'median',case when s.n>=20 then round(s.median::numeric) end,
   'p25',case when s.n>=20 then round(s.p25::numeric) end,
   'p75',case when s.n>=20 then round(s.p75::numeric) end,
   'vs_median_pct',case when s.n>=20 then round((((t.annual_min+t.annual_max)/2.0/s.median)-1)::numeric*100) end)
 from target t cross join stats s
$$;
revoke all on function public.job_salary_comparison(uuid) from public;
grant execute on function public.job_salary_comparison(uuid) to anon, authenticated, service_role;
