-- Reproduced live: any anonymous visitor could post a message into any
-- other guest's support ticket, since the old guest check was just
-- "caller is anonymous AND the target ticket has no owner" -- true for
-- every guest ticket, not just the caller's own. There is no session to
-- tie a guest to their ticket, so the fix is a per-ticket secret: a random
-- value the client generates and holds itself (the same pattern the ticket
-- id itself already uses -- crypto.randomUUID(), never read back from the
-- server), required on every subsequent guest write against that ticket.

alter table public.support_tickets add column if not exists guest_token uuid;
alter table public.ticket_messages add column if not exists guest_token uuid;

-- Data hygiene only: existing guest tickets predate this column and have no
-- token, so backfill one. This does not reopen or change anything live --
-- there is no guest reply UI today, so nothing currently depends on being
-- able to post a second guest message into an old ticket.
update public.support_tickets set guest_token = gen_random_uuid() where user_id is null and guest_token is null;

-- Drop the policy that depends on the old (insecure) function signature first.
drop policy "Users can create messages on own tickets" on public.ticket_messages;

-- The old single-argument version matched ANY guest ticket for ANY
-- anonymous caller; drop it outright rather than leave it as a second,
-- insecure overload alongside the fixed one.
drop function public.ticket_belongs_to_caller(uuid);

create function public.ticket_belongs_to_caller(p_ticket_id uuid, p_guest_token uuid default null)
returns boolean
language sql
stable security definer
set search_path to 'public'
as $function$
  select exists (
    select 1 from public.support_tickets
    where id = p_ticket_id
      and (
        user_id = (select auth.uid())
        or (
          (select auth.uid()) is null
          and user_id is null
          and guest_token is not null
          and guest_token = p_guest_token
        )
      )
  )
$function$;

grant execute on function public.ticket_belongs_to_caller(uuid, uuid) to anon, authenticated, service_role;

-- A guest ticket can no longer be created without a token to claim it with.
drop policy "Anyone can create tickets" on public.support_tickets;
create policy "Anyone can create tickets" on public.support_tickets for insert
  with check (
    (((select auth.uid()) is not null) and (user_id = (select auth.uid())))
    or (
      ((select auth.uid()) is null)
      and (user_id is null)
      and (guest_email is not null)
      and (length(guest_email) > 5)
      and (guest_token is not null)
    )
  );

-- A guest message insert must now supply the matching token.
create policy "Users can create messages on own tickets" on public.ticket_messages for insert
  with check (
    ticket_belongs_to_caller(ticket_id, guest_token)
    and (sender_type = 'user'::ticket_sender_type)
    and (is_internal_note = false)
  );
