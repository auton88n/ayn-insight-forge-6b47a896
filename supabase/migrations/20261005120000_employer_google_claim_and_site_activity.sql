-- 1. Employers who sign up with Google.
--    Google cannot carry the company details an employer signup needs, so a new Google
--    account starts as a job seeker. This function lets that same account, on the day it
--    was created, apply as an employer with the same checks the email signup trigger runs
--    (work email domain matches the company website, not a personal provider, US or Canada,
--    position, phone and address present). The account still lands in pending_approval, so
--    this cannot be used to skip employer approval. Email-created accounts and older
--    accounts are refused.
create or replace function public.employer_claim_after_oauth(
  p_company_name text, p_company_website text, p_position_title text,
  p_phone text, p_company_address text, p_company_country text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := (select auth.uid());
  v_email text; v_provider text; v_created timestamptz;
  v_company text := nullif(trim(coalesce(p_company_name, '')), '');
  v_website text := nullif(trim(coalesce(p_company_website, '')), '');
  v_position text := nullif(trim(coalesce(p_position_title, '')), '');
  v_phone text := nullif(trim(coalesce(p_phone, '')), '');
  v_address text := nullif(trim(coalesce(p_company_address, '')), '');
  v_country text := upper(nullif(trim(coalesce(p_company_country, '')), ''));
  v_email_domain text; v_website_domain text;
  v_personal_providers text[] := array[
    'gmail.com','googlemail.com','yahoo.com','yahoo.co.uk','outlook.com',
    'hotmail.com','hotmail.co.uk','live.com','msn.com','icloud.com','me.com',
    'mac.com','aol.com','protonmail.com','proton.me','gmx.com','gmx.net',
    'mail.com','yandex.com','yandex.ru','zoho.com','qq.com','163.com','126.com'];
begin
  if v_uid is null then raise exception 'Sign in first.'; end if;
  select email, coalesce(raw_app_meta_data ->> 'provider', 'email'), created_at
    into v_email, v_provider, v_created from auth.users where id = v_uid;
  if v_email is null then raise exception 'Account not found.'; end if;
  if v_provider = 'email' then
    raise exception 'This is only for accounts created with Google. Sign up as an employer with your work email instead.';
  end if;
  if v_created < now() - interval '1 day' then
    raise exception 'Company details can only be added on the day the account is created. Contact support to change an existing account.';
  end if;
  if exists (select 1 from public.employer_accounts where user_id = v_uid) then
    raise exception 'This account already has a company application.';
  end if;

  v_email_domain := lower(split_part(v_email, '@', 2));
  if v_email_domain = any(v_personal_providers) then
    raise exception 'Please use your business Google account. A personal Gmail address cannot be matched to a company.';
  end if;
  if v_company is null then raise exception 'Company name is required.'; end if;
  if v_website is null then raise exception 'Company website is required.'; end if;
  v_website_domain := lower(regexp_replace(v_website, '^(https?://)?(www\.)?([^/]+).*$', '\3'));
  if v_email_domain is distinct from v_website_domain
     and v_email_domain !~ ('(^|\.)' || regexp_replace(v_website_domain, '[.]', '\\.', 'g') || '$') then
    raise exception 'Your email domain must match your company website (% does not match %).', v_email_domain, v_website_domain;
  end if;
  if v_country is null or v_country not in ('US', 'CA') then
    raise exception 'AYN currently operates only in the United States and Canada.';
  end if;
  if v_position is null then raise exception 'Your position at the company is required.'; end if;
  if v_phone is null then raise exception 'A phone number is required.'; end if;
  if v_address is null then raise exception 'A company address is required.'; end if;

  insert into public.employer_accounts (user_id, company_name, status, position_title, phone, company_website, company_address, company_country)
    values (v_uid, v_company, 'pending_approval', v_position, v_phone, v_website, v_address, v_country);
  perform set_config('ayn.allow_role_change', 'on', true);
  update public.profiles set role = 'employer'::public.user_role, company_name = v_company, updated_at = now() where user_id = v_uid;
  perform set_config('ayn.allow_role_change', 'off', true);

  -- The job-seeker plan started at signup does not belong to an employer. Remove it only if untouched.
  delete from public.credit_ledger where user_id = v_uid and reason = 'period_grant'
    and not exists (select 1 from public.credit_ledger c2 where c2.user_id = v_uid and c2.reason <> 'period_grant');
  delete from public.subscriptions where user_id = v_uid and plan_key = 'seeker_free';

  -- Make sure the welcome email is the employer one: leave a pending one alone (the worker
  -- reads the role when it sends), queue a fresh one if the job-seeker email already went.
  insert into public.welcome_emails (user_id, status) values (v_uid, 'pending')
    on conflict (user_id) do update
      set status = case when public.welcome_emails.status in ('pending', 'sending') then public.welcome_emails.status else 'pending' end,
          attempts = case when public.welcome_emails.status in ('pending', 'sending') then public.welcome_emails.attempts else 0 end,
          next_attempt_at = case when public.welcome_emails.status in ('pending', 'sending') then public.welcome_emails.next_attempt_at else now() end,
          sent_at = case when public.welcome_emails.status in ('pending', 'sending') then public.welcome_emails.sent_at else null end,
          delivery_status = case when public.welcome_emails.status in ('pending', 'sending') then public.welcome_emails.delivery_status else null end,
          resend_id = case when public.welcome_emails.status in ('pending', 'sending') then public.welcome_emails.resend_id else null end,
          skipped_reason = null;
  insert into public.security_audit_logs (user_id, action, details, severity)
    values (v_uid, 'employer_claim_after_oauth', jsonb_build_object('company', v_company, 'provider', v_provider), 'medium');
  return jsonb_build_object('ok', true);
end;
$$;
revoke all on function public.employer_claim_after_oauth(text, text, text, text, text, text) from public, anon;
grant execute on function public.employer_claim_after_oauth(text, text, text, text, text, text) to authenticated, service_role;

-- Whether a signed-in account may still apply as an employer this way (drives the screen).
create or replace function public.employer_claim_available()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from auth.users u
    where u.id = (select auth.uid())
      and coalesce(u.raw_app_meta_data ->> 'provider', 'email') <> 'email'
      and u.created_at >= now() - interval '1 day'
      and not exists (select 1 from public.employer_accounts ea where ea.user_id = u.id));
