-- Real bug, found by querying the live function right after deploying it,
-- not assumed: ordering candidates by raw sample_size across both kinds
-- meant hiring_trend topics (nationwide, so naturally a far bigger n --
-- confirmed live, 1615 vs salary_report's own largest at 84) would have
-- dominated every run for weeks before a single salary_report topic ever
-- surfaced, since all topics start "never covered" and the ordering falls
-- straight through to sample_size as the tiebreak. The two-kind variety
-- this was actually built for would not have shown up in practice.
--
-- Fixed by ranking each kind separately (its own never-covered/staleness/
-- sample_size order) and interleaving: rn=1 of both kinds before rn=2 of
-- either. A plain request for p_limit=2 (content-engine's own per-run
-- default) now returns one salary_report and one hiring_trend topic from
-- the very first run, not two of the same kind.
create or replace function public.article_topic_candidates(p_limit int default 4)
returns table(kind text, category text, city text, sample_size bigint)
language sql
security definer
set search_path = public
stable
as $$
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
      and a.status = 'published'
  )
  select kind, category, city, sample_size
  from ranked
  order by rn asc, kind asc
  limit p_limit;
$$;

revoke all on function public.article_topic_candidates(int) from public, anon, authenticated;
grant execute on function public.article_topic_candidates(int) to service_role;
