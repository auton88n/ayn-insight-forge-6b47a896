
-- 1) Drop broad SELECT (list) policies on public buckets
DROP POLICY IF EXISTS "Authenticated can list avatars" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated can list generated-images" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated can list documents" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated can list floor-plans" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated can list generated-files" ON storage.objects;

-- 2) Revoke EXECUTE from authenticated on admin-only SECURITY DEFINER functions
REVOKE EXECUTE ON FUNCTION public.add_bonus_credits(uuid, integer, text, text, uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_can_view_message_with_logging(uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_unblock_user(uuid, text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_upsert_system_config(text, jsonb) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_view_contact_with_logging() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.get_admin_contact_messages(integer) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.get_admin_custom_orders() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.get_admin_llm_management() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.get_admin_nda_agreements() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.get_admin_notification_log() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.get_admin_rate_limit_stats() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.get_admin_support_tickets(integer, integer) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.get_admin_system_config() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.get_admin_system_monitoring() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.get_admin_test_results_data() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.get_admin_user_messages(uuid, integer) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.get_admin_users() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.get_admin_visitor_analytics(integer) FROM authenticated;
