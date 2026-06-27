DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polrelid='public.user_profile_canonical'::regclass AND polname='upc_select_own') THEN
    EXECUTE 'CREATE POLICY upc_select_own ON public.user_profile_canonical FOR SELECT TO authenticated USING (auth.uid() = user_id)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polrelid='public.user_profile_canonical'::regclass AND polname='upc_insert_own') THEN
    EXECUTE 'CREATE POLICY upc_insert_own ON public.user_profile_canonical FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polrelid='public.user_profile_canonical'::regclass AND polname='upc_update_own') THEN
    EXECUTE 'CREATE POLICY upc_update_own ON public.user_profile_canonical FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id)';
  END IF;
END$$;

ALTER TABLE public.user_profile_canonical ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE ON public.user_profile_canonical TO authenticated;
GRANT ALL ON public.user_profile_canonical TO service_role;