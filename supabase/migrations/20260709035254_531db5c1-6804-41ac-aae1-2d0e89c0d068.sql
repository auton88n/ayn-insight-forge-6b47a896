DROP POLICY IF EXISTS "Service role can upload" ON storage.objects;
CREATE POLICY "Service role can upload generated-images"
ON storage.objects
FOR INSERT
TO public
WITH CHECK (bucket_id = 'generated-images' AND auth.role() = 'service_role');