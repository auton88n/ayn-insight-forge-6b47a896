
-- Phase 2: server-side full-JD cache.
-- One row per normalized URL hash. Written and read ONLY by the resume-hub
-- edge function via service role. No user-facing access, so RLS is enabled
-- with no policies; service role bypasses RLS.

CREATE TABLE IF NOT EXISTS public.job_cache (
  url_hash    text PRIMARY KEY,
  url         text,
  title       text,
  company     text,
  full_jd     text NOT NULL,
  parsed      jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL DEFAULT (now() + interval '24 hours')
);

CREATE INDEX IF NOT EXISTS job_cache_expires_at_idx ON public.job_cache (expires_at);

-- Service role only. No grants to anon/authenticated.
GRANT ALL ON public.job_cache TO service_role;

ALTER TABLE public.job_cache ENABLE ROW LEVEL SECURITY;

-- Intentionally no policies: only service role (which bypasses RLS) can touch this table.
