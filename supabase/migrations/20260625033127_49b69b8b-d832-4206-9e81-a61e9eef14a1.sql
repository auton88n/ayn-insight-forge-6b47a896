
CREATE POLICY "resumes owner read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'resumes' AND (storage.foldername(name))[1] = (select auth.uid())::text);
CREATE POLICY "resumes owner insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'resumes' AND (storage.foldername(name))[1] = (select auth.uid())::text);
CREATE POLICY "resumes owner update" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'resumes' AND (storage.foldername(name))[1] = (select auth.uid())::text);
CREATE POLICY "resumes owner delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'resumes' AND (storage.foldername(name))[1] = (select auth.uid())::text);
