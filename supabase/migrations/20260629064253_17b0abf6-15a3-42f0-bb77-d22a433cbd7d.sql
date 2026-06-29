
-- 1. app_settings: block anon, hide admin_pin_hash from non-admins
DROP POLICY IF EXISTS app_settings_public_read ON public.app_settings;
DROP POLICY IF EXISTS "Authenticated users can read app settings" ON public.app_settings;
CREATE POLICY app_settings_auth_read_safe ON public.app_settings
  FOR SELECT TO authenticated
  USING (key NOT IN ('admin_pin_hash'));
CREATE POLICY app_settings_admin_read_all ON public.app_settings
  FOR SELECT TO authenticated
  USING (public.has_role((select auth.uid()), 'admin'));
REVOKE SELECT ON public.app_settings FROM anon;

-- 2. system_config: admins only
DROP POLICY IF EXISTS "Authenticated users can read system config" ON public.system_config;
CREATE POLICY system_config_admin_read ON public.system_config
  FOR SELECT TO authenticated
  USING (public.has_role((select auth.uid()), 'admin'));

-- 3. custom_orders: remove anon public read + anon update via token
DROP POLICY IF EXISTS "public can read order by signing token" ON public.custom_orders;
DROP POLICY IF EXISTS "client can sign via token" ON public.custom_orders;
REVOKE SELECT, UPDATE ON public.custom_orders FROM anon;

-- 4. nda_agreements: same
DROP POLICY IF EXISTS "Public can read NDA by signing token" ON public.nda_agreements;
DROP POLICY IF EXISTS "Client can sign NDA via token" ON public.nda_agreements;
REVOKE SELECT, UPDATE ON public.nda_agreements FROM anon;

-- 5. ayn_sales_pipeline: ensure no anon access (defensive)
REVOKE ALL ON public.ayn_sales_pipeline FROM anon;

-- 6. Storage: floor-plans owner check on INSERT
DROP POLICY IF EXISTS "Authenticated users can upload floor plans" ON storage.objects;
CREATE POLICY "Authenticated users can upload floor plans" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'floor-plans'
    AND (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- 7. Storage: remove anon signature uploads; allow only authenticated users
DROP POLICY IF EXISTS "anon can upload signatures" ON storage.objects;
CREATE POLICY "auth can upload signatures" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'generated-files'
    AND name LIKE 'signatures/%'
  );

-- 8. Storage: explicit SELECT policies for documents & generated-images (still public via policy)
DROP POLICY IF EXISTS "Public can read documents" ON storage.objects;
CREATE POLICY "Public can read documents" ON storage.objects
  FOR SELECT TO anon, authenticated
  USING (bucket_id = 'documents');

DROP POLICY IF EXISTS "Public can read generated images" ON storage.objects;
CREATE POLICY "Public can read generated images" ON storage.objects
  FOR SELECT TO anon, authenticated
  USING (bucket_id = 'generated-images');

-- generated-files is now private (set via storage_update_bucket); read via signed URLs from edge functions
DROP POLICY IF EXISTS "Authenticated can read own generated files" ON storage.objects;
CREATE POLICY "Authenticated can read own generated files" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'generated-files'
    AND (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- 9. Revoke EXECUTE on non-essential SECURITY DEFINER RPCs from authenticated
REVOKE EXECUTE ON FUNCTION public.increment_faq_helpful FROM authenticated, anon, public;
REVOKE EXECUTE ON FUNCTION public.increment_faq_view FROM authenticated, anon, public;
REVOKE EXECUTE ON FUNCTION public.record_device_fingerprint FROM authenticated, anon, public;
