
CREATE TABLE public.user_profile_canonical (
  user_id uuid PRIMARY KEY,
  skills jsonb NOT NULL DEFAULT '[]'::jsonb,
  experiences jsonb NOT NULL DEFAULT '[]'::jsonb,
  education jsonb NOT NULL DEFAULT '[]'::jsonb,
  certifications jsonb NOT NULL DEFAULT '[]'::jsonb,
  work_auth jsonb NOT NULL DEFAULT '{}'::jsonb,
  preferences jsonb NOT NULL DEFAULT '{}'::jsonb,
  derived jsonb NOT NULL DEFAULT '{}'::jsonb,
  source_resume_id uuid,
  extracted_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_profile_canonical TO authenticated;
GRANT ALL ON public.user_profile_canonical TO service_role;

ALTER TABLE public.user_profile_canonical ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user can read own canonical profile"
  ON public.user_profile_canonical FOR SELECT
  USING ((select auth.uid()) = user_id);

CREATE POLICY "user can insert own canonical profile"
  ON public.user_profile_canonical FOR INSERT
  WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY "user can update own canonical profile"
  ON public.user_profile_canonical FOR UPDATE
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY "user can delete own canonical profile"
  ON public.user_profile_canonical FOR DELETE
  USING ((select auth.uid()) = user_id);

CREATE OR REPLACE FUNCTION public.touch_user_profile_canonical()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_touch_user_profile_canonical
  BEFORE UPDATE ON public.user_profile_canonical
  FOR EACH ROW EXECUTE FUNCTION public.touch_user_profile_canonical();
