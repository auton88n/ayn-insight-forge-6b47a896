
-- Convert to SECURITY INVOKER so the linter is happy and re-grant EXECUTE
ALTER FUNCTION public.increment_faq_view(uuid) SECURITY INVOKER;
ALTER FUNCTION public.increment_faq_helpful(uuid) SECURITY INVOKER;
ALTER FUNCTION public.record_device_fingerprint(uuid, text, jsonb) SECURITY INVOKER;

GRANT EXECUTE ON FUNCTION public.increment_faq_view(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.increment_faq_helpful(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_device_fingerprint(uuid, text, jsonb) TO authenticated;
