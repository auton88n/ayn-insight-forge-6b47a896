-- resumes.ats_score already existed, unused until the resume optimizer
-- (v3.64.0). This adds the sibling column for the free diagnosis's specific
-- issue list, cached alongside the score so the tailoring flow can show a
-- warning without paying for another AI call every time a job is opened.
alter table public.resumes add column if not exists ats_issues jsonb;
