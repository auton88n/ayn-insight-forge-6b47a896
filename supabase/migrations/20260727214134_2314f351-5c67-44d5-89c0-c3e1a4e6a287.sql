ALTER TABLE public.autofill_runs
  ADD COLUMN IF NOT EXISTS human_typing_used boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS human_typed_count integer NOT NULL DEFAULT 0;