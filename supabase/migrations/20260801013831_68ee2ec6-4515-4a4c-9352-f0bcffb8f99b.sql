-- v3.28.0 account moderation

CREATE TYPE public.account_capability AS ENUM ('discovery','proposals','assessments','ai');

CREATE TABLE public.account_restrictions (
  user_id uuid NOT NULL,
  capability public.account_capability NOT NULL,
  reason text NOT NULL,
  set_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, capability)
);
GRANT SELECT ON public.account_restrictions TO authenticated;
GRANT ALL ON public.account_restrictions TO service_role;
ALTER TABLE public.account_restrictions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own restrictions readable" ON public.account_restrictions
  FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()) OR public.has_role((SELECT auth.uid()), 'admin'::app_role));

CREATE TABLE public.account_suspensions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  reason text NOT NULL,
  until timestamptz,
  active boolean NOT NULL DEFAULT true,
  suspended_by uuid,
  suspended_at timestamptz NOT NULL DEFAULT now(),
  restored_by uuid,
  restored_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX account_suspensions_one_active ON public.account_suspensions (user_id) WHERE active;
CREATE INDEX account_suspensions_user ON public.account_suspensions (user_id);
GRANT SELECT ON public.account_suspensions TO authenticated;
GRANT ALL ON public.account_suspensions TO service_role;
ALTER TABLE public.account_suspensions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own suspensions readable" ON public.account_suspensions
  FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()) OR public.has_role((SELECT auth.uid()), 'admin'::app_role));

