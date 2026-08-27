-- v3.265.0 — the auto-apply answer bank. A flexible, user-authored store
-- for the class of job-application screening question that has no "closest
-- answer based on the resume": desired salary, work authorization, licenses,
-- non-compete status, and similar. Nothing here is ever AI-generated — every
-- value is typed by the user themselves in Profile and reused verbatim by
-- the autofill matcher, the same way work_auth/preferences already work.
alter table public.user_profile_canonical
  add column if not exists screening_answers jsonb not null default '{}'::jsonb;

comment on column public.user_profile_canonical.screening_answers is
  'Free-text answers to common application screening questions the user typed themselves (non-compete status, referral default, etc.) — copied verbatim by autofill, never inferred by AI.';
