-- Companies worth a page of their own: at least a few live roles. Read by the server for /sitemap-companies.xml.
create or replace function public.company_sitemap_list(p_min integer default 3, p_limit integer default 5000)
returns table(slug text, open_roles bigint, last_posted timestamptz)
language sql stable security definer set search_path = public as $$
  select lower(company_slug) as slug, count(*) as open_roles, max(posted_at) as last_posted
    from job_postings
   where company_slug is not null and btrim(company_slug) <> '' and scam_suspected is not true
   group by lower(company_slug)
  having count(*) >= greatest(p_min, 1)
   order by count(*) desc
   limit least(greatest(p_limit, 1), 20000)
$$;
grant execute on function public.company_sitemap_list(integer, integer) to anon, authenticated, service_role;
