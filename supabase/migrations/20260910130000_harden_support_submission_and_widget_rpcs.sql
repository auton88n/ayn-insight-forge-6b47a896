-- Public support is intentionally available to guests, but the old flow let
-- any caller write tickets directly and invoke a separate unauthenticated
-- email relay. Route creation through support-submit instead: it validates
-- input, derives signed-in identity server-side, serializes the per-address
-- limit, and creates the ticket plus first message atomically.
drop policy if exists "Anyone can create tickets" on public.support_tickets;
drop policy if exists "Users can create messages on own tickets" on public.ticket_messages;
drop policy if exists "Service role can insert messages" on public.ticket_messages;

create or replace function public.submit_support_ticket(
  p_user_id uuid,
  p_name text,
  p_email text,
  p_subject text,
  p_category public.support_ticket_category,
  p_message text
) returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_email text := lower(btrim(p_email));
  v_ticket_id uuid;
begin
  if v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
     or length(v_email) > 254
     or p_subject is null or length(btrim(p_subject)) not between 1 and 200
     or p_message is null or length(btrim(p_message)) not between 1 and 10000
     or coalesce(length(btrim(p_name)), 0) > 120 then
    raise exception 'invalid support request';
  end if;

  -- Serializing by normalized address prevents concurrent requests from
  -- both passing the count and turning the three-per-day limit into a race.
  perform pg_advisory_xact_lock(hashtextextended(v_email, 0));
  if (select count(*) from public.support_tickets
      where lower(guest_email) = v_email
        and created_at > now() - interval '24 hours') >= 3 then
    raise exception 'support submission rate limit exceeded';
  end if;

  insert into public.support_tickets (user_id, guest_name, guest_email, subject, category, priority, status)
  values (p_user_id, nullif(btrim(p_name), ''), v_email, btrim(p_subject), p_category, 'medium', 'open')
  returning id into v_ticket_id;

  insert into public.ticket_messages (ticket_id, sender_type, sender_id, message)
  values (v_ticket_id, 'user', p_user_id, btrim(p_message));

  return v_ticket_id;
end;
$function$;

revoke all on function public.submit_support_ticket(uuid, text, text, text, public.support_ticket_category, text) from public, anon, authenticated;
grant execute on function public.submit_support_ticket(uuid, text, text, text, public.support_ticket_category, text) to service_role;

-- These functions were intended service-role-only in their original
-- migrations, but default PUBLIC grants remained effective in production.
revoke all on function public.increment_widget_pattern_flag(text, integer) from public, anon, authenticated;
grant execute on function public.increment_widget_pattern_flag(text, integer) to service_role;
revoke all on function public.record_widget_domain(text, text, integer) from public, anon, authenticated;
grant execute on function public.record_widget_domain(text, text, integer) to service_role;

-- Trigger-returning functions cannot be invoked through PostgREST. Excluding
-- them keeps the SECURITY DEFINER audit focused on callable RPC exposure.
create or replace function public.get_admin_security_definer_audit()
returns table(proname text, args text, granted_to text)
language plpgsql
stable security definer
set search_path to 'public'
as $function$
begin
  if not has_role((select auth.uid()), 'admin'::app_role) then
    raise exception 'Admin access required';
  end if;

  return query
  select p.proname::text, pg_get_function_arguments(p.oid), 'authenticated'::text
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.prosecdef = true
    and p.prorettype <> 'trigger'::regtype
    and has_function_privilege('authenticated', p.oid, 'EXECUTE')
    and p.prosrc !~* 'auth\.uid|has_role|has_duty_access'
  union all
  select p.proname::text, pg_get_function_arguments(p.oid), 'anon'::text
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.prosecdef = true
    and p.prorettype <> 'trigger'::regtype
    and has_function_privilege('anon', p.oid, 'EXECUTE')
    and p.prosrc !~* 'auth\.uid|has_role|has_duty_access'
  order by 1, 3;
end;
$function$;
