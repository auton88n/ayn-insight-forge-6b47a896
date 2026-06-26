create table if not exists public.ext_answers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  question_hash text not null,
  question_text text not null,
  answer_text text not null,
  use_count integer not null default 1,
  last_company text,
  last_role text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, question_hash)
);
create index if not exists idx_ext_answers_user on public.ext_answers(user_id, updated_at desc);
grant select, insert, update, delete on public.ext_answers to authenticated;
grant all on public.ext_answers to service_role;
alter table public.ext_answers enable row level security;
create policy "users read own ext_answers" on public.ext_answers for select to authenticated using ((select auth.uid()) = user_id);
create policy "users insert own ext_answers" on public.ext_answers for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "users update own ext_answers" on public.ext_answers for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "users delete own ext_answers" on public.ext_answers for delete to authenticated using ((select auth.uid()) = user_id);

create table if not exists public.ext_ask_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  session_id uuid not null,
  role text not null check (role in ('user','assistant','system')),
  content text not null,
  context jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_ext_ask_user_session on public.ext_ask_messages(user_id, session_id, created_at);
grant select, insert, delete on public.ext_ask_messages to authenticated;
grant all on public.ext_ask_messages to service_role;
alter table public.ext_ask_messages enable row level security;
create policy "users read own ask msgs" on public.ext_ask_messages for select to authenticated using ((select auth.uid()) = user_id);
create policy "users insert own ask msgs" on public.ext_ask_messages for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "users delete own ask msgs" on public.ext_ask_messages for delete to authenticated using ((select auth.uid()) = user_id);