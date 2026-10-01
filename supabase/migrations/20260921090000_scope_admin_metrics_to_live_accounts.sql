-- Admin operational views must describe accounts that can still sign in.
-- Erased accounts remain available to accounting/erasure audit procedures,
-- but are not active users, employers, email recipients, or subscribers.

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
$$;

CREATE OR REPLACE FUNCTION public.get_admin_accounts(p_search text DEFAULT NULL::text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
BEGIN
  IF NOT has_role((SELECT auth.uid()), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;

  RETURN jsonb_build_object(
    'total', (SELECT count(*) FROM auth.users WHERE email IS NOT NULL AND banned_until IS NULL),
    'seekers', (
      SELECT count(*)
      FROM auth.users u
      LEFT JOIN employer_accounts ea ON ea.user_id = u.id
      WHERE u.email IS NOT NULL AND u.banned_until IS NULL AND ea.user_id IS NULL
    ),
    'employers', (
      SELECT count(*)
      FROM employer_accounts ea
      JOIN auth.users u ON u.id = ea.user_id AND u.banned_until IS NULL
    ),
    'admins', (
      SELECT count(*)
      FROM user_roles ur
      JOIN auth.users u ON u.id = ur.user_id AND u.banned_until IS NULL
      WHERE ur.role = 'admin'::app_role
    ),
    'suspended', (
      SELECT count(*)
      FROM account_suspensions s
      JOIN auth.users u ON u.id = s.user_id AND u.banned_until IS NULL
      WHERE s.active
    ),
    'restricted', (
      SELECT count(DISTINCT r.user_id)
      FROM account_restrictions r
      JOIN auth.users u ON u.id = r.user_id AND u.banned_until IS NULL
    ),
    'rows', coalesce((
      SELECT jsonb_agg(row_to_json(t) ORDER BY t.signed_up_at DESC)
      FROM (
        SELECT
          u.id AS user_id,
          u.email,
          coalesce(p.contact_person, split_part(u.email, '@', 1)) AS display_name,
          coalesce(p.role::text, 'job_seeker') AS account_role,
          coalesce(ur.role::text, 'user') AS system_role,
          u.created_at AS signed_up_at,
          u.last_sign_in_at,
          coalesce(u.raw_app_meta_data->>'provider', 'email') AS provider,
          (u.email_confirmed_at IS NOT NULL) AS email_confirmed,
          ea.status::text AS employer_status,
          ea.company_name,
          coalesce(s.plan_key, 'none') AS plan_key,
          s.status AS sub_status,
          coalesce((SELECT sum(cl.delta) FROM credit_ledger cl WHERE cl.user_id = u.id), 0) AS credits,
          coalesce(tp.opted_in, false) AS discoverable,
          EXISTS (SELECT 1 FROM account_suspensions ax WHERE ax.user_id = u.id AND ax.active) AS suspended,
          coalesce((
            SELECT array_agg(ar.capability::text ORDER BY ar.capability)
            FROM account_restrictions ar WHERE ar.user_id = u.id
          ), ARRAY[]::text[]) AS restrictions
        FROM auth.users u
        LEFT JOIN profiles p ON p.user_id = u.id
        LEFT JOIN user_roles ur ON ur.user_id = u.id
        LEFT JOIN employer_accounts ea ON ea.user_id = u.id
        LEFT JOIN subscriptions s ON s.user_id = u.id
        LEFT JOIN talent_pool_consent tp ON tp.user_id = u.id
        WHERE u.email IS NOT NULL AND u.banned_until IS NULL
          AND (p_search IS NULL OR p_search = '' OR u.email ILIKE '%' || p_search || '%'
            OR coalesce(p.contact_person, '') ILIKE '%' || p_search || '%'
            OR coalesce(ea.company_name, '') ILIKE '%' || p_search || '%')
        ORDER BY u.created_at DESC
        LIMIT 300
      ) t
    ), '[]'::jsonb)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_admin_employers()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
BEGIN
  IF NOT has_role((SELECT auth.uid()), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;

  RETURN jsonb_build_object(
    'pending', coalesce((SELECT jsonb_agg(row_to_json(p) ORDER BY p.requested_at) FROM (
      SELECT ea.user_id, ea.company_name, ea.company_size, ea.hiring_need, ea.phone,
             ea.created_at AS requested_at, ea.internal_note,
             u.email AS requester_email,
             o.website, o.industry, o.headquarters, o.about, o.logo_url
      FROM employer_accounts ea
      JOIN auth.users u ON u.id = ea.user_id AND u.banned_until IS NULL
      LEFT JOIN orgs o ON o.created_by = ea.user_id
      WHERE ea.status = 'pending_approval'
    ) p), '[]'::jsonb),
    'active', coalesce((SELECT jsonb_agg(row_to_json(a) ORDER BY a.approved_at DESC NULLS LAST) FROM (
      SELECT ea.user_id, ea.company_name, ea.status::text AS status, ea.approved_at, ea.internal_note,
             u.email AS requester_email,
             o.website, o.industry, o.headquarters,
             coalesce(s.plan_key, 'employer_trial') AS plan_key,
             pl.name AS plan_name, pl.proposals_limit, pl.assessments_limit, pl.searches_limit,
             s.trial_ends_at, s.current_period_start, s.current_period_end, s.status AS sub_status,
             (SELECT count(*) FROM reveal_requests r WHERE r.org_id = o.id
               AND r.created_at >= coalesce(s.current_period_start, now() - interval '30 days')) AS proposals_used,
             (SELECT count(*) FROM assessments x WHERE x.org_id = o.id
               AND x.created_at >= coalesce(s.current_period_start, now() - interval '30 days')) AS assessments_used,
             (SELECT count(*) FROM employer_searches es WHERE es.org_id = o.id
               AND es.created_at >= coalesce(s.current_period_start, now() - interval '30 days')) AS searches_used
      FROM employer_accounts ea
      JOIN auth.users u ON u.id = ea.user_id AND u.banned_until IS NULL
      LEFT JOIN orgs o ON o.created_by = ea.user_id
      LEFT JOIN subscriptions s ON s.user_id = ea.user_id
      LEFT JOIN plans pl ON pl.key = coalesce(s.plan_key, 'employer_trial')
      WHERE ea.status <> 'pending_approval'
    ) a), '[]'::jsonb),
    'plans', coalesce((SELECT jsonb_agg(row_to_json(q) ORDER BY q.sort) FROM (
      SELECT key, name, price_cents, proposals_limit, assessments_limit, searches_limit, sort
      FROM plans WHERE audience = 'employer' AND active
    ) q), '[]'::jsonb)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_admin_money()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE m_start timestamptz := date_trunc('month', now());
BEGIN
  IF NOT has_role((SELECT auth.uid()), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;

  RETURN jsonb_build_object(
    'mrr_cents', (
      SELECT coalesce(sum(CASE WHEN pl.interval = 'week' THEN round(pl.price_cents * 52.0 / 12.0) ELSE pl.price_cents END), 0)
      FROM subscriptions s
      JOIN auth.users u ON u.id = s.user_id AND u.banned_until IS NULL
      JOIN plans pl ON pl.key = s.plan_key
      WHERE s.status IN ('active', 'trialing') AND pl.price_cents > 0 AND s.status <> 'canceled'
    ),
    'paying_count', (
      SELECT count(*)
      FROM subscriptions s
      JOIN auth.users u ON u.id = s.user_id AND u.banned_until IS NULL
      JOIN plans pl ON pl.key = s.plan_key
      WHERE s.status = 'active' AND pl.price_cents > 0
    ),
    'by_plan', coalesce((SELECT jsonb_agg(x ORDER BY (x->>'sort')::int) FROM (
      SELECT jsonb_build_object(
        'key', pl.key, 'name', pl.name, 'audience', pl.audience,
        'price_cents', pl.price_cents, 'sort', pl.sort,
        'subscribers', count(s.user_id) FILTER (WHERE u.id IS NOT NULL AND s.status IN ('active', 'trialing'))
      ) AS x
      FROM plans pl
      LEFT JOIN subscriptions s ON s.plan_key = pl.key
      LEFT JOIN auth.users u ON u.id = s.user_id AND u.banned_until IS NULL
      WHERE pl.active
      GROUP BY pl.key, pl.name, pl.audience, pl.price_cents, pl.sort
    ) x), '[]'::jsonb),
    'failed_payments', coalesce((SELECT jsonb_agg(row_to_json(f)) FROM (
      SELECT s.user_id, u.email, s.plan_key, s.status, s.current_period_end
      FROM subscriptions s
      JOIN auth.users u ON u.id = s.user_id AND u.banned_until IS NULL
      WHERE s.status IN ('past_due', 'unpaid', 'incomplete')
      LIMIT 50
    ) f), '[]'::jsonb),
    'ai_spend_month', (
      SELECT coalesce(round(sum(l.cost_sar)::numeric, 2), 0)
      FROM llm_usage_logs l
      JOIN auth.users u ON u.id = l.user_id AND u.banned_until IS NULL
      WHERE l.created_at >= m_start
    ),
    'credits_granted_month', (
      SELECT coalesce(sum(cl.delta), 0)
      FROM credit_ledger cl
      JOIN auth.users u ON u.id = cl.user_id AND u.banned_until IS NULL
      WHERE cl.delta > 0 AND cl.created_at >= m_start
    ),
    'credits_spent_month', (
      SELECT coalesce(-sum(cl.delta), 0)
      FROM credit_ledger cl
      JOIN auth.users u ON u.id = cl.user_id AND u.banned_until IS NULL
      WHERE cl.delta < 0 AND cl.created_at >= m_start
    ),
    'top_consumers', coalesce((SELECT jsonb_agg(row_to_json(c) ORDER BY c.spent DESC) FROM (
      SELECT cl.user_id, u.email, -sum(cl.delta) AS spent, count(*) AS entries
      FROM credit_ledger cl
      JOIN auth.users u ON u.id = cl.user_id AND u.banned_until IS NULL
      WHERE cl.delta < 0
      GROUP BY cl.user_id, u.email
      ORDER BY 3 DESC
      LIMIT 20
    ) c), '[]'::jsonb),
    'ledger', coalesce((SELECT jsonb_agg(row_to_json(l) ORDER BY l.created_at DESC) FROM (
      SELECT cl.id, cl.user_id, u.email, cl.delta, cl.reason, cl.balance_after, cl.created_at
      FROM credit_ledger cl
      JOIN auth.users u ON u.id = cl.user_id AND u.banned_until IS NULL
      ORDER BY cl.created_at DESC
      LIMIT 100
    ) l), '[]'::jsonb)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_admin_email_audience()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
BEGIN
  IF NOT has_role((SELECT auth.uid()), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;

  RETURN coalesce((
    SELECT jsonb_agg(row_to_json(t) ORDER BY t.signed_up_at DESC)
    FROM (
      SELECT u.id AS user_id, u.email,
             coalesce(p.contact_person, split_part(u.email, '@', 1)) AS display_name,
             coalesce(p.role::text, 'job_seeker') AS account_role,
             (ea.user_id IS NOT NULL) AS is_employer,
             coalesce(tp.opted_in, false) AS discoverable,
             u.created_at AS signed_up_at
      FROM auth.users u
      LEFT JOIN profiles p ON p.user_id = u.id
      LEFT JOIN employer_accounts ea ON ea.user_id = u.id
      LEFT JOIN talent_pool_consent tp ON tp.user_id = u.id
      WHERE u.email IS NOT NULL AND u.banned_until IS NULL
    ) t
  ), '[]'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_admin_candidates()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
BEGIN
  IF NOT has_role((SELECT auth.uid()), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;

  RETURN (
    WITH pool AS (
      SELECT tp.user_id, tp.consented_at,
             ci.indexed_at, ci.embedding_model, ci.headline, ci.seniority, ci.years_experience,
             length(coalesce(ci.profile_text, '')) AS profile_len,
             (SELECT max(updated_at) FROM user_profile_canonical c WHERE c.user_id = tp.user_id) AS profile_updated_at,
             (SELECT max(updated_at) FROM resumes r WHERE r.user_id = tp.user_id) AS resume_updated_at,
             (SELECT count(*) FROM candidate_skills s WHERE s.user_id = tp.user_id) AS skills_count,
             u.email
      FROM talent_pool_consent tp
      JOIN auth.users u ON u.id = tp.user_id AND u.banned_until IS NULL
      LEFT JOIN candidate_index ci ON ci.user_id = tp.user_id
      WHERE tp.opted_in = true
    ), flagged AS (
      SELECT *,
        (indexed_at IS NULL
          OR indexed_at < coalesce(profile_updated_at, '-infinity'::timestamptz)
          OR indexed_at < coalesce(resume_updated_at, '-infinity'::timestamptz)) AS is_stale,
        (skills_count < 5 OR profile_len < 400) AS is_thin
      FROM pool
    )
    SELECT jsonb_build_object(
      'total_opted_in', (SELECT count(*) FROM flagged),
      'stale_count', (SELECT count(*) FROM flagged WHERE is_stale),
      'thin_count', (SELECT count(*) FROM flagged WHERE is_thin),
      'models', coalesce((SELECT jsonb_agg(x) FROM (
        SELECT coalesce(embedding_model, 'none') AS model, count(*) AS n
        FROM flagged GROUP BY 1 ORDER BY 2 DESC
      ) x), '[]'::jsonb),
      'rows', coalesce((SELECT jsonb_agg(row_to_json(f) ORDER BY f.is_stale DESC, f.consented_at DESC) FROM (
        SELECT user_id, email, headline, seniority, years_experience, skills_count, profile_len,
               indexed_at, embedding_model, profile_updated_at, resume_updated_at, is_stale, is_thin,
               consented_at
        FROM flagged LIMIT 200
      ) f), '[]'::jsonb)
    )
  );
END;
$$;
