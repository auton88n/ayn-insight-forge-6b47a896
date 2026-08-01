ALTER TABLE public.candidate_index ALTER COLUMN indexed_at DROP NOT NULL;
ALTER TABLE public.candidate_index ALTER COLUMN embedding_model DROP NOT NULL;