
-- pgvector for semantic recall
create extension if not exists vector;

-- ── talent_pool_consent ─────────────────────────────────────────────
create table if not exists public.talent_pool_consent (
  user_id uuid primary key references auth.users(id) on delete cascade,
  opted_in boolean not null default false,
  consented_at timestamptz,
  revoked_at timestamptz,
  updated_at timestamptz not null default now()
);

grant select, insert, update on public.talent_pool_consent to authenticated;
grant all on public.talent_pool_consent to service_role;

alter table public.talent_pool_consent enable row level security;

create policy "consent_select_own" on public.talent_pool_consent
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "consent_insert_own" on public.talent_pool_consent
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "consent_update_own" on public.talent_pool_consent
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- ── candidate_index ─────────────────────────────────────────────────
create table if not exists public.candidate_index (
  user_id uuid primary key references auth.users(id) on delete cascade,
  headline text,
  summary text,
  seniority text,
  location text,
  years_experience numeric,
  embedding vector(768),
  profile_text text,
  indexed_at timestamptz not null default now()
);

grant select on public.candidate_index to authenticated;
grant all on public.candidate_index to service_role;

alter table public.candidate_index enable row level security;

-- Users can read only their own row. No cross-user select policy;
-- employer search in Phase B runs via the service role and is gated on
-- talent_pool_consent.opted_in.
create policy "candidate_index_select_own" on public.candidate_index
  for select to authenticated using ((select auth.uid()) = user_id);

-- HNSW cosine index (pgvector >= 0.5). 768 dims fits within HNSW's cap.
create index if not exists candidate_index_embedding_hnsw
  on public.candidate_index using hnsw (embedding vector_cosine_ops);

-- ── candidate_skills ────────────────────────────────────────────────
create table if not exists public.candidate_skills (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  skill text not null,
  skill_norm text not null,
  provenance text not null check (provenance in ('extracted','inferred')),
  source text,
  created_at timestamptz not null default now(),
  unique (user_id, skill_norm, provenance)
);

grant select, delete on public.candidate_skills to authenticated;
grant all on public.candidate_skills to service_role;

alter table public.candidate_skills enable row level security;

create policy "candidate_skills_select_own" on public.candidate_skills
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "candidate_skills_delete_own" on public.candidate_skills
  for delete to authenticated using ((select auth.uid()) = user_id);

create index if not exists candidate_skills_skill_norm_idx on public.candidate_skills (skill_norm);
create index if not exists candidate_skills_user_idx on public.candidate_skills (user_id);
