
CREATE TABLE public.autofill_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  user_id uuid,
  url text,
  ats text,
  company text,
  job_title text,
  ext_version text,
  fields_total int,
  ai_answered int,
  filled int,
  failed int,
  fields_scanned jsonb,
  ai_values jsonb,
  skipped jsonb,
  inject_results jsonb,
  meta jsonb
);
GRANT ALL ON public.autofill_runs TO service_role;
ALTER TABLE public.autofill_runs ENABLE ROW LEVEL SECURITY;
CREATE INDEX autofill_runs_created_at_idx ON public.autofill_runs (created_at DESC);
CREATE INDEX autofill_runs_url_idx ON public.autofill_runs (url);
