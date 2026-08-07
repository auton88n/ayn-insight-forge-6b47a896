-- Same bug, second table: usage_logs.user_id is also NOT NULL, so the
-- anonymize-in-place approach used for ai_call_telemetry/error_logs/
-- security_logs/system_logs (which genuinely allow null) can't work here
-- either. Delete the row instead, same as user_usage_daily just fixed.
create or replace function public.erase_account_core(p_user_id uuid, p_actor uuid, p_reason text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
DECLARE
  v_email text;
  v_files integer := 0;
  v_ref text := 'erased-' || left(replace(p_user_id::text,'-',''), 8);
  v_org_ids uuid[];
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
  DELETE FROM public.user_usage_daily     WHERE user_id = p_user_id;
  DELETE FROM public.usage_logs           WHERE user_id = p_user_id;

  SELECT array_agg(org_id) INTO v_org_ids FROM public.org_members WHERE user_id = p_user_id;
  DELETE FROM public.org_members          WHERE user_id = p_user_id;
  DELETE FROM public.orgs
   WHERE id = ANY(v_org_ids)
     AND NOT EXISTS (SELECT 1 FROM public.org_members om WHERE om.org_id = orgs.id);

  DELETE FROM public.account_restrictions WHERE user_id = p_user_id;
  DELETE FROM public.account_limit_overrides WHERE user_id = p_user_id;
  DELETE FROM public.profiles             WHERE user_id = p_user_id OR id = p_user_id;
  DELETE FROM public.user_roles           WHERE user_id = p_user_id;
  DELETE FROM public.llm_usage_logs       WHERE user_id = p_user_id;

  v_files := public.admin_erase_storage(p_user_id);

  UPDATE public.ai_call_telemetry SET user_id = NULL WHERE user_id = p_user_id;
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
END; $function$;
