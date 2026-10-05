-- Overview cards show how many seekers and employers came through Google vs email.
CREATE OR REPLACE FUNCTION public.get_admin_overview()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE m_start timestamptz := date_trunc('month', now());
BEGIN
  IF NOT has_role((SELECT auth.uid()), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;

  RETURN jsonb_build_object(
    'seekers_by_provider', coalesce((
      SELECT jsonb_object_agg(provider, n) FROM (
        SELECT coalesce(u.raw_app_meta_data->>'provider', 'email') AS provider, count(*) AS n
        FROM auth.users u
        LEFT JOIN employer_accounts ea ON ea.user_id = u.id
        WHERE u.email IS NOT NULL AND u.banned_until IS NULL AND ea.user_id IS NULL
        GROUP BY 1
      ) x
    ), '{}'::jsonb),
    'employers_by_provider', coalesce((
      SELECT jsonb_object_agg(provider, n) FROM (
        SELECT coalesce(u.raw_app_meta_data->>'provider', 'email') AS provider, count(*) AS n
        FROM employer_accounts ea
        JOIN auth.users u ON u.id = ea.user_id AND u.banned_until IS NULL
        GROUP BY 1
      ) x
    ), '{}'::jsonb),
    'seekers_total', (
      SELECT count(*)
      FROM auth.users u
      LEFT JOIN employer_accounts ea ON ea.user_id = u.id
      WHERE u.email IS NOT NULL AND u.banned_until IS NULL AND ea.user_id IS NULL
    ),
    'seekers_new_month', (
      SELECT count(*)
      FROM auth.users u
      LEFT JOIN employer_accounts ea ON ea.user_id = u.id
      WHERE u.email IS NOT NULL AND u.banned_until IS NULL
        AND ea.user_id IS NULL AND u.created_at >= m_start
    ),
    'seekers_discoverable', (
      SELECT count(*)
      FROM talent_pool_consent tp
      JOIN auth.users u ON u.id = tp.user_id AND u.banned_until IS NULL
      WHERE tp.opted_in = true
    ),
    'employers_pending', (
      SELECT count(*)
      FROM employer_accounts ea
      JOIN auth.users u ON u.id = ea.user_id AND u.banned_until IS NULL
      WHERE ea.status = 'pending_approval'
    ),
    'employers_active', (
      SELECT count(*)
      FROM employer_accounts ea
      JOIN auth.users u ON u.id = ea.user_id AND u.banned_until IS NULL
      WHERE ea.status = 'approved'
    ),
    'employers_by_plan', coalesce((
      SELECT jsonb_agg(x) FROM (
        SELECT coalesce(s.plan_key, 'employer_trial') AS plan_key, count(*) AS n
        FROM employer_accounts ea
        JOIN auth.users u ON u.id = ea.user_id AND u.banned_until IS NULL
        LEFT JOIN subscriptions s ON s.user_id = ea.user_id
        WHERE ea.status = 'approved'
        GROUP BY 1
        ORDER BY 2 DESC
      ) x
    ), '[]'::jsonb),
    'proposals_sent_month', (SELECT count(*) FROM reveal_requests WHERE created_at >= m_start),
    'proposals_accepted_month', (
      SELECT count(*) FROM reveal_requests
      WHERE status = 'accepted' AND coalesce(decided_at, responded_at, created_at) >= m_start
    ),
    'assessments_sent_month', (
      SELECT count(*) FROM assessments WHERE coalesce(sent_at, created_at) >= m_start
    ),
    'assessments_completed_month', (SELECT count(*) FROM assessments WHERE submitted_at >= m_start),
    'credits_consumed_month', (
      SELECT coalesce(-sum(cl.delta), 0)
      FROM credit_ledger cl
      JOIN auth.users u ON u.id = cl.user_id AND u.banned_until IS NULL
      WHERE cl.delta < 0 AND cl.created_at >= m_start
    ),
    'ai_spend_month', (
      SELECT coalesce(round(sum(l.cost_sar)::numeric, 2), 0)
      FROM llm_usage_logs l
      JOIN auth.users u ON u.id = l.user_id AND u.banned_until IS NULL
      WHERE l.created_at >= m_start
    ),
    'accounts_total', (
      SELECT count(*) FROM auth.users WHERE email IS NOT NULL AND banned_until IS NULL
    ),
    'accounts_without_consent', (
      SELECT count(*)
      FROM auth.users u
      WHERE u.email IS NOT NULL AND u.banned_until IS NULL
        AND NOT EXISTS (
          SELECT 1
          FROM terms_consent_log tc
          WHERE tc.user_id = u.id
            AND tc.terms_accepted AND tc.privacy_accepted
            AND tc.terms_version IS NOT NULL AND tc.privacy_version IS NOT NULL
        )
    ),
    'generated_at', now()
  );
END;
$function$;
