CREATE OR REPLACE FUNCTION public.admin_set_feature_flag(p_key text, p_enabled boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Admin access required'; END IF;
  IF p_key NOT IN ('platform','candidate_search','proposals','assessments','tailoring','signups') THEN
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
END; $$;

CREATE OR REPLACE FUNCTION public.admin_set_feature_message(p_key text, p_message text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Admin access required'; END IF;
  IF p_key NOT IN ('platform','candidate_search','proposals','assessments','tailoring','signups') THEN
    RAISE EXCEPTION 'Unknown flag';
  END IF;
  INSERT INTO public.system_config(key, value, updated_by, updated_at)
  VALUES ('feature_flag_messages', jsonb_build_object(p_key, left(coalesce(p_message,''), 300)), auth.uid(), now())
  ON CONFLICT (key) DO UPDATE
    SET value = coalesce(public.system_config.value, '{}'::jsonb) || jsonb_build_object(p_key, left(coalesce(p_message,''), 300)),
        updated_by = auth.uid(), updated_at = now();
  SELECT value INTO v FROM public.system_config WHERE key = 'feature_flag_messages';
  RETURN jsonb_build_object('ok', true, 'messages', coalesce(v, '{}'::jsonb));
END; $$;

CREATE OR REPLACE FUNCTION public.get_admin_feature_flags()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v jsonb; m jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Admin access required'; END IF;
  SELECT value INTO v FROM public.system_config WHERE key = 'feature_flags';
  SELECT value INTO m FROM public.system_config WHERE key = 'feature_flag_messages';
  RETURN jsonb_build_object('flags', coalesce(v, '{}'::jsonb), 'messages', coalesce(m, '{}'::jsonb),
    'defaults', jsonb_build_object('platform', true, 'candidate_search', true, 'proposals', true, 'assessments', true, 'tailoring', true, 'signups', true));
END; $$;

CREATE OR REPLACE FUNCTION public.get_feature_flags()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'flags', coalesce((SELECT value FROM public.system_config WHERE key = 'feature_flags'), '{}'::jsonb),
    'messages', coalesce((SELECT value FROM public.system_config WHERE key = 'feature_flag_messages'), '{}'::jsonb));
$$;

REVOKE EXECUTE ON FUNCTION public.admin_set_feature_message(text, text) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.admin_set_feature_message(text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_feature_flags() TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_signups boolean;
BEGIN
  SELECT coalesce((value ->> 'signups')::boolean, true) INTO v_signups FROM public.system_config WHERE key = 'feature_flags';
  IF v_signups IS NOT NULL AND v_signups = false THEN
    RAISE EXCEPTION 'Signups are temporarily unavailable while AYN is under maintenance';
  END IF;
  INSERT INTO public.user_subscriptions (user_id, subscription_tier, status) VALUES (NEW.id, 'free', 'active') ON CONFLICT (user_id) DO NOTHING;
  INSERT INTO public.user_ai_limits (user_id, daily_messages, monthly_messages, is_unlimited) VALUES (NEW.id, 5, 0, false) ON CONFLICT (user_id) DO NOTHING;
  INSERT INTO public.access_grants (user_id, is_active, monthly_limit, current_month_usage) VALUES (NEW.id, true, 5, 0) ON CONFLICT (user_id) DO NOTHING;
  INSERT INTO public.user_settings (user_id, has_accepted_terms) VALUES (NEW.id, false) ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION public.get_admin_terms_consent()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role((SELECT auth.uid()), 'admin'::app_role) THEN RAISE EXCEPTION 'Admin access required'; END IF;
  RETURN coalesce((
    SELECT jsonb_agg(jsonb_build_object(
      'id', t.id, 'user_id', t.user_id, 'terms_version', t.terms_version,
      'privacy_accepted', t.privacy_accepted, 'terms_accepted', t.terms_accepted,
      'ai_disclaimer_accepted', t.ai_disclaimer_accepted, 'accepted_at', t.accepted_at,
      'user_agent', t.user_agent,
      'display_name', COALESCE(split_part(u.email, '@', 1), t.user_id::text), 'email', u.email
    ) ORDER BY t.accepted_at DESC)
    FROM public.terms_consent_log t LEFT JOIN auth.users u ON u.id = t.user_id
  ), '[]'::jsonb);
END; $$;