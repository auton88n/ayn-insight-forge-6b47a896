-- 1. Accounts, AYN shaped
CREATE OR REPLACE FUNCTION public.get_admin_accounts(p_search text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT has_role((SELECT auth.uid()), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;
  RETURN jsonb_build_object(
    'total', (SELECT count(*) FROM auth.users WHERE email IS NOT NULL),
    'seekers', (SELECT count(*) FROM profiles WHERE coalesce(role::text,'job_seeker') = 'job_seeker'),
    'employers', (SELECT count(*) FROM employer_accounts),
    'admins', (SELECT count(*) FROM user_roles WHERE role = 'admin'::app_role),
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
          ea.status::text AS employer_status,
          ea.company_name,
          coalesce(s.plan_key, 'none') AS plan_key,
          s.status AS sub_status,
          coalesce((SELECT sum(delta) FROM credit_ledger cl WHERE cl.user_id = u.id), 0) AS credits,
          coalesce(tp.opted_in, false) AS discoverable
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
END; $function$;

-- 2. AI usage, real numbers
CREATE OR REPLACE FUNCTION public.get_admin_ai_usage()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_today timestamptz := date_trunc('day', now());
  v_month timestamptz := date_trunc('month', now());
BEGIN
  IF NOT has_role((SELECT auth.uid()), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;
  RETURN jsonb_build_object(
    'calls_today', (SELECT count(*) FROM llm_usage_logs WHERE created_at >= v_today),
    'calls_month', (SELECT count(*) FROM llm_usage_logs WHERE created_at >= v_month),
    'spend_today', (SELECT coalesce(round(sum(cost_sar)::numeric,2),0) FROM llm_usage_logs WHERE created_at >= v_today),
    'spend_month', (SELECT coalesce(round(sum(cost_sar)::numeric,2),0) FROM llm_usage_logs WHERE created_at >= v_month),
    'failures_month', (SELECT count(*) FROM llm_failures WHERE created_at >= v_month),
    'by_model', coalesce((SELECT jsonb_agg(m) FROM (
        SELECT model_used AS model, count(*) AS calls,
               coalesce(round(sum(cost_sar)::numeric,2),0) AS spend
        FROM llm_usage_logs WHERE created_at >= v_month
        GROUP BY 1 ORDER BY 2 DESC LIMIT 20) m), '[]'::jsonb),
    'by_day', coalesce((SELECT jsonb_agg(d ORDER BY (d->>'day')) FROM (
        SELECT jsonb_build_object(
          'day', to_char(date_trunc('day', created_at), 'YYYY-MM-DD'),
          'calls', count(*),
          'spend', coalesce(round(sum(cost_sar)::numeric,2),0)) AS d
        FROM llm_usage_logs WHERE created_at >= now() - interval '30 days'
        GROUP BY date_trunc('day', created_at)) x), '[]'::jsonb),
    'recent_failures', coalesce((SELECT jsonb_agg(row_to_json(f) ORDER BY f.created_at DESC) FROM (
        SELECT * FROM llm_failures ORDER BY created_at DESC LIMIT 25) f), '[]'::jsonb)
  );
END; $function$;

-- 3. Email audience
CREATE OR REPLACE FUNCTION public.get_admin_email_audience()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT has_role((SELECT auth.uid()), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;
  RETURN coalesce((
    SELECT jsonb_agg(row_to_json(t) ORDER BY t.signed_up_at DESC)
    FROM (
      SELECT u.id AS user_id, u.email,
             coalesce(p.contact_person, split_part(u.email,'@',1)) AS display_name,
             coalesce(p.role::text,'job_seeker') AS account_role,
             (ea.user_id IS NOT NULL) AS is_employer,
             coalesce(tp.opted_in,false) AS discoverable,
             u.created_at AS signed_up_at
      FROM auth.users u
      LEFT JOIN profiles p ON p.user_id = u.id
      LEFT JOIN employer_accounts ea ON ea.user_id = u.id
      LEFT JOIN talent_pool_consent tp ON tp.user_id = u.id
      WHERE u.email IS NOT NULL
    ) t), '[]'::jsonb);
END; $function$;

-- 4. Change the admin PIN server side
CREATE OR REPLACE FUNCTION public.admin_set_pin(p_hash text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT has_role((SELECT auth.uid()), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;
  IF p_hash IS NULL OR length(p_hash) <> 64 OR p_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'Invalid PIN hash';
  END IF;
  INSERT INTO app_settings (key, value, updated_at)
  VALUES ('admin_pin_hash', p_hash, now())
  ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = now();
  INSERT INTO security_logs (action, details, severity)
  VALUES ('admin_pin_changed', jsonb_build_object('changed_at', now()), 'high');
  RETURN jsonb_build_object('ok', true);
END; $function$;

-- 5. Guard the rate limit stats function
CREATE OR REPLACE FUNCTION public.get_admin_rate_limit_stats()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE result jsonb;
BEGIN
  IF NOT has_role((SELECT auth.uid()), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', r.id, 'user_id', r.user_id, 'user_email', u.email, 'endpoint', r.endpoint,
      'request_count', r.request_count, 'max_requests', r.max_requests,
      'violation_count', r.violation_count, 'window_start', r.window_start,
      'last_violation', r.last_violation,
      'is_blocked', (r.blocked_until IS NOT NULL AND r.blocked_until > now()),
      'blocked_until', r.blocked_until,
      'last_activity', COALESCE(r.updated_at, r.created_at)
    )
  ), '[]'::jsonb) INTO result
  FROM public.api_rate_limits r
  LEFT JOIN auth.users u ON u.id = r.user_id;
  RETURN result;
END; $function$;

REVOKE EXECUTE ON FUNCTION public.get_admin_accounts(text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_admin_ai_usage() FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_admin_email_audience() FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_set_pin(text) FROM anon;