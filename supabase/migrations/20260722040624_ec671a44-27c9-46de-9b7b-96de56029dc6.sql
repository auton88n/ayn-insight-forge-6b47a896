ALTER TABLE public.candidate_index
  ADD COLUMN IF NOT EXISTS embedding_model text NOT NULL DEFAULT 'deterministic-v1',
  ADD COLUMN IF NOT EXISTS embedded_at timestamptz DEFAULT now();