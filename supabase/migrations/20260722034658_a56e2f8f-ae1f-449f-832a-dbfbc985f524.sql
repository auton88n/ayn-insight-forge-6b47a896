
create table if not exists public.orgs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  website text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create table if not exists public.org_members (
  org_id uuid not null references public.orgs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'admin',
  created_at timestamptz not null default now(),
  primary key (org_id, user_id)
);
create table if not exists public.employer_searches (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  created_by uuid references auth.users(id) on delete set null,
  job_spec jsonb not null,
  results jsonb,
  ref_map jsonb,
  created_at timestamptz not null default now()
);
create table if not exists public.reveal_requests (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  candidate_user_id uuid not null references auth.users(id) on delete cascade,
  search_id uuid references public.employer_searches(id) on delete set null,
  candidate_ref text,
  status text not null default 'pending' check (status in ('pending','approved','declined')),
  created_at timestamptz not null default now(),
  decided_at timestamptz
);

grant select, insert on public.orgs to authenticated;
grant all on public.orgs to service_role;
grant select, insert on public.org_members to authenticated;
grant all on public.org_members to service_role;
grant all on public.employer_searches to service_role;
grant select, update on public.reveal_requests to authenticated;
grant all on public.reveal_requests to service_role;

alter table public.orgs enable row level security;
alter table public.org_members enable row level security;
alter table public.employer_searches enable row level security;
alter table public.reveal_requests enable row level security;

create policy "orgs_select_member" on public.orgs
  for select to authenticated using (
    exists (select 1 from public.org_members m
            where m.org_id = orgs.id and m.user_id = (select auth.uid()))
  );
create policy "orgs_insert_own" on public.orgs
  for insert to authenticated with check ((select auth.uid()) = created_by);

create policy "org_members_select_own" on public.org_members
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "org_members_insert_self" on public.org_members
  for insert to authenticated with check ((select auth.uid()) = user_id);

create policy "reveal_select_own_candidate" on public.reveal_requests
  for select to authenticated using ((select auth.uid()) = candidate_user_id);
create policy "reveal_update_own_candidate" on public.reveal_requests
  for update to authenticated
  using ((select auth.uid()) = candidate_user_id)
  with check ((select auth.uid()) = candidate_user_id);

create index if not exists reveal_candidate_idx on public.reveal_requests (candidate_user_id, status);
create index if not exists reveal_search_idx on public.reveal_requests (search_id);
create index if not exists org_members_user_idx on public.org_members (user_id);
