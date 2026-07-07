
-- Part 1: track retry/failure classification on autofill_runs
ALTER TABLE public.autofill_runs
  ADD COLUMN IF NOT EXISTS retry_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS failure_classes jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS resolved_by jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Part 2: extension answer memory (learned answers across forms/ATSes)
CREATE TABLE IF NOT EXISTS public.ext_answer_memory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  question_signature text NOT NULL,
  canonical_label text NOT NULL,
  semantic_type text NOT NULL DEFAULT 'unknown',
  question_kind text NOT NULL DEFAULT 'text',
  answer_value text,
  answer_option_label text,
  answer_option_labels jsonb,
  ats_hint text,
  times_used integer NOT NULL DEFAULT 1,
  verified_ok_count integer NOT NULL DEFAULT 0,
  verified_fail_count integer NOT NULL DEFAULT 0,
  last_used_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, question_signature)
);

CREATE INDEX IF NOT EXISTS ext_answer_memory_user_sig_idx
  ON public.ext_answer_memory (user_id, question_signature);
CREATE INDEX IF NOT EXISTS ext_answer_memory_user_type_idx
  ON public.ext_answer_memory (user_id, semantic_type);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ext_answer_memory TO authenticated;
GRANT ALL ON public.ext_answer_memory TO service_role;

ALTER TABLE public.ext_answer_memory ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ext_answer_memory owner read"
  ON public.ext_answer_memory FOR SELECT TO authenticated
  USING ((select auth.uid()) = user_id);
CREATE POLICY "ext_answer_memory owner insert"
  ON public.ext_answer_memory FOR INSERT TO authenticated
  WITH CHECK ((select auth.uid()) = user_id);
CREATE POLICY "ext_answer_memory owner update"
  ON public.ext_answer_memory FOR UPDATE TO authenticated
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);
CREATE POLICY "ext_answer_memory owner delete"
  ON public.ext_answer_memory FOR DELETE TO authenticated
  USING ((select auth.uid()) = user_id);

CREATE OR REPLACE FUNCTION public.ext_answer_memory_touch()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS ext_answer_memory_touch_trg ON public.ext_answer_memory;
CREATE TRIGGER ext_answer_memory_touch_trg
  BEFORE UPDATE ON public.ext_answer_memory
  FOR EACH ROW EXECUTE FUNCTION public.ext_answer_memory_touch();
