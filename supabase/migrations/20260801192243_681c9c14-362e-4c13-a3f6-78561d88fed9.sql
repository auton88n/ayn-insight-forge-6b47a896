ALTER TABLE public.terms_consent_log
  ADD COLUMN IF NOT EXISTS privacy_version text,
  ADD COLUMN IF NOT EXISTS ip_address text,
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'signup';

CREATE INDEX IF NOT EXISTS idx_terms_consent_log_user_accepted
  ON public.terms_consent_log (user_id, accepted_at DESC);

CREATE OR REPLACE FUNCTION public.get_admin_account_detail(p_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v jsonb;
BEGIN
  IF NOT has_role((SELECT auth.uid()), 'admin'::app_role) THEN RAISE EXCEPTION 'Admin access required'; END IF;

  SELECT jsonb_build_object(
    'user_id', u.id,
    'email', u.email,
    'display_name', coalesce(p.contact_person, split_part(u.email,'@',1)),
    'provider', coalesce(u.raw_app_meta_data->>'provider', 'email'),
    'providers', coalesce(u.raw_app_meta_data->'providers', '[]'::jsonb),
    'email_confirmed_at', u.email_confirmed_at,
    'signed_up_at', u.created_at,
    'last_sign_in_at', u.last_sign_in_at,
    'sign_in_count', (SELECT count(*) FROM auth.sessions s WHERE s.user_id = u.id),
    'banned_until', u.banned_until,
    'account_role', coalesce(p.role::text,'job_seeker'),
    'system_role', coalesce(ur.role::text,'user'),
    'employer_status', ea.status::text,
    'company_name', ea.company_name,
    'plan_key', coalesce(sub.plan_key,'none'),
    'sub_status', sub.status,
    'credits_balance', coalesce((SELECT sum(delta) FROM credit_ledger cl WHERE cl.user_id = u.id),0),
    'credits_spent', coalesce((SELECT -sum(delta) FROM credit_ledger cl WHERE cl.user_id = u.id AND cl.delta < 0),0),
    'has_resume', EXISTS (SELECT 1 FROM resumes r WHERE r.user_id = u.id),
    'saved_jobs', (SELECT count(*) FROM jobs j WHERE j.user_id = u.id),
    'discoverable', coalesce(tp.opted_in,false),
    'discovery_consent_at', tp.consented_at,
    'indexed_at', ci.indexed_at,
    'profile_completeness', (
      SELECT round(100.0 * (
        (CASE WHEN coalesce(ci.headline,'') <> '' THEN 1 ELSE 0 END) +
        (CASE WHEN coalesce(ci.summary,'') <> '' THEN 1 ELSE 0 END) +
        (CASE WHEN coalesce(ci.location,'') <> '' THEN 1 ELSE 0 END) +
        (CASE WHEN coalesce(ci.years_experience,0) > 0 THEN 1 ELSE 0 END) +
        (CASE WHEN EXISTS (SELECT 1 FROM resumes r WHERE r.user_id = u.id) THEN 1 ELSE 0 END) +
        (CASE WHEN coalesce(jsonb_array_length(upc.skills), 0) > 0 THEN 1 ELSE 0 END) +
        (CASE WHEN coalesce(jsonb_array_length(upc.experiences), 0) > 0 THEN 1 ELSE 0 END)
      ) / 7.0)
    ),
    'proposals_received', (SELECT count(*) FROM reveal_requests rr WHERE rr.candidate_user_id = u.id),
    'proposals_sent', (SELECT count(*) FROM reveal_requests rr JOIN org_members om ON om.org_id = rr.org_id WHERE om.user_id = u.id),
    'assessments_taken', (SELECT count(*) FROM assessments a WHERE a.candidate_user_id = u.id AND a.submitted_at IS NOT NULL),
    'assessments_received', (SELECT count(*) FROM assessments a WHERE a.candidate_user_id = u.id),
    'legal_consent', (
      SELECT to_jsonb(c) FROM (
        SELECT tc.terms_version, tc.privacy_version, tc.accepted_at, tc.ip_address,
               tc.source, tc.user_agent, tc.terms_accepted, tc.privacy_accepted
        FROM terms_consent_log tc WHERE tc.user_id = u.id
        ORDER BY tc.accepted_at DESC LIMIT 1
      ) c
    ),
    'legal_consent_history', coalesce((
      SELECT jsonb_agg(to_jsonb(ch) ORDER BY ch.accepted_at DESC) FROM (
        SELECT tc.terms_version, tc.privacy_version, tc.accepted_at, tc.ip_address, tc.source
        FROM terms_consent_log tc WHERE tc.user_id = u.id
        ORDER BY tc.accepted_at DESC LIMIT 10
      ) ch
    ), '[]'::jsonb),
    'suspension', (
      SELECT to_jsonb(x) FROM (
        SELECT s.reason, s.until, s.suspended_at, s.suspended_by,
               (SELECT email FROM auth.users au WHERE au.id = s.suspended_by) AS suspended_by_email
        FROM account_suspensions s WHERE s.user_id = u.id AND s.active LIMIT 1
      ) x
    ),
    'suspension_history', coalesce((
      SELECT jsonb_agg(to_jsonb(h) ORDER BY h.suspended_at DESC) FROM (
        SELECT s.reason, s.until, s.suspended_at, s.restored_at, s.active FROM account_suspensions s
        WHERE s.user_id = u.id ORDER BY s.suspended_at DESC LIMIT 10
      ) h
    ), '[]'::jsonb),
    'restrictions', coalesce((
      SELECT jsonb_agg(to_jsonb(rq)) FROM (
        SELECT ar.capability::text AS capability, ar.reason, ar.created_at,
               (SELECT email FROM auth.users au WHERE au.id = ar.set_by) AS set_by_email
        FROM account_restrictions ar WHERE ar.user_id = u.id ORDER BY ar.capability
      ) rq
    ), '[]'::jsonb)
  )
  INTO v
  FROM auth.users u
  LEFT JOIN profiles p ON p.user_id = u.id
  LEFT JOIN user_roles ur ON ur.user_id = u.id
  LEFT JOIN employer_accounts ea ON ea.user_id = u.id
  LEFT JOIN subscriptions sub ON sub.user_id = u.id
  LEFT JOIN talent_pool_consent tp ON tp.user_id = u.id
  LEFT JOIN candidate_index ci ON ci.user_id = u.id
  LEFT JOIN user_profile_canonical upc ON upc.user_id = u.id
  WHERE u.id = p_user_id;

  IF v IS NULL THEN RAISE EXCEPTION 'No such account'; END IF;
  RETURN v;
END; $function$;