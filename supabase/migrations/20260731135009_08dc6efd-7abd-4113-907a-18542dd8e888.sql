
ALTER TABLE public.employer_accounts ADD COLUMN IF NOT EXISTS internal_note text;

-- ============ OVERVIEW ============
CREATE OR REPLACE FUNCTION public.get_admin_overview()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE m_start timestamptz := date_trunc('month', now());
BEGIN
  IF NOT has_role((SELECT auth.uid()), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;
  RETURN jsonb_build_object(
    'seekers_total', (SELECT count(*) FROM profiles WHERE coalesce(role::text,'job_seeker') = 'job_seeker'),
    'seekers_new_month', (SELECT count(*) FROM profiles WHERE coalesce(role::text,'job_seeker')='job_seeker' AND created_at >= m_start),
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
    'generated_at', now()
  );
END; $$;

-- ============ EMPLOYERS ============
CREATE OR REPLACE FUNCTION public.get_admin_employers()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
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
        LEFT JOIN auth.users u ON u.id = ea.user_id
        LEFT JOIN orgs o ON o.created_by = ea.user_id
        WHERE ea.status = 'pending_approval'
      ) p), '[]'::jsonb),
    'active', coalesce((SELECT jsonb_agg(row_to_json(a) ORDER BY a.approved_at DESC NULLS LAST) FROM (
        SELECT ea.user_id, ea.company_name, ea.status::text AS status, ea.approved_at, ea.internal_note,
               u.email AS requester_email,
               o.website, o.industry, o.headquarters,
               coalesce(s.plan_key,'employer_trial') AS plan_key,
               pl.name AS plan_name, pl.proposals_limit, pl.assessments_limit,
               s.trial_ends_at, s.current_period_start, s.current_period_end, s.status AS sub_status,
               (SELECT count(*) FROM reveal_requests r WHERE r.org_id = o.id
                  AND r.created_at >= coalesce(s.current_period_start, now() - interval '30 days')) AS proposals_used,
               (SELECT count(*) FROM assessments x WHERE x.org_id = o.id
                  AND x.created_at >= coalesce(s.current_period_start, now() - interval '30 days')) AS assessments_used
        FROM employer_accounts ea
        LEFT JOIN auth.users u ON u.id = ea.user_id
        LEFT JOIN orgs o ON o.created_by = ea.user_id
        LEFT JOIN subscriptions s ON s.user_id = ea.user_id
        LEFT JOIN plans pl ON pl.key = coalesce(s.plan_key,'employer_trial')
        WHERE ea.status <> 'pending_approval'
      ) a), '[]'::jsonb),
    'plans', coalesce((SELECT jsonb_agg(row_to_json(q) ORDER BY q.sort) FROM (
        SELECT key, name, price_cents, proposals_limit, assessments_limit, sort FROM plans WHERE audience='employer' AND active
      ) q), '[]'::jsonb)
  );
END; $$;

