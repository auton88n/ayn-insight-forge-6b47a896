-- Asked directly: a way to manage content-engine's cadence (more or fewer
-- articles per run, how often it fires) without asking for a code change
-- every time. Two real knobs, both admin-controlled:
--
-- 1. articles_per_run -- stored in the existing app_settings key/value
--    table (already used elsewhere for exactly this shape of thing, no
--    new table needed). content-engine itself reads this at the start of
--    every run and uses it unless the caller explicitly overrides it.
-- 2. schedule -- which days/how often the cron fires. Deliberately a
--    fixed set of named presets, not a free-text cron expression in the
--    admin UI: a typo'd cron string would either silently never fire or
--    fire constantly, and there is no real reason an admin needs anything
--    finer-grained than "how many times a week."
--
-- admin_article_set_config is SECURITY DEFINER, owned by postgres (same
-- as every other admin_* function here), which is what lets it call
-- cron.alter_job() -- a schema `authenticated` has no direct grant on --
-- from inside a function an authenticated admin can call. Same pattern,
-- new privileged action.

insert into app_settings (key, value) values ('content_engine_articles_per_run', '2')
  on conflict (key) do nothing;
insert into app_settings (key, value) values ('content_engine_schedule', '0 14 * * 2,5')
  on conflict (key) do nothing;

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
    'articles_per_run', (select coalesce((select value from app_settings where key = 'content_engine_articles_per_run'), '2')::int),
    'schedule', (select coalesce((select value from app_settings where key = 'content_engine_schedule'), '0 14 * * 2,5')),
    'schedule_active', (select active from cron.job where jobname = 'content-engine'),
    'generated_at', now()
  );
end;
$$;

-- p_schedule must be one of a known, safe set -- never an arbitrary string
-- handed straight to cron.alter_job.
create or replace function public.admin_article_set_config(p_articles_per_run int, p_schedule text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  job_id bigint;
  allowed_schedules text[] := array['0 14 * * 1', '0 14 * * 2,5', '0 14 * * 1,3,5', '0 14 * * *'];
begin
  if not has_role((select auth.uid()), 'admin'::app_role) then
    raise exception 'Admin access required';
  end if;
  if p_articles_per_run is null or p_articles_per_run < 1 or p_articles_per_run > 5 then
    raise exception 'articles_per_run must be between 1 and 5';
  end if;
  if not (p_schedule = any(allowed_schedules)) then
    raise exception 'Unrecognized schedule';
  end if;

  insert into app_settings (key, value) values ('content_engine_articles_per_run', p_articles_per_run::text)
    on conflict (key) do update set value = excluded.value, updated_at = now();
  insert into app_settings (key, value) values ('content_engine_schedule', p_schedule)
    on conflict (key) do update set value = excluded.value, updated_at = now();

  select cron.job.jobid into job_id from cron.job where jobname = 'content-engine';
  if job_id is not null then
    perform cron.alter_job(job_id, schedule := p_schedule);
  end if;

  return jsonb_build_object('ok', true, 'articles_per_run', p_articles_per_run, 'schedule', p_schedule);
end;
$$;

revoke all on function public.admin_article_set_config(int, text) from public, anon;
grant execute on function public.admin_article_set_config(int, text) to authenticated, service_role;