CREATE TRIGGER account_restrictions_updated_at BEFORE UPDATE ON public.account_restrictions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER account_suspensions_updated_at BEFORE UPDATE ON public.account_suspensions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- suspend
CREATE OR REPLACE FUNCTION public.admin_suspend_account(p_user_id uuid, p_reason text, p_until timestamptz DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_admin uuid := (SELECT auth.uid());
BEGIN
  IF NOT has_role(v_admin, 'admin'::app_role) THEN RAISE EXCEPTION 'Admin access required'; END IF;
  IF p_user_id IS NULL THEN RAISE EXCEPTION 'A user is required'; END IF;
  IF coalesce(btrim(p_reason),'') = '' THEN RAISE EXCEPTION 'A reason is required to suspend an account'; END IF;
  IF p_user_id = v_admin THEN RAISE EXCEPTION 'You cannot suspend your own account'; END IF;
  IF has_role(p_user_id, 'admin'::app_role) THEN RAISE EXCEPTION 'You cannot suspend another admin'; END IF;

  UPDATE auth.users
     SET banned_until = coalesce(p_until, now() + interval '100 years')
   WHERE id = p_user_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'No such account'; END IF;

  UPDATE public.account_suspensions
     SET active = false, restored_by = v_admin, restored_at = now()
   WHERE user_id = p_user_id AND active;

  INSERT INTO public.account_suspensions (user_id, reason, until, suspended_by)
  VALUES (p_user_id, btrim(p_reason), p_until, v_admin);

  INSERT INTO public.security_audit_logs (user_id, action, details, severity)
  VALUES (v_admin, 'admin_suspend_account',
          jsonb_build_object('target_user_id', p_user_id, 'reason', btrim(p_reason), 'until', p_until), 'high');

  RETURN jsonb_build_object('ok', true, 'suspended', true, 'until', p_until);
END; $$;

CREATE OR REPLACE FUNCTION public.admin_restore_account(p_user_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_admin uuid := (SELECT auth.uid());
BEGIN
  IF NOT has_role(v_admin, 'admin'::app_role) THEN RAISE EXCEPTION 'Admin access required'; END IF;
  IF p_user_id IS NULL THEN RAISE EXCEPTION 'A user is required'; END IF;

  UPDATE auth.users SET banned_until = NULL WHERE id = p_user_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'No such account'; END IF;

  UPDATE public.account_suspensions
     SET active = false, restored_by = v_admin, restored_at = now()
   WHERE user_id = p_user_id AND active;

  INSERT INTO public.security_audit_logs (user_id, action, details, severity)
  VALUES (v_admin, 'admin_restore_account', jsonb_build_object('target_user_id', p_user_id), 'high');

  RETURN jsonb_build_object('ok', true, 'suspended', false);
END; $$;

CREATE OR REPLACE FUNCTION public.admin_set_restriction(p_user_id uuid, p_capability text, p_on boolean, p_reason text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_admin uuid := (SELECT auth.uid()); v_cap public.account_capability;
BEGIN
  IF NOT has_role(v_admin, 'admin'::app_role) THEN RAISE EXCEPTION 'Admin access required'; END IF;
  IF p_user_id IS NULL THEN RAISE EXCEPTION 'A user is required'; END IF;
  BEGIN v_cap := p_capability::public.account_capability;
  EXCEPTION WHEN others THEN RAISE EXCEPTION 'Unknown capability %', p_capability; END;

  IF p_on THEN
    IF coalesce(btrim(p_reason),'') = '' THEN RAISE EXCEPTION 'A reason is required to restrict an account'; END IF;
    IF p_user_id = v_admin THEN RAISE EXCEPTION 'You cannot restrict your own account'; END IF;
    IF has_role(p_user_id, 'admin'::app_role) THEN RAISE EXCEPTION 'You cannot restrict another admin'; END IF;
    INSERT INTO public.account_restrictions (user_id, capability, reason, set_by)
    VALUES (p_user_id, v_cap, btrim(p_reason), v_admin)
    ON CONFLICT (user_id, capability) DO UPDATE
      SET reason = excluded.reason, set_by = excluded.set_by, updated_at = now();
  ELSE
    DELETE FROM public.account_restrictions WHERE user_id = p_user_id AND capability = v_cap;
  END IF;

  INSERT INTO public.security_audit_logs (user_id, action, details, severity)
  VALUES (v_admin, CASE WHEN p_on THEN 'admin_restrict_account' ELSE 'admin_unrestrict_account' END,
          jsonb_build_object('target_user_id', p_user_id, 'capability', p_capability, 'reason', btrim(coalesce(p_reason,''))), 'high');

  RETURN jsonb_build_object('ok', true, 'capability', p_capability, 'restricted', p_on);
END; $$;

-- one person, read only
CREATE OR REPLACE FUNCTION public.get_admin_account_detail(p_user_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v jsonb;
BEGIN
  IF NOT has_role((SELECT auth.uid()), 'admin'::app_role) THEN RAISE EXCEPTION 'Admin access required'; END IF;

  SELECT jsonb_build_object(
    'user_id', u.id,
    'email', u.email,
    'display_name', coalesce(p.contact_person, split_part(u.email,'@',1)),
    'provider', coalesce(u.raw_app_meta_data->>'provider', 'email'),
    'providers', coalesce(u.raw_app_meta_data->'providers', '[]'::jsonb),
    'email_confirmed_at', u.email_confirmed_at,
    'signed_up_at', u.created_at,
    'last_sign_in_at', u.last_sign_in_at,
    'sign_in_count', (SELECT count(*) FROM auth.sessions s WHERE s.user_id = u.id),
    'banned_until', u.banned_until,
    'account_role', coalesce(p.role::text,'job_seeker'),
    'system_role', coalesce(ur.role::text,'user'),
    'employer_status', ea.status::text,
    'company_name', ea.company_name,
    'plan_key', coalesce(sub.plan_key,'none'),
    'sub_status', sub.status,
    'credits_balance', coalesce((SELECT sum(delta) FROM credit_ledger cl WHERE cl.user_id = u.id),0),
    'credits_spent', coalesce((SELECT -sum(delta) FROM credit_ledger cl WHERE cl.user_id = u.id AND cl.delta < 0),0),
    'has_resume', EXISTS (SELECT 1 FROM resumes r WHERE r.user_id = u.id),
    'saved_jobs', (SELECT count(*) FROM jobs j WHERE j.user_id = u.id),
    'discoverable', coalesce(tp.opted_in,false),
    'discovery_consent_at', tp.consented_at,
    'indexed_at', ci.indexed_at,
    'profile_completeness', (
      SELECT round(100.0 * (
        (CASE WHEN coalesce(ci.headline,'') <> '' THEN 1 ELSE 0 END) +
        (CASE WHEN coalesce(ci.summary,'') <> '' THEN 1 ELSE 0 END) +
        (CASE WHEN coalesce(ci.location,'') <> '' THEN 1 ELSE 0 END) +
        (CASE WHEN coalesce(ci.years_experience,0) > 0 THEN 1 ELSE 0 END) +
        (CASE WHEN EXISTS (SELECT 1 FROM resumes r WHERE r.user_id = u.id) THEN 1 ELSE 0 END) +
        (CASE WHEN coalesce(jsonb_array_length(upc.skills), 0) > 0 THEN 1 ELSE 0 END) +
        (CASE WHEN coalesce(jsonb_array_length(upc.experiences), 0) > 0 THEN 1 ELSE 0 END)
      ) / 7.0)
    ),
    'proposals_received', (SELECT count(*) FROM reveal_requests rr WHERE rr.candidate_user_id = u.id),
    'proposals_sent', (SELECT count(*) FROM reveal_requests rr JOIN org_members om ON om.org_id = rr.org_id WHERE om.user_id = u.id),
    'assessments_taken', (SELECT count(*) FROM assessments a WHERE a.candidate_user_id = u.id AND a.submitted_at IS NOT NULL),
    'assessments_received', (SELECT count(*) FROM assessments a WHERE a.candidate_user_id = u.id),
    'suspension', (
      SELECT to_jsonb(x) FROM (
        SELECT s.reason, s.until, s.suspended_at, s.suspended_by,
               (SELECT email FROM auth.users au WHERE au.id = s.suspended_by) AS suspended_by_email
        FROM account_suspensions s WHERE s.user_id = u.id AND s.active LIMIT 1
      ) x
    ),
    'suspension_history', coalesce((
      SELECT jsonb_agg(to_jsonb(h) ORDER BY h.suspended_at DESC) FROM (
        SELECT s.reason, s.until, s.suspended_at, s.restored_at, s.active FROM account_suspensions s
        WHERE s.user_id = u.id ORDER BY s.suspended_at DESC LIMIT 10
      ) h
    ), '[]'::jsonb),
    'restrictions', coalesce((
      SELECT jsonb_agg(to_jsonb(rq)) FROM (
        SELECT ar.capability::text AS capability, ar.reason, ar.created_at,
               (SELECT email FROM auth.users au WHERE au.id = ar.set_by) AS set_by_email
        FROM account_restrictions ar WHERE ar.user_id = u.id ORDER BY ar.capability
      ) rq
    ), '[]'::jsonb)
  )
  INTO v
  FROM auth.users u
  LEFT JOIN profiles p ON p.user_id = u.id
  LEFT JOIN user_roles ur ON ur.user_id = u.id
  LEFT JOIN employer_accounts ea ON ea.user_id = u.id
  LEFT JOIN subscriptions sub ON sub.user_id = u.id
  LEFT JOIN talent_pool_consent tp ON tp.user_id = u.id
  LEFT JOIN candidate_index ci ON ci.user_id = u.id
  LEFT JOIN user_profile_canonical upc ON upc.user_id = u.id
  WHERE u.id = p_user_id;

  IF v IS NULL THEN RAISE EXCEPTION 'No such account'; END IF;
  RETURN v;
END; $$;

-- list gains suspension and restriction state
CREATE OR REPLACE FUNCTION public.get_admin_accounts(p_search text DEFAULT NULL::text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NOT has_role((SELECT auth.uid()), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;
  RETURN jsonb_build_object(
    'total', (SELECT count(*) FROM auth.users WHERE email IS NOT NULL),
    'seekers', (SELECT count(*) FROM profiles WHERE coalesce(role::text,'job_seeker') = 'job_seeker'),
    'employers', (SELECT count(*) FROM employer_accounts),
    'admins', (SELECT count(*) FROM user_roles WHERE role = 'admin'::app_role),
    'suspended', (SELECT count(*) FROM account_suspensions WHERE active),
    'restricted', (SELECT count(DISTINCT user_id) FROM account_restrictions),
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
          coalesce(u.raw_app_meta_data->>'provider','email') AS provider,
          (u.email_confirmed_at IS NOT NULL) AS email_confirmed,
          ea.status::text AS employer_status,
          ea.company_name,
          coalesce(s.plan_key, 'none') AS plan_key,
          s.status AS sub_status,
          coalesce((SELECT sum(delta) FROM credit_ledger cl WHERE cl.user_id = u.id), 0) AS credits,
          coalesce(tp.opted_in, false) AS discoverable,
          EXISTS (SELECT 1 FROM account_suspensions asx WHERE asx.user_id = u.id AND asx.active) AS suspended,
          coalesce((SELECT array_agg(ar.capability::text ORDER BY ar.capability) FROM account_restrictions ar WHERE ar.user_id = u.id), ARRAY[]::text[]) AS restrictions
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
END; $$;

REVOKE EXECUTE ON FUNCTION public.admin_suspend_account(uuid, text, timestamptz) FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_restore_account(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_set_restriction(uuid, text, boolean, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_admin_account_detail(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_admin_accounts(text) FROM anon;