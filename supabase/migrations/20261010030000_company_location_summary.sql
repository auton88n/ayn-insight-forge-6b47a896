-- Public catalog aggregates only. Do not infer locations from the 40-role
-- company preview or from the employer's headquarters.
create or replace function public.company_location_summary(p_company_slug text)
returns jsonb language sql stable security definer set search_path = public as $$
  with postings as (
    select location from public.job_postings
    where lower(company_slug) = lower(left(p_company_slug, 200)) and scam_suspected is not true
  ), groups as (
    select btrim(location) as location, count(*) as roles from postings
    where nullif(btrim(location), '') is not null group by 1
  ), shown as (
    select left(location, 300) as location, roles from groups order by roles desc, location limit 100
  )
  select jsonb_build_object(
    'total', (select count(*) from postings),
    'with_location', (select count(*) from postings where nullif(btrim(location), '') is not null),
    'source_groups', (select count(*) from groups),
    'groups', (select coalesce(jsonb_agg(jsonb_build_object('location', location, 'roles', roles) order by roles desc, location), '[]'::jsonb) from shown)
  );
$$;
revoke all on function public.company_location_summary(text) from public;
grant execute on function public.company_location_summary(text) to anon, authenticated, service_role;
notify pgrst, 'reload schema';
