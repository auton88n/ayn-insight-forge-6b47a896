-- Save document and debit as one transaction; only the authenticated backend
-- may call this. Existing document/cache export and erasure paths apply.
create or replace function public.complete_paid_job_document(
  p_user_id uuid, p_id uuid, p_job_id uuid, p_resume_id uuid,
  p_action text, p_result jsonb, p_cost integer
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_key text;
  v_saved jsonb;
  v_charge jsonb;
begin
  if p_user_id is null or p_id is null or p_job_id is null or p_resume_id is null
    or p_action is null or p_action not in ('tailor','cover_letter')
    or p_cost is null or p_cost not in (0, case when p_action='tailor' then 2 else 1 end)
    or jsonb_typeof(p_result) is distinct from 'object' then
    raise exception 'Invalid document completion' using errcode='22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 929));
  if not exists(select 1 from public.jobs where id=p_job_id and user_id=p_user_id)
    or not exists(select 1 from public.resumes where id=p_resume_id and user_id=p_user_id) then
    raise exception 'Document ownership mismatch' using errcode='42501';
  end if;
  v_key := 'paid-job:v1:'||p_user_id||':'||p_action||':'||p_id;
  select payload into v_saved from public.ai_result_cache where cache_key=v_key and user_id=p_user_id;
  if found then
    if v_saved->>'jobId' is distinct from p_job_id::text then
      raise exception 'Request belongs to another job' using errcode='22023';
    end if;
    return v_saved;
  end if;
  if p_action='tailor' then
    if jsonb_typeof(p_result->'resume') is distinct from 'object' or p_result->'resume'='{}'::jsonb then
      raise exception 'Missing resume' using errcode='22023';
    end if;
    insert into public.resume_versions(id,user_id,resume_id,created_for_job_id,content,match_pct,still_missing)
      values(p_id,p_user_id,p_resume_id,p_job_id,p_result->'resume',
        (p_result->'gapAnalysis'->>'matchPct')::integer,
        coalesce(p_result->'gapAnalysis'->'missing','[]'::jsonb));
  else
    if coalesce(length(trim(p_result->>'body')),0)=0 then
      raise exception 'Missing letter' using errcode='22023';
    end if;
    insert into public.cover_letters(id,user_id,resume_id,job_id,body)
      values(p_id,p_user_id,p_resume_id,p_job_id,p_result->>'body');
  end if;
  v_charge := public.credit_spend(p_user_id,p_cost,
    case when p_action='tailor' then 'tailored_resume' else 'cover_letter' end,'req:'||p_id);
  if not coalesce((v_charge->>'ok')::boolean,false) then
    raise exception 'Insufficient credits';
  end if;
  v_saved := p_result || jsonb_build_object('documentId',p_id,'jobId',p_job_id,
    'credits',jsonb_build_object('spent',p_cost,'balance',v_charge->'balance'));
  insert into public.ai_result_cache(cache_key,user_id,purpose,payload,expires_at)
    values(v_key,p_user_id,'paid_job_document',v_saved,now()+interval '30 days');
  return v_saved;
end;
$$;
revoke all on function public.complete_paid_job_document(uuid,uuid,uuid,uuid,text,jsonb,integer) from public,anon,authenticated;
grant execute on function public.complete_paid_job_document(uuid,uuid,uuid,uuid,text,jsonb,integer) to service_role;
