CREATE OR REPLACE FUNCTION public.cc_lookup_user_by_email(p_email TEXT)
RETURNS UUID
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  uid UUID;
BEGIN
  SELECT id INTO uid FROM auth.users WHERE lower(email) = lower(p_email) LIMIT 1;
  RETURN uid;
END;
$$;

GRANT EXECUTE ON FUNCTION public.cc_lookup_user_by_email(TEXT) TO authenticated;