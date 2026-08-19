-- v3.169.0 -- real bug found live during a verification sweep: the
-- job_board_trending edge-function action fetched job_postings capped at
-- .limit(8000) rows with no .order(), then hand-aggregated in JS. The real
-- 3-day trending window already holds 9,449+ rows and keeps growing, so
-- that limit was silently truncating to an arbitrary, unordered slice of
-- the true window -- confirmed live: a direct SQL GROUP BY put SpaceX at
-- 2,131 postings in the window, the edge function's own JS aggregation
-- (over its capped, unordered slice) reported 373. Raising the limit is
-- not a real fix (it just moves the same failure to a bigger number as the
-- table keeps growing) -- the correct fix is letting Postgres do the
-- GROUP BY itself, which is correct at any table size.
create or replace function public.job_board_trending_counts(p_since timestamptz, p_city text default null)
returns table (scope text, metric text, label text, cnt bigint)
language sql
stable
security invoker
set search_path = public
as $$
  (select 'national'::text, 'category'::text, category, count(*)
   from job_postings
   where posted_at >= p_since and category is not null
   group by category
   order by count(*) desc
   limit 10)
  union all
  (select 'national'::text, 'company'::text, company, count(*)
   from job_postings
   where posted_at >= p_since and category is not null and company is not null
   group by company
   order by count(*) desc
   limit 10)
  union all
  (select 'city'::text, 'category'::text, category, count(*)
   from job_postings
   where posted_at >= p_since and category is not null and p_city is not null and city = p_city
   group by category
   order by count(*) desc
   limit 10)
  union all
  (select 'city'::text, 'company'::text, company, count(*)
   from job_postings
   where posted_at >= p_since and category is not null and company is not null and p_city is not null and city = p_city
   group by company
   order by count(*) desc
   limit 10)
$$;

-- Only the resume-hub edge function's own service-role client calls this
-- (job_board_trending); job_postings itself already grants authenticated
-- read access directly, so nothing sensitive is exposed either way, but
-- there is no reason to also expose this aggregate RPC to raw PostgREST.
revoke all on function public.job_board_trending_counts(timestamptz, text) from public, anon, authenticated;
grant execute on function public.job_board_trending_counts(timestamptz, text) to service_role;
