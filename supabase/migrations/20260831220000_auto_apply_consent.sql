-- v3.321.0 -- the one real, missing piece between the extension's already
-- mature fill engine (frame_agent.js/content.js) and "one click, filled and
-- submitted, once they've agreed." content.js was deliberately rebuilt at
-- v3.276.0 to never click a third-party site's own submit button, per
-- direct founder feedback at the time ("an autofill tool fills fields,
-- full stop"). Asked directly, later, for the opposite behavior -- but as
-- a real, explicit, recorded, revocable opt-in, not a silent default
-- change, exactly the same shape talent_pool_consent already uses for its
-- own "AYN acts on your behalf" decision. Mirrors that table's schema and
-- RLS shape precisely, not a new pattern.
create table public.auto_apply_consent (
  user_id uuid primary key references auth.users(id) on delete cascade,
  opted_in boolean not null default false,
  consented_at timestamptz,
  revoked_at timestamptz,
  consent_version text,
  updated_at timestamptz not null default now()
);

alter table public.auto_apply_consent enable row level security;

create policy "consent_select_own" on public.auto_apply_consent
  for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "consent_insert_own" on public.auto_apply_consent
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "consent_update_own" on public.auto_apply_consent
  for update to authenticated
  using ((select auth.uid()) = user_id);
