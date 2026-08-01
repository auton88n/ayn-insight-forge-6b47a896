-- 1. app_settings: drop the unrestricted public read policy
DROP POLICY IF EXISTS "public read app settings" ON public.app_settings;
DROP POLICY IF EXISTS "app_settings_auth_read_safe" ON public.app_settings;
REVOKE SELECT ON public.app_settings FROM anon;

-- 2. custom_orders: drop the anon status-only SELECT policy (signing goes through the sign-document edge function using service role + signing_token)
DROP POLICY IF EXISTS "Clients can view their orders" ON public.custom_orders;
REVOKE ALL ON public.custom_orders FROM anon;

-- 3. Revoke EXECUTE from anon on privileged SECURITY DEFINER functions
REVOKE EXECUTE ON FUNCTION public.admin_adjust_credits(uuid, integer, text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.admin_moderate_assessment(uuid, text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.admin_moderate_proposal(uuid, text, text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.admin_set_feature_flag(text, boolean) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.admin_set_pin(text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.admin_user_snapshot(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.billing_ensure(uuid, text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.credit_balance(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.credit_grant(uuid, integer, text, text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.credit_spend(uuid, integer, text, text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.get_admin_accounts(text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.get_admin_ai_usage() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.get_admin_email_audience() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.get_admin_feature_flags() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.get_admin_moderation(integer) FROM anon, public;

GRANT EXECUTE ON FUNCTION public.admin_adjust_credits(uuid, integer, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_moderate_assessment(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_moderate_proposal(uuid, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_set_feature_flag(text, boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_set_pin(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_user_snapshot(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.billing_ensure(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.credit_balance(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.credit_grant(uuid, integer, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.credit_spend(uuid, integer, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_admin_accounts(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_admin_ai_usage() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_admin_email_audience() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_admin_feature_flags() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_admin_moderation(integer) TO authenticated, service_role;