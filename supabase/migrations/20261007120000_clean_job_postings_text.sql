-- Remove the placeholder company that reached the production index (the archive trigger keeps a copy),
-- and tidy text that arrived HTML-escaped or with stray whitespace.
delete from public.job_postings where lower(trim(company)) in ('example corp', 'example company', 'example inc');

update public.job_postings
set title = btrim(regexp_replace(title, '\s+', ' ', 'g'))
where title is distinct from btrim(regexp_replace(title, '\s+', ' ', 'g'));

update public.job_postings
set description = replace(replace(replace(replace(replace(description, '&#13;', ''), '&#34;', '"'), '&mdash;', '-'), '&nbsp;', ' '), '&#39;', '''')
where description ~ '&#13;|&#34;|&mdash;|&nbsp;|&#39;';
