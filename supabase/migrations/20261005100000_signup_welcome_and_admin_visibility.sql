-- Signup welcome emails, free-plan setup at signup, and fuller admin visibility.
--
-- 1. welcome_emails: a server-side queue. A row is added when an account becomes
--    verified (Google and other OAuth signups are verified immediately, email
--    signups when they confirm). One row per account, so it can never send twice.
--    Holds no email address; the worker reads the address from the account.
-- 2. The same trigger starts the free plan (and its starter credits) at signup
--    for job seekers, instead of waiting for the first time they open the app.
--    Employers are untouched: their trial starts at approval.
-- 3. Admin: signup method and last sign-in method on every account, an all
--    job-seekers directory, an email log with delivery status and filters,
--    visitor analytics without admin traffic, a per-account timeline, and a
--    control to resend a welcome email.

create table if not exists public.welcome_emails (
  user_id uuid primary key references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','sending','sent','failed','skipped')),
  attempts integer not null default 0,
  last_error text,
  resend_id text,
  delivery_status text,
  skipped_reason text,
  queued_at timestamptz not null default now(),
  next_attempt_at timestamptz not null default now(),
  sent_at timestamptz
);
create index if not exists welcome_emails_due on public.welcome_emails (status, next_attempt_at);
alter table public.welcome_emails enable row level security;

-- Accounts that already exist never get a welcome email retroactively.
insert into public.welcome_emails (user_id, status, skipped_reason)
select u.id, 'skipped', 'existing account before welcome emails'
from auth.users u
where u.created_at < timestamptz '2026-10-04 21:00:00+00'   -- only accounts that existed before this shipped; makes a re-run safe
on conflict (user_id) do nothing;

create or replace function public.signup_welcome_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare v_employer boolean := coalesce(new.raw_user_meta_data ->> 'role', '') = 'employer';
begin
  -- Never allowed to block a signup: any failure here is logged and ignored.
  begin
    if new.email is not null and new.email_confirmed_at is not null then
      insert into public.welcome_emails (user_id) values (new.id) on conflict (user_id) do nothing;
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

create or replace function public.signup_welcome_confirmed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  begin
    if new.email is not null then
      insert into public.welcome_emails (user_id) values (new.id) on conflict (user_id) do nothing;
    end if;
  exception when others then
    raise warning 'welcome queue failed for %: %', new.id, sqlerrm;
  end;
  return new;
end;
$$;

drop trigger if exists zz_signup_welcome_insert on auth.users;
create trigger zz_signup_welcome_insert after insert on auth.users
  for each row execute function public.signup_welcome_insert();
drop trigger if exists zz_signup_welcome_confirmed on auth.users;
create trigger zz_signup_welcome_confirmed after update of email_confirmed_at on auth.users
  for each row when (old.email_confirmed_at is null and new.email_confirmed_at is not null)
  execute function public.signup_welcome_confirmed();

-- The worker claims due rows. FOR UPDATE SKIP LOCKED so two workers never take the same one;
-- a row left in 'sending' by a crashed worker becomes claimable again after ten minutes.
create or replace function public.claim_welcome_emails(p_limit integer default 10)
returns table (user_id uuid, attempts integer)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with due as (
    select w.user_id from public.welcome_emails w
    where (w.status = 'pending' or w.status = 'sending') and w.next_attempt_at <= now()
    order by w.queued_at
    limit greatest(1, least(coalesce(p_limit, 10), 50))
    for update skip locked
  ), claimed as (
    update public.welcome_emails w
       set status = 'sending', attempts = w.attempts + 1, next_attempt_at = now() + interval '10 minutes'
      from due where w.user_id = due.user_id
    returning w.user_id, w.attempts
  )
  select c.user_id, c.attempts from claimed c;
end;
$$;
revoke all on function public.claim_welcome_emails(integer) from public, anon, authenticated;
grant execute on function public.claim_welcome_emails(integer) to service_role;

-- Admin traffic (the /manage- panel) is not a visitor.
create or replace view public.visitor_analytics_public as
  select * from public.visitor_analytics
  where page_path not like '/manage-%' and page_path not like '/admin%';
