-- v3.29.0 per account limit overrides, and account erasure

-- ── PART A ─────────────────────────────────────────────────────────────
CREATE TABLE public.account_limit_overrides (
  user_id uuid PRIMARY KEY,
  proposals_limit integer,
  assessments_limit integer,
  searches_limit integer,
  monthly_credits integer,
  reason text NOT NULL,
  set_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT account_limit_overrides_nonneg CHECK (
    coalesce(proposals_limit, 0) >= 0 AND coalesce(assessments_limit, 0) >= 0
    AND coalesce(searches_limit, 0) >= 0 AND coalesce(monthly_credits, 0) >= 0
  )
);
GRANT SELECT ON public.account_limit_overrides TO authenticated;
GRANT ALL ON public.account_limit_overrides TO service_role;
ALTER TABLE public.account_limit_overrides ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own override readable" ON public.account_limit_overrides
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()) OR public.has_role((SELECT auth.uid()), 'admin'::app_role));
CREATE TRIGGER account_limit_overrides_updated_at BEFORE UPDATE ON public.account_limit_overrides
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Full replace: every call states all four values, so null always means
-- "fall back to the plan" and 0 always means a real zero.
CREATE OR REPLACE FUNCTION public.admin_set_limit_override(
  p_user_id uuid,
  p_proposals_limit integer,
  p_assessments_limit integer,
  p_searches_limit integer,
  p_monthly_credits integer,
  p_reason text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_admin uuid := (SELECT auth.uid());
BEGIN
  IF NOT has_role(v_admin, 'admin'::app_role) THEN RAISE EXCEPTION 'Admin access required'; END IF;
  IF p_user_id IS NULL THEN RAISE EXCEPTION 'A user is required'; END IF;
  IF coalesce(btrim(p_reason),'') = '' THEN RAISE EXCEPTION 'A reason is required to set a limit override'; END IF;
  IF p_proposals_limit IS NULL AND p_assessments_limit IS NULL
     AND p_searches_limit IS NULL AND p_monthly_credits IS NULL THEN
    RAISE EXCEPTION 'An override needs at least one value. Clear the override instead.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = p_user_id) THEN RAISE EXCEPTION 'No such account'; END IF;

  INSERT INTO public.account_limit_overrides
    (user_id, proposals_limit, assessments_limit, searches_limit, monthly_credits, reason, set_by)
  VALUES (p_user_id, p_proposals_limit, p_assessments_limit, p_searches_limit, p_monthly_credits, btrim(p_reason), v_admin)
  ON CONFLICT (user_id) DO UPDATE SET
    proposals_limit = excluded.proposals_limit,
    assessments_limit = excluded.assessments_limit,
    searches_limit = excluded.searches_limit,
    monthly_credits = excluded.monthly_credits,
    reason = excluded.reason,
    set_by = excluded.set_by,
    updated_at = now();

  INSERT INTO public.security_audit_logs (user_id, action, details, severity)
  VALUES (v_admin, 'admin_set_limit_override', jsonb_build_object(
    'target_user_id', p_user_id, 'proposals_limit', p_proposals_limit,
    'assessments_limit', p_assessments_limit, 'searches_limit', p_searches_limit,
    'monthly_credits', p_monthly_credits, 'reason', btrim(p_reason)), 'high');

  RETURN jsonb_build_object('ok', true, 'override', true);
END; $$;

CREATE OR REPLACE FUNCTION public.admin_clear_limit_override(p_user_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_admin uuid := (SELECT auth.uid());
BEGIN
  IF NOT has_role(v_admin, 'admin'::app_role) THEN RAISE EXCEPTION 'Admin access required'; END IF;
  DELETE FROM public.account_limit_overrides WHERE user_id = p_user_id;
  INSERT INTO public.security_audit_logs (user_id, action, details, severity)
  VALUES (v_admin, 'admin_clear_limit_override', jsonb_build_object('target_user_id', p_user_id), 'high');
  RETURN jsonb_build_object('ok', true, 'override', false);
END; $$;

-- ── PART B ─────────────────────────────────────────────────────────────
CREATE TABLE public.account_erasures (
  user_id uuid PRIMARY KEY,
  email_at_erasure text,
  reason text NOT NULL,
  erased_by uuid,
  erased_at timestamptz NOT NULL DEFAULT now(),
  purge_reason text,
  purged_by uuid,
  purged_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.account_erasures TO service_role;
ALTER TABLE public.account_erasures ENABLE ROW LEVEL SECURITY;
CREATE POLICY "erasures admin readable" ON public.account_erasures
  FOR SELECT TO authenticated USING (public.has_role((SELECT auth.uid()), 'admin'::app_role));
GRANT SELECT ON public.account_erasures TO authenticated;
CREATE TRIGGER account_erasures_updated_at BEFORE UPDATE ON public.account_erasures
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.admin_erase_account(p_user_id uuid, p_reason text, p_confirm_email text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_admin uuid := (SELECT auth.uid());
  v_email text;
  v_ref text := 'erased-' || left(replace(p_user_id::text,'-',''), 8);
BEGIN
  IF NOT has_role(v_admin, 'admin'::app_role) THEN RAISE EXCEPTION 'Admin access required'; END IF;
  IF p_user_id IS NULL THEN RAISE EXCEPTION 'A user is required'; END IF;
  IF coalesce(btrim(p_reason),'') = '' THEN RAISE EXCEPTION 'A reason is required to erase an account'; END IF;
  IF p_user_id = v_admin THEN RAISE EXCEPTION 'You cannot erase your own account'; END IF;
  IF has_role(p_user_id, 'admin'::app_role) THEN RAISE EXCEPTION 'You cannot erase another admin'; END IF;

  SELECT email INTO v_email FROM auth.users WHERE id = p_user_id;
  IF v_email IS NULL THEN RAISE EXCEPTION 'No such account'; END IF;
  IF coalesce(btrim(p_confirm_email),'') <> v_email THEN
    RAISE EXCEPTION 'The confirmation email does not match this account';
  END IF;

  -- content, deleted outright
  DELETE FROM public.resume_versions      WHERE user_id = p_user_id;
  DELETE FROM public.resumes              WHERE user_id = p_user_id;
  DELETE FROM public.cover_letters        WHERE user_id = p_user_id;
  DELETE FROM public.jobs                 WHERE user_id = p_user_id;
  DELETE FROM public.job_matches          WHERE user_id = p_user_id;
  DELETE FROM public.job_applications     WHERE user_id = p_user_id;
  DELETE FROM public.applications         WHERE user_id = p_user_id;
  DELETE FROM public.user_profile_data    WHERE user_id = p_user_id;
  DELETE FROM public.user_profile_canonical WHERE user_id = p_user_id;
  DELETE FROM public.candidate_index      WHERE user_id = p_user_id;
  DELETE FROM public.candidate_skills     WHERE user_id = p_user_id;
  DELETE FROM public.talent_pool_consent  WHERE user_id = p_user_id;
  DELETE FROM public.extension_tokens     WHERE user_id = p_user_id;
  DELETE FROM public.extension_link_codes WHERE user_id = p_user_id;
  DELETE FROM public.ext_answers          WHERE user_id = p_user_id;
  DELETE FROM public.ext_answer_memory    WHERE user_id = p_user_id;
  DELETE FROM public.ext_ask_messages     WHERE user_id = p_user_id;
  DELETE FROM public.autofill_runs        WHERE user_id = p_user_id;
  DELETE FROM public.ai_result_cache      WHERE user_id = p_user_id;
  DELETE FROM public.user_memory          WHERE user_id = p_user_id;
  DELETE FROM public.user_preferences     WHERE user_id = p_user_id;
  DELETE FROM public.user_settings        WHERE user_id = p_user_id;
  DELETE FROM public.user_ai_limits       WHERE user_id = p_user_id;
  DELETE FROM public.message_ratings      WHERE user_id = p_user_id;
  DELETE FROM public.favorite_chats       WHERE user_id = p_user_id;
  DELETE FROM public.messages             WHERE user_id = p_user_id;
  DELETE FROM public.chat_sessions        WHERE user_id = p_user_id;
  DELETE FROM public.beta_feedback        WHERE user_id = p_user_id;
  DELETE FROM public.ticket_messages      WHERE ticket_id IN (SELECT id FROM public.support_tickets WHERE user_id = p_user_id);
  DELETE FROM public.support_ticket_replies WHERE ticket_id IN (SELECT id FROM public.support_tickets WHERE user_id = p_user_id);
  DELETE FROM public.support_admin_reads  WHERE ticket_id IN (SELECT id FROM public.support_tickets WHERE user_id = p_user_id);
  DELETE FROM public.support_tickets      WHERE user_id = p_user_id;
  DELETE FROM public.device_fingerprints  WHERE user_id = p_user_id;
  DELETE FROM public.email_logs           WHERE user_id = p_user_id;
  DELETE FROM public.upgrade_intents      WHERE user_id = p_user_id;
  DELETE FROM public.access_grants        WHERE user_id = p_user_id;
  DELETE FROM public.user_subscriptions   WHERE user_id = p_user_id;
  DELETE FROM public.api_rate_limits      WHERE user_id = p_user_id;
  DELETE FROM public.rate_limits          WHERE user_id = p_user_id;
  DELETE FROM public.threat_detection     WHERE user_id = p_user_id;
  DELETE FROM public.terms_consent_log    WHERE user_id = p_user_id;
  DELETE FROM public.employer_accounts    WHERE user_id = p_user_id;
  DELETE FROM public.org_members          WHERE user_id = p_user_id;
  DELETE FROM public.account_restrictions WHERE user_id = p_user_id;
  DELETE FROM public.account_limit_overrides WHERE user_id = p_user_id;
  DELETE FROM public.profiles             WHERE user_id = p_user_id OR id = p_user_id;
  DELETE FROM public.user_roles           WHERE user_id = p_user_id;
  DELETE FROM storage.objects
    WHERE bucket_id IN ('resumes','attachments','avatars','generated-files')
      AND (owner = p_user_id OR name LIKE p_user_id::text || '/%');

  -- operational logs keep their shape, lose the person
  UPDATE public.llm_usage_logs   SET user_id = NULL WHERE user_id = p_user_id;
  UPDATE public.ai_call_telemetry SET user_id = NULL WHERE user_id = p_user_id;
  UPDATE public.usage_logs       SET user_id = NULL WHERE user_id = p_user_id;
  UPDATE public.user_usage_daily SET user_id = NULL WHERE user_id = p_user_id;
  UPDATE public.error_logs       SET user_id = NULL WHERE user_id = p_user_id;
  UPDATE public.security_logs    SET user_id = NULL WHERE user_id = p_user_id;
  UPDATE public.system_logs      SET user_id = NULL WHERE user_id = p_user_id;

  -- the employer's own history stays, the candidate becomes opaque
  UPDATE public.reveal_requests SET candidate_ref = v_ref WHERE candidate_user_id = p_user_id;
  UPDATE public.assessments     SET candidate_ref = v_ref WHERE candidate_user_id = p_user_id;

  -- auth: banned, and stripped of what Supabase lets us clear
  UPDATE auth.users SET
    banned_until = now() + interval '100 years',
    email = 'erased+' || replace(p_user_id::text,'-','') || '@erased.invalid',
    phone = NULL,
    raw_user_meta_data = '{}'::jsonb,
    email_change = '', phone_change = '',
    updated_at = now()
  WHERE id = p_user_id;
  DELETE FROM auth.identities WHERE user_id = p_user_id;
  DELETE FROM auth.sessions   WHERE user_id = p_user_id;

  INSERT INTO public.account_erasures (user_id, email_at_erasure, reason, erased_by)
  VALUES (p_user_id, v_email, btrim(p_reason), v_admin)
  ON CONFLICT (user_id) DO UPDATE
    SET reason = excluded.reason, erased_by = excluded.erased_by, erased_at = now(), updated_at = now();

  INSERT INTO public.security_audit_logs (user_id, action, details, severity)
  VALUES (v_admin, 'admin_erase_account',
          jsonb_build_object('target_user_id', p_user_id, 'email', v_email,
                             'reason', btrim(p_reason), 'candidate_ref', v_ref), 'high');

  RETURN jsonb_build_object('ok', true, 'erased', true, 'candidate_ref', v_ref);
END; $$;

CREATE OR REPLACE FUNCTION public.admin_purge_account(p_user_id uuid, p_reason text, p_confirm_email text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_admin uuid := (SELECT auth.uid());
  v_email text;
  v_erasure public.account_erasures;
BEGIN
  IF NOT has_role(v_admin, 'admin'::app_role) THEN RAISE EXCEPTION 'Admin access required'; END IF;
  IF p_user_id IS NULL THEN RAISE EXCEPTION 'A user is required'; END IF;
  IF coalesce(btrim(p_reason),'') = '' THEN RAISE EXCEPTION 'A reason is required to purge an account'; END IF;
  IF p_user_id = v_admin THEN RAISE EXCEPTION 'You cannot purge your own account'; END IF;
  IF has_role(p_user_id, 'admin'::app_role) THEN RAISE EXCEPTION 'You cannot purge another admin'; END IF;

  SELECT * INTO v_erasure FROM public.account_erasures WHERE user_id = p_user_id;
  IF v_erasure.user_id IS NULL THEN
    RAISE EXCEPTION 'Erase this account before purging it';
  END IF;

  SELECT email INTO v_email FROM auth.users WHERE id = p_user_id;
  IF v_email IS NULL THEN RAISE EXCEPTION 'No such account'; END IF;
  IF coalesce(btrim(p_confirm_email),'') <> v_email THEN
    RAISE EXCEPTION 'The confirmation email does not match this account';
  END IF;

  DELETE FROM auth.identities     WHERE user_id = p_user_id;
  DELETE FROM auth.sessions       WHERE user_id = p_user_id;
  DELETE FROM auth.mfa_factors    WHERE user_id = p_user_id;
  DELETE FROM auth.one_time_tokens WHERE user_id = p_user_id;
  DELETE FROM auth.users          WHERE id = p_user_id;

  UPDATE public.account_erasures
     SET purge_reason = btrim(p_reason), purged_by = v_admin, purged_at = now(), updated_at = now()
   WHERE user_id = p_user_id;

  INSERT INTO public.security_audit_logs (user_id, action, details, severity)
  VALUES (v_admin, 'admin_purge_account',
          jsonb_build_object('target_user_id', p_user_id, 'email_at_erasure', v_erasure.email_at_erasure,
                             'reason', btrim(p_reason)), 'high');

  RETURN jsonb_build_object('ok', true, 'purged', true);
END; $$;

-- ── read only: plan, override, and what is actually in force ───────────
CREATE OR REPLACE FUNCTION public.get_admin_account_governance(p_user_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_plan public.plans; v_ov public.account_limit_overrides; v_key text;
BEGIN
  IF NOT has_role((SELECT auth.uid()), 'admin'::app_role) THEN RAISE EXCEPTION 'Admin access required'; END IF;
  SELECT plan_key INTO v_key FROM public.subscriptions WHERE user_id = p_user_id;
  SELECT * INTO v_plan FROM public.plans WHERE key = coalesce(v_key, '');
  SELECT * INTO v_ov FROM public.account_limit_overrides WHERE user_id = p_user_id;

  RETURN jsonb_build_object(
    'plan_key', coalesce(v_key, 'none'),
    'plan_name', v_plan.name,
    'plan', jsonb_build_object(
      'proposals_limit', v_plan.proposals_limit,
      'assessments_limit', v_plan.assessments_limit,
      'searches_limit', v_plan.searches_limit,
      'monthly_credits', v_plan.credits),
    'override', CASE WHEN v_ov.user_id IS NULL THEN NULL ELSE jsonb_build_object(
      'proposals_limit', v_ov.proposals_limit,
      'assessments_limit', v_ov.assessments_limit,
      'searches_limit', v_ov.searches_limit,
      'monthly_credits', v_ov.monthly_credits,
      'reason', v_ov.reason,
      'set_at', v_ov.updated_at,
      'set_by_email', (SELECT email FROM auth.users au WHERE au.id = v_ov.set_by)) END,
    'effective', jsonb_build_object(
      'proposals_limit', CASE WHEN v_ov.proposals_limit IS NOT NULL THEN v_ov.proposals_limit ELSE v_plan.proposals_limit END,
      'assessments_limit', CASE WHEN v_ov.assessments_limit IS NOT NULL THEN v_ov.assessments_limit ELSE v_plan.assessments_limit END,
      'searches_limit', CASE WHEN v_ov.searches_limit IS NOT NULL THEN v_ov.searches_limit ELSE v_plan.searches_limit END,
      'monthly_credits', CASE WHEN v_ov.monthly_credits IS NOT NULL THEN v_ov.monthly_credits ELSE v_plan.credits END),
    'erasure', (SELECT to_jsonb(e) FROM public.account_erasures e WHERE e.user_id = p_user_id)
  );
END; $$;

REVOKE EXECUTE ON FUNCTION public.admin_set_limit_override(uuid,integer,integer,integer,integer,text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_clear_limit_override(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_erase_account(uuid,text,text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_purge_account(uuid,text,text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_admin_account_governance(uuid) FROM anon;