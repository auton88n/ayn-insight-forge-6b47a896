-- v3.41.0 admin panel walkthrough fixes.

-- 1. admin_user_snapshot (System > Credits pane) referenced a nonexistent
-- column, tp.is_active, breaking the Snapshot panel for every account with
-- a silent 400. Every other reference in the codebase uses
-- talent_pool_consent.opted_in.
CREATE OR REPLACE FUNCTION public.admin_user_snapshot(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Admin access required'; END IF;

  SELECT jsonb_build_object(
    'user_id', p_user_id,
    'email', (SELECT u.email FROM auth.users u WHERE u.id = p_user_id),
    'created_at', (SELECT u.created_at FROM auth.users u WHERE u.id = p_user_id),
    'last_sign_in_at', (SELECT u.last_sign_in_at FROM auth.users u WHERE u.id = p_user_id),
    'roles', coalesce((SELECT jsonb_agg(ur.role) FROM public.user_roles ur WHERE ur.user_id = p_user_id), '[]'::jsonb),
    'subscription', (SELECT to_jsonb(s) FROM public.subscriptions s WHERE s.user_id = p_user_id),
    'credits', public.credit_balance(p_user_id),
    'recent_credits', coalesce((
      SELECT jsonb_agg(to_jsonb(c) ORDER BY c.created_at DESC)
      FROM (SELECT * FROM public.credit_ledger WHERE user_id = p_user_id ORDER BY created_at DESC LIMIT 20) c
    ), '[]'::jsonb),
    'proposals', coalesce((SELECT count(*) FROM public.reveal_requests r WHERE r.candidate_user_id = p_user_id), 0),
    'assessments', coalesce((SELECT count(*) FROM public.assessments a WHERE a.candidate_user_id = p_user_id), 0),
    'discoverable', coalesce((SELECT tp.opted_in FROM public.talent_pool_consent tp WHERE tp.user_id = p_user_id), false)
  ) INTO v;

  INSERT INTO public.security_audit_logs(user_id, action, details, severity)
  VALUES (auth.uid(), 'admin_user_snapshot', jsonb_build_object('target_user', p_user_id), 'medium');

  RETURN v;
END;
$$;

-- 2. get_admin_rate_limit_stats and admin_unblock_user are both called
-- directly by the frontend (System > Rate limits pane) but were missing the
-- authenticated GRANT every sibling get_admin_*/admin_* function has, same
-- shape of bug already fixed once for get_admin_terms_consent (v3.27.0).
GRANT EXECUTE ON FUNCTION public.get_admin_rate_limit_stats() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_unblock_user(uuid, text) TO authenticated;

-- 3. get_admin_overview and get_admin_accounts both counted "job seekers" as
-- `SELECT count(*) FROM profiles WHERE coalesce(role,'job_seeker')='job_seeker'`,
-- which only iterates rows that already exist in profiles. 31 of 58 real
-- accounts had no profiles row at all (never completed onboarding) and were
-- silently excluded, undercounting the headline Overview stat (27 shown vs
-- 57 real) and the Accounts pane stat by more than half. profiles.role is
-- also stale for at least one real employer account that signed up before
-- the v3.36.0 role-on-signup fix (its profiles.role is literally
-- 'job_seeker' despite having a real, approved employer_accounts row), so
-- "job seeker" now means "not present in employer_accounts", matching how
-- get_admin_email_audience already treats is_employer independently of
-- profiles.role.
CREATE OR REPLACE FUNCTION public.get_admin_overview()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE m_start timestamptz := date_trunc('month', now());
BEGIN
  IF NOT has_role((SELECT auth.uid()), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;
  RETURN jsonb_build_object(
    'seekers_total', (
      SELECT count(*) FROM auth.users u LEFT JOIN employer_accounts ea ON ea.user_id = u.id
      WHERE u.email IS NOT NULL AND ea.user_id IS NULL
    ),
    'seekers_new_month', (
      SELECT count(*) FROM auth.users u LEFT JOIN employer_accounts ea ON ea.user_id = u.id
      WHERE u.email IS NOT NULL AND ea.user_id IS NULL AND u.created_at >= m_start
    ),
    'seekers_discoverable', (SELECT count(*) FROM talent_pool_consent WHERE opted_in = true),
    'employers_pending', (SELECT count(*) FROM employer_accounts WHERE status = 'pending_approval'),
    'employers_active', (SELECT count(*) FROM employer_accounts WHERE status = 'approved'),
    'employers_by_plan', coalesce((
      SELECT jsonb_agg(x) FROM (
        SELECT coalesce(s.plan_key,'employer_trial') AS plan_key, count(*) AS n
        FROM employer_accounts ea LEFT JOIN subscriptions s ON s.user_id = ea.user_id
        WHERE ea.status = 'approved' GROUP BY 1 ORDER BY 2 DESC
      ) x), '[]'::jsonb),
    'proposals_sent_month', (SELECT count(*) FROM reveal_requests WHERE created_at >= m_start),
    'proposals_accepted_month', (SELECT count(*) FROM reveal_requests WHERE status = 'accepted' AND coalesce(decided_at, responded_at, created_at) >= m_start),
    'assessments_sent_month', (SELECT count(*) FROM assessments WHERE coalesce(sent_at, created_at) >= m_start),
    'assessments_completed_month', (SELECT count(*) FROM assessments WHERE submitted_at >= m_start),
    'credits_consumed_month', (SELECT coalesce(-sum(delta),0) FROM credit_ledger WHERE delta < 0 AND created_at >= m_start),
    'ai_spend_month', (SELECT coalesce(round(sum(cost_sar)::numeric, 2),0) FROM llm_usage_logs WHERE created_at >= m_start),
    'accounts_total', (SELECT count(*) FROM auth.users),
    'accounts_without_consent', (
      SELECT count(*) FROM auth.users u
      WHERE NOT EXISTS (
        SELECT 1 FROM terms_consent_log tc
        WHERE tc.user_id = u.id AND tc.terms_accepted AND tc.privacy_accepted
          AND tc.terms_version IS NOT NULL AND tc.privacy_version IS NOT NULL
      )
    ),
    'generated_at', now()
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_admin_accounts(p_search text DEFAULT NULL::text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NOT has_role((SELECT auth.uid()), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;
  RETURN jsonb_build_object(
    'total', (SELECT count(*) FROM auth.users WHERE email IS NOT NULL),
    'seekers', (
      SELECT count(*) FROM auth.users u LEFT JOIN employer_accounts ea ON ea.user_id = u.id
      WHERE u.email IS NOT NULL AND ea.user_id IS NULL
    ),
    'employers', (SELECT count(*) FROM employer_accounts),
    'admins', (SELECT count(*) FROM user_roles WHERE role = 'admin'::app_role),
    'suspended', (SELECT count(*) FROM account_suspensions WHERE active),
    'restricted', (SELECT count(DISTINCT user_id) FROM account_restrictions),
    'rows', coalesce((
      SELECT jsonb_agg(row_to_json(t) ORDER BY t.signed_up_at DESC)
      FROM (
        SELECT
          u.id AS user_id,
          u.email,
          coalesce(p.contact_person, split_part(u.email,'@',1)) AS display_name,
          coalesce(p.role::text, 'job_seeker') AS account_role,
          coalesce(ur.role::text, 'user') AS system_role,
          u.created_at AS signed_up_at,
          u.last_sign_in_at,
          coalesce(u.raw_app_meta_data->>'provider','email') AS provider,
          (u.email_confirmed_at IS NOT NULL) AS email_confirmed,
          ea.status::text AS employer_status,
          ea.company_name,
          coalesce(s.plan_key, 'none') AS plan_key,
          s.status AS sub_status,
          coalesce((SELECT sum(delta) FROM credit_ledger cl WHERE cl.user_id = u.id), 0) AS credits,
          coalesce(tp.opted_in, false) AS discoverable,
          EXISTS (SELECT 1 FROM account_suspensions asx WHERE asx.user_id = u.id AND asx.active) AS suspended,
          coalesce((SELECT array_agg(ar.capability::text ORDER BY ar.capability) FROM account_restrictions ar WHERE ar.user_id = u.id), ARRAY[]::text[]) AS restrictions
        FROM auth.users u
        LEFT JOIN profiles p ON p.user_id = u.id
        LEFT JOIN user_roles ur ON ur.user_id = u.id
        LEFT JOIN employer_accounts ea ON ea.user_id = u.id
        LEFT JOIN subscriptions s ON s.user_id = u.id
        LEFT JOIN talent_pool_consent tp ON tp.user_id = u.id
        WHERE u.email IS NOT NULL
          AND (p_search IS NULL OR p_search = '' OR u.email ILIKE '%'||p_search||'%'
               OR coalesce(p.contact_person,'') ILIKE '%'||p_search||'%'
               OR coalesce(ea.company_name,'') ILIKE '%'||p_search||'%')
        ORDER BY u.created_at DESC
        LIMIT 300
      ) t), '[]'::jsonb)
  );
END; $$;
