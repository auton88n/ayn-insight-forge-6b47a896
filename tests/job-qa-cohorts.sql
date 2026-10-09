-- Execute with the migration in one transaction; ALWAYS roll back fixtures.
do $$
declare t public.job_postings; target uuid := gen_random_uuid(); peer uuid; r jsonb; n int;
begin
 select * into t from public.job_postings limit 1;
 if t.id is null then raise exception 'Need a posting template'; end if;
 t.id:=target; t.external_id:=target::text; t.apply_url:='https://fixture.invalid/qa/'||target;
 t.company:='QA fixture'; t.category:='AYN_qa_remote_fixture'; t.city:='Scottsdale';
 t.location:='United States (Remote)'; t.work_mode:='remote'; t.work_mode_text:='remote';
 t.remote_region:='United States'; t.seniority:='senior'; t.employment_type:='full_time_employee';
 t.salary_min:=100000; t.salary_max:=140000; t.salary_currency:='USD'; t.scam_suspected:=false;
 insert into public.job_postings select (t).*;
 r:=public.job_salary_comparison(target);
 if (r->>'sample')::int<>0 or r->>'cohort_scope'<>'remote' then raise exception 'Self count / remote cohort: %',r; end if;
 for n in 1..20 loop
   t.id:=gen_random_uuid(); t.external_id:=t.id::text; t.apply_url:='https://fixture.invalid/qa/'||t.id;
   t.city:='Different HQ';
   insert into public.job_postings select (t).*;
 end loop;
 peer:=t.id;
 r:=public.job_salary_comparison(target);
 if (r->>'sample')::int<>20 or not (r->>'enough')::boolean or (r->>'median')::numeric<>120000
   or r->>'cohort_location'<>'United States' then raise exception 'National remote cohort: %',r; end if;
 t.id:=gen_random_uuid(); t.external_id:=t.id::text; t.apply_url:='https://fixture.invalid/qa/'||t.id;
 t.location:='Scottsdale'; t.city:='Scottsdale'; t.work_mode:='onsite'; t.work_mode_text:='onsite'; t.remote_region:=null;
 insert into public.job_postings select (t).*;
 if (public.job_salary_comparison(target)->>'sample')::int<>20 then raise exception 'Local HQ contaminated remote cohort'; end if;
 update public.job_postings set salary_currency='GBP' where id=peer;
 r:=public.job_salary_comparison(target);
 if (r->>'sample')::int<>19 or (r->>'enough')::boolean or r->>'median' is not null then raise exception 'Currency/sample guard: %',r; end if;
 if not exists(select 1 from public.browse_job_postings(100000,'USD','full_time') where id=target)
   or exists(select 1 from public.browse_job_postings(100001,'USD','full_time') where id=target)
   or exists(select 1 from public.browse_job_postings(100000,'GBP','full_time') where id=target) then raise exception 'Minimum/currency/type filter'; end if;
 update public.job_postings set location='Scottsdale',remote_region=null where id=target;
 if public.job_salary_comparison(target) is not null then raise exception 'Inferred remote eligibility from HQ'; end if;
 if public.job_remote_cohort('US only','Scottsdale')<>'United States'
   or public.job_remote_cohort('Arizona, Colorado','United States')='United States' then raise exception 'Eligibility broadened'; end if;
 if not has_function_privilege('anon','public.browse_job_postings(numeric,text,text)','execute')
   or has_table_privilege('anon','public.job_pay','select') then raise exception 'Public privileges'; end if;
 raise notice 'Remote cohorts, pay floor, currency, employment aliases and public privileges passed';
end $$;
rollback;
