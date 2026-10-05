-- Some company career pages put the email address of whoever a link was first
-- generated for into the query string (comeet: pms_email=someone@gmail.com).
-- AYN stored those links as-is and showed them to every candidate. The sync
-- functions and the front end now strip them (cleanApplyUrl); this removes
-- the ones already stored, in both job_postings.apply_url and the copies
-- users saved in jobs.source_url.
--
-- Removes any pms_* parameter, and any parameter whose value looks like an
-- email address, leaving the rest of the URL untouched.
-- Idempotent: running it again changes nothing.

create or replace function pg_temp.strip_personal_url_params(u text) returns text
language sql immutable as $$
  select regexp_replace(
    regexp_replace(
      regexp_replace(
        regexp_replace(
          regexp_replace(
            u,
            '([?&])pms_[^=&#]*=[^&#]*', '\1', 'gi'),
          '([?&])[^=&#]*=[^&#%@/ ]+(%40|@)[^&#%@/ ]+\.[^&#%@/ ]+', '\1', 'g'),
        '\?&+', '?', 'g'),
      '&{2,}', '&', 'g'),
    '[?&]+(#|$)', '\1', 'g')
$$;

update public.job_postings
   set apply_url = pg_temp.strip_personal_url_params(apply_url)
 where apply_url ~* '[?&]pms_'
    or apply_url ~* '[?&][^=&#]*=[^&#%@/ ]+(%40|@)[^&#%@/ ]+\.[^&#%@/ ]+';

update public.jobs
   set source_url = pg_temp.strip_personal_url_params(source_url)
 where source_url ~* '[?&]pms_'
    or source_url ~* '[?&][^=&#]*=[^&#%@/ ]+(%40|@)[^&#%@/ ]+\.[^&#%@/ ]+';
