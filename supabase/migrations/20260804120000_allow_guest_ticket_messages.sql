-- The Contact page is about to embed TicketForm for signed-out visitors, so
-- a guest submitting the form has to actually be able to complete it. Three
-- separate things were blocking that, found by simulating the exact anon
-- insert path directly against Postgres:
--
-- 1. "Duty and admins can view all tickets" (and the ticket_messages
--    equivalent) calls has_duty_access(auth.uid()) and applies to the
--    `public` role, which anon inherits -- but anon was never granted
--    EXECUTE on that function. Any insert().select() as anon (the normal
--    supabase-js pattern) threw a hard permission error before a row could
--    even be returned. has_duty_access is SECURITY DEFINER and a plain
--    existence check, so a NULL uid (anon) safely evaluates to false --
--    there is nothing unsafe about letting anon call it, it was just never
--    granted.
grant execute on function public.has_duty_access(uuid) to anon;

-- 2. Even after that grant, INSERT ... RETURNING re-checks the new row
--    against the table's SELECT policies (Postgres treats RETURNING like an
--    implicit SELECT). No SELECT policy on support_tickets grants anon
--    visibility into a guest ticket it just created (the only three
--    policies are "own row by auth.uid()", "admin", "duty/admin" -- all
--    false for a guest), so INSERT ... RETURNING itself failed with a row
--    level security error even though the INSERT's own WITH CHECK passed.
--    Fix on the client (TicketForm.tsx), not here: generate the ticket id
--    client side and stop asking Postgres to hand the row back.
--
-- 3. ticket_messages' insert policy re-queries support_tickets by hand
--    ("EXISTS (SELECT ... FROM support_tickets WHERE ...)"), and that
--    subquery is itself subject to support_tickets' RLS -- same invisible
--    guest row problem as #2, this time inside a WITH CHECK. Moved the
--    ownership check into a SECURITY DEFINER helper (the same pattern
--    has_duty_access/has_role already use) so it runs with the check
--    bypassed, while still enforcing the identical boundary: a message can
--    only attach to a ticket that is either the caller's own authenticated
--    ticket, or an unclaimed guest ticket (user_id IS NULL). This does not
--    loosen anything for real accounts -- user_id = auth.uid() is never
--    true for anon against another person's real ticket.
create or replace function public.ticket_belongs_to_caller(p_ticket_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.support_tickets
    where id = p_ticket_id
      and (
        user_id = (select auth.uid())
        or ((select auth.uid()) is null and user_id is null)
      )
  )
$$;

grant execute on function public.ticket_belongs_to_caller(uuid) to anon, authenticated;

drop policy if exists "Users can create messages on own tickets" on public.ticket_messages;

create policy "Users can create messages on own tickets"
on public.ticket_messages
for insert
to public
with check (
  public.ticket_belongs_to_caller(ticket_id)
  and sender_type = 'user'::ticket_sender_type
  and is_internal_note = false
);
