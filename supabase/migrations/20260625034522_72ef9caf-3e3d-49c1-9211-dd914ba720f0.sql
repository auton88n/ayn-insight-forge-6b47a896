
-- =========================================================================
-- 1) Lock down SECURITY DEFINER functions in public schema
--    Revoke EXECUTE from PUBLIC, anon, authenticated. Re-grant authenticated
--    EXECUTE only on the curated list of functions that must be callable by
--    signed-in users (RLS helpers + RPC endpoints actually called from src/).
-- =========================================================================

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prosecdef = true
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %I.%I(%s) FROM PUBLIC, anon, authenticated',
                   r.nspname, r.proname, r.args);
  END LOOP;
END $$;

-- Re-grant EXECUTE to authenticated for functions used in RLS policies
-- (referenced inside policy expressions) and via supabase.rpc() from the app.
DO $$
DECLARE
  r record;
  whitelist text[] := ARRAY[
    'has_role',
    'has_duty_access',
    'admin_view_contact_with_logging',
    'admin_can_view_message_with_logging',
    'add_bonus_credits',
    'admin_unblock_user',
    'admin_upsert_system_config',
    'get_admin_contact_messages',
    'get_admin_custom_orders',
    'get_admin_llm_management',
    'get_admin_nda_agreements',
    'get_admin_notification_log',
    'get_admin_rate_limit_stats',
    'get_admin_support_tickets',
    'get_admin_system_config',
    'get_admin_system_monitoring',
    'get_admin_test_results_data',
    'get_admin_user_messages',
    'get_admin_users',
    'get_admin_visitor_analytics',
    'increment_faq_helpful',
    'increment_faq_view',
    'record_device_fingerprint'
  ];
BEGIN
  FOR r IN
    SELECT n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef = true
      AND p.proname = ANY(whitelist)
  LOOP
    EXECUTE format('GRANT EXECUTE ON FUNCTION %I.%I(%s) TO authenticated',
                   r.nspname, r.proname, r.args);
  END LOOP;
END $$;

-- =========================================================================
-- 2) Tighten public storage buckets: prevent anonymous listing while
--    keeping direct public-URL reads working (handled by bucket.public flag).
-- =========================================================================

-- avatars
DROP POLICY IF EXISTS "Anyone can view avatars" ON storage.objects;
CREATE POLICY "Authenticated can list avatars"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'avatars');

-- generated-images
DROP POLICY IF EXISTS "Public read for generated images 1yhuiye_0" ON storage.objects;
CREATE POLICY "Authenticated can list generated-images"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'generated-images');

-- documents
DROP POLICY IF EXISTS "Public read for documents" ON storage.objects;
CREATE POLICY "Authenticated can list documents"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'documents');

-- floor-plans
DROP POLICY IF EXISTS "Public can read floor plans" ON storage.objects;
CREATE POLICY "Authenticated can list floor-plans"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'floor-plans');

-- generated-files (two overlapping policies)
DROP POLICY IF EXISTS "Public read generated files" ON storage.objects;
DROP POLICY IF EXISTS "public read generated-files" ON storage.objects;
CREATE POLICY "Authenticated can list generated-files"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'generated-files');
