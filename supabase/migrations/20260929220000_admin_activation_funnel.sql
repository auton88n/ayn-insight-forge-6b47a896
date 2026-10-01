-- Real activation funnel for the admin Overview panel. AYN had real
-- aggregate counts (signups, credits, proposals) but nothing that
-- actually traces one cohort of real people through the stages that
-- matter: signed up, actually built a resume, took a real paid action,
-- came back a second time. Without this the founder has no way to see
-- where people genuinely drop off.
--
-- Deliberately NOT a naive "last 30 days" rolling window: someone who
-- signed up yesterday hasn't had a fair chance to reach "came back" yet,
-- which would make the funnel look artificially worse for the most
-- recent days for no real reason. The cohort here is a matured 30-day
-- window that ends 7 days ago, so every single person counted has
-- already had at least a full week to reach every stage, including the
-- last one.
--
-- Seeker-only, same employer exclusion (LEFT JOIN employer_accounts,
-- WHERE ea.user_id IS NULL) and banned-account exclusion (banned_until
-- IS NULL) already used throughout get_admin_overview -- an employer's
-- own funnel (signup -> approval -> first search -> first proposal) is
-- structurally different and already covered by EmployersSection and
-- MarketplaceSection.
create or replace function public.get_admin_activation_funnel()
returns jsonb
language plpgsql
stable security definer
set search_path to 'public'
as $function$
declare
  cohort_start timestamptz := now() - interval '37 days';
  cohort_end timestamptz := now() - interval '7 days';
begin
  if not has_role((select auth.uid()), 'admin'::app_role) then
    raise exception 'Admin access required';
  end if;

  return jsonb_build_object(
    'cohort_start', cohort_start,
    'cohort_end', cohort_end,
    'signed_up', (
      select count(*)
      from auth.users u
      left join employer_accounts ea on ea.user_id = u.id
      where u.email is not null and u.banned_until is null
        and ea.user_id is null
        and u.created_at >= cohort_start and u.created_at < cohort_end
    ),
    -- The gateway stage: nothing else (score, tailor, discovery) is
    -- reachable without a real primary resume on file.
    'built_resume', (
      select count(distinct u.id)
      from auth.users u
      left join employer_accounts ea on ea.user_id = u.id
      join resumes r on r.user_id = u.id and r.is_primary = true
      where u.email is not null and u.banned_until is null
        and ea.user_id is null
        and u.created_at >= cohort_start and u.created_at < cohort_end
    ),
    -- A real credit spend (delta < 0): optimized, tailored, or wrote a
    -- cover letter. The actual paid core of the product, not a free
    -- action, so this is a genuine "got real value" signal, not a
    -- page view.
    'took_paid_action', (
      select count(distinct u.id)
      from auth.users u
      left join employer_accounts ea on ea.user_id = u.id
      join credit_ledger cl on cl.user_id = u.id and cl.delta < 0
      where u.email is not null and u.banned_until is null
        and ea.user_id is null
        and u.created_at >= cohort_start and u.created_at < cohort_end
    ),
    -- Any real activity (a resume saved, a job added, a credit spent)
    -- more than 24 hours after their own signup moment -- a genuine
    -- second visit, not the tail end of the same first session.
    'came_back', (
      select count(distinct u.id)
      from auth.users u
      left join employer_accounts ea on ea.user_id = u.id
      where u.email is not null and u.banned_until is null
        and ea.user_id is null
        and u.created_at >= cohort_start and u.created_at < cohort_end
        and exists (
          select 1 from (
            select created_at from resumes where user_id = u.id
            union all
            select created_at from jobs where user_id = u.id
            union all
            select created_at from credit_ledger where user_id = u.id
          ) act
          where act.created_at >= u.created_at + interval '24 hours'
        )
    )
  );
end;
$function$;

grant execute on function public.get_admin_activation_funnel() to authenticated;
