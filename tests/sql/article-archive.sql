\set ON_ERROR_STOP on

create role anon;
create role authenticated;
create role service_role;

create table public.job_postings (
  category text,
  city text,
  scam_suspected boolean
);

create table public.articles (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  kind text not null,
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
  status text not null default 'published',
  published_at timestamptz not null default now(),
  refreshed_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index articles_kind_category_city_idx
  on public.articles (kind, category, coalesce(city, ''));

\ir ../../supabase/migrations/20261002123000_keep_archived_articles_archived.sql

insert into public.job_postings (category, city, scam_suspected)
select 'software', 'Dubai', false from generate_series(1, 20);

do $$
begin
  if not exists (
    select 1 from public.article_topic_candidates(10)
    where kind = 'salary_report' and category = 'software' and city = 'Dubai'
  ) then
    raise exception 'new topic was not selected';
  end if;
end;
$$;

select public.article_upsert(
  'salary-software-dubai', 'salary_report', 'software', 'Dubai',
  'Original title', 'Original dek', 'Original description', 'Original body',
  null, '{}'::jsonb, 400, 1.25
);

update public.articles set status = 'archived' where slug = 'salary-software-dubai';

do $$
declare refused boolean := false;
begin
  if exists (
    select 1 from public.article_topic_candidates(10)
    where kind = 'salary_report' and category = 'software' and city = 'Dubai'
  ) then
    raise exception 'archived topic was selected again';
  end if;

  begin
    perform public.article_upsert(
      'salary-software-dubai', 'salary_report', 'software', 'Dubai',
      'Replacement title', 'Replacement dek', 'Replacement description', 'Replacement body',
      null, '{}'::jsonb, 400, 2.00
    );
  exception when raise_exception then
    refused := true;
  end;

  if not refused then
    raise exception 'archived article was republished';
  end if;
  if not exists (
    select 1 from public.articles
    where slug = 'salary-software-dubai' and status = 'archived'
      and title = 'Original title' and generation_cost_cents = 1.25
  ) then
    raise exception 'archived article changed';
  end if;
end;
$$;

update public.articles set status = 'published' where slug = 'salary-software-dubai';

do $$
begin
  if not exists (
    select 1 from public.article_topic_candidates(10)
    where kind = 'salary_report' and category = 'software' and city = 'Dubai'
  ) then
    raise exception 'restored topic was not selectable';
  end if;
end;
$$;
