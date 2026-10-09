-- Run AFTER the migration inside BEGIN; this file always rolls back all fixtures.
do $$
declare t public.job_postings; target uuid:=gen_random_uuid(); r jsonb; n int;
begin
  select * into t from public.job_postings limit 1;
  if t.id is null then raise exception 'Posting template required'; end if;
  t.id:=target; t.external_id:=target::text; t.apply_url:='https://fixture.invalid/evidence/'||target;
  t.company_slug:='ayn-evidence-fixture'; t.scam_suspected:=false;
  t.closure_status:='open'; t.closure_checked_at:='2026-10-08T12:00:00Z';
  insert into public.job_postings select (t).*;
  update public.job_postings set closure_status='error',closure_checked_at='2026-10-09T12:00:00Z' where id=target;
  r:=public.job_posting_evidence(target);
  if (r->>'closure_last_open_at')::timestamptz<>'2026-10-08T12:00:00Z'::timestamptz
    or r->>'closure_status'<>'error' then raise exception 'Lost last successful check: %',r; end if;
  for n in 1..35 loop
    insert into public.job_posting_changes(job_posting_id,company_slug,title,field,old_value,new_value)
      values(target,'ayn-evidence-fixture',t.title,'title',repeat('x',400),'New');
  end loop;
  r:=public.job_posting_evidence(target);
  if jsonb_array_length(r->'changes')<>30 or length(r->'changes'->0->>'old_value')<>300
    or r ? 'description' or r ? 'apply_url' or r ? 'embedding' then raise exception 'Public projection/cap failed'; end if;
  if not exists(select 1 from jsonb_array_elements(public.company_profile('ayn-evidence-fixture')->'jobs') j
      where j->>'closure_last_open_at' is not null) then raise exception 'Company projection missing receipts'; end if;
  delete from public.job_postings where id=target;
  r:=public.job_posting_evidence(target);
  if r->>'removed_at' is null or r->>'removal_reason'<>'pruned' then raise exception 'Archive evidence missing: %',r; end if;
  if has_table_privilege('anon','public.job_posting_changes','select')
    or has_table_privilege('anon','public.job_postings_archive','select')
    or has_function_privilege('anon','public.saved_jobs_status()','execute') then raise exception 'Unexpected public privileges'; end if;
  perform set_config('ayn.evidence.fixture',target::text,true);
  t.id:=gen_random_uuid(); t.external_id:=t.id::text; t.scam_suspected:=true;
  insert into public.job_postings select (t).*;
  if public.job_posting_evidence(t.id) is not null then raise exception 'Scam evidence disclosed'; end if;
  raise notice 'Check preservation, public projection, caps, company receipts, scams, archives and privileges passed';
end $$;
set local role anon;
do $$ begin
  if public.job_posting_evidence(current_setting('ayn.evidence.fixture')::uuid)->>'removed_at' is null
    then raise exception 'Anonymous evidence unavailable'; end if;
  if public.job_posting_evidence('00000000-0000-4000-8000-000000000000') is not null
    then raise exception 'Invented history for unknown ID'; end if;
end $$;
reset role;
do $$
declare owners uuid[]; a uuid:=gen_random_uuid(); b uuid:=gen_random_uuid(); url text;
begin
  select array_agg(id) into owners from (select id from auth.users order by id limit 2) u;
  if cardinality(owners)<2 then raise exception 'Need two account IDs for rollback-only isolation'; end if;
  url:='https://fixture.invalid/evidence/'||current_setting('ayn.evidence.fixture');
  insert into public.jobs(id,user_id,source,source_url,title,company,jd_text)
    values(a,owners[1],'job_board',url,'Evidence fixture','Fixture','Fixture'),
      (b,owners[2],'job_board',url,'Evidence fixture','Fixture','Fixture');
  perform set_config('request.jwt.claim.sub',owners[1]::text,true);
  perform set_config('ayn.evidence.saved_own',a::text,true);
  perform set_config('ayn.evidence.saved_other',b::text,true);
end $$;
set local role authenticated;
do $$
declare r jsonb;
begin
  r:=public.saved_jobs_status();
  if not exists(select 1 from jsonb_array_elements(r) j where j->>'job_id'=current_setting('ayn.evidence.saved_own') and j->'receipt'->>'removed_at' is not null)
    or exists(select 1 from jsonb_array_elements(r) j where j->>'job_id'=current_setting('ayn.evidence.saved_other'))
    then raise exception 'Saved-job ownership or receipts failed'; end if;
end $$;
reset role;
rollback;
