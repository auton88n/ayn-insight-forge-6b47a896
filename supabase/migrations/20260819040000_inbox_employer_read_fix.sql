-- Fixes a real gap in 20260819030000_inbox_messaging.sql: the employer-side
-- SELECT policy on inbox_messages joined through reveal_requests, but
-- reveal_requests has no employer-facing SELECT policy of its own (only
-- "candidate can see their own row"). Under RLS, a subquery's reference to
-- another RLS-protected table is itself filtered by that table's own
-- policies, so the join silently saw zero reveal_requests rows for any
-- employer and the whole EXISTS clause always failed. Confirmed live:
-- direct table reads returned rows to postgres, but the identical query
-- simulated under the employer's own JWT returned none.
--
-- Fixed the same way this codebase has fixed this exact class of bug
-- before (has_role(), ticket_belongs_to_caller()): a SECURITY DEFINER
-- helper that checks the real relationship internally, bypassing RLS on
-- the table it reads, rather than depending on the caller already having
-- row-level visibility into a table via a different table's policy.

create or replace function public.is_org_member_for_reveal_request(p_reveal_request_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.reveal_requests rr
    join public.org_members m on m.org_id = rr.org_id
    where rr.id = p_reveal_request_id
      and m.user_id = auth.uid()
  );
$$;

revoke all on function public.is_org_member_for_reveal_request(uuid) from public;
grant execute on function public.is_org_member_for_reveal_request(uuid) to authenticated;

drop policy if exists "inbox_messages_select_employer_org" on public.inbox_messages;

create policy "inbox_messages_select_employer_org"
  on public.inbox_messages for select
  to authenticated
  using (public.is_org_member_for_reveal_request(reveal_request_id));
