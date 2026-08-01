CREATE OR REPLACE FUNCTION public.admin_erase_storage(p_user_id uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_n integer;
BEGIN
  PERFORM set_config('storage.allow_delete_query','true', true);
  DELETE FROM storage.objects
    WHERE bucket_id IN ('resumes','attachments','avatars','generated-files')
      AND (owner = p_user_id OR name LIKE p_user_id::text || '/%');
  GET DIAGNOSTICS v_n = ROW_COUNT;
  PERFORM set_config('storage.allow_delete_query','false', true);
  RETURN v_n;
END; $$;
REVOKE ALL ON FUNCTION public.admin_erase_storage(uuid) FROM public, anon, authenticated;

CREATE OR REPLACE FUNCTION public.admin_erase_account(p_user_id uuid, p_reason text, p_confirm_email text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_admin uuid := (SELECT auth.uid());
  v_email text;
  v_files integer := 0;
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

  v_files := public.admin_erase_storage(p_user_id);

  UPDATE public.llm_usage_logs   SET user_id = NULL WHERE user_id = p_user_id;
  UPDATE public.ai_call_telemetry SET user_id = NULL WHERE user_id = p_user_id;
  UPDATE public.usage_logs       SET user_id = NULL WHERE user_id = p_user_id;
  UPDATE public.user_usage_daily SET user_id = NULL WHERE user_id = p_user_id;
  UPDATE public.error_logs       SET user_id = NULL WHERE user_id = p_user_id;
  UPDATE public.security_logs    SET user_id = NULL WHERE user_id = p_user_id;
  UPDATE public.system_logs      SET user_id = NULL WHERE user_id = p_user_id;

  UPDATE public.reveal_requests SET candidate_ref = v_ref WHERE candidate_user_id = p_user_id;
  UPDATE public.assessments     SET candidate_ref = v_ref WHERE candidate_user_id = p_user_id;

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
                             'reason', btrim(p_reason), 'candidate_ref', v_ref,
                             'files_removed', v_files), 'high');

  RETURN jsonb_build_object('ok', true, 'erased', true, 'candidate_ref', v_ref, 'files_removed', v_files);
END; $$;

CREATE OR REPLACE FUNCTION public.admin_purge_account(p_user_id uuid, p_reason text, p_confirm_email text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_admin uuid := (SELECT auth.uid());
  v_email text;
  v_erasure public.account_erasures;
  v_typed text := coalesce(btrim(p_confirm_email),'');
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
  IF v_typed <> v_email AND v_typed <> coalesce(v_erasure.email_at_erasure,'') THEN
    RAISE EXCEPTION 'The confirmation email does not match this account';
  END IF;

  DELETE FROM auth.identities     WHERE user_id = p_user_id;
  DELETE FROM auth.sessions       WHERE user_id = p_user_id;
  DELETE FROM auth.mfa_factors    WHERE user_id = p_user_id;
  DELETE FROM auth.one_time_tokens WHERE user_id = p_user_id;
  DELETE FROM auth.users          WHERE id = p_user_id;

  UPDATE public.account_erasures
     SET purged_at = now(), purged_by = v_admin, updated_at = now()
   WHERE user_id = p_user_id;

  INSERT INTO public.security_audit_logs (user_id, action, details, severity)
  VALUES (v_admin, 'admin_purge_account',
          jsonb_build_object('target_user_id', p_user_id,
                             'email_at_erasure', v_erasure.email_at_erasure,
                             'reason', btrim(p_reason)), 'high');

  RETURN jsonb_build_object('ok', true, 'purged', true);
END; $$;