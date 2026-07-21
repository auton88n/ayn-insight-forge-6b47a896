
-- Workstream A1: link job_applications to jobs
ALTER TABLE public.job_applications ADD COLUMN IF NOT EXISTS job_id uuid;
CREATE INDEX IF NOT EXISTS idx_job_applications_job ON public.job_applications(job_id);

-- Backfill from legacy applications table (only where a matching job exists).
INSERT INTO public.job_applications (
  user_id, job_id, job_title, company, job_url, status, notes,
  applied_at, created_at, updated_at
)
SELECT
  a.user_id, a.job_id, j.title, j.company,
  COALESCE(j.source_url, ''), a.status::text, a.notes,
  a.applied_at, a.created_at, a.updated_at
FROM public.applications a
JOIN public.jobs j ON j.id = a.job_id
ON CONFLICT (user_id, job_url) DO NOTHING;

-- Workstream E1: let users read their own autofill telemetry.
GRANT SELECT ON public.autofill_runs TO authenticated;
CREATE POLICY "autofill_runs_select_own"
  ON public.autofill_runs
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);
