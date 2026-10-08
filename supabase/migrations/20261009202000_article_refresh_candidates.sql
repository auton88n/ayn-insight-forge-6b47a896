-- Bounded maintenance refresh: no new, archived or blocked topics.
create function public.article_refresh_candidates(p_limit integer default 2)
returns table(kind text,category text,city text,sample_size bigint)
language sql stable security definer set search_path=public as $$
  select a.kind,a.category,a.city,count(j.id) as sample_size
  from public.articles a join public.job_postings j on j.category=a.category
    and (a.city is null or j.city=a.city) and j.scam_suspected is not true
  where a.status='published' and not exists(select 1 from public.seo_topic_blocks b
    where b.kind=a.kind and b.category=a.category and coalesce(b.city,'')=coalesce(a.city,''))
  group by a.id,a.kind,a.category,a.city,a.refreshed_at
  having count(j.id)>=20
  order by a.refreshed_at asc nulls first,a.id
  limit greatest(1,least(coalesce(p_limit,2),5));
$$;
revoke all on function public.article_refresh_candidates(integer) from public,anon,authenticated;
grant execute on function public.article_refresh_candidates(integer) to service_role;
