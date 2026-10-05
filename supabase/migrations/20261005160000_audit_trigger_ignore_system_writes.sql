-- The profiles audit trigger logged every account creation and deletion done by the backend
-- itself (no signed-in person), which produced about 32,000 rows of noise and buried the real
-- events. It now only records changes made by a signed-in person.
CREATE OR REPLACE FUNCTION public.audit_sensitive_data_access()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  PERFORM log_security_event(
    'sensitive_data_access',
    jsonb_build_object(
      'table_name', TG_TABLE_NAME,
      'operation', TG_OP,
      'user_id', auth.uid(),
      'target_user_id', COALESCE(NEW.user_id, OLD.user_id),
      'accessed_columns', TG_OP,
      'timestamp', now(),
      'ip_address', inet_client_addr()
    ),
    'medium'
  );
  RETURN COALESCE(NEW, OLD);
END;
$function$;
