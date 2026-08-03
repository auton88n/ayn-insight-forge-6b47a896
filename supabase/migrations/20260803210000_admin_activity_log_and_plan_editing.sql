-- v3.47.0 — three admin panel gaps closed:
-- 1. get_admin_activity_log: security_audit_logs has been written to by
--    nearly every admin_* RPC since early in this project, but nothing has
--    ever read it back. This is the first reader.
-- 2. get_admin_plans / admin_update_plan: plans could not be edited from
--    the panel at all. Editable fields are deliberately limited to name,
--    credits, proposals/assessments/searches limits, and active/visible —
--    never price_cents or the Stripe price/product ids, since Stripe
--    prices are immutable once created and this repo has never created or
--    mutated a Stripe Price/Product object anywhere (confirmed by grep
--    across every edge function before writing this). Editing price_cents
--    here without a matching Stripe change would silently desync what the
--    app displays from what Stripe actually charges, a worse bug than not
--    having the editor at all.
-- 3. get_admin_email_log: email_logs has always been writable by every
--    edge function via service_role, but only admin-broadcast ever
--    actually wrote to it. This reader lets the admin see every email
--    attempt (broadcast and the v3.43.0/v3.44.0 automatic system emails
--    alike) in one place, including failures, which previously failed
--    completely silently.

CREATE OR REPLACE FUNCTION public.get_admin_activity_log(p_limit integer DEFAULT 100)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT has_role((SELECT auth.uid()), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;
  RETURN coalesce((
    SELECT jsonb_agg(row_to_json(t) ORDER BY t.created_at DESC)
    FROM (
      SELECT
        l.id,
        l.action,
        l.details,
        l.severity,
        l.created_at,
        u.email AS actor_email
      FROM public.security_audit_logs l
      LEFT JOIN auth.users u ON u.id = l.user_id
      ORDER BY l.created_at DESC
      LIMIT LEAST(GREATEST(coalesce(p_limit, 100), 1), 500)
    ) t
  ), '[]'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_admin_plans()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT has_role((SELECT auth.uid()), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;
  RETURN coalesce((
    SELECT jsonb_agg(row_to_json(t) ORDER BY t.audience, t.sort)
    FROM (
      SELECT key, name, audience, price_cents, interval, credits,
             proposals_limit, assessments_limit, searches_limit, active, sort
      FROM public.plans
    ) t
  ), '[]'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_update_plan(
  p_key text,
  p_name text,
  p_credits integer,
  p_proposals_limit integer,
  p_assessments_limit integer,
  p_searches_limit integer,
  p_active boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin uuid := (SELECT auth.uid());
  v_before public.plans;
BEGIN
  IF NOT has_role(v_admin, 'admin'::app_role) THEN RAISE EXCEPTION 'Admin access required'; END IF;
  IF p_key IS NULL THEN RAISE EXCEPTION 'A plan key is required'; END IF;
  IF coalesce(btrim(p_name), '') = '' THEN RAISE EXCEPTION 'A plan name is required'; END IF;

  SELECT * INTO v_before FROM public.plans WHERE key = p_key;
  IF v_before.key IS NULL THEN RAISE EXCEPTION 'No such plan'; END IF;

  UPDATE public.plans SET
    name = btrim(p_name),
    credits = p_credits,
    proposals_limit = p_proposals_limit,
    assessments_limit = p_assessments_limit,
    searches_limit = p_searches_limit,
    active = coalesce(p_active, true),
    updated_at = now()
  WHERE key = p_key;

  INSERT INTO public.security_audit_logs (user_id, action, details, severity)
  VALUES (v_admin, 'admin_update_plan',
          jsonb_build_object(
            'plan_key', p_key,
            'before', jsonb_build_object('name', v_before.name, 'credits', v_before.credits,
              'proposals_limit', v_before.proposals_limit, 'assessments_limit', v_before.assessments_limit,
              'searches_limit', v_before.searches_limit, 'active', v_before.active),
            'after', jsonb_build_object('name', p_name, 'credits', p_credits,
              'proposals_limit', p_proposals_limit, 'assessments_limit', p_assessments_limit,
              'searches_limit', p_searches_limit, 'active', p_active)
          ), 'medium');

  RETURN jsonb_build_object('ok', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_admin_email_log(p_limit integer DEFAULT 100)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT has_role((SELECT auth.uid()), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;
  RETURN coalesce((
    SELECT jsonb_agg(row_to_json(t) ORDER BY t.sent_at DESC)
    FROM (
      SELECT id, email_type, recipient_email, status, error_message, sent_at
      FROM public.email_logs
      ORDER BY sent_at DESC
      LIMIT LEAST(GREATEST(coalesce(p_limit, 100), 1), 500)
    ) t
  ), '[]'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION public.get_admin_activity_log(integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_admin_plans() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_update_plan(text, text, integer, integer, integer, integer, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_admin_email_log(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_admin_activity_log(integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_admin_plans() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_update_plan(text, text, integer, integer, integer, integer, boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_admin_email_log(integer) TO authenticated, service_role;
