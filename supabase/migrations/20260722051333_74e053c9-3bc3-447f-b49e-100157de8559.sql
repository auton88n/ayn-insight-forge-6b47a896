
-- v2.10.0 Two-role platform: job seekers vs employers

-- 1. Role enum + column on profiles
DO $$ BEGIN
  CREATE TYPE public.user_role AS ENUM ('job_seeker', 'employer');
EXCEPTION WHEN duplicate_object THEN null; END $$;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS role public.user_role NOT NULL DEFAULT 'job_seeker';

CREATE INDEX IF NOT EXISTS idx_profiles_role ON public.profiles(role);

-- 2. Employer accounts table
DO $$ BEGIN
  CREATE TYPE public.employer_status AS ENUM ('pending_approval', 'approved', 'suspended');
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS public.employer_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  company_name text NOT NULL,
  company_size text,
  hiring_need text,
  phone text,
  status public.employer_status NOT NULL DEFAULT 'pending_approval',
  approved_at timestamptz,
  approved_by uuid,
  package_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.employer_accounts TO authenticated;
GRANT ALL ON public.employer_accounts TO service_role;

ALTER TABLE public.employer_accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "employer reads own account" ON public.employer_accounts;
CREATE POLICY "employer reads own account"
  ON public.employer_accounts FOR SELECT
  TO authenticated
  USING ((select auth.uid()) = user_id OR public.has_role((select auth.uid()), 'admin'));

DROP POLICY IF EXISTS "employer inserts own account" ON public.employer_accounts;
CREATE POLICY "employer inserts own account"
  ON public.employer_accounts FOR INSERT
  TO authenticated
  WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "employer updates own account non-status" ON public.employer_accounts;
CREATE POLICY "employer updates own account non-status"
  ON public.employer_accounts FOR UPDATE
  TO authenticated
  USING ((select auth.uid()) = user_id OR public.has_role((select auth.uid()), 'admin'))
  WITH CHECK ((select auth.uid()) = user_id OR public.has_role((select auth.uid()), 'admin'));

CREATE INDEX IF NOT EXISTS idx_employer_accounts_status ON public.employer_accounts(status);

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.tg_employer_accounts_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS trg_employer_accounts_updated_at ON public.employer_accounts;
CREATE TRIGGER trg_employer_accounts_updated_at
  BEFORE UPDATE ON public.employer_accounts
  FOR EACH ROW EXECUTE FUNCTION public.tg_employer_accounts_updated_at();
