
-- ============================================================
-- RESUME HUB — Phase 1 schema
-- ============================================================

-- Application status enum
DO $$ BEGIN
  CREATE TYPE public.application_status AS ENUM ('saved','applied','interview','offer','rejected');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Reusable updated_at trigger (no-op if already exists)
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql SET search_path = public;

-- ============================================================
-- RESUMES
-- ============================================================
CREATE TABLE public.resumes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  title text NOT NULL DEFAULT 'My Resume',
  is_primary boolean NOT NULL DEFAULT false,
  content jsonb NOT NULL DEFAULT '{}'::jsonb,
  pdf_path text,
  ats_score int,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_resumes_user ON public.resumes(user_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.resumes TO authenticated;
GRANT ALL ON public.resumes TO service_role;
ALTER TABLE public.resumes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner full access" ON public.resumes FOR ALL
  USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);
CREATE TRIGGER trg_resumes_updated BEFORE UPDATE ON public.resumes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- RESUME VERSIONS (tailored variants)
-- ============================================================
CREATE TABLE public.resume_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  resume_id uuid NOT NULL,
  content jsonb NOT NULL,
  created_for_job_id uuid,
  pdf_path text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_resume_versions_user ON public.resume_versions(user_id);
CREATE INDEX idx_resume_versions_resume ON public.resume_versions(resume_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.resume_versions TO authenticated;
GRANT ALL ON public.resume_versions TO service_role;
ALTER TABLE public.resume_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner full access" ON public.resume_versions FOR ALL
  USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);

-- ============================================================
-- JOBS (per-user; jobs are saved into each user's private workspace)
-- ============================================================
CREATE TABLE public.jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  source text NOT NULL DEFAULT 'manual',
  source_url text,
  company text,
  title text,
  location text,
  remote boolean,
  salary_min int,
  salary_max int,
  salary_currency text,
  jd_text text,
  jd_html text,
  posted_at timestamptz,
  captured_at timestamptz NOT NULL DEFAULT now(),
  dedupe_hash text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_jobs_user ON public.jobs(user_id);
CREATE UNIQUE INDEX idx_jobs_user_dedupe ON public.jobs(user_id, dedupe_hash) WHERE dedupe_hash IS NOT NULL;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.jobs TO authenticated;
GRANT ALL ON public.jobs TO service_role;
ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner full access" ON public.jobs FOR ALL
  USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);
CREATE TRIGGER trg_jobs_updated BEFORE UPDATE ON public.jobs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- JOB MATCHES (score of a resume vs a job)
-- ============================================================
CREATE TABLE public.job_matches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  job_id uuid NOT NULL,
  resume_id uuid NOT NULL,
  score int NOT NULL,
  breakdown jsonb NOT NULL DEFAULT '{}'::jsonb,
  generated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_job_matches_user ON public.job_matches(user_id);
CREATE INDEX idx_job_matches_job ON public.job_matches(job_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.job_matches TO authenticated;
GRANT ALL ON public.job_matches TO service_role;
ALTER TABLE public.job_matches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner full access" ON public.job_matches FOR ALL
  USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);

-- ============================================================
-- APPLICATIONS (tracker)
-- ============================================================
CREATE TABLE public.applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  job_id uuid NOT NULL,
  resume_version_id uuid,
  status public.application_status NOT NULL DEFAULT 'saved',
  notes text,
  applied_at timestamptz,
  follow_up_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_applications_user ON public.applications(user_id);
CREATE INDEX idx_applications_status ON public.applications(user_id, status);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.applications TO authenticated;
GRANT ALL ON public.applications TO service_role;
ALTER TABLE public.applications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner full access" ON public.applications FOR ALL
  USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);
CREATE TRIGGER trg_applications_updated BEFORE UPDATE ON public.applications
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- COVER LETTERS
-- ============================================================
CREATE TABLE public.cover_letters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  job_id uuid NOT NULL,
  resume_id uuid,
  body text NOT NULL,
  tone text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_cover_letters_user ON public.cover_letters(user_id);
CREATE INDEX idx_cover_letters_job ON public.cover_letters(job_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cover_letters TO authenticated;
GRANT ALL ON public.cover_letters TO service_role;
ALTER TABLE public.cover_letters ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner full access" ON public.cover_letters FOR ALL
  USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);

-- ============================================================
-- USER PROFILE DATA (powers Chrome extension autofill)
-- ============================================================
CREATE TABLE public.user_profile_data (
  user_id uuid PRIMARY KEY,
  legal_first_name text,
  legal_last_name text,
  preferred_name text,
  email text,
  phone text,
  address jsonb DEFAULT '{}'::jsonb,
  work_auth jsonb DEFAULT '{}'::jsonb,
  links jsonb DEFAULT '{}'::jsonb,
  demographics jsonb DEFAULT '{}'::jsonb,
  default_answers jsonb DEFAULT '{}'::jsonb,
  primary_resume_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_profile_data TO authenticated;
GRANT ALL ON public.user_profile_data TO service_role;
ALTER TABLE public.user_profile_data ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner full access" ON public.user_profile_data FOR ALL
  USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);
CREATE TRIGGER trg_upd_updated BEFORE UPDATE ON public.user_profile_data
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- EXTENSION TOKENS (per-device auth for the Chrome extension)
-- ============================================================
CREATE TABLE public.extension_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  token_hash text NOT NULL UNIQUE,
  token_prefix text NOT NULL,
  device_label text,
  last_used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_extension_tokens_user ON public.extension_tokens(user_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.extension_tokens TO authenticated;
GRANT ALL ON public.extension_tokens TO service_role;
ALTER TABLE public.extension_tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner full access" ON public.extension_tokens FOR ALL
  USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);

-- ============================================================
-- SUPPORT ADMIN READS (audit of admin support-ticket reads)
-- ============================================================
CREATE TABLE public.support_admin_reads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id uuid NOT NULL,
  user_id uuid NOT NULL,
  table_name text NOT NULL,
  row_id uuid,
  ticket_id uuid,
  read_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_sar_admin ON public.support_admin_reads(admin_id);
CREATE INDEX idx_sar_user ON public.support_admin_reads(user_id);
GRANT SELECT, INSERT ON public.support_admin_reads TO authenticated;
GRANT ALL ON public.support_admin_reads TO service_role;
ALTER TABLE public.support_admin_reads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin can insert and read own audit rows" ON public.support_admin_reads
  FOR ALL TO authenticated
  USING (public.has_role((select auth.uid()), 'admin'::public.app_role))
  WITH CHECK (public.has_role((select auth.uid()), 'admin'::public.app_role) AND admin_id = (select auth.uid()));
