-- v3.131.0 — turns the manual pg_proc SECURITY DEFINER sweep
-- (docs/map/blueprint.md's own "run this after adding any SECURITY DEFINER
-- function, and periodically regardless" query) into a real, callable,
-- admin-gated function, so it can be checked by an automated test instead
-- of relying on a human (or an AI) remembering to paste the query in by
-- hand. Every real severe vulnerability this app has ever had (credit_
-- balance, then credit_grant/credit_spend/billing_ensure) was exactly this
-- shape: a SECURITY DEFINER function taking an arbitrary target id, granted
-- to authenticated or anon, with no ownership check in its own body.
CREATE OR REPLACE FUNCTION public.get_admin_security_definer_audit()
RETURNS TABLE(proname text, args text, granted_to text)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT has_role((SELECT auth.uid()), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;

  RETURN QUERY
  SELECT p.proname::text, pg_get_function_arguments(p.oid), 'authenticated'::text
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.prosecdef = true
    AND has_function_privilege('authenticated', p.oid, 'EXECUTE')
    AND p.prosrc !~* 'auth\.uid|has_role|has_duty_access'
  UNION ALL
  SELECT p.proname::text, pg_get_function_arguments(p.oid), 'anon'::text
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.prosecdef = true
    AND has_function_privilege('anon', p.oid, 'EXECUTE')
    AND p.prosrc !~* 'auth\.uid|has_role|has_duty_access'
  ORDER BY 1, 3;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_admin_security_definer_audit() TO authenticated;
