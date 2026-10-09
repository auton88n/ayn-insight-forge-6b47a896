-- Rollback-only production-schema test. Unique public posting fixture; no
-- account mutations or email endpoints. Run with ON_ERROR_STOP.
begin;
do $$
declare fixture public.job_postings; fixture_id uuid:=gen_random_uuid(); archived jsonb;
begin
  if not (select relrowsecurity from pg_class where oid='public.job_postings_archive'::regclass)
    or has_table_privilege('anon','public.job_postings_archive','select')
    or has_table_privilege('authenticated','public.job_postings_archive','select') then
    raise exception 'Archive privacy boundary missing';
  end if;
  select * into fixture from public.job_postings limit 1;
  if fixture.id is null then raise exception 'No public fixture template'; end if;
  fixture.id:=fixture_id;
  fixture.title:='AYN archive rollback fixture';
  fixture.external_id:=fixture_id::text;
  fixture.apply_url:='https://fixture.invalid/archive/'||fixture_id;
  fixture.closure_status:='closed';
  insert into public.job_postings select (fixture).*;
  delete from public.job_postings where id=fixture_id;
  select data into archived from public.job_postings_archive where job_posting_id=fixture_id and removal_reason='closed';
  if archived is null or archived ? 'embedding' or archived->>'title'<>fixture.title then
    raise exception 'Archive trigger did not preserve the correct record';
  end if;
  raise notice 'Archive privacy and delete trigger passed';
end;
$$;
rollback;
