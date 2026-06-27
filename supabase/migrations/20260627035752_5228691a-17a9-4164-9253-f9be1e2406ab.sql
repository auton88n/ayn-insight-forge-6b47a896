-- 1. Deduplicate existing rows: keep the most recently updated per (user_id, job_url)
WITH ranked AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY user_id, job_url
           ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST, id DESC
         ) AS rn
  FROM public.job_applications
  WHERE job_url IS NOT NULL
)
DELETE FROM public.job_applications ja
USING ranked r
WHERE ja.id = r.id AND r.rn > 1;

-- 2. Add the unique constraint expected by the ext_save_application upsert
ALTER TABLE public.job_applications
  ADD CONSTRAINT job_applications_user_url_key UNIQUE (user_id, job_url);