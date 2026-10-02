-- SEO/AEO content engine: a real, auto-publishing articles table built
-- entirely from job_postings -- the same source /salary-guide and
-- job_market_snapshot() already serve from. The one rule that makes
-- unsupervised publishing safe: every number an article states has to
-- have come from a SQL query first. article_source_data() computes the
-- real facts; content-engine (the edge function) only ever phrases them.
-- Reuses job_market_snapshot()'s own plausibility filters (a salary
-- outside 15000..700000 is a data error, not a real figure; only USD or
-- null-currency rows are comparable) rather than inventing a second
-- standard.

create table public.articles (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  kind text not null check (kind in ('salary_report','hiring_trend')),
  category text not null,
  city text,
  title text not null,
  dek text not null,
  meta_description text not null,
  body_md text not null,
  faq jsonb,
  source_data jsonb not null,
  word_count int not null,
  generation_cost_cents numeric not null default 0,
  status text not null default 'published' check (status in ('published','archived')),
  published_at timestamptz not null default now(),
  refreshed_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index articles_kind_category_city_idx
  on public.articles (kind, category, coalesce(city, ''));
create index articles_status_published_idx
  on public.articles (status, published_at desc);

alter table public.articles enable row level security;

-- Matches job_postings_select_anon's own shape exactly: public content,
-- no PII, readable without a session. Writes are service_role only --
-- nothing here grants anon/authenticated INSERT/UPDATE/DELETE.
create policy articles_select_published
  on public.articles
  for select
  to anon, authenticated
  using (status = 'published');

-- ============ TOPIC SELECTION (deterministic, no model involved) ============
-- A category/city (or category-only, for a hiring_trend rollup) combo only
-- becomes a candidate once it clears the same real-sample-size floor
-- job_market_snapshot() already uses for its own category rows (n >= 20) --
-- no thin, unsupportable pages. Never-covered topics sort first, then the
-- stalest-refreshed slug, so repeat runs naturally rotate through fresh
-- ground before ever re-touching the same one -- and when they do, it's a
-- real refresh with current numbers, not a duplicate.
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
  )
  select ac.kind, ac.category, ac.city, ac.sample_size
  from all_candidates ac
  left join public.articles a
    on a.kind = ac.kind
    and a.category = ac.category
    and coalesce(a.city, '') = coalesce(ac.city, '')
    and a.status = 'published'
  order by
    (a.id is null) desc,
    a.refreshed_at asc nulls first,
    ac.sample_size desc
  limit p_limit;
$$;

revoke all on function public.article_topic_candidates(int) from public, anon, authenticated;
grant execute on function public.article_topic_candidates(int) to service_role;

-- ============ SOURCE DATA (the exact facts handed to the model) ============
-- One topic's real numbers: open-role count, freshness, median/p25/p75
-- salary (USD-comparable rows only, same plausibility filter as
-- job_market_snapshot), work-mode split, top companies by volume. This
-- jsonb result is stored verbatim on the article row as source_data, so
-- every figure in the published prose is traceable back to the query that
-- produced it.
create or replace function public.article_source_data(p_kind text, p_category text, p_city text default null)
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
  with base as (
    select *
    from public.job_postings
    where scam_suspected is not true
      and category = p_category
      and (p_city is null or city = p_city)
  ),
  salary_base as (
    select *
    from base
    where salary_min is not null and salary_max is not null
      and (salary_min + salary_max) / 2.0 between 15000 and 700000
      and (salary_currency is null or upper(salary_currency) = 'USD')
  ),
  work_mode_counts as (
    select coalesce(work_mode, 'unspecified') as mode, count(*) as n
    from base
    group by coalesce(work_mode, 'unspecified')
  ),
  top_companies as (
    select company, count(*) as n
    from base
    where company is not null
    group by company
    order by count(*) desc
    limit 8
  )
  select jsonb_build_object(
    'generated_at', now(),
    'kind', p_kind,
    'category', p_category,
    'city', p_city,
    'open_roles', (select count(*) from base),
    'posted_last_24h', (select count(*) from base where posted_at > now() - interval '24 hours'),
    'posted_last_7d', (select count(*) from base where posted_at > now() - interval '7 days'),
    'median_salary', (select round(coalesce(percentile_cont(0.5) within group (order by (salary_min + salary_max) / 2.0), 0))::int from salary_base),
    'p25_salary', (select round(coalesce(percentile_cont(0.25) within group (order by (salary_min + salary_max) / 2.0), 0))::int from salary_base),
    'p75_salary', (select round(coalesce(percentile_cont(0.75) within group (order by (salary_min + salary_max) / 2.0), 0))::int from salary_base),
    'salary_sample_size', (select count(*) from salary_base),
    'work_mode', (select coalesce(jsonb_object_agg(mode, n), '{}'::jsonb) from work_mode_counts),
    'top_companies', (select coalesce(jsonb_agg(jsonb_build_object('company', company, 'open_roles', n) order by n desc), '[]'::jsonb) from top_companies)
  );
