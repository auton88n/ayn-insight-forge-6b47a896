ALTER TABLE public.reveal_requests
  ADD COLUMN IF NOT EXISTS job_title text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS job_location text,
  ADD COLUMN IF NOT EXISTS employment_type text,
  ADD COLUMN IF NOT EXISTS salary_range text,
  ADD COLUMN IF NOT EXISTS job_url text,
  ADD COLUMN IF NOT EXISTS message text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS sent_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS responded_at timestamptz;

ALTER TABLE public.reveal_requests
  DROP CONSTRAINT IF EXISTS reveal_requests_message_len;
ALTER TABLE public.reveal_requests
  ADD CONSTRAINT reveal_requests_message_len CHECK (char_length(message) <= 1000);

ALTER TABLE public.reveal_requests
  DROP CONSTRAINT IF EXISTS reveal_requests_status_valid;
ALTER TABLE public.reveal_requests
  ADD CONSTRAINT reveal_requests_status_valid CHECK (status IN ('pending','approved','declined'));

-- One open (pending) proposal per org and candidate at a time.
CREATE UNIQUE INDEX IF NOT EXISTS reveal_requests_one_open_per_org_candidate
  ON public.reveal_requests (org_id, candidate_user_id)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS reveal_requests_candidate_sent_idx
  ON public.reveal_requests (candidate_user_id, sent_at DESC);

UPDATE public.reveal_requests SET responded_at = decided_at WHERE responded_at IS NULL AND decided_at IS NOT NULL;