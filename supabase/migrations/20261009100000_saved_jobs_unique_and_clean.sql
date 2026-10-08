-- 1. A saved job can only exist once per person. A double click on the save button used to be able
-- to create two rows for the same posting. Where a duplicate already exists, keep the row with the
-- most work attached (cover letters, tailored resumes, skills to learn), then the oldest.
create temp table _drop_jobs on commit drop as
with d as (
  select j.id, j.user_id, j.source_url, j.created_at,
         (select count(*) from public.cover_letters c where c.job_id = j.id)
       + (select count(*) from public.resume_versions v where v.created_for_job_id = j.id)
       + (select count(*) from public.skills_to_learn s where s.job_id = j.id) as deps
    from public.jobs j
   where j.source_url is not null
), r as (
  select id, row_number() over (partition by user_id, source_url order by deps desc, created_at asc, id) as rn from d
)
select id from r where rn > 1;

delete from public.job_matches where job_id in (select id from _drop_jobs);
delete from public.cover_letters where job_id in (select id from _drop_jobs);
delete from public.skills_to_learn where job_id in (select id from _drop_jobs);
update public.resume_versions set created_for_job_id = null where created_for_job_id in (select id from _drop_jobs);
delete from public.jobs where id in (select id from _drop_jobs);

create unique index if not exists jobs_user_source_url_key
  on public.jobs (user_id, source_url) where source_url is not null;

-- 2. Saved copies of job text kept a few raw HTML entities from the moment they were saved.
update public.jobs
   set jd_text = replace(replace(replace(replace(replace(jd_text, '&#13;', ''), '&#34;', '"'), '&#39;', ''''), '&quot;', '"'), '&amp;', '&')
 where jd_text ~ '&(#13|#34|#39|quot|amp);';
