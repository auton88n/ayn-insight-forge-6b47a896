\set ON_ERROR_STOP on
-- Fresh disposable database ONLY. Billing is a transaction-aware fixture;
-- completion is the actual migration, not a duplicate implementation.
do $$ begin
  if not exists(select from pg_roles where rolname = 'anon') then create role anon; end if;
  if not exists(select from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
  if not exists(select from pg_roles where rolname = 'service_role') then create role service_role; end if;
end $$;
create table public.resumes(id uuid primary key, user_id uuid not null, title text, content jsonb,
  is_primary boolean default false, ats_score integer, ats_issues jsonb);
create table public.ai_result_cache(cache_key text primary key, user_id uuid, purpose text, payload jsonb,
  expires_at timestamptz, constraint simulate_failure check (not (payload ? 'force_failure')));
create table public.credit_ledger(user_id uuid, amount integer);
create function public.credit_spend(uuid,integer,text,text) returns jsonb language plpgsql as $$
begin
  if $1 = '00000000-0000-0000-0000-000000000099'::uuid then
    return '{"ok":false,"balance":0}'::jsonb;
  end if;
  if $2 > 0 then insert into public.credit_ledger values($1,$2); end if;
  return jsonb_build_object('ok',true,'balance',100-$2);
end $$;
\ir ../../supabase/migrations/20260925090000_atomic_paid_base_resume.sql
insert into public.resumes values('10000000-0000-0000-0000-000000000000',
  '00000000-0000-0000-0000-000000000001','Original','{"name":"Original"}',true,70,'[]');
set role service_role;
select public.complete_paid_base_resume('00000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001','rewrite','{"resume":{"name":"Improved"},"ats_score":80,"issues":[]}',15);
-- A lost response must replay the first stored result, not adopt a new draft.
select public.complete_paid_base_resume('00000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001','rewrite','{"resume":{"name":"Different retry"}}',15);
reset role;
do $$ begin
  assert (select count(*) from public.credit_ledger)=1, 'Duplicate debit';
  assert (select count(*) from public.resumes)=2, 'Lost original or duplicated result';
  assert (select content->>'name' from public.resumes where is_primary)='Improved';
  assert (select payload->'resume'->>'name' from public.ai_result_cache)='Improved';
  begin
    perform public.complete_paid_base_resume('00000000-0000-0000-0000-000000000001',
      '10000000-0000-0000-0000-000000000002','rewrite','{"resume":{"name":"Failed"},"force_failure":true}',15);
    raise exception 'Expected persistence failure';
  exception when check_violation then null; end;
  assert (select count(*) from public.credit_ledger)=1, 'Persistence failure kept debit';
  assert (select count(*) from public.resumes)=2, 'Persistence failure kept document';
  assert (select content->>'name' from public.resumes where is_primary)='Improved', 'Primary switch was not rolled back';
  begin
    perform public.complete_paid_base_resume('00000000-0000-0000-0000-000000000099',
      '10000000-0000-0000-0000-000000000099','resume_generate','{"resume":{"name":"No balance"}}',15);
  exception when raise_exception then null; end;
  assert (select count(*) from public.resumes)=2, 'Insufficient balance left a draft';
  assert not has_function_privilege('authenticated','public.complete_paid_base_resume(uuid,uuid,text,jsonb,integer)','EXECUTE');
  assert not has_function_privilege('anon','public.complete_paid_base_resume(uuid,uuid,text,jsonb,integer)','EXECUTE');
end $$;
select public.complete_paid_base_resume('00000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000003','rewrite','{"resume":{"name":"Unchanged"}}',0);
do $$ begin
  assert (select count(*) from public.credit_ledger)=1, 'Unchanged output charged';
  assert (select count(*) from public.resumes)=2, 'Unchanged output created version';
end $$;
\echo 'Paid document/debit atomicity, rollback, replay and service-only boundary passed.'

select public.complete_paid_base_resume('00000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000004','resume_generate','{"resume":{"name":"Newest"}}',15);
select public.complete_paid_base_resume('00000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001','rewrite','{"resume":{"name":"Late retry"}}',15);
do $$ begin
  assert (select content->>'name' from public.resumes where is_primary)='Newest', 'Stale replay reactivated an older version';
  assert (select count(*) from public.credit_ledger)=2;
  begin
    perform public.complete_paid_base_resume('00000000-0000-0000-0000-000000000002',
      '10000000-0000-0000-0000-000000000001','rewrite','{"resume":{"name":"Other user"}}',15);
    raise exception 'Expected identifier collision';
  exception when unique_violation then null; end;
  assert (select count(*) from public.credit_ledger)=2, 'Cross-user collision charged';
end $$;
\echo 'Late replay and cross-user identifier collision checks passed.'