$$;
revoke all on function public.employer_claim_available() from public, anon;
grant execute on function public.employer_claim_available() to authenticated, service_role;

-- 2. One feed of what is happening across the whole site, newest first, with a category
--    filter, a search, and paging by time. Reads the records that already exist.
create or replace function public.get_admin_site_activity(
  p_limit integer default 100, p_before timestamptz default null,
  p_kind text default null, p_search text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not has_role((select auth.uid()), 'admin'::app_role) then
    raise exception 'Admin access required';
  end if;
  return (
    with ev as (
      select u.created_at as at, 'signup'::text as kind, ('Signed up with ' || coalesce(u.raw_app_meta_data ->> 'provider', 'email')) as title, null::text as detail, u.id as user_id, u.email::text as email
        from auth.users u where u.email is not null
      union all select u.email_confirmed_at, 'signup', 'Verified their email', null, u.id, u.email from auth.users u where u.email is not null and u.email_confirmed_at is not null
      union all select u.last_sign_in_at, 'login', 'Signed in', null, u.id, u.email from auth.users u where u.email is not null and u.last_sign_in_at is not null
      union all select c.accepted_at, 'legal',
                 case when c.terms_accepted then 'Accepted Terms ' || coalesce(c.terms_version, '?') || ' and Privacy ' || coalesce(c.privacy_version, '?') else 'No acceptance recorded' end,
                 'source: ' || coalesce(c.source, 'unknown'), c.user_id, u.email
          from public.terms_consent_log c join auth.users u on u.id = c.user_id
      union all select coalesce(w.sent_at, w.queued_at), 'email', 'Welcome email ' || w.status || coalesce(' (' || w.delivery_status || ')', ''), coalesce(w.skipped_reason, w.last_error), w.user_id, u.email
          from public.welcome_emails w join auth.users u on u.id = w.user_id where w.status <> 'skipped'
      union all select l.sent_at, 'email', 'Email ' || l.email_type || ': ' || l.status || coalesce(' (' || (l.metadata ->> 'delivery_status') || ')', ''), l.error_message, l.user_id, l.recipient_email
          from public.email_logs l where l.email_type <> 'welcome'
      union all select cl.created_at, 'credits', 'Credits ' || case when cl.delta >= 0 then '+' else '' end || cl.delta || ' (' || cl.reason || ')', 'balance ' || cl.balance_after, cl.user_id, u.email
          from public.credit_ledger cl join auth.users u on u.id = cl.user_id
      union all select r.created_at, 'content', 'Added a resume', r.title, r.user_id, u.email from public.resumes r join auth.users u on u.id = r.user_id
      union all select j.created_at, 'content', 'Saved a job', coalesce(j.title, '') || ' at ' || coalesce(j.company, ''), j.user_id, u.email from public.jobs j join auth.users u on u.id = j.user_id
      union all select t.consented_at, 'content', case when t.opted_in then 'Opted in to the talent pool' else 'Left the talent pool' end, null, t.user_id, u.email
          from public.talent_pool_consent t join auth.users u on u.id = t.user_id where t.consented_at is not null
      union all select ea.created_at, 'marketplace', 'Applied as an employer', ea.company_name, ea.user_id, u.email from public.employer_accounts ea join auth.users u on u.id = ea.user_id
      union all select ea.approved_at, 'marketplace', 'Employer approved', ea.company_name, ea.user_id, u.email from public.employer_accounts ea join auth.users u on u.id = ea.user_id where ea.approved_at is not null
      union all select rr.created_at, 'marketplace', 'Proposal sent to a candidate', coalesce(rr.job_title, '') || ' (' || coalesce(o.name, 'a company') || ')', rr.candidate_user_id, u.email
          from public.reveal_requests rr left join public.orgs o on o.id = rr.org_id left join auth.users u on u.id = rr.candidate_user_id
      union all select rr.responded_at, 'marketplace', 'Candidate answered a proposal: ' || rr.status, coalesce(rr.job_title, ''), rr.candidate_user_id, u.email
          from public.reveal_requests rr left join auth.users u on u.id = rr.candidate_user_id where rr.responded_at is not null
      union all select a.created_at, 'marketplace', 'Assessment sent to a candidate', a.job_title, a.candidate_user_id, u.email from public.assessments a left join auth.users u on u.id = a.candidate_user_id
      union all select a.submitted_at, 'marketplace', 'Assessment submitted', a.job_title, a.candidate_user_id, u.email from public.assessments a left join auth.users u on u.id = a.candidate_user_id where a.submitted_at is not null
      union all select tk.created_at, 'support', 'Support ticket: ' || tk.subject, tk.status::text, tk.user_id, coalesce(tk.guest_email, u.email) from public.support_tickets tk left join auth.users u on u.id = tk.user_id
      union all select e.created_at, 'support', 'Error on the site', left(e.error_message, 160), e.user_id, u.email
          from public.error_logs e left join auth.users u on u.id = e.user_id where coalesce(e.severity, 'error') in ('error', 'critical')
      union all select a.created_at, 'admin', a.action, nullif(coalesce(a.details ->> 'reason', a.details ->> 'target_email'), ''), a.user_id, u.email
          from public.security_audit_logs a left join auth.users u on u.id = a.user_id
    ), filtered as (
      select * from ev
      where at is not null
        and (p_before is null or at < p_before)
        and (p_kind is null or p_kind = 'all' or kind = p_kind)
        and (p_search is null or p_search = '' or email ilike '%' || p_search || '%' or title ilike '%' || p_search || '%' or detail ilike '%' || p_search || '%')
    )
    select jsonb_build_object(
      'rows', coalesce((select jsonb_agg(row_to_json(t)) from (
         select at, kind, title, detail, user_id, email from filtered order by at desc limit least(greatest(coalesce(p_limit, 100), 1), 300)) t), '[]'::jsonb),
      'counts_24h', coalesce((select jsonb_object_agg(kind, n) from (select kind, count(*) as n from ev where at >= now() - interval '24 hours' group by kind) c), '{}'::jsonb)
    )
  );
end;
$$;
revoke all on function public.get_admin_site_activity(integer, timestamptz, text, text) from public, anon;
grant execute on function public.get_admin_site_activity(integer, timestamptz, text, text) to authenticated, service_role;

-- The role guard on profiles, with the single exception described above.
CREATE OR REPLACE FUNCTION public.prevent_system_field_modification()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Only apply to non-admin users
  IF NOT has_role(auth.uid(), 'admin'::app_role) AND TG_OP = 'UPDATE' THEN
    -- Prevent modification of system-managed fields
    IF OLD.account_status IS DISTINCT FROM NEW.account_status THEN
      RAISE EXCEPTION 'Cannot modify account_status field';
    END IF;

    IF OLD.last_login IS DISTINCT FROM NEW.last_login THEN
      RAISE EXCEPTION 'Cannot modify last_login field';
    END IF;

    IF OLD.total_sessions IS DISTINCT FROM NEW.total_sessions THEN
      RAISE EXCEPTION 'Cannot modify total_sessions field';
    END IF;

    -- employer_claim_after_oauth is the one place a non-admin's own role may change: it sets this
    -- flag for the length of a single update, after running the same checks as the employer signup.
    IF OLD.role IS DISTINCT FROM NEW.role AND coalesce(current_setting('ayn.allow_role_change', true), '') <> 'on' THEN
      RAISE EXCEPTION 'Cannot modify role field';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

-- Google and other OAuth signups are verified at creation, so their welcome email is held for two
-- minutes: long enough for someone applying as an employer to fill in their company details first,
-- so the email matches what they are (the worker reads the account type when it sends).
create or replace function public.signup_welcome_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_employer boolean := coalesce(new.raw_user_meta_data ->> 'role', '') = 'employer';
  v_oauth boolean := coalesce(new.raw_app_meta_data ->> 'provider', 'email') <> 'email';
begin
  -- Never allowed to block a signup: any failure here is logged and ignored.
  begin
    if new.email is not null and new.email_confirmed_at is not null then
      insert into public.welcome_emails (user_id, next_attempt_at)
        values (new.id, case when v_oauth then now() + interval '2 minutes' else now() end)
        on conflict (user_id) do nothing;
    end if;
    if new.email is not null and not v_employer then
      perform public.billing_ensure(new.id, 'seeker');
    end if;
  exception when others then
    raise warning 'signup welcome/plan setup failed for %: %', new.id, sqlerrm;
  end;
  return new;
end;
$$;
