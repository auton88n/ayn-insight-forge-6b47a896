
-- ── admin credit adjustment ────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_adjust_credits(p_user_id uuid, p_amount integer, p_reason text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_balance integer; v_res jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Admin access required'; END IF;
  IF p_amount IS NULL OR p_amount = 0 THEN RAISE EXCEPTION 'Amount must be non zero'; END IF;
  IF abs(p_amount) > 10000 THEN RAISE EXCEPTION 'Amount out of range'; END IF;

  IF p_amount > 0 THEN
    v_balance := public.credit_grant(p_user_id, p_amount, coalesce(nullif(trim(p_reason), ''), 'admin adjustment'), 'admin:' || auth.uid()::text);
  ELSE
    v_res := public.credit_spend(p_user_id, abs(p_amount), coalesce(nullif(trim(p_reason), ''), 'admin adjustment'), 'admin:' || auth.uid()::text);
    v_balance := public.credit_balance(p_user_id);
    IF coalesce((v_res->>'ok')::boolean, false) IS NOT TRUE THEN
      RAISE EXCEPTION 'Deduction failed: %', coalesce(v_res->>'error', 'insufficient balance');
    END IF;
  END IF;

  INSERT INTO public.security_audit_logs(user_id, action, details, severity)
  VALUES (auth.uid(), 'admin_adjust_credits',
          jsonb_build_object('target_user', p_user_id, 'amount', p_amount, 'reason', p_reason), 'high');

  RETURN jsonb_build_object('ok', true, 'balance', v_balance);
END;
$$;

-- ── moderation queue ───────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_admin_moderation(p_limit integer DEFAULT 50)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Admin access required'; END IF;

  SELECT jsonb_build_object(
    'proposals', coalesce((
      SELECT jsonb_agg(x ORDER BY x->>'created_at' DESC) FROM (
        SELECT jsonb_build_object(
          'id', r.id, 'status', r.status, 'created_at', r.created_at,
          'job_title', r.job_title, 'job_location', r.job_location,
          'salary_range', r.salary_range, 'job_url', r.job_url,
          'message', left(coalesce(r.message, ''), 1200),
          'company', o.name, 'candidate_user_id', r.candidate_user_id
        ) AS x
        FROM public.reveal_requests r
        LEFT JOIN public.orgs o ON o.id = r.org_id
        ORDER BY r.created_at DESC
        LIMIT greatest(1, least(coalesce(p_limit, 50), 200))
      ) s
    ), '[]'::jsonb),
    'assessments', coalesce((
      SELECT jsonb_agg(y ORDER BY y->>'created_at' DESC) FROM (
        SELECT jsonb_build_object(
          'id', a.id, 'status', a.status, 'created_at', a.created_at,
          'job_title', a.job_title, 'company', o.name,
          'question_count', coalesce(jsonb_array_length(a.questions), 0),
          'candidate_user_id', a.candidate_user_id
        ) AS y
        FROM public.assessments a
        LEFT JOIN public.orgs o ON o.id = a.org_id
        ORDER BY a.created_at DESC
        LIMIT greatest(1, least(coalesce(p_limit, 50), 200))
      ) s2
    ), '[]'::jsonb)
  ) INTO v;

  RETURN v;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_moderate_proposal(p_id uuid, p_action text, p_note text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Admin access required'; END IF;
  IF p_action NOT IN ('cancel') THEN RAISE EXCEPTION 'Unsupported action'; END IF;

  UPDATE public.reveal_requests
     SET status = 'declined', decided_at = now()
   WHERE id = p_id;

  INSERT INTO public.security_audit_logs(user_id, action, details, severity)
  VALUES (auth.uid(), 'admin_moderate_proposal',
          jsonb_build_object('proposal_id', p_id, 'action', p_action, 'note', p_note), 'medium');

  RETURN jsonb_build_object('ok', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_moderate_assessment(p_id uuid, p_note text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Admin access required'; END IF;

  UPDATE public.assessments SET status = 'expired', updated_at = now() WHERE id = p_id;

  INSERT INTO public.security_audit_logs(user_id, action, details, severity)
  VALUES (auth.uid(), 'admin_moderate_assessment',
          jsonb_build_object('assessment_id', p_id, 'note', p_note), 'medium');

  RETURN jsonb_build_object('ok', true);
END;
$$;

-- ── feature kill switches ──────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_admin_feature_flags()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Admin access required'; END IF;
  SELECT value INTO v FROM public.system_config WHERE key = 'feature_flags';
  RETURN jsonb_build_object(
    'flags', coalesce(v, '{}'::jsonb),
    'defaults', jsonb_build_object(
      'candidate_search', true, 'proposals', true, 'assessments', true,
      'tailoring', true, 'signups', true
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_set_feature_flag(p_key text, p_enabled boolean)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Admin access required'; END IF;
  IF p_key NOT IN ('candidate_search','proposals','assessments','tailoring','signups') THEN
    RAISE EXCEPTION 'Unknown flag';
  END IF;

  INSERT INTO public.system_config(key, value, updated_by, updated_at)
  VALUES ('feature_flags', jsonb_build_object(p_key, p_enabled), auth.uid(), now())
  ON CONFLICT (key) DO UPDATE
    SET value = coalesce(public.system_config.value, '{}'::jsonb) || jsonb_build_object(p_key, p_enabled),
        updated_by = auth.uid(), updated_at = now();

  INSERT INTO public.security_audit_logs(user_id, action, details, severity)
  VALUES (auth.uid(), 'admin_set_feature_flag', jsonb_build_object('flag', p_key, 'enabled', p_enabled), 'high');

  SELECT value INTO v FROM public.system_config WHERE key = 'feature_flags';
  RETURN jsonb_build_object('ok', true, 'flags', coalesce(v, '{}'::jsonb));
END;
$$;

-- ── read only user snapshot (instead of impersonation) ─────
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
    'discoverable', coalesce((SELECT tp.is_active FROM public.talent_pool_consent tp WHERE tp.user_id = p_user_id), false)
  ) INTO v;

  INSERT INTO public.security_audit_logs(user_id, action, details, severity)
  VALUES (auth.uid(), 'admin_user_snapshot', jsonb_build_object('target_user', p_user_id), 'medium');

  RETURN v;
END;
$$;
