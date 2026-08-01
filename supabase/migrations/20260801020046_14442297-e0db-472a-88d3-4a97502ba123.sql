ALTER TABLE public.reveal_requests DROP CONSTRAINT reveal_requests_candidate_user_id_fkey;
ALTER TABLE public.reveal_requests ALTER COLUMN candidate_user_id DROP NOT NULL;
ALTER TABLE public.reveal_requests
  ADD CONSTRAINT reveal_requests_candidate_user_id_fkey
  FOREIGN KEY (candidate_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;