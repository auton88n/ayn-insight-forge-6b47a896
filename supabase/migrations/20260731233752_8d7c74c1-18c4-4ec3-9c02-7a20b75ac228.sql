CREATE OR REPLACE FUNCTION public.get_broadcast_recipients(p_admin_id uuid, p_audience text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT has_role(p_admin_id, 'admin'::app_role) THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;

  RETURN coalesce((
    SELECT jsonb_agg(row_to_json(t))
    FROM (
      SELECT u.id AS user_id, u.email
      FROM auth.users u
      LEFT JOIN employer_accounts ea ON ea.user_id = u.id
      LEFT JOIN talent_pool_consent tp ON tp.user_id = u.id
      WHERE u.email IS NOT NULL
        AND (
          p_audience = 'all'
          OR (p_audience = 'employers' AND ea.user_id IS NOT NULL)
          OR (p_audience = 'seekers' AND ea.user_id IS NULL)
          OR (p_audience = 'discoverable' AND coalesce(tp.opted_in, false) = true)
        )
    ) t), '[]'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION public.get_broadcast_recipients(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_broadcast_recipients(uuid, text) TO service_role;