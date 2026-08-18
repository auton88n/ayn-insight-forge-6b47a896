-- employer_reveal_request's three checks (open-proposal, 30-day-decline
-- cooldown) and the insert were three separate, unguarded PostgREST round
-- trips from the edge function — a real TOCTOU race: two concurrent
-- proposal sends from the same employer to the same candidate could both
-- pass the "no open proposal" check before either insert lands, producing
-- two "open" proposals for one (org, candidate) pair, the exact invariant
-- this rate limit exists to enforce. Found by the blueprint-checklist
-- backend audit, same shape of bug credit_spend/credit_grant/billing_ensure
-- already close with a per-key advisory lock — this function follows the
-- identical pattern (blueprint.md's "Scale" section: "any new per-user
-- mutable counter needs the identical pattern or it has the identical race
-- condition at scale, even if it never shows up in single-user testing" —
-- true here too, just per-(org, candidate) rather than per-user).
--
-- SECURITY DEFINER, granted service_role only (matching every other
-- money/invariant-critical function in this schema) — the edge function's
-- own assertOrgMember/assertOrgProfileComplete/planLimitReached checks
-- still run in resume-hub before this is ever called; this function only
-- owns the atomicity of the check-then-insert sequence itself.
create or replace function public.create_reveal_request_atomic(
  p_org_id uuid,
  p_candidate_user_id uuid,
  p_search_id uuid,
  p_candidate_ref text,
  p_job_title text,
  p_job_location text,
  p_employment_type text,
  p_salary_range text,
  p_job_url text,
  p_message text
) returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_open_id uuid;
  v_decline_id uuid;
  v_new_id uuid;
begin
  -- Same lock-then-check-then-write shape as credit_spend/credit_grant:
  -- serializes concurrent calls for this exact (org, candidate) pair only,
  -- auto-releases at transaction end even on error, and is a safe reentrant
  -- no-op if this transaction already holds it.
  perform pg_advisory_xact_lock(hashtext(p_org_id::text || ':' || p_candidate_user_id::text));

  select id into v_open_id from public.reveal_requests
   where org_id = p_org_id and candidate_user_id = p_candidate_user_id and status = 'pending'
   limit 1;
  if v_open_id is not null then
    return jsonb_build_object('ok', false, 'code', 'open_proposal_exists');
  end if;

  select id into v_decline_id from public.reveal_requests
   where org_id = p_org_id and candidate_user_id = p_candidate_user_id and status = 'declined'
     and responded_at >= now() - interval '30 days'
   limit 1;
  if v_decline_id is not null then
    return jsonb_build_object('ok', false, 'code', 'recent_decline_cooldown');
  end if;

  insert into public.reveal_requests (
    org_id, candidate_user_id, search_id, candidate_ref,
    job_title, job_location, employment_type, salary_range, job_url, message, sent_at
  ) values (
    p_org_id, p_candidate_user_id, p_search_id, p_candidate_ref,
    p_job_title, p_job_location, p_employment_type, p_salary_range, p_job_url, p_message, now()
  ) returning id into v_new_id;

  return jsonb_build_object('ok', true, 'id', v_new_id);
end;
$function$;

revoke all on function public.create_reveal_request_atomic from public, anon, authenticated;
grant execute on function public.create_reveal_request_atomic to service_role;
