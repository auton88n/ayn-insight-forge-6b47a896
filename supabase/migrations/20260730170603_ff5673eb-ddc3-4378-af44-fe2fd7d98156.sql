ALTER TABLE public.candidate_skills
  ADD COLUMN IF NOT EXISTS level text,
  ADD COLUMN IF NOT EXISTS years numeric,
  ADD COLUMN IF NOT EXISTS last_used text;