CREATE OR REPLACE FUNCTION public.admin_employer_approve(p_user_id uuid, p_note text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NOT has_role((SELECT auth.uid()), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;
  UPDATE employer_accounts
     SET status = 'approved', approved_at = now(), approved_by = (SELECT auth.uid()),
         internal_note = coalesce(p_note, internal_note), updated_at = now()
   WHERE user_id = p_user_id;
  INSERT INTO subscriptions (user_id, plan_key, status, current_period_start, current_period_end, trial_ends_at)
  VALUES (p_user_id, 'employer_trial', 'trialing', now(), now() + interval '30 days', now() + interval '30 days')
  ON CONFLICT (user_id) DO UPDATE
    SET plan_key='employer_trial', status='trialing', current_period_start=now(),
        current_period_end=now() + interval '30 days', trial_ends_at=now() + interval '30 days', updated_at=now();
  RETURN jsonb_build_object('ok', true, 'trial_ends_at', now() + interval '30 days');
END; $$;

CREATE OR REPLACE FUNCTION public.admin_employer_decline(p_user_id uuid, p_note text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NOT has_role((SELECT auth.uid()), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;
  UPDATE employer_accounts
     SET status = 'suspended', internal_note = p_note, updated_at = now()
   WHERE user_id = p_user_id;
  RETURN jsonb_build_object('ok', true);
END; $$;

CREATE OR REPLACE FUNCTION public.admin_employer_override(p_user_id uuid, p_plan_key text DEFAULT NULL, p_extend_days integer DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NOT has_role((SELECT auth.uid()), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;
  IF p_plan_key IS NOT NULL AND NOT EXISTS (SELECT 1 FROM plans WHERE key = p_plan_key AND audience='employer') THEN
    RAISE EXCEPTION 'Unknown employer plan %', p_plan_key;
  END IF;
  INSERT INTO subscriptions (user_id, plan_key, status, current_period_start, current_period_end)
  VALUES (p_user_id, coalesce(p_plan_key,'employer_trial'), 'active', now(), now() + interval '30 days')
  ON CONFLICT (user_id) DO UPDATE SET
    plan_key = coalesce(p_plan_key, subscriptions.plan_key),
    trial_ends_at = CASE WHEN p_extend_days IS NULL THEN subscriptions.trial_ends_at
                         ELSE coalesce(subscriptions.trial_ends_at, now()) + (p_extend_days || ' days')::interval END,
    current_period_end = CASE WHEN p_extend_days IS NULL THEN subscriptions.current_period_end
                         ELSE coalesce(subscriptions.current_period_end, now()) + (p_extend_days || ' days')::interval END,
    updated_at = now();
  RETURN jsonb_build_object('ok', true);
END; $$;

-- ============ CANDIDATES ============
CREATE OR REPLACE FUNCTION public.get_admin_candidates()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NOT has_role((SELECT auth.uid()), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;
  RETURN (
    WITH pool AS (
      SELECT tp.user_id, tp.consented_at,
             ci.indexed_at, ci.embedding_model, ci.headline, ci.seniority, ci.years_experience,
             length(coalesce(ci.profile_text,'')) AS profile_len,
             (SELECT max(updated_at) FROM user_profile_canonical c WHERE c.user_id = tp.user_id) AS profile_updated_at,
             (SELECT max(updated_at) FROM resumes r WHERE r.user_id = tp.user_id) AS resume_updated_at,
             (SELECT count(*) FROM candidate_skills s WHERE s.user_id = tp.user_id) AS skills_count,
             u.email
      FROM talent_pool_consent tp
      LEFT JOIN candidate_index ci ON ci.user_id = tp.user_id
      LEFT JOIN auth.users u ON u.id = tp.user_id
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
          SELECT coalesce(embedding_model,'none') AS model, count(*) AS n
          FROM flagged GROUP BY 1 ORDER BY 2 DESC) x), '[]'::jsonb),
      'rows', coalesce((SELECT jsonb_agg(row_to_json(f) ORDER BY f.is_stale DESC, f.consented_at DESC) FROM (
          SELECT user_id, email, headline, seniority, years_experience, skills_count, profile_len,
                 indexed_at, embedding_model, profile_updated_at, resume_updated_at, is_stale, is_thin
          FROM flagged LIMIT 200) f), '[]'::jsonb)
    )
  );
END; $$;

CREATE OR REPLACE FUNCTION public.admin_mark_candidates_stale(p_user_ids uuid[])
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE n integer;
BEGIN
  IF NOT has_role((SELECT auth.uid()), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;
  IF p_user_ids IS NULL OR array_length(p_user_ids,1) IS NULL THEN
    RETURN jsonb_build_object('ok', true, 'queued', 0);
  END IF;
  IF array_length(p_user_ids,1) > 25 THEN
    RAISE EXCEPTION 'Reindex is bounded to 25 candidates per run';
  END IF;
  UPDATE candidate_index SET indexed_at = NULL, embedding_model = NULL
   WHERE user_id = ANY(p_user_ids);
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN jsonb_build_object('ok', true, 'queued', n);
END; $$;

-- ============ MARKETPLACE ============
CREATE OR REPLACE FUNCTION public.get_admin_marketplace()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NOT has_role((SELECT auth.uid()), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;
  RETURN jsonb_build_object(
    'proposals', jsonb_build_object(
      'total', (SELECT count(*) FROM reveal_requests),
      'pending', (SELECT count(*) FROM reveal_requests WHERE status = 'pending'),
      'accepted', (SELECT count(*) FROM reveal_requests WHERE status = 'accepted'),
      'declined', (SELECT count(*) FROM reveal_requests WHERE status = 'declined')
    ),
    'by_employer', coalesce((SELECT jsonb_agg(x ORDER BY (x->>'sent')::int DESC) FROM (
        SELECT jsonb_build_object(
          'org_id', r.org_id,
          'company', coalesce(o.name, 'Unknown'),
          'sent', count(*),
          'accepted', count(*) FILTER (WHERE r.status='accepted'),
          'declined', count(*) FILTER (WHERE r.status='declined'),
          'pending', count(*) FILTER (WHERE r.status='pending'),
          'acceptance_rate', round(100.0 * count(*) FILTER (WHERE r.status='accepted') / greatest(count(*),1))
        ) AS x
        FROM reveal_requests r LEFT JOIN orgs o ON o.id = r.org_id
        GROUP BY r.org_id, o.name) y), '[]'::jsonb),
    'assessments', jsonb_build_object(
      'sent', (SELECT count(*) FROM assessments WHERE sent_at IS NOT NULL),
      'total', (SELECT count(*) FROM assessments),
      'started', (SELECT count(*) FROM assessments WHERE started_at IS NOT NULL),
      'completed', (SELECT count(*) FROM assessments WHERE submitted_at IS NOT NULL),
      'avg_score', (SELECT round(avg(overall_score)::numeric, 1) FROM assessment_results),
      'verdicts', coalesce((SELECT jsonb_agg(v) FROM (
          SELECT verification_verdict AS verdict, count(*) AS n FROM assessment_results
          GROUP BY 1 ORDER BY 2 DESC) v), '[]'::jsonb)
    ),
    'recent_proposals', coalesce((SELECT jsonb_agg(row_to_json(p) ORDER BY p.created_at DESC) FROM (
        SELECT r.id, r.status, r.job_title, r.created_at, r.decided_at, coalesce(o.name,'Unknown') AS company
        FROM reveal_requests r LEFT JOIN orgs o ON o.id = r.org_id
        ORDER BY r.created_at DESC LIMIT 50) p), '[]'::jsonb)
  );
END; $$;

-- ============ MONEY ============
CREATE OR REPLACE FUNCTION public.get_admin_money()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE m_start timestamptz := date_trunc('month', now());
BEGIN
  IF NOT has_role((SELECT auth.uid()), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;
  RETURN jsonb_build_object(
    'mrr_cents', (SELECT coalesce(sum(CASE WHEN pl.interval = 'week' THEN round(pl.price_cents * 52.0 / 12.0) ELSE pl.price_cents END),0)
                    FROM subscriptions s JOIN plans pl ON pl.key = s.plan_key
                   WHERE s.status IN ('active','trialing') AND pl.price_cents > 0 AND s.status <> 'canceled'),
    'paying_count', (SELECT count(*) FROM subscriptions s JOIN plans pl ON pl.key = s.plan_key
                      WHERE s.status = 'active' AND pl.price_cents > 0),
    'by_plan', coalesce((SELECT jsonb_agg(x ORDER BY (x->>'sort')::int) FROM (
        SELECT jsonb_build_object('key', pl.key, 'name', pl.name, 'audience', pl.audience,
          'price_cents', pl.price_cents, 'sort', pl.sort,
          'subscribers', count(s.user_id) FILTER (WHERE s.status IN ('active','trialing'))) AS x
        FROM plans pl LEFT JOIN subscriptions s ON s.plan_key = pl.key
        WHERE pl.active GROUP BY pl.key, pl.name, pl.audience, pl.price_cents, pl.sort) y), '[]'::jsonb),
    'failed_payments', coalesce((SELECT jsonb_agg(row_to_json(f)) FROM (
        SELECT s.user_id, u.email, s.plan_key, s.status, s.current_period_end
        FROM subscriptions s LEFT JOIN auth.users u ON u.id = s.user_id
        WHERE s.status IN ('past_due','unpaid','incomplete') LIMIT 50) f), '[]'::jsonb),
    'ai_spend_month', (SELECT coalesce(round(sum(cost_sar)::numeric,2),0) FROM llm_usage_logs WHERE created_at >= m_start),
    'credits_granted_month', (SELECT coalesce(sum(delta),0) FROM credit_ledger WHERE delta > 0 AND created_at >= m_start),
    'credits_spent_month', (SELECT coalesce(-sum(delta),0) FROM credit_ledger WHERE delta < 0 AND created_at >= m_start),
    'top_consumers', coalesce((SELECT jsonb_agg(row_to_json(c) ORDER BY c.spent DESC) FROM (
        SELECT cl.user_id, u.email, -sum(cl.delta) AS spent, count(*) AS entries
        FROM credit_ledger cl LEFT JOIN auth.users u ON u.id = cl.user_id
        WHERE cl.delta < 0 GROUP BY cl.user_id, u.email ORDER BY 3 DESC LIMIT 20) c), '[]'::jsonb),
    'ledger', coalesce((SELECT jsonb_agg(row_to_json(l) ORDER BY l.created_at DESC) FROM (
        SELECT cl.id, cl.user_id, u.email, cl.delta, cl.reason, cl.balance_after, cl.created_at
        FROM credit_ledger cl LEFT JOIN auth.users u ON u.id = cl.user_id
        ORDER BY cl.created_at DESC LIMIT 100) l), '[]'::jsonb)
  );
END; $$;

REVOKE EXECUTE ON FUNCTION public.get_admin_overview() FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_admin_employers() FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_admin_candidates() FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_admin_marketplace() FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_admin_money() FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_employer_approve(uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_employer_decline(uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_employer_override(uuid, text, integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_mark_candidates_stale(uuid[]) FROM anon;
