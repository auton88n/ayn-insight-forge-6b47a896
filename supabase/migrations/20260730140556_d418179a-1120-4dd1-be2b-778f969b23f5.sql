CREATE TABLE public.ai_result_cache (
  cache_key text PRIMARY KEY,
  user_id uuid,
  purpose text NOT NULL,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);
CREATE INDEX idx_ai_result_cache_expires ON public.ai_result_cache (expires_at);
GRANT ALL ON public.ai_result_cache TO service_role;
ALTER TABLE public.ai_result_cache ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can read their own cached results"
  ON public.ai_result_cache FOR SELECT TO authenticated
  USING (user_id = (select auth.uid()));

CREATE TABLE public.ai_call_telemetry (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  purpose text NOT NULL,
  model text,
  duration_ms integer,
  cache_hit boolean NOT NULL DEFAULT false,
  source_map jsonb,
  gap_matched integer,
  gap_missing integer,
  gap_surfaced integer,
  meta jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_ai_call_telemetry_created ON public.ai_call_telemetry (created_at DESC);
CREATE INDEX idx_ai_call_telemetry_user ON public.ai_call_telemetry (user_id, created_at DESC);
GRANT ALL ON public.ai_call_telemetry TO service_role;
GRANT SELECT ON public.ai_call_telemetry TO authenticated;
ALTER TABLE public.ai_call_telemetry ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can read their own AI telemetry"
  ON public.ai_call_telemetry FOR SELECT TO authenticated
  USING (user_id = (select auth.uid()));
CREATE POLICY "Admins can read all AI telemetry"
  ON public.ai_call_telemetry FOR SELECT TO authenticated
  USING (public.has_role((select auth.uid()), 'admin'::public.app_role));