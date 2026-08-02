-- v3.35.0 self service session list.
-- SessionManagement.tsx / useUserSettings.ts have been reading from
-- device_fingerprints, a table nothing has ever written a row to, so
-- "Active sessions" has always shown empty and "Sign out all devices"
-- only ran supabase.auth.signOut() (current tab only) after deleting zero
-- rows from that dead table. Real session data lives in auth.sessions.

CREATE OR REPLACE FUNCTION public.self_list_sessions()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_uid uuid := (SELECT auth.uid());
  v_current uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Sign in first'; END IF;
  BEGIN
    v_current := (auth.jwt() ->> 'session_id')::uuid;
  EXCEPTION WHEN OTHERS THEN v_current := NULL;
  END;

  RETURN coalesce((
    SELECT jsonb_agg(jsonb_build_object(
      'id', s.id,
      'created_at', s.created_at,
      'refreshed_at', s.refreshed_at,
      'not_after', s.not_after,
      'user_agent', s.user_agent,
      'ip', s.ip::text,
      'is_current', s.id = v_current
    ) ORDER BY coalesce(s.refreshed_at, s.created_at) DESC)
    FROM auth.sessions s
    WHERE s.user_id = v_uid
  ), '[]'::jsonb);
END; $$;
GRANT EXECUTE ON FUNCTION public.self_list_sessions() TO authenticated;

-- Ends one session by id. Deletes the auth.sessions row (so a refresh is
-- refused) and revokes its refresh tokens (so a still-valid one cannot be
-- redeemed either). The live access token already issued for that session
-- keeps working until it expires on its own, same as any JWT-based auth.
CREATE OR REPLACE FUNCTION public.self_revoke_session(p_session_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_uid uuid := (SELECT auth.uid());
  v_owned boolean;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Sign in first'; END IF;
  SELECT EXISTS(SELECT 1 FROM auth.sessions WHERE id = p_session_id AND user_id = v_uid) INTO v_owned;
  IF NOT v_owned THEN RAISE EXCEPTION 'No such session'; END IF;

  UPDATE auth.refresh_tokens SET revoked = true, updated_at = now()
   WHERE session_id = p_session_id AND revoked = false;
  DELETE FROM auth.sessions WHERE id = p_session_id AND user_id = v_uid;

  RETURN jsonb_build_object('ok', true);
END; $$;
GRANT EXECUTE ON FUNCTION public.self_revoke_session(uuid) TO authenticated;
