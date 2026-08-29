-- v3.296.0 -- a real, live diagnostics channel for the extension's own
-- field extraction/fill runs on a REAL third-party site, in a REAL
-- browser, so the actual results can be read directly from the
-- database rather than relayed by hand through a person watching a
-- screenshot. Deliberately narrow and privacy-safe by construction:
-- the payload this table ever holds is field LABELS/KINDS/structural
-- widget SIGNATURES (the exact same sanitized shape form_widget_patterns
-- already proves safe -- tag/role/ariaAttrs/childShape/classHint/
-- nearbyText/optionTexts, never a value) and fill SUCCESS/FAILURE per
-- label, never the actual value written into a field. No resume
-- content, no personal facts, no page HTML.
create table public.ext_diagnostics (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  page_hostname text,
  page_pathname text,
  report jsonb not null,
  note text
);

alter table public.ext_diagnostics enable row level security;

-- Owner can insert and read their own rows (matches how a signed-in
-- extension session already reads/writes everything else it touches).
create policy ext_diagnostics_insert_own
  on public.ext_diagnostics for insert
  with check (auth.uid() = user_id);

create policy ext_diagnostics_select_own
  on public.ext_diagnostics for select
  using (auth.uid() = user_id);

-- erase_account_core's own standing rule: any table with a user_id
-- column needs a matching line there. This one is pure content (a
-- diagnostic snapshot of a specific test run), so it is deleted
-- outright on erasure, the same treatment resumes/tailored versions
-- already get -- never anonymized-and-kept, since it holds nothing
-- worth retaining once its owner is gone.
