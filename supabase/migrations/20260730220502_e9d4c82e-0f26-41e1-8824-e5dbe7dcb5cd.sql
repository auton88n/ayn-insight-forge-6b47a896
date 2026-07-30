REVOKE ALL ON public.assessments FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.assessments FROM authenticated;
GRANT SELECT ON public.assessments TO authenticated;
GRANT ALL ON public.assessments TO service_role;