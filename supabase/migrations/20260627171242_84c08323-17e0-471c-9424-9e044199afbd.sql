
ALTER TABLE public.job_applications ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='job_applications' AND policyname='ja_select_own') THEN
    CREATE POLICY ja_select_own ON public.job_applications FOR SELECT TO authenticated USING ((select auth.uid()) = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='job_applications' AND policyname='ja_insert_own') THEN
    CREATE POLICY ja_insert_own ON public.job_applications FOR INSERT TO authenticated WITH CHECK ((select auth.uid()) = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='job_applications' AND policyname='ja_update_own') THEN
    CREATE POLICY ja_update_own ON public.job_applications FOR UPDATE TO authenticated USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='job_applications' AND policyname='ja_delete_own') THEN
    CREATE POLICY ja_delete_own ON public.job_applications FOR DELETE TO authenticated USING ((select auth.uid()) = user_id);
  END IF;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.job_applications TO authenticated;
GRANT ALL ON public.job_applications TO service_role;
