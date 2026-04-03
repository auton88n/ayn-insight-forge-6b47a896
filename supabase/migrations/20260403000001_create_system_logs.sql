-- AYN v2 Phase 1: System Logs Table
-- Centralised request logging for Gateway + AI Router

CREATE TABLE IF NOT EXISTS public.system_logs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id    TEXT NOT NULL,
  user_id       UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  endpoint      TEXT NOT NULL,
  intent        TEXT,
  status        TEXT NOT NULL DEFAULT 'pending',  -- pending | success | error | rate_limited
  latency_ms    INTEGER,
  error         TEXT,
  metadata      JSONB DEFAULT '{}',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for dashboard queries
CREATE INDEX IF NOT EXISTS idx_system_logs_user_id      ON public.system_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_system_logs_created_at   ON public.system_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_system_logs_endpoint     ON public.system_logs(endpoint);
CREATE INDEX IF NOT EXISTS idx_system_logs_status       ON public.system_logs(status);
CREATE INDEX IF NOT EXISTS idx_system_logs_request_id   ON public.system_logs(request_id);

-- RLS: only service role can write; admins can read all; users can read own
ALTER TABLE public.system_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access" ON public.system_logs
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Users read own logs" ON public.system_logs
  FOR SELECT USING (auth.uid() = user_id);

-- Auto-purge logs older than 30 days (keep table lean)
-- Run manually or via pg_cron if available:
-- DELETE FROM public.system_logs WHERE created_at < now() - INTERVAL '30 days';

COMMENT ON TABLE public.system_logs IS 'AYN v2 — Gateway and Router request logs. Source of truth for latency, errors, and intent distribution.';
