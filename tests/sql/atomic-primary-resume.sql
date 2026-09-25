\set ON_ERROR_STOP on
-- Run only in a fresh, disposable local database. This fixture deliberately
-- creates auth roles/schema; it must never be run against a deployed app.
create role anon;
create role authenticated;
create schema auth;
create function auth.uid() returns uuid language sql stable as
$$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema auth to authenticated, anon;
grant execute on function auth.uid() to authenticated, anon;
create table public.resumes (
  id uuid primary key, user_id uuid not null, title text not null,
  content jsonb not null, is_primary boolean not null default false,
  ats_score integer, ats_issues jsonb,
  constraint simulate_activation_failure check (not (is_primary and title = 'Force failure'))
);
alter table public.resumes enable row level security;
create policy owner_only on public.resumes for all
using (user_id = auth.uid()) with check (user_id = auth.uid());
grant select, insert, update, delete on public.resumes to authenticated;

\ir ../../supabase/migrations/20260923090000_atomic_primary_resume_save.sql

set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', false);
select public.save_primary_resume('10000000-0000-0000-0000-000000000001', 'Original', '{"name":"A"}', 70, '[]');
select public.save_primary_resume('10000000-0000-0000-0000-000000000002', 'Improved', '{"name":"A","skills":["SQL"]}', 80, '[]');
do $$ begin
  assert (select count(*) from public.resumes) = 2, 'Old content was removed';
  assert (select count(*) from public.resumes where is_primary) = 1, 'Primary not unique';
  assert (select title from public.resumes where is_primary) = 'Improved';
end $$;
-- A late replay of the original save must not reactivate it.
select public.save_primary_resume('10000000-0000-0000-0000-000000000001', 'Original', '{"name":"A"}', 70, '[]');
do $$ begin
  assert (select count(*) from public.resumes) = 2, 'Retry duplicated content';
  assert (select title from public.resumes where is_primary) = 'Improved', 'Retry restored stale content';
  begin
    perform public.save_primary_resume('10000000-0000-0000-0000-000000000003', 'Force failure', '{"name":"A"}', 80, '[]');
    raise exception 'Expected constraint failure';
  exception when check_violation then null;
  end;
  assert (select count(*) from public.resumes) = 2, 'Failed save left a row';
  assert (select title from public.resumes where is_primary) = 'Improved', 'Failed activation demoted the original';
end $$;

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', false);
do $$ begin
  assert (select count(*) from public.resumes) = 0, 'Cross-user read';
  begin
    perform public.save_primary_resume('10000000-0000-0000-0000-000000000002', 'Attack', '{"name":"B"}', 80, '[]');
    raise exception 'Cross-user identifier accepted';
  exception when unique_violation then null;
  end;
end $$;
select public.save_primary_resume('20000000-0000-0000-0000-000000000001', 'B resume', '{"name":"B"}', 80, '[]');
select set_config('request.jwt.claim.sub', '', false);
do $$ begin
  begin
    perform public.save_primary_resume('30000000-0000-0000-0000-000000000001', 'Anonymous', '{"name":"C"}', 80, '[]');
    raise exception 'Missing identity accepted';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
do $$ begin
  assert not has_function_privilege('anon', 'public.save_primary_resume(uuid,text,jsonb,integer,jsonb)', 'EXECUTE'), 'Anonymous grant';
  assert (select count(*) from public.resumes) = 3;
  assert (select count(*) from public.resumes where is_primary) = 2;
end $$;
\echo 'Atomic save, retry, rollback, ownership and anonymous-boundary checks passed.'
