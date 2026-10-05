-- One-off cleanup of test and non-real data, 5 October 2026.
-- Backup already taken: /root/backups/pre-cleanup-20261005-1037.dump (on the server).
-- Runs as one transaction: it either fully applies or not at all.
-- Leaves alone: the 5 real accounts and their data, the Hoolet company, genuine security events,
-- cookie consent records and the old chat and sales tables.
\set ON_ERROR_STOP on

\echo === BEFORE
select 'visitor_analytics' t, count(*) from visitor_analytics
union all select 'security_logs', count(*) from security_logs
union all select 'error_logs', count(*) from error_logs
union all select 'ai_call_telemetry', count(*) from ai_call_telemetry
union all select 'email_logs', count(*) from email_logs
union all select 'auth.users', count(*) from auth.users
union all select 'orgs', count(*) from orgs
union all select 'support_tickets', count(*) from support_tickets;

begin;

-- 1. Dead test accounts: already erased, only the empty shell remains.
-- Their last few error rows must go first, or the database refuses to remove the account.
delete from error_logs where user_id in (select id from auth.users where email like 'erased+%@erased.invalid');
do $$
declare r record; n int := 0;
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', '1d5aef56-4c7e-4880-a41c-3f6e29ced2be', 'role', 'authenticated')::text, true);
  for r in select id, email from auth.users where email like 'erased+%@erased.invalid' loop
    perform public.admin_purge_account(r.id, 'test cleanup', r.email);
    n := n + 1;
  end loop;
  raise notice 'purged % test accounts', n;
end $$;

-- 2. Demo company and test support tickets.
delete from orgs where name like 'AYN Preview Co%';
delete from ticket_messages where ticket_id in (select id from support_tickets where guest_email like '%@ayn-test.local');
delete from support_tickets where guest_email like '%@ayn-test.local';

-- 3. Visitor table: nothing in it is a real outside visitor (Lovable previews, bots, the founder).
delete from visitor_analytics;

-- 4. Backend self-audit noise with no person attached.
delete from security_logs
 where action in ('sensitive_data_access', 'sensitive_profile_access') and user_id is null;

-- 5. Errors from the old product, Lovable previews and local development.
delete from error_logs
 where created_at < '2026-07-30'
    or url ~* '^https?://(localhost|127\.0\.0\.1)'
    or url ~* 'lovable'
    or url ~* 'aynn\.io';

-- 6. AI calls that belong to no real account, and emails to test addresses.
delete from ai_call_telemetry where user_id is null or user_id not in (select id from auth.users);
delete from email_logs
 where recipient_email ~* '(@resend\.dev|@example\.com|@ayn-test\.local|@erased\.invalid)$';

commit;

\echo === AFTER
select 'visitor_analytics' t, count(*) from visitor_analytics
union all select 'security_logs', count(*) from security_logs
union all select 'error_logs', count(*) from error_logs
union all select 'ai_call_telemetry', count(*) from ai_call_telemetry
union all select 'email_logs', count(*) from email_logs
union all select 'auth.users', count(*) from auth.users
union all select 'orgs', count(*) from orgs
union all select 'support_tickets', count(*) from support_tickets;
