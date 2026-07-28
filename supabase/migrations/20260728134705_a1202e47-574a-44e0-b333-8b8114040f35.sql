ALTER TABLE public.ext_answers ADD COLUMN IF NOT EXISTS field_kind text;
ALTER TABLE public.autofill_runs
  ADD COLUMN IF NOT EXISTS memory_exact_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS memory_fuzzy_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ai_resolved_count  integer NOT NULL DEFAULT 0;