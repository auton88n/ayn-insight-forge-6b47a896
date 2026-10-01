-- Dead-code cleanup: retire the pre-Stripe "message tier" billing system.
--
-- handle_new_user() unconditionally inserted a row into user_subscriptions
-- and user_ai_limits on every single signup -- both leftover from the
-- app's pre-pivot chat/consulting era, superseded long ago by the real,
-- current billing system (subscriptions/credit_ledger/plans, Stripe-
-- backed). Confirmed dead via a full trace before touching anything: zero
-- application code anywhere reads either table (one of this repo's own
-- now-deleted hooks, useUsageTracking.ts, carried a comment admitting it
-- read "dead user_ai_limits/user_subscriptions tables"), and the only
-- things that ever wrote to them were this trigger and two of their own
-- self-contained sync triggers (sync_limits_on_tier_change,
-- sync_user_limits_on_subscription_change) plus four fully orphaned
-- sibling counters (increment_messages_daily/monthly,
-- increment_engineering_daily/monthly -- zero trigger attachments, zero
-- callers anywhere, confirmed via pg_proc/pg_trigger directly).
--
-- erase_account_core() is edited in the same migration to drop its now-
-- pointless references to both tables, plus six more tables it has only
-- ever referenced for cleanup and that have zero other live consumer
-- anywhere (application code, Postgres function, or trigger): the
-- job_applications/applications pair this app's own CLAUDE.md names
-- "deprecated" in its very first global rule, message_ratings/
-- favorite_chats/beta_feedback (old chat platform), and
-- device_fingerprints (superseded by real auth.sessions per this app's
-- own v3.35.0 fix).
--
-- Verified live before this migration was written: a real signup against
-- the updated handle_new_user, and a real erase_account_core call against
-- that same account, both succeeded cleanly.

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_signups boolean;
  v_meta jsonb := coalesce(NEW.raw_user_meta_data, '{}'::jsonb);
  v_terms text := nullif(trim(v_meta ->> 'terms_version'), '');
  v_privacy text := nullif(trim(v_meta ->> 'privacy_version'), '');
  v_accepted boolean := coalesce((v_meta ->> 'legal_accepted')::boolean, false);
  v_provider text := coalesce(NEW.raw_app_meta_data ->> 'provider', 'email');