$$;

revoke all on function public.article_source_data(text, text, text) from public, anon, authenticated;
grant execute on function public.article_source_data(text, text, text) to service_role;

-- ============ WRITE PATH (service_role only, content-engine's one way in) ============
-- articles_kind_category_city_idx is an expression index (coalesce(city,''))
-- so PostgREST's upsert on_conflict can't target it directly by column list
-- -- this function owns the real ON CONFLICT clause instead, matching the
-- same expression, so content-engine never has to reconstruct it client
-- side. Always sets refreshed_at: both a brand new topic and a repeat
-- refresh of an existing one should read as "current as of now".
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
    status = 'published',
    refreshed_at = now()
  returning id into result_id;
  return result_id;
end;
$$;

revoke all on function public.article_upsert(text, text, text, text, text, text, text, text, jsonb, jsonb, int, numeric) from public, anon, authenticated;
grant execute on function public.article_upsert(text, text, text, text, text, text, text, text, jsonb, jsonb, int, numeric) to service_role;

-- ============ ADMIN ============
create or replace function public.get_admin_articles()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare week_start timestamptz := now() - interval '7 days';
begin
  if not has_role((select auth.uid()), 'admin'::app_role) then
    raise exception 'Admin access required';
  end if;
  return jsonb_build_object(
    'articles', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', id, 'slug', slug, 'kind', kind, 'category', category, 'city', city,
        'title', title, 'status', status, 'word_count', word_count,
        'generation_cost_cents', generation_cost_cents,
        'published_at', published_at, 'refreshed_at', refreshed_at
      ) order by published_at desc)
      from public.articles
    ), '[]'::jsonb),
    'published_total', (select count(*) from public.articles where status = 'published'),
    'published_this_week', (select count(*) from public.articles where status = 'published' and published_at >= week_start),
    'total_cost_cents', (select coalesce(sum(generation_cost_cents), 0) from public.articles),
    'generated_at', now()
  );
end;
$$;

revoke all on function public.get_admin_articles() from public, anon;
grant execute on function public.get_admin_articles() to authenticated, service_role;

-- Response-honesty pattern from this file's own history (v3.103.0): check
-- the update actually matched a row before answering {ok:true}, instead of
-- trusting an unconditional success.
create or replace function public.admin_article_archive(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not has_role((select auth.uid()), 'admin'::app_role) then
    raise exception 'Admin access required';
  end if;
  update public.articles set status = 'archived' where id = p_id;
  if not found then
    raise exception 'Article not found';
  end if;
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.admin_article_restore(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not has_role((select auth.uid()), 'admin'::app_role) then
    raise exception 'Admin access required';
  end if;
  update public.articles set status = 'published' where id = p_id;
  if not found then
    raise exception 'Article not found';
  end if;
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.admin_article_archive(uuid) from public, anon;
grant execute on function public.admin_article_archive(uuid) to authenticated, service_role;
revoke all on function public.admin_article_restore(uuid) from public, anon;
grant execute on function public.admin_article_restore(uuid) to authenticated, service_role;
