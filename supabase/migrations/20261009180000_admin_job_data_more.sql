-- The admin job-data report also counts the remote-region and deadline facts.
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
      'remote_region', (select count(*) from job_postings where remote_region is not null),
      'apply_by', (select count(*) from job_postings where apply_by is not null),
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
