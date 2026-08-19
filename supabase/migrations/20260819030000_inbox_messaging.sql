-- Inbox messaging, requested directly: real messages between an employer
-- and a candidate, living inside AYN rather than in anyone's real email
-- inbox. Deliberately attached to reveal_requests (the existing proposal
-- relationship) rather than a freestanding thread system — that's already
-- the one place anonymity-until-accepted is correctly enforced (assembled
-- in the edge function, never a raw table read), and blueprint.md's own
-- rule is to reuse an existing mechanism rather than build a second one
-- doing the same job. A message thread is a proposal; there is no message
-- thread without one.
--
-- One-way by default, matching what was actually asked for: a candidate
-- can never initiate two-way or a call. Only the employer can turn
-- two_way_enabled on for a given thread, and only the employer can block
-- a candidate from sending anything further on it.
alter table public.reveal_requests
  add column if not exists two_way_enabled boolean not null default false,
  add column if not exists candidate_blocked boolean not null default false;

comment on column public.reveal_requests.two_way_enabled is 'Employer-controlled. A candidate can never set this themselves.';
comment on column public.reveal_requests.candidate_blocked is 'Employer-controlled. Blocks further candidate replies on this thread.';

create table if not exists public.inbox_messages (
  id uuid primary key default gen_random_uuid(),
  reveal_request_id uuid not null references public.reveal_requests(id) on delete cascade,
  sender_role text not null check (sender_role in ('employer', 'candidate')),
  sender_user_id uuid references auth.users(id) on delete set null,
  kind text not null default 'text' check (kind in ('text', 'call_invite')),
  body text,
  call_url text,
  call_scheduled_at timestamptz,
  -- v3.163.0 message safety screening (rules-only, no AI cost) writes here.
  -- A blocked message is stored for the employer's own record and audit,
  -- but never surfaced to the candidate — enforced by the read policy
  -- below, not just by client-side filtering.
  status text not null default 'sent' check (status in ('sent', 'blocked')),
  block_reason text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_inbox_messages_reveal_request on public.inbox_messages(reveal_request_id, created_at);

alter table public.inbox_messages enable row level security;

-- Deny-by-default, same shape as assessment_rubrics/assessment_results:
-- every write goes through a resume-hub action (service role), so the
-- safety screen always runs before anything is stored or delivered. RLS
-- here only ever grants reads, and only to the two real participants.
revoke all on public.inbox_messages from anon, authenticated;

create policy "inbox_messages_select_employer_org"
  on public.inbox_messages for select
  to authenticated
  using (
    exists (
      select 1 from public.reveal_requests rr
      join public.org_members m on m.org_id = rr.org_id
      where rr.id = inbox_messages.reveal_request_id
        and m.user_id = (select auth.uid())
    )
  );

create policy "inbox_messages_select_candidate"
  on public.inbox_messages for select
  to authenticated
  using (
    status = 'sent'
    and exists (
      select 1 from public.reveal_requests rr
      where rr.id = inbox_messages.reveal_request_id
        and rr.candidate_user_id = (select auth.uid())
    )
  );

grant select on public.inbox_messages to authenticated;
