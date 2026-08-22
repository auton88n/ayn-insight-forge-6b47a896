-- v3.199.0 — Browse Jobs shows many distinct companies per page; calling
-- company_hiring_status() once per company would mean dozens of round
-- trips per page load. One batch call instead, same underlying logic.
create or replace function public.company_hiring_status_batch(p_company_slugs text[])
returns table(company_slug text, status text)
language sql
stable
as $$
  select s, public.company_hiring_status(s)
  from unnest(p_company_slugs) as s;
$$;
