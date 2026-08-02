-- v3.34.0 self service account tools.
-- One removal routine, shared by the admin path and the person's own path.
CREATE OR REPLACE FUNCTION public.erase_account_core(p_user_id uuid, p_actor uuid, p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_email text;
  v_files integer := 0;
  v_ref text := 'erased-' || left(replace(p_user_id::text,'-',''), 8);
BEGIN
  SELECT email INTO v_email FROM auth.users WHERE id = p_user_id;
  IF v_email IS NULL THEN RAISE EXCEPTION 'No such account'; END IF;

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

  UPDATE public.llm_usage_logs    SET user_id = NULL WHERE user_id = p_user_id;
  UPDATE public.ai_call_telemetry SET user_id = NULL WHERE user_id = p_user_id;
  UPDATE public.usage_logs        SET user_id = NULL WHERE user_id = p_user_id;
  UPDATE public.user_usage_daily  SET user_id = NULL WHERE user_id = p_user_id;
  UPDATE public.error_logs        SET user_id = NULL WHERE user_id = p_user_id;
  UPDATE public.security_logs     SET user_id = NULL WHERE user_id = p_user_id;
  UPDATE public.system_logs       SET user_id = NULL WHERE user_id = p_user_id;

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
  VALUES (p_user_id, v_email, btrim(p_reason), p_actor)
  ON CONFLICT (user_id) DO UPDATE
    SET reason = excluded.reason, erased_by = excluded.erased_by, erased_at = now(), updated_at = now();

  RETURN jsonb_build_object('ok', true, 'erased', true, 'email', v_email,
                            'candidate_ref', v_ref, 'files_removed', v_files);
END; $$;
REVOKE ALL ON FUNCTION public.erase_account_core(uuid, uuid, text) FROM public, anon, authenticated;

-- The admin path keeps its own guards and now shares the removal code.
CREATE OR REPLACE FUNCTION public.admin_erase_account(p_user_id uuid, p_reason text, p_confirm_email text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_admin uuid := (SELECT auth.uid());
  v_email text;
  v_out jsonb;
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

  v_out := public.erase_account_core(p_user_id, v_admin, btrim(p_reason));

  INSERT INTO public.security_audit_logs (user_id, action, details, severity)
  VALUES (v_admin, 'admin_erase_account',
          jsonb_build_object('target_user_id', p_user_id, 'email', v_email,
                             'reason', btrim(p_reason),
                             'candidate_ref', v_out->>'candidate_ref',
                             'files_removed', v_out->'files_removed'), 'high');

  RETURN v_out - 'email';
END; $$;

-- A person deleting their own account. Same work, their own account only.
CREATE OR REPLACE FUNCTION public.self_delete_account(p_confirm_email text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_uid uuid := (SELECT auth.uid());
  v_email text;
  v_out jsonb;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Sign in first'; END IF;
  IF has_role(v_uid, 'admin'::app_role) THEN
    RAISE EXCEPTION 'Admin accounts cannot be deleted from settings';
  END IF;

  SELECT email INTO v_email FROM auth.users WHERE id = v_uid;
  IF v_email IS NULL THEN RAISE EXCEPTION 'No such account'; END IF;
  IF lower(coalesce(btrim(p_confirm_email),'')) <> lower(v_email) THEN
    RAISE EXCEPTION 'The email you typed does not match this account';
  END IF;

  v_out := public.erase_account_core(v_uid, v_uid, 'self service deletion');

  INSERT INTO public.security_audit_logs (user_id, action, details, severity)
  VALUES (NULL, 'self_delete_account',
          jsonb_build_object('user_id', v_uid, 'email', v_email,
                             'candidate_ref', v_out->>'candidate_ref',
                             'files_removed', v_out->'files_removed'), 'high');

  RETURN v_out - 'email';
END; $$;
GRANT EXECUTE ON FUNCTION public.self_delete_account(text) TO authenticated;

-- The lighter alternative: stop being found, stop the emails, keep everything.
CREATE OR REPLACE FUNCTION public.self_pause_account()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_uid uuid := (SELECT auth.uid());
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Sign in first'; END IF;

  UPDATE public.talent_pool_consent
     SET opted_in = false, revoked_at = now(), updated_at = now()
   WHERE user_id = v_uid;

  UPDATE public.candidate_index SET indexed_at = NULL WHERE user_id = v_uid;

  INSERT INTO public.user_settings (user_id, email_system_alerts, email_usage_warnings, email_marketing, email_weekly_summary)
  VALUES (v_uid, false, false, false, false)
  ON CONFLICT (user_id) DO UPDATE SET
    email_system_alerts = false, email_usage_warnings = false,
    email_marketing = false, email_weekly_summary = false, updated_at = now();

  RETURN jsonb_build_object('ok', true, 'paused', true);
END; $$;
GRANT EXECUTE ON FUNCTION public.self_pause_account() TO authenticated;

-- Everything we hold about the person, in one machine readable object.
CREATE OR REPLACE FUNCTION public.self_export_account()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_uid uuid := (SELECT auth.uid());
  v_email text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Sign in first'; END IF;
  SELECT email INTO v_email FROM auth.users WHERE id = v_uid;

  RETURN jsonb_build_object(
    'export_version', '1.0',
    'generated_at', now(),
    'account', jsonb_build_object('user_id', v_uid, 'email', v_email),
    'profile', (SELECT to_jsonb(p) FROM public.profiles p WHERE p.user_id = v_uid),
    'career_profile', (SELECT to_jsonb(c) FROM public.user_profile_canonical c WHERE c.user_id = v_uid),
    'skills', coalesce((SELECT jsonb_agg(to_jsonb(s)) FROM public.candidate_skills s WHERE s.user_id = v_uid), '[]'::jsonb),
    'resumes', coalesce((SELECT jsonb_agg(to_jsonb(r)) FROM public.resumes r WHERE r.user_id = v_uid), '[]'::jsonb),
    'tailored_resumes', coalesce((SELECT jsonb_agg(to_jsonb(v)) FROM public.resume_versions v WHERE v.user_id = v_uid), '[]'::jsonb),
    'cover_letters', coalesce((SELECT jsonb_agg(to_jsonb(cl)) FROM public.cover_letters cl WHERE cl.user_id = v_uid), '[]'::jsonb),
    'saved_jobs', coalesce((SELECT jsonb_agg(to_jsonb(j)) FROM public.jobs j WHERE j.user_id = v_uid), '[]'::jsonb),
    'job_matches', coalesce((SELECT jsonb_agg(to_jsonb(m)) FROM public.job_matches m WHERE m.user_id = v_uid), '[]'::jsonb),
    'discovery', (SELECT to_jsonb(t) FROM public.talent_pool_consent t WHERE t.user_id = v_uid),
    'proposals', coalesce((SELECT jsonb_agg(jsonb_build_object(
        'id', rr.id, 'status', rr.status, 'job_title', rr.job_title,
        'job_location', rr.job_location, 'employment_type', rr.employment_type,
        'salary_range', rr.salary_range, 'job_url', rr.job_url, 'message', rr.message,
        'sent_at', rr.sent_at, 'responded_at', rr.responded_at, 'created_at', rr.created_at))
      FROM public.reveal_requests rr WHERE rr.candidate_user_id = v_uid), '[]'::jsonb),
    'assessments', coalesce((SELECT jsonb_agg(jsonb_build_object(
        'id', a.id, 'job_title', a.job_title, 'status', a.status,
        'questions', a.questions, 'answers', a.answers,
        'sent_at', a.sent_at, 'started_at', a.started_at, 'submitted_at', a.submitted_at))
      FROM public.assessments a WHERE a.candidate_user_id = v_uid), '[]'::jsonb),
    'settings', (SELECT to_jsonb(us) FROM public.user_settings us WHERE us.user_id = v_uid),
    'preferences', (SELECT to_jsonb(up) FROM public.user_preferences up WHERE up.user_id = v_uid),
    'memory', coalesce((SELECT jsonb_agg(to_jsonb(um)) FROM public.user_memory um WHERE um.user_id = v_uid), '[]'::jsonb),
    'legal_consent', coalesce((SELECT jsonb_agg(to_jsonb(tc)) FROM public.terms_consent_log tc WHERE tc.user_id = v_uid), '[]'::jsonb),
    'subscription', (SELECT to_jsonb(sb) FROM public.subscriptions sb WHERE sb.user_id = v_uid),
    'credit_ledger', coalesce((SELECT jsonb_agg(to_jsonb(cle)) FROM public.credit_ledger cle WHERE cle.user_id = v_uid), '[]'::jsonb)
  );
END; $$;
GRANT EXECUTE ON FUNCTION public.self_export_account() TO authenticated;