revoke all on public.visitor_analytics_public from public, anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_admin_accounts(p_search text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT has_role((SELECT auth.uid()), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;

  RETURN jsonb_build_object(
    'total', (SELECT count(*) FROM auth.users WHERE email IS NOT NULL AND banned_until IS NULL),
    'seekers', (
      SELECT count(*)
      FROM auth.users u
      LEFT JOIN employer_accounts ea ON ea.user_id = u.id
      WHERE u.email IS NOT NULL AND u.banned_until IS NULL AND ea.user_id IS NULL
    ),
    'employers', (
      SELECT count(*)
      FROM employer_accounts ea
      JOIN auth.users u ON u.id = ea.user_id AND u.banned_until IS NULL
    ),
    'admins', (
      SELECT count(*)
      FROM user_roles ur
      JOIN auth.users u ON u.id = ur.user_id AND u.banned_until IS NULL
      WHERE ur.role = 'admin'::app_role
    ),
    'suspended', (
      SELECT count(*)
      FROM account_suspensions s
      JOIN auth.users u ON u.id = s.user_id AND u.banned_until IS NULL
      WHERE s.active
    ),
    'restricted', (
      SELECT count(DISTINCT r.user_id)
      FROM account_restrictions r
      JOIN auth.users u ON u.id = r.user_id AND u.banned_until IS NULL
    ),
    'by_provider', coalesce((
      SELECT jsonb_object_agg(provider, n) FROM (
        SELECT coalesce(u.raw_app_meta_data->>'provider', 'email') AS provider, count(*) AS n
        FROM auth.users u WHERE u.email IS NOT NULL AND u.banned_until IS NULL GROUP BY 1
      ) bp
    ), '{}'::jsonb),
    'rows', coalesce((
      SELECT jsonb_agg(row_to_json(t) ORDER BY t.signed_up_at DESC)
      FROM (
        SELECT
          u.id AS user_id,
          u.email,
          coalesce(p.contact_person, split_part(u.email, '@', 1)) AS display_name,
          coalesce(p.role::text, 'job_seeker') AS account_role,
          coalesce(ur.role::text, 'user') AS system_role,
          u.created_at AS signed_up_at,
          u.last_sign_in_at,
          coalesce(u.raw_app_meta_data->>'provider', 'email') AS provider,
          coalesce((SELECT array_agg(DISTINCT i.provider ORDER BY i.provider) FROM auth.identities i WHERE i.user_id = u.id), ARRAY[]::text[]) AS providers,
          (SELECT i.provider FROM auth.identities i WHERE i.user_id = u.id ORDER BY i.last_sign_in_at DESC NULLS LAST LIMIT 1) AS last_sign_in_method,
          we.status AS welcome_status,
          we.delivery_status AS welcome_delivery,
          (u.email_confirmed_at IS NOT NULL) AS email_confirmed,
          ea.status::text AS employer_status,
          ea.company_name,
          coalesce(s.plan_key, 'none') AS plan_key,
          s.status AS sub_status,
          coalesce((SELECT sum(cl.delta) FROM credit_ledger cl WHERE cl.user_id = u.id), 0) AS credits,
          coalesce(tp.opted_in, false) AS discoverable,
          EXISTS (SELECT 1 FROM account_suspensions ax WHERE ax.user_id = u.id AND ax.active) AS suspended,
          coalesce((
            SELECT array_agg(ar.capability::text ORDER BY ar.capability)
            FROM account_restrictions ar WHERE ar.user_id = u.id
          ), ARRAY[]::text[]) AS restrictions
        FROM auth.users u
        LEFT JOIN profiles p ON p.user_id = u.id
        LEFT JOIN user_roles ur ON ur.user_id = u.id
        LEFT JOIN employer_accounts ea ON ea.user_id = u.id
        LEFT JOIN subscriptions s ON s.user_id = u.id
        LEFT JOIN talent_pool_consent tp ON tp.user_id = u.id
        LEFT JOIN welcome_emails we ON we.user_id = u.id
        WHERE u.email IS NOT NULL AND u.banned_until IS NULL
          AND (p_search IS NULL OR p_search = '' OR u.email ILIKE '%' || p_search || '%'
            OR coalesce(p.contact_person, '') ILIKE '%' || p_search || '%'
            OR coalesce(ea.company_name, '') ILIKE '%' || p_search || '%')
        ORDER BY u.created_at DESC
        LIMIT 300
      ) t
    ), '[]'::jsonb)
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_admin_visitor_analytics()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not has_role((select auth.uid()), 'admin'::app_role) then
    raise exception 'Admin access required';
  end if;

  return jsonb_build_object(
    'visitors24h', (
      select count(distinct visitor_id) from public.visitor_analytics_public
      where created_at >= now() - interval '24 hours'
    ),
    'visitors7d', (
      select count(distinct visitor_id) from public.visitor_analytics_public
      where created_at >= now() - interval '7 days'
    ),
    'visitors30d', (
      select count(distinct visitor_id) from public.visitor_analytics_public
      where created_at >= now() - interval '30 days'
    ),
    'pageviews30d', (
      select count(*) from public.visitor_analytics_public
      where created_at >= now() - interval '30 days'
    ),
    'daily', coalesce((
      select jsonb_agg(row_to_json(day_row) order by day_row.day)
      from (
        select
          created_at::date as day,
          count(*) as pageviews,
          count(distinct visitor_id) as visitors
        from public.visitor_analytics_public
        where created_at >= now() - interval '14 days'
        group by created_at::date
      ) day_row
    ), '[]'::jsonb),
    'topPaths', coalesce((
      select jsonb_agg(row_to_json(path_row) order by path_row.pageviews desc, path_row.page_path)
      from (
        select
          page_path,
          count(*) as pageviews,
          count(distinct visitor_id) as visitors
        from public.visitor_analytics_public
        where created_at >= now() - interval '30 days'
        group by page_path
        order by count(*) desc, page_path
        limit 20
      ) path_row
    ), '[]'::jsonb)
  );
end;
$function$;

-- All job seekers (not just the opted-in talent pool). Discoverability is shown separately.
create or replace function public.get_admin_job_seekers(p_search text default null)
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
    with seekers as (
      select u.id as user_id, u.email,
             coalesce(p.contact_person, split_part(u.email, '@', 1)) as display_name,
             u.created_at as signed_up_at, u.last_sign_in_at,
             coalesce(u.raw_app_meta_data ->> 'provider', 'email') as provider,
             (select i.provider from auth.identities i where i.user_id = u.id order by i.last_sign_in_at desc nulls last limit 1) as last_sign_in_method,
             (u.email_confirmed_at is not null) as email_confirmed,
             exists (select 1 from public.resumes r where r.user_id = u.id) as has_resume,
             (select count(*) from public.jobs j where j.user_id = u.id) as saved_jobs,
             coalesce(tp.opted_in, false) as discoverable,
             coalesce(s.plan_key, 'none') as plan_key,
             coalesce((select sum(cl.delta) from public.credit_ledger cl where cl.user_id = u.id), 0) as credits,
             we.status as welcome_status, we.delivery_status as welcome_delivery
      from auth.users u
      left join public.profiles p on p.user_id = u.id
      left join public.employer_accounts ea on ea.user_id = u.id
      left join public.subscriptions s on s.user_id = u.id
      left join public.talent_pool_consent tp on tp.user_id = u.id
      left join public.welcome_emails we on we.user_id = u.id
      where u.email is not null and u.banned_until is null and ea.user_id is null
        and (p_search is null or p_search = '' or u.email ilike '%' || p_search || '%'
             or coalesce(p.contact_person, '') ilike '%' || p_search || '%')
    )
    select jsonb_build_object(
      'total', (select count(*) from seekers),
      'with_resume', (select count(*) from seekers where has_resume),
      'discoverable', (select count(*) from seekers where discoverable),
      'by_provider', coalesce((select jsonb_object_agg(provider, n) from (select provider, count(*) as n from seekers group by 1) b), '{}'::jsonb),
      'rows', coalesce((select jsonb_agg(row_to_json(t) order by t.signed_up_at desc) from (select * from seekers order by signed_up_at desc limit 500) t), '[]'::jsonb)
    )
  );
end;
$$;

-- Email log with delivery status, a window, and a switch to hide test and retired-domain addresses.
drop function if exists public.get_admin_email_log(integer);
create or replace function public.get_admin_email_log(
  p_limit integer default 100, p_days integer default null, p_hide_test boolean default false)
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
    with scoped as (
      select id, email_type, recipient_email, status, error_message, sent_at,
             metadata ->> 'delivery_status' as delivery_status
      from public.email_logs
      where (p_days is null or sent_at >= now() - make_interval(days => p_days))
        and (not coalesce(p_hide_test, false) or (
              recipient_email not ilike '%@example.com' and recipient_email not ilike '%@example.org'
          and recipient_email not ilike '%@aynn.io' and recipient_email not ilike '%@mail.aynn.io'
          and recipient_email not ilike '%@test.%'))
    )
    select jsonb_build_object(
      'summary', jsonb_build_object(
        'total', (select count(*) from scoped),
        'sent', (select count(*) from scoped where status = 'sent'),
        'failed', (select count(*) from scoped where status = 'failed'),
        'delivered', (select count(*) from scoped where delivery_status = 'delivered'),
        'bounced', (select count(*) from scoped where delivery_status = 'bounced'),
        'complained', (select count(*) from scoped where delivery_status = 'complained')
      ),
      'rows', coalesce((select jsonb_agg(row_to_json(t) order by t.sent_at desc) from (
        select * from scoped order by sent_at desc limit least(greatest(coalesce(p_limit, 100), 1), 500)) t), '[]'::jsonb)
    )
  );
end;
$$;

-- One account's full history, newest first, from the records that already exist.
create or replace function public.get_admin_account_timeline(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_email text; v_events jsonb;
begin
  if not has_role((select auth.uid()), 'admin'::app_role) then
    raise exception 'Admin access required';
  end if;
  select email into v_email from auth.users where id = p_user_id;
  v_events := coalesce((
    select jsonb_agg(jsonb_build_object('at', e.at, 'kind', e.kind, 'title', e.title, 'detail', e.detail) order by e.at desc)
    from (
      select u.created_at as at, 'account' as kind,
             'Signed up with ' || coalesce(u.raw_app_meta_data ->> 'provider', 'email') as title, null::text as detail
        from auth.users u where u.id = p_user_id
      union all
      select u.email_confirmed_at, 'account', 'Email verified', null from auth.users u
        where u.id = p_user_id and u.email_confirmed_at is not null
      union all
      select i.last_sign_in_at, 'login', 'Last sign-in with ' || i.provider, null
        from auth.identities i where i.user_id = p_user_id and i.last_sign_in_at is not null
      union all
      select c.accepted_at, 'legal',
             case when c.terms_accepted then 'Accepted Terms ' || coalesce(c.terms_version, '?') || ' and Privacy ' || coalesce(c.privacy_version, '?') else 'No acceptance recorded' end,
             'source: ' || coalesce(c.source, 'unknown')
        from public.terms_consent_log c where c.user_id = p_user_id
      union all
      select coalesce(w.sent_at, w.queued_at), 'email',
             'Welcome email ' || w.status || coalesce(' (' || w.delivery_status || ')', ''),
             coalesce(w.skipped_reason, w.last_error)
        from public.welcome_emails w where w.user_id = p_user_id
      union all
      select l.sent_at, 'email', 'Email ' || l.email_type || ': ' || l.status || coalesce(' (' || (l.metadata ->> 'delivery_status') || ')', ''), l.error_message
        from public.email_logs l where l.user_id = p_user_id or (v_email is not null and l.recipient_email = v_email)
      union all
      select cl.created_at, 'credits', 'Credits ' || case when cl.delta >= 0 then '+' else '' end || cl.delta || ' (' || cl.reason || ')', 'balance ' || cl.balance_after
        from public.credit_ledger cl where cl.user_id = p_user_id
      union all
      select a.created_at, 'security', a.action, a.severity
        from public.security_audit_logs a where a.user_id = p_user_id
      union all
      select a.created_at, 'admin', 'Admin action: ' || a.action, coalesce(a.details ->> 'reason', null)
        from public.security_audit_logs a where a.details ->> 'target_user_id' = p_user_id::text
    ) e
    where e.at is not null
    limit 200
  ), '[]'::jsonb);
  return jsonb_build_object(
    'welcome', (select to_jsonb(w) - 'user_id' from public.welcome_emails w where w.user_id = p_user_id),
    'events', v_events
  );
end;
$$;

-- Queue (or re-queue) a welcome email for one account. Audited.
create or replace function public.admin_welcome_email_requeue(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_admin uuid := (select auth.uid()); v_email text; v_confirmed timestamptz;
begin
  if not has_role(v_admin, 'admin'::app_role) then
    raise exception 'Admin access required';
  end if;
  select email, email_confirmed_at into v_email, v_confirmed from auth.users where id = p_user_id and banned_until is null;
  if v_email is null then raise exception 'Account not found'; end if;
  if v_confirmed is null then raise exception 'This account has not verified its email yet'; end if;
  insert into public.welcome_emails (user_id, status, attempts, last_error, skipped_reason, delivery_status, next_attempt_at)
    values (p_user_id, 'pending', 0, null, null, null, now())
    on conflict (user_id) do update
      set status = 'pending', attempts = 0, last_error = null, skipped_reason = null,
          delivery_status = null, resend_id = null, sent_at = null, next_attempt_at = now(), queued_at = now();
  insert into public.security_audit_logs (user_id, action, details, severity)
    values (v_admin, 'admin_welcome_email_requeue', jsonb_build_object('target_user_id', p_user_id, 'target_email', v_email), 'medium');
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.get_admin_job_seekers(text) from public, anon;
revoke all on function public.get_admin_email_log(integer, integer, boolean) from public, anon;
revoke all on function public.get_admin_account_timeline(uuid) from public, anon;
revoke all on function public.admin_welcome_email_requeue(uuid) from public, anon;
grant execute on function public.get_admin_job_seekers(text) to authenticated, service_role;
grant execute on function public.get_admin_email_log(integer, integer, boolean) to authenticated, service_role;
grant execute on function public.get_admin_account_timeline(uuid) to authenticated, service_role;
grant execute on function public.admin_welcome_email_requeue(uuid) to authenticated, service_role;

-- Account erasure also removes the welcome-email record (keeps the rule that every user_id table is covered).
CREATE OR REPLACE FUNCTION public.erase_account_core(p_user_id uuid, p_actor uuid, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  declare
    v_email text;
    v_files integer := 0;
    v_ref text := 'erased-' || left(replace(p_user_id::text,'-',''), 8);
    v_org_ids uuid[];
  begin
    select email into v_email from auth.users where id = p_user_id;
    if v_email is null then raise exception 'No such account'; end if;

    delete from public.resume_versions where user_id = p_user_id;
    delete from public.resumes where user_id = p_user_id;
    delete from public.cover_letters where user_id = p_user_id;
    delete from public.jobs where user_id = p_user_id;
    delete from public.job_matches where user_id = p_user_id;
    delete from public.skills_to_learn where user_id = p_user_id;
    delete from public.job_postings_seen where user_id = p_user_id;
    delete from public.user_profile_data where user_id = p_user_id;
    delete from public.user_profile_canonical where user_id = p_user_id;
    delete from public.candidate_index where user_id = p_user_id;
    delete from public.candidate_skills where user_id = p_user_id;
    delete from public.talent_pool_consent where user_id = p_user_id;
    delete from public.ai_result_cache where user_id = p_user_id;
    delete from public.user_memory where user_id = p_user_id;
    delete from public.user_preferences where user_id = p_user_id;
    delete from public.user_settings where user_id = p_user_id;
    delete from public.messages where user_id = p_user_id;
    delete from public.chat_sessions where user_id = p_user_id;
    delete from public.ticket_messages where ticket_id in (select id from public.support_tickets where user_id = p_user_id);
    delete from public.support_ticket_replies where ticket_id in (select id from public.support_tickets where user_id = p_user_id);
    delete from public.support_admin_reads where ticket_id in (select id from public.support_tickets where user_id = p_user_id);
    delete from public.support_tickets where user_id = p_user_id;
    delete from public.email_logs where user_id = p_user_id;
    delete from public.welcome_emails where user_id = p_user_id;
    delete from public.upgrade_intents where user_id = p_user_id;
    delete from public.access_grants where user_id = p_user_id;
    delete from public.api_rate_limits where user_id = p_user_id;
    delete from public.rate_limits where user_id = p_user_id;
    delete from public.threat_detection where user_id = p_user_id;
    delete from public.terms_consent_log where user_id = p_user_id;
    delete from public.employer_accounts where user_id = p_user_id;
    delete from public.user_usage_daily where user_id = p_user_id;
    delete from public.usage_logs where user_id = p_user_id;
    delete from public.admin_totp_secrets where user_id = p_user_id;

    select array_agg(org_id) into v_org_ids from public.org_members where user_id = p_user_id;
    delete from public.org_members where user_id = p_user_id;
    delete from public.orgs
      where id = any(v_org_ids)
        and not exists (select 1 from public.org_members om where om.org_id = orgs.id);

    delete from public.account_restrictions where user_id = p_user_id;
    delete from public.account_limit_overrides where user_id = p_user_id;
    delete from public.profiles where user_id = p_user_id or id = p_user_id;
    delete from public.user_roles where user_id = p_user_id;
    delete from public.llm_usage_logs where user_id = p_user_id;

    v_files := public.admin_erase_storage(p_user_id);

    update public.ai_call_telemetry set user_id = null where user_id = p_user_id;
    update public.error_logs set user_id = null where user_id = p_user_id;
    update public.security_logs set user_id = null where user_id = p_user_id;
    update public.system_logs set user_id = null where user_id = p_user_id;
    update public.cookie_consent_log set user_id = null where user_id = p_user_id;

    update public.reveal_requests set candidate_ref = v_ref where candidate_user_id = p_user_id;
    update public.assessments set candidate_ref = v_ref where candidate_user_id = p_user_id;

    update auth.users set
      banned_until = now() + interval '100 years',
      email = 'erased+' || replace(p_user_id::text,'-','') || '@erased.invalid',
      phone = null,
      raw_user_meta_data = '{}'::jsonb,
      email_change = '', phone_change = '',
      updated_at = now()
    where id = p_user_id;
    delete from auth.identities where user_id = p_user_id;
    delete from auth.sessions where user_id = p_user_id;

    insert into public.account_erasures (user_id, email_at_erasure, reason, erased_by)
    values (p_user_id, v_email, btrim(p_reason), p_actor)
    on conflict (user_id) do update
      set reason = excluded.reason, erased_by = excluded.erased_by, erased_at = now(), updated_at = now();

    return jsonb_build_object('ok', true, 'erased', true, 'email', v_email,
      'candidate_ref', v_ref, 'files_removed', v_files);
  end;
$function$;

-- Employers: how each signed up, last sign-in, welcome email status.
CREATE OR REPLACE FUNCTION public.get_admin_employers()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT has_role((SELECT auth.uid()), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;

  RETURN jsonb_build_object(
    'pending', coalesce((SELECT jsonb_agg(row_to_json(p) ORDER BY p.requested_at) FROM (
      SELECT ea.user_id, ea.company_name, ea.company_size, ea.hiring_need, ea.phone,
             ea.created_at AS requested_at, ea.internal_note,
             u.email AS requester_email,
             coalesce(u.raw_app_meta_data ->> 'provider', 'email') AS provider,
             (SELECT i.provider FROM auth.identities i WHERE i.user_id = u.id ORDER BY i.last_sign_in_at DESC NULLS LAST LIMIT 1) AS last_sign_in_method,
             u.last_sign_in_at,
             (SELECT w.status FROM public.welcome_emails w WHERE w.user_id = u.id) AS welcome_status,
             (SELECT w.delivery_status FROM public.welcome_emails w WHERE w.user_id = u.id) AS welcome_delivery,
             o.website, o.industry, o.headquarters, o.about, o.logo_url
      FROM employer_accounts ea
      JOIN auth.users u ON u.id = ea.user_id AND u.banned_until IS NULL
      LEFT JOIN orgs o ON o.created_by = ea.user_id
      WHERE ea.status = 'pending_approval'
    ) p), '[]'::jsonb),
    'active', coalesce((SELECT jsonb_agg(row_to_json(a) ORDER BY a.approved_at DESC NULLS LAST) FROM (
      SELECT ea.user_id, ea.company_name, ea.status::text AS status, ea.approved_at, ea.internal_note,
             u.email AS requester_email,
             coalesce(u.raw_app_meta_data ->> 'provider', 'email') AS provider,
             (SELECT i.provider FROM auth.identities i WHERE i.user_id = u.id ORDER BY i.last_sign_in_at DESC NULLS LAST LIMIT 1) AS last_sign_in_method,
             u.last_sign_in_at,
             (SELECT w.status FROM public.welcome_emails w WHERE w.user_id = u.id) AS welcome_status,
             (SELECT w.delivery_status FROM public.welcome_emails w WHERE w.user_id = u.id) AS welcome_delivery,
             o.website, o.industry, o.headquarters,
             coalesce(s.plan_key, 'employer_trial') AS plan_key,
             pl.name AS plan_name, pl.proposals_limit, pl.assessments_limit, pl.searches_limit,
             s.trial_ends_at, s.current_period_start, s.current_period_end, s.status AS sub_status,
             (SELECT count(*) FROM reveal_requests r WHERE r.org_id = o.id
               AND r.created_at >= coalesce(s.current_period_start, now() - interval '30 days')) AS proposals_used,
             (SELECT count(*) FROM assessments x WHERE x.org_id = o.id
               AND x.created_at >= coalesce(s.current_period_start, now() - interval '30 days')) AS assessments_used,
             (SELECT count(*) FROM employer_searches es WHERE es.org_id = o.id
               AND es.created_at >= coalesce(s.current_period_start, now() - interval '30 days')) AS searches_used
      FROM employer_accounts ea
      JOIN auth.users u ON u.id = ea.user_id AND u.banned_until IS NULL
      LEFT JOIN orgs o ON o.created_by = ea.user_id
      LEFT JOIN subscriptions s ON s.user_id = ea.user_id
      LEFT JOIN plans pl ON pl.key = coalesce(s.plan_key, 'employer_trial')
      WHERE ea.status <> 'pending_approval'
    ) a), '[]'::jsonb),
    'plans', coalesce((SELECT jsonb_agg(row_to_json(q) ORDER BY q.sort) FROM (
      SELECT key, name, price_cents, proposals_limit, assessments_limit, searches_limit, sort
      FROM plans WHERE audience = 'employer' AND active
    ) q), '[]'::jsonb)
  );
END;
$function$;

-- Signup health in one call: how people are signing up, whether welcome emails are keeping up,
-- and the newest accounts. Feeds the Overview card.
create or replace function public.get_admin_signup_health()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not has_role((select auth.uid()), 'admin'::app_role) then
    raise exception 'Admin access required';
  end if;
  return jsonb_build_object(
    'signups_7d', (select count(*) from auth.users where email is not null and email not like 'erased+%@erased.invalid' and created_at >= now() - interval '7 days'),
    'unverified_7d', (select count(*) from auth.users where email is not null and email not like 'erased+%@erased.invalid' and email_confirmed_at is null and created_at >= now() - interval '7 days'),
    'by_provider_7d', coalesce((select jsonb_object_agg(provider, n) from (
        select coalesce(raw_app_meta_data ->> 'provider', 'email') as provider, count(*) as n
        from auth.users where email is not null and email not like 'erased+%@erased.invalid' and created_at >= now() - interval '7 days' group by 1) b), '{}'::jsonb),
    'welcome', jsonb_build_object(
      'pending', (select count(*) from welcome_emails where status in ('pending', 'sending')),
      'failed', (select count(*) from welcome_emails where status = 'failed'),
      'sent_7d', (select count(*) from welcome_emails where status = 'sent' and sent_at >= now() - interval '7 days'),
      'bounced_7d', (select count(*) from welcome_emails where delivery_status in ('bounced', 'complained') and sent_at >= now() - interval '7 days'),
      'oldest_pending_minutes', (select floor(extract(epoch from (now() - min(queued_at))) / 60) from welcome_emails where status in ('pending', 'sending'))
    ),
    'recent', coalesce((select jsonb_agg(row_to_json(r)) from (
      select u.id as user_id, u.email, u.created_at,
             coalesce(u.raw_app_meta_data ->> 'provider', 'email') as provider,
             (ea.user_id is not null) as is_employer,
             (u.email_confirmed_at is not null) as email_confirmed,
             w.status as welcome_status, w.delivery_status as welcome_delivery
      from auth.users u
      left join employer_accounts ea on ea.user_id = u.id
      left join welcome_emails w on w.user_id = u.id
      where u.email is not null and u.email not like 'erased+%@erased.invalid' and u.banned_until is null
      order by u.created_at desc limit 10) r), '[]'::jsonb)
  );
end;
$$;
revoke all on function public.get_admin_signup_health() from public, anon;
grant execute on function public.get_admin_signup_health() to authenticated, service_role;
