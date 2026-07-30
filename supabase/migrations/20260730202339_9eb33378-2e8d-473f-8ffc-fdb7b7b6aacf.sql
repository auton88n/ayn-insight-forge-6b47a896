ALTER TABLE public.orgs
  ADD COLUMN IF NOT EXISTS industry text,
  ADD COLUMN IF NOT EXISTS company_size text,
  ADD COLUMN IF NOT EXISTS headquarters text,
  ADD COLUMN IF NOT EXISTS about text,
  ADD COLUMN IF NOT EXISTS logo_url text,
  ADD COLUMN IF NOT EXISTS linkedin_url text;

CREATE OR REPLACE FUNCTION public.orgs_about_length_check()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.about IS NOT NULL AND char_length(NEW.about) > 600 THEN
    NEW.about := left(NEW.about, 600);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS orgs_about_length ON public.orgs;
CREATE TRIGGER orgs_about_length
  BEFORE INSERT OR UPDATE ON public.orgs
  FOR EACH ROW EXECUTE FUNCTION public.orgs_about_length_check();

CREATE TABLE IF NOT EXISTS public.employer_intake_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL UNIQUE,
  opening text NOT NULL DEFAULT '',
  job_spec jsonb NOT NULL DEFAULT '{}'::jsonb,
  answered text[] NOT NULL DEFAULT '{}'::text[],
  phase text NOT NULL DEFAULT 'opening',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.employer_intake_drafts TO authenticated;
GRANT ALL ON public.employer_intake_drafts TO service_role;

ALTER TABLE public.employer_intake_drafts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members manage their intake draft"
  ON public.employer_intake_drafts FOR ALL
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.org_members m
    WHERE m.org_id = employer_intake_drafts.org_id AND m.user_id = (select auth.uid())
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.org_members m
    WHERE m.org_id = employer_intake_drafts.org_id AND m.user_id = (select auth.uid())
  ));

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$
LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS employer_intake_drafts_updated_at ON public.employer_intake_drafts;
CREATE TRIGGER employer_intake_drafts_updated_at
  BEFORE UPDATE ON public.employer_intake_drafts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();