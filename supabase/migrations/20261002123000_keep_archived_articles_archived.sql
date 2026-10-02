-- An admin archive must be durable. The original candidate selector joined
-- published rows only, making an archived topic look never published; the
-- next cron run then selected it and article_upsert republished it. Exclude
-- archived topics from selection, and guard the upsert against the race where
-- an admin archives a topic after selection but before generation completes.

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
    where a.id is null or a.status = 'published'
  )
  select kind, category, city, sample_size
  from ranked
  order by rn asc, kind asc
  limit p_limit;
$$;

revoke all on function public.article_topic_candidates(int) from public, anon, authenticated;
grant execute on function public.article_topic_candidates(int) to service_role;

create or replace function public.article_upsert(
  p_slug text, p_kind text, p_category text, p_city text,
  p_title text, p_dek text, p_meta_description text, p_body_md text,
  p_faq jsonb, p_source_data jsonb, p_word_count int, p_generation_cost_cents numeric
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare result_id uuid;
begin
  insert into public.articles (
    slug, kind, category, city, title, dek, meta_description, body_md,
    faq, source_data, word_count, generation_cost_cents, status, published_at, refreshed_at
  ) values (
    p_slug, p_kind, p_category, p_city, p_title, p_dek, p_meta_description, p_body_md,
    p_faq, p_source_data, p_word_count, p_generation_cost_cents, 'published', now(), now()
  )
  on conflict (kind, category, coalesce(city, ''))
  do update set
    title = excluded.title,
    dek = excluded.dek,
    meta_description = excluded.meta_description,
    body_md = excluded.body_md,
    faq = excluded.faq,
    source_data = excluded.source_data,
    word_count = excluded.word_count,
    generation_cost_cents = public.articles.generation_cost_cents + excluded.generation_cost_cents,
    refreshed_at = now()
  where public.articles.status = 'published'
  returning id into result_id;

  if result_id is null then
    raise exception 'Article is archived; restore it before publishing again';
  end if;
  return result_id;
end;
$$;

revoke all on function public.article_upsert(text, text, text, text, text, text, text, text, jsonb, jsonb, int, numeric) from public, anon, authenticated;
grant execute on function public.article_upsert(text, text, text, text, text, text, text, text, jsonb, jsonb, int, numeric) to service_role;
