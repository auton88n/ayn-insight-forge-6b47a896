-- v3.33.0 consent recording. The write moves into account creation itself.

ALTER TABLE public.terms_consent_log ALTER COLUMN terms_version DROP NOT NULL;
ALTER TABLE public.terms_consent_log ALTER COLUMN terms_version DROP DEFAULT;

CREATE INDEX IF NOT EXISTS idx_terms_consent_log_source ON public.terms_consent_log (source);

-- Compares a dotted version like 1.0 or 2.11 as a sortable number. Anything
-- that is not a dotted number (the old date style versions) returns NULL and
-- is therefore treated as below any current version.
CREATE OR REPLACE FUNCTION public.legal_version_num(p_version text)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_version ~ '^[0-9]+(\.[0-9]+)?$' THEN p_version::numeric
    ELSE NULL
  END
$$;

-- Consent is now written inside the same transaction as the auth.users row.
-- A failure here fails the signup, which is the point: no account may exist
-- without a record of what it agreed to.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
  INSERT INTO public.user_subscriptions (user_id, subscription_tier, status) VALUES (NEW.id, 'free', 'active') ON CONFLICT (user_id) DO NOTHING;
  INSERT INTO public.user_ai_limits (user_id, daily_messages, monthly_messages, is_unlimited) VALUES (NEW.id, 5, 0, false) ON CONFLICT (user_id) DO NOTHING;
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
$$;

-- Backfill: one honest row per account that has none. Nothing is claimed to
-- have been accepted.
INSERT INTO public.terms_consent_log
  (user_id, terms_version, privacy_version, terms_accepted, privacy_accepted, ai_disclaimer_accepted, accepted_at, source)
SELECT u.id, NULL, NULL, false, false, false, u.created_at, 'backfill_unrecorded'
FROM auth.users u
WHERE NOT EXISTS (SELECT 1 FROM public.terms_consent_log t WHERE t.user_id = u.id);

-- Who still owes us an acceptance. The current versions are passed in by the
-- caller, because the one source of truth is the markdown of each document.
CREATE OR REPLACE FUNCTION public.get_admin_consent_gap(p_terms_version text, p_privacy_version text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v jsonb;
BEGIN
  IF NOT has_role((SELECT auth.uid()), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;

  WITH latest AS (
    SELECT DISTINCT ON (tc.user_id) tc.user_id, tc.terms_version, tc.privacy_version,
           tc.terms_accepted, tc.privacy_accepted, tc.accepted_at, tc.source
    FROM public.terms_consent_log tc
    ORDER BY tc.user_id, tc.accepted_at DESC
  ), state AS (
    SELECT u.id, u.email, u.created_at, l.terms_version, l.privacy_version,
           l.accepted_at, l.source,
           CASE
             WHEN l.user_id IS NULL THEN 'no_record'
             WHEN NOT (coalesce(l.terms_accepted,false) AND coalesce(l.privacy_accepted,false)) THEN 'not_accepted'
             WHEN coalesce(public.legal_version_num(l.terms_version), -1) < coalesce(public.legal_version_num(p_terms_version), 0)
               OR coalesce(public.legal_version_num(l.privacy_version), -1) < coalesce(public.legal_version_num(p_privacy_version), 0)
               THEN 'below_current'
             ELSE 'current'
           END AS consent_state
    FROM auth.users u
    LEFT JOIN latest l ON l.user_id = u.id
  )
  SELECT jsonb_build_object(
    'terms_version', p_terms_version,
    'privacy_version', p_privacy_version,
    'total_users', (SELECT count(*) FROM state),
    'current', (SELECT count(*) FROM state WHERE consent_state = 'current'),
    'below_current', (SELECT count(*) FROM state WHERE consent_state = 'below_current'),
    'not_accepted', (SELECT count(*) FROM state WHERE consent_state = 'not_accepted'),
    'no_record', (SELECT count(*) FROM state WHERE consent_state = 'no_record'),
    'needs_reaccept', (SELECT count(*) FROM state WHERE consent_state <> 'current'),
    'users', coalesce((
      SELECT jsonb_agg(to_jsonb(s) ORDER BY s.created_at DESC)
      FROM (SELECT * FROM state WHERE consent_state <> 'current' LIMIT 200) s
    ), '[]'::jsonb),
    'generated_at', now()
  ) INTO v;

  RETURN v;
END;
$$;

REVOKE ALL ON FUNCTION public.get_admin_consent_gap(text, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_admin_consent_gap(text, text) TO authenticated;

-- Overview gains the number that should be zero.
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
    'accounts_total', (SELECT count(*) FROM auth.users),
    'accounts_without_consent', (
      SELECT count(*) FROM auth.users u
      WHERE NOT EXISTS (
        SELECT 1 FROM terms_consent_log tc
        WHERE tc.user_id = u.id AND tc.terms_accepted AND tc.privacy_accepted
          AND tc.terms_version IS NOT NULL AND tc.privacy_version IS NOT NULL
      )
    ),
    'generated_at', now()
  );
END;
$$;
