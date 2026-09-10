-- Privacy Policy v2.3 reflects the live catalogue's four-region scope.
-- Keep the required versions in the database so the server, not only the
-- browser, refuses normal account actions until a current acceptance exists.
INSERT INTO public.system_config (key, value, updated_at)
VALUES (
  'legal_versions',
  '{"terms_version":"1.2","privacy_version":"2.3"}'::jsonb,
  now()
)
ON CONFLICT (key) DO UPDATE
SET value = EXCLUDED.value,
    updated_at = EXCLUDED.updated_at;
