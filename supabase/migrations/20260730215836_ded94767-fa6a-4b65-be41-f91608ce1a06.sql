-- v3.13.0 verification assessments
CREATE TABLE public.assessments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL,
  candidate_user_id UUID NOT NULL,
  search_id UUID,
  candidate_ref TEXT,
  job_title TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  questions JSONB NOT NULL DEFAULT '[]'::jsonb,
  answers JSONB NOT NULL DEFAULT '{}'::jsonb,
  time_limit_seconds INTEGER NOT NULL DEFAULT 1800,
  started_at TIMESTAMPTZ,
  submitted_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_assessments_candidate ON public.assessments(candidate_user_id, status);
CREATE INDEX idx_assessments_org ON public.assessments(org_id, created_at DESC);

GRANT SELECT ON public.assessments TO authenticated;
GRANT ALL ON public.assessments TO service_role;
ALTER TABLE public.assessments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Candidates read their own sent assessments"
ON public.assessments FOR SELECT TO authenticated
USING (candidate_user_id = (select auth.uid()) AND status <> 'draft');

CREATE POLICY "Org members read their org assessments"
ON public.assessments FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.org_members m
  WHERE m.org_id = assessments.org_id AND m.user_id = (select auth.uid())
));

-- Private grading guidance. No grants to anon or authenticated at all:
-- the rubric is physically outside every lane the candidate can query.
CREATE TABLE public.assessment_rubrics (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  assessment_id UUID NOT NULL,
  question_id TEXT NOT NULL,
  rubric TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (assessment_id, question_id)
);
CREATE INDEX idx_assessment_rubrics_assessment ON public.assessment_rubrics(assessment_id);
REVOKE ALL ON public.assessment_rubrics FROM anon, authenticated;
GRANT ALL ON public.assessment_rubrics TO service_role;
ALTER TABLE public.assessment_rubrics ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.assessment_results (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  assessment_id UUID NOT NULL UNIQUE,
  overall_score INTEGER NOT NULL DEFAULT 0,
  verification_verdict TEXT NOT NULL DEFAULT 'partly consistent',
  per_question JSONB NOT NULL DEFAULT '[]'::jsonb,
  strengths JSONB NOT NULL DEFAULT '[]'::jsonb,
  concerns JSONB NOT NULL DEFAULT '[]'::jsonb,
  employer_summary TEXT,
  seeker_growth_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_assessment_results_assessment ON public.assessment_results(assessment_id);
REVOKE ALL ON public.assessment_results FROM anon, authenticated;
GRANT ALL ON public.assessment_results TO service_role;
ALTER TABLE public.assessment_results ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER update_assessments_updated_at
BEFORE UPDATE ON public.assessments
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();