-- Service-only completion: a credit debit cannot commit without its document.
-- Existing resumes export/erasure covers the document; ai_result_cache is
-- already erased by erase_account_core. Exact response replay lasts 30 days.
create or replace function public.complete_paid_base_resume(
  p_user_id uuid, p_id uuid, p_action text, p_result jsonb, p_cost integer
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_key text;
  v_cached jsonb;
  v_charge jsonb;
  v_result jsonb;
begin
  if p_user_id is null or p_id is null or p_action not in ('rewrite', 'resume_generate')
     or p_action is null or p_cost is null
     or not (p_cost = 15 or (p_action = 'rewrite' and p_cost = 0))
     or p_result is null or jsonb_typeof(p_result) <> 'object'
     or jsonb_typeof(p_result->'resume') is distinct from 'object'
     or p_result->'resume' = '{}'::jsonb then
    raise exception 'Invalid paid resume completion' using errcode = '22023';
  end if;
  -- Same primary-save lock as save_primary_resume, including across tabs.
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 923));
  v_key := 'paid-base:v1:' || p_user_id || ':' || p_action || ':' || p_id;
  select payload into v_cached from public.ai_result_cache
    where cache_key = v_key and user_id = p_user_id;
  if found then return v_cached; end if;

  if p_cost > 0 then
    -- Never delete the previous version. A colliding id fails before charging.
    insert into public.resumes(id, user_id, title, content, is_primary, ats_score, ats_issues)
    values (p_id, p_user_id,
      case when p_action = 'rewrite' then 'Optimized Resume' else 'Generated Resume' end,
      p_result->'resume', false, (p_result->>'ats_score')::integer,
      coalesce(p_result->'issues', '[]'::jsonb));
  end if;
  v_charge := public.credit_spend(p_user_id, p_cost,
    case when p_action = 'rewrite' then 'resume_optimize' else 'resume_generate' end,
    'req:' || p_id);
  if not coalesce((v_charge->>'ok')::boolean, false) then
    -- An exception rolls back the draft INSERT and any nested billing writes.
    raise exception 'Insufficient credits' using errcode = 'P0001';
  end if;
  if p_cost > 0 then
    update public.resumes set is_primary = false where user_id = p_user_id and is_primary;
    update public.resumes set is_primary = true where id = p_id and user_id = p_user_id;
  end if;
  v_result := p_result || jsonb_build_object('credits', jsonb_build_object(
    'spent', p_cost, 'balance', v_charge->'balance'));
  insert into public.ai_result_cache(cache_key, user_id, purpose, payload, expires_at)
    values (v_key, p_user_id, 'paid_base_resume', v_result, now() + interval '30 days');
  return v_result;
end;
$$;
revoke all on function public.complete_paid_base_resume(uuid,uuid,text,jsonb,integer) from public, anon, authenticated;
grant execute on function public.complete_paid_base_resume(uuid,uuid,text,jsonb,integer) to service_role;
