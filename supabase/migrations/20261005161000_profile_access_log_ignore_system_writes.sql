-- Second source of the same noise: every profile insert or update done by the backend itself
-- (no signed-in person) wrote a "sensitive_profile_access" row. It now skips those and still
-- records anything a signed-in person does. The input validation in the trigger that calls this
-- is untouched.
CREATE OR REPLACE FUNCTION public.log_profiles_sensitive_access(_operation text, _user_id uuid, _accessed_fields text[] DEFAULT NULL::text[], _additional_context jsonb DEFAULT '{}'::jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN;
  END IF;
  INSERT INTO public.security_logs (
    user_id,
    action,
    details,
    severity,
    ip_address
  ) VALUES (
    auth.uid(),
    'sensitive_profile_access',
    jsonb_build_object(
      'operation', _operation,
      'target_user_id', _user_id,
      'accessed_fields', _accessed_fields,
      'timestamp', now(),
      'context', _additional_context
    ),
    CASE
      WHEN _operation IN ('SELECT', 'UPDATE') AND auth.uid() != _user_id THEN 'high'
      ELSE 'medium'
    END,
    inet_client_addr()
  );
END;
$function$;
