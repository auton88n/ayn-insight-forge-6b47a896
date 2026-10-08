-- 1. A log of when a company edits a posting it already has live (title, place, pay, description).
create table if not exists public.job_posting_changes (
  id bigserial primary key,
  job_posting_id uuid not null,
  company_slug text,
  title text,
  field text not null check (field in ('title', 'location', 'salary', 'description')),
  old_value text,
  new_value text,
  changed_at timestamptz not null default now()
);
alter table public.job_posting_changes enable row level security;   -- no policies: service role and admin RPC only
revoke all on public.job_posting_changes from anon, authenticated;
create index if not exists job_posting_changes_company_idx on public.job_posting_changes (company_slug, changed_at desc);
create index if not exists job_posting_changes_job_idx on public.job_posting_changes (job_posting_id);

create or replace function public.job_postings_log_changes() returns trigger as $$
declare
  old_norm text; new_norm text;
begin
  -- A handover between two feeds for the same job is not the company editing it.
  if old.source is distinct from new.source then
    return new;
  end if;
  if old.title is distinct from new.title and new.title is not null then
    insert into public.job_posting_changes (job_posting_id, company_slug, title, field, old_value, new_value)
    values (new.id, new.company_slug, new.title, 'title', left(old.title, 300), left(new.title, 300));
  end if;
  if coalesce(old.location, '') is distinct from coalesce(new.location, '') and new.location is not null then
    insert into public.job_posting_changes (job_posting_id, company_slug, title, field, old_value, new_value)
    values (new.id, new.company_slug, new.title, 'location', left(old.location, 300), left(new.location, 300));
  end if;
  if (old.salary_min, old.salary_max) is distinct from (new.salary_min, new.salary_max) and (new.salary_min is not null or new.salary_max is not null) then
    insert into public.job_posting_changes (job_posting_id, company_slug, title, field, old_value, new_value)
    values (new.id, new.company_slug, new.title, 'salary',
            concat_ws(' to ', old.salary_min::text, old.salary_max::text),
            concat_ws(' to ', new.salary_min::text, new.salary_max::text));
  end if;
  -- Description: compared with spacing and case ignored, so a re-formatted copy of the same text is not an edit.
  if new.description is not null and length(new.description) >= 40 and old.description is distinct from new.description then
    old_norm := regexp_replace(lower(coalesce(old.description, '')), '\s+', ' ', 'g');
    new_norm := regexp_replace(lower(new.description), '\s+', ' ', 'g');
    if old_norm <> new_norm then
      insert into public.job_posting_changes (job_posting_id, company_slug, title, field, old_value, new_value)
      values (new.id, new.company_slug, new.title, 'description',
              length(old.description)::text || ' characters', length(new.description)::text || ' characters');
    end if;
  end if;
  return new;
exception when others then
  return new;   -- logging must never block a sync
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists trg_job_postings_log_changes on public.job_postings;
create trigger trg_job_postings_log_changes
  before update of title, location, salary_min, salary_max, description on public.job_postings
  for each row execute function public.job_postings_log_changes();

-- 2. How long roles at a company really stay open, from the archive of removed postings.
-- Only answers once there are at least 5 closed postings to learn from; before that it returns null.
create or replace function public.company_hiring_speed(p_company_slug text) returns jsonb
language sql stable security definer set search_path = public as $$
  with arch as (
    select days_live from public.job_postings_archive
     where lower(company_slug) = lower(p_company_slug) and removal_reason in ('closed', 'pruned') and days_live is not null
  ), live as (
    select extract(epoch from (now() - first_seen_at)) / 86400 as age_days
      from public.job_postings where lower(company_slug) = lower(p_company_slug)
  ), changes as (
    select count(*) as n from public.job_posting_changes
     where lower(company_slug) = lower(p_company_slug) and changed_at > now() - interval '30 days'
  )
  select case when (select count(*) from arch) >= 5 then jsonb_build_object(
    'closed_tracked', (select count(*) from arch),
    'median_days_open', (select round((percentile_cont(0.5) within group (order by days_live))::numeric, 0) from arch),
    'typical_low_days', (select round((percentile_cont(0.25) within group (order by days_live))::numeric, 0) from arch),
    'typical_high_days', (select round((percentile_cont(0.75) within group (order by days_live))::numeric, 0) from arch),
    'open_now', (select count(*) from live),
    'median_open_age_days', (select round((percentile_cont(0.5) within group (order by age_days))::numeric, 0) from live),
    'edits_30d', (select n from changes)
  ) else null end
$$;
grant execute on function public.company_hiring_speed(text) to anon, authenticated, service_role;

-- 3. What the job feed is collecting, for the admin panel.
create or replace function public.get_admin_job_data() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not has_role((select auth.uid()), 'admin'::app_role) then
    raise exception 'Admin access required';
  end if;
  return jsonb_build_object(
    'total', (select count(*) from job_postings),
    'coverage', jsonb_build_object(
      'salary_listed', (select count(*) from job_postings where salary_min is not null or salary_max is not null),
      'salary_from_text', (select count(*) from job_postings where salary_text_min is not null),
      'salary_either', (select count(*) from job_postings where salary_min is not null or salary_max is not null or salary_text_min is not null),
      'work_mode_feed', (select count(*) from job_postings where work_mode is not null),
      'work_mode_either', (select count(*) from job_postings where work_mode is not null or work_mode_text is not null),
      'years_required', (select count(*) from job_postings where years_required is not null),
      'sponsorship', (select count(*) from job_postings where sponsorship is not null),
      'benefits', (select count(*) from job_postings where benefits is not null),
      'seniority', (select count(*) from job_postings where seniority is not null),
      'category', (select count(*) from job_postings where category is not null),
      'vectors', (select count(*) from job_postings where embedding is not null),
      'facts_read', (select count(*) from job_postings where facts_extracted_at is not null)
    ),
    'by_source', coalesce((select jsonb_object_agg(source, n) from (select source, count(*) n from job_postings group by 1) s), '{}'::jsonb),
    'history', jsonb_build_object(
      'archive_total', (select count(*) from job_postings_archive),
      'archive_7d', (select count(*) from job_postings_archive where archived_at > now() - interval '7 days'),
      'by_reason', coalesce((select jsonb_object_agg(removal_reason, n) from (select removal_reason, count(*) n from job_postings_archive group by 1) r), '{}'::jsonb),
      'relisted_now', (select count(*) from job_postings where repost_count > 0),
      'first_seen_oldest', (select min(first_seen_at) from job_postings),
      'older_than_shown_date', (select count(*) from job_postings where first_seen_at < posted_at - interval '5 days' and first_seen_at < now() - interval '7 days'),
      'edits_total', (select count(*) from job_posting_changes),
      'edits_7d', (select count(*) from job_posting_changes where changed_at > now() - interval '7 days'),
      'edits_by_field', coalesce((select jsonb_object_agg(field, n) from (select field, count(*) n from job_posting_changes group by 1) f), '{}'::jsonb)
    ),
    'companies', jsonb_build_object(
      'distinct_live', (select count(distinct company_slug) from job_postings),
      'with_5_closed_tracked', (select count(*) from (select company_slug from job_postings_archive where removal_reason in ('closed','pruned') group by 1 having count(*) >= 5) c)
    ),
    'generated_at', now()
  );
end;
$$;
revoke all on function public.get_admin_job_data() from public, anon;
grant execute on function public.get_admin_job_data() to authenticated;
