-- Run after the two 2026100920 migrations in an UNCOMMITTED transaction.
-- Uses existing schema/data as templates; every fixture and preference change
-- rolls back. Never call an email endpoint while this transaction is open.
do $$
declare
  uid uuid; saved uuid:=gen_random_uuid(); posting uuid:=gen_random_uuid();
  aid bigint; r jsonb; job_template public.job_postings; n integer;
begin
  select id into uid from auth.users where email not like '%@erased.invalid' limit 1;
  if uid is null then raise exception 'Need one account template'; end if;
  select * into job_template from public.job_postings limit 1;
  if job_template.id is null then raise exception 'Need one posting template'; end if;
  update public.user_settings set email_saved_job_alerts=false where user_id=uid;
  insert into public.jobs(id,user_id,source,source_url,company,title,jd_text,dedupe_hash)
    values(saved,uid,'job_board','https://fixture.invalid/job/test?source=saved','Fixture company','Fixture role','Fixture JD',saved::text);
  insert into public.job_postings_archive(job_posting_id,company,title,removal_reason,data)
    values(posting,'Fixture company','Fixture role','pruned','{"apply_url":"https://fixture.invalid/job/test?source=feed"}');
  if exists(select 1 from public.saved_job_email_alerts where job_id=saved) then raise exception 'Alert without consent'; end if;
  update public.user_settings set email_saved_job_alerts=true where user_id=uid;

  insert into public.job_postings_archive(job_posting_id,company,title,removal_reason,data)
    values(posting,'Fixture company','Fixture role','pruned','{"apply_url":"https://fixture.invalid/job/test?source=feed"}') returning archive_id into aid;
  if (select count(*) from public.saved_job_email_alerts where job_id=saved)<>1 then raise exception 'Missing alert'; end if;
  select count(*) into n from public.claim_saved_job_alerts(3);
  if n<>1 then raise exception 'Claim did not reserve alert'; end if;
  select count(*) into n from public.claim_saved_job_alerts(3);
  if n<>0 then raise exception 'Active lease reclaimed'; end if;
  update public.saved_job_email_alerts set attempts=4,next_attempt_at=now()-interval '1 minute' where job_id=saved;
  perform public.claim_saved_job_alerts(3);
  if (select status from public.saved_job_email_alerts where job_id=saved)<>'failed' then raise exception 'Crashed final send not surfaced'; end if;
  if not public.saved_job_alert_sendable((select id from public.saved_job_email_alerts where job_id=saved)) then raise exception 'Sendability'; end if;
  update public.jobs set application_status='applied' where id=saved;
  if public.saved_job_alert_sendable((select id from public.saved_job_email_alerts where job_id=saved)) then raise exception 'Applied job alert'; end if;
  update public.jobs set application_status='saved' where id=saved;
  update public.user_settings set email_saved_job_alerts=false where user_id=uid;
  if public.saved_job_alert_sendable((select id from public.saved_job_email_alerts where job_id=saved)) then raise exception 'Opt-out not respected'; end if;
  update public.user_settings set email_saved_job_alerts=true where user_id=uid;

  -- Isolated equal-pay cohort: exactly 20 OTHERS needed, then a currency
  -- mismatch must remove one peer rather than convert or broaden the sample.
  job_template.id:=posting;
  job_template.apply_url:='https://fixture.invalid/job/test';
  job_template.external_id:=posting::text;
  job_template.city:='AYN release fixture city'; job_template.category:='AYN_fixture';
  job_template.seniority:='senior'; job_template.salary_min:=100000; job_template.salary_max:=140000;
  job_template.salary_currency:='USD'; job_template.scam_suspected:=false;
  insert into public.job_postings select (job_template).*;
  if public.saved_job_alert_sendable((select id from public.saved_job_email_alerts where job_id=saved)) then raise exception 'Relisted job alert'; end if;
  r:=public.job_salary_comparison(posting);
  if (r->>'sample')::int<>0 or (r->>'enough')::boolean then raise exception 'Target compared against itself'; end if;
  for n in 1..20 loop
    job_template.id:=gen_random_uuid(); job_template.external_id:=job_template.id::text;
    job_template.apply_url:='https://fixture.invalid/peer/'||n;
    insert into public.job_postings select (job_template).*;
  end loop;
  r:=public.job_salary_comparison(posting);
  if (r->>'sample')::int<>20 or not (r->>'enough')::boolean or (r->>'median')::numeric<>120000 then raise exception 'Incorrect benchmark: %',r; end if;
  update public.job_postings set salary_currency='GBP' where id=job_template.id;
  r:=public.job_salary_comparison(posting);
  if (r->>'sample')::int<>19 or (r->>'enough')::boolean or r->>'median' is not null then raise exception 'Mixed currency or sample floor'; end if;

  -- Non-admin cannot read queues or invoke privileged sending functions.
  if has_table_privilege('authenticated','public.saved_job_email_alerts','select')
    or has_function_privilege('authenticated','public.claim_saved_job_alerts(integer)','execute')
    or has_function_privilege('anon','public.admin_saved_job_alert_health()','execute') then raise exception 'Incorrect grants'; end if;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',uid,'role','authenticated')::text,true);
  r:=public.self_export_account();
  if jsonb_array_length(r->'saved_job_email_alerts')<1 then raise exception 'Export missing alerts'; end if;
  if exists(select 1 from jsonb_array_elements(r->'saved_job_email_alerts') a where a->>'user_id'<>uid::text or a ? 'send_payload') then raise exception 'Export privacy'; end if;
  delete from public.user_settings where user_id=uid;
  if exists(select 1 from public.saved_job_email_alerts where user_id=uid) then raise exception 'Soft erasure missed queue'; end if;
  raise notice 'Job data release fixtures passed';
end;
$$;
rollback;
