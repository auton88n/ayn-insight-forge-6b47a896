-- v3.46.0 — admins could not see or manage who else has admin access from
-- the panel; it had to be done by hand in the database. get_admin_admins
-- lists every account with the admin role (email, when granted, last sign
-- in). admin_set_admin_role grants or revokes it for an existing account,
-- always refusing to touch your own admin role (the same self-protection
-- shape already used by admin_suspend_account/admin_erase_account/etc, so
-- an admin can never accidentally lock themselves out), requires a reason,
-- and audits at high severity like every other admin moderation action.

CREATE OR REPLACE FUNCTION public.get_admin_admins()
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
    SELECT jsonb_agg(row_to_json(t) ORDER BY t.granted_at DESC)
    FROM (
      SELECT
        u.id AS user_id,
        u.email,
        ur.created_at AS granted_at,
        u.last_sign_in_at,
        (u.id = (SELECT auth.uid())) AS is_you
      FROM public.user_roles ur
      JOIN auth.users u ON u.id = ur.user_id
      WHERE ur.role = 'admin'::app_role
    ) t
  ), '[]'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_set_admin_role(p_user_id uuid, p_grant boolean, p_reason text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin uuid := (SELECT auth.uid());
  v_email text;
BEGIN
  IF NOT has_role(v_admin, 'admin'::app_role) THEN RAISE EXCEPTION 'Admin access required'; END IF;
  IF p_user_id IS NULL THEN RAISE EXCEPTION 'A user is required'; END IF;
  IF coalesce(btrim(p_reason), '') = '' THEN RAISE EXCEPTION 'A reason is required'; END IF;
  IF p_user_id = v_admin THEN RAISE EXCEPTION 'You cannot change your own admin access'; END IF;

  SELECT email INTO v_email FROM auth.users WHERE id = p_user_id;
  IF v_email IS NULL THEN RAISE EXCEPTION 'No such account'; END IF;

  IF p_grant THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (p_user_id, 'admin'::app_role)
    ON CONFLICT DO NOTHING;
  ELSE
    DELETE FROM public.user_roles WHERE user_id = p_user_id AND role = 'admin'::app_role;
  END IF;

  INSERT INTO public.security_audit_logs (user_id, action, details, severity)
  VALUES (v_admin, 'admin_set_admin_role',
          jsonb_build_object('target_user_id', p_user_id, 'target_email', v_email,
                              'grant', p_grant, 'reason', btrim(p_reason)), 'high');

  RETURN jsonb_build_object('ok', true, 'granted', p_grant);
END;
$$;

REVOKE ALL ON FUNCTION public.get_admin_admins() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_set_admin_role(uuid, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_admin_admins() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_set_admin_role(uuid, boolean, text) TO authenticated, service_role;