BEGIN
  SELECT coalesce((value ->> 'signups')::boolean, true) INTO v_signups FROM public.system_config WHERE key = 'feature_flags';
  IF v_signups IS NOT NULL AND v_signups = false THEN
    RAISE EXCEPTION 'Signups are temporarily unavailable while AYN is under maintenance';
  END IF;
  INSERT INTO public.access_grants (user_id, is_active, monthly_limit, current_month_usage) VALUES (NEW.id, true, 5, 0) ON CONFLICT (user_id) DO NOTHING;
  INSERT INTO public.user_settings (user_id, has_accepted_terms) VALUES (NEW.id, false) ON CONFLICT (user_id) DO NOTHING;

  IF v_accepted AND v_terms IS NOT NULL AND v_privacy IS NOT NULL THEN
    INSERT INTO public.terms_consent_log
      (user_id, terms_version, privacy_version, terms_accepted, privacy_accepted, user_agent, source)
    VALUES
      (NEW.id, left(v_terms, 32), left(v_privacy, 32), true, true,
       left(nullif(trim(v_meta ->> 'consent_user_agent'), ''), 500), 'signup');
  ELSE
    -- No acceptance was presented to this person, which is true of an OAuth
    -- signup and of an account created by hand. Record that plainly rather
    -- than leaving a hole or inventing an acceptance.
    INSERT INTO public.terms_consent_log
      (user_id, terms_version, privacy_version, terms_accepted, privacy_accepted, user_agent, source)
    VALUES
      (NEW.id, NULL, NULL, false, false,
       left(nullif(trim(v_meta ->> 'consent_user_agent'), ''), 500),
       CASE WHEN v_provider = 'email' THEN 'unrecorded' ELSE 'oauth_unrecorded' END);
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.erase_account_core(p_user_id uuid, p_actor uuid, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  declare
    v_email text;
    v_files integer := 0;
    v_ref text := 'erased-' || left(replace(p_user_id::text,'-',''), 8);
    v_org_ids uuid[];
  begin
    select email into v_email from auth.users where id = p_user_id;
    if v_email is null then raise exception 'No such account'; end if;

    delete from public.resume_versions where user_id = p_user_id;
    delete from public.resumes where user_id = p_user_id;
    delete from public.cover_letters where user_id = p_user_id;
    delete from public.jobs where user_id = p_user_id;
    delete from public.job_matches where user_id = p_user_id;
    delete from public.skills_to_learn where user_id = p_user_id;
    delete from public.job_postings_seen where user_id = p_user_id;
    delete from public.user_profile_data where user_id = p_user_id;
    delete from public.user_profile_canonical where user_id = p_user_id;
    delete from public.candidate_index where user_id = p_user_id;
    delete from public.candidate_skills where user_id = p_user_id;
    delete from public.talent_pool_consent where user_id = p_user_id;
    delete from public.ai_result_cache where user_id = p_user_id;
    delete from public.user_memory where user_id = p_user_id;
    delete from public.user_preferences where user_id = p_user_id;
    delete from public.user_settings where user_id = p_user_id;
    delete from public.messages where user_id = p_user_id;
    delete from public.chat_sessions where user_id = p_user_id;
    delete from public.ticket_messages where ticket_id in (select id from public.support_tickets where user_id = p_user_id);
    delete from public.support_ticket_replies where ticket_id in (select id from public.support_tickets where user_id = p_user_id);
    delete from public.support_admin_reads where ticket_id in (select id from public.support_tickets where user_id = p_user_id);
    delete from public.support_tickets where user_id = p_user_id;
    delete from public.email_logs where user_id = p_user_id;
    delete from public.upgrade_intents where user_id = p_user_id;
    delete from public.access_grants where user_id = p_user_id;
    delete from public.api_rate_limits where user_id = p_user_id;
    delete from public.rate_limits where user_id = p_user_id;
    delete from public.threat_detection where user_id = p_user_id;
    delete from public.terms_consent_log where user_id = p_user_id;
    delete from public.employer_accounts where user_id = p_user_id;
    delete from public.user_usage_daily where user_id = p_user_id;
    delete from public.usage_logs where user_id = p_user_id;
    delete from public.admin_totp_secrets where user_id = p_user_id;

    select array_agg(org_id) into v_org_ids from public.org_members where user_id = p_user_id;
    delete from public.org_members where user_id = p_user_id;
    delete from public.orgs
      where id = any(v_org_ids)
        and not exists (select 1 from public.org_members om where om.org_id = orgs.id);

    delete from public.account_restrictions where user_id = p_user_id;
    delete from public.account_limit_overrides where user_id = p_user_id;
    delete from public.profiles where user_id = p_user_id or id = p_user_id;
    delete from public.user_roles where user_id = p_user_id;
    delete from public.llm_usage_logs where user_id = p_user_id;

    v_files := public.admin_erase_storage(p_user_id);

    update public.ai_call_telemetry set user_id = null where user_id = p_user_id;
    update public.error_logs set user_id = null where user_id = p_user_id;
    update public.security_logs set user_id = null where user_id = p_user_id;
    update public.system_logs set user_id = null where user_id = p_user_id;
    update public.cookie_consent_log set user_id = null where user_id = p_user_id;

    update public.reveal_requests set candidate_ref = v_ref where candidate_user_id = p_user_id;
    update public.assessments set candidate_ref = v_ref where candidate_user_id = p_user_id;

    update auth.users set
      banned_until = now() + interval '100 years',
      email = 'erased+' || replace(p_user_id::text,'-','') || '@erased.invalid',
      phone = null,
      raw_user_meta_data = '{}'::jsonb,
      email_change = '', phone_change = '',
      updated_at = now()
    where id = p_user_id;
    delete from auth.identities where user_id = p_user_id;
    delete from auth.sessions where user_id = p_user_id;

    insert into public.account_erasures (user_id, email_at_erasure, reason, erased_by)
    values (p_user_id, v_email, btrim(p_reason), p_actor)
    on conflict (user_id) do update
      set reason = excluded.reason, erased_by = excluded.erased_by, erased_at = now(), updated_at = now();

    return jsonb_build_object('ok', true, 'erased', true, 'email', v_email,
      'candidate_ref', v_ref, 'files_removed', v_files);
  end;
$function$;

-- The tables and trigger functions below are NOT dropped by this
-- migration -- dropping 21 tables in one action was refused by this
-- session's own safety guardrail as a mass-delete, pending the founder's
-- explicit approval. Both functions above are already safe with these
-- tables either present or absent (neither writes nor reads them), so
-- applying this migration is safe regardless of when/whether the drop
-- itself runs. The drop statements, fully verified (no other table's
-- foreign key or view depends on any of the 21, confirmed directly
-- against pg_depend/information_schema before this was written), are
-- staged in supabase/migrations/20260927140500_drop_dead_tables.sql.pending
-- -- rename to .sql and run it once approved, or run it as a one-off.
