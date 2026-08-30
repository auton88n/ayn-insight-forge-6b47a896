-- Adds the flag-and-retrain loop the shared Form Intelligence cache
-- (form_widget_patterns, v3.290.0) never had: a real user can say "this
-- classification was wrong," and a periodic sweep can re-classify a
-- flagged or stale pattern without needing to encounter it live on a
-- real page again.
--
-- signature stores the widget's own raw structural shape (tag, role,
-- aria attribute names, immediate-child tag counts, class hint) --
-- everything canonicalSignature() in formIntelligence.ts already hashes,
-- just also kept in full alongside the hash. Without this, a flagged
-- row could be marked "needs another look" but never actually re-looked
-- at, since nothing about the widget's own shape survived anywhere. It
-- is nullable and backfilled going forward only -- existing rows keep
-- working exactly as before, just without a stored shape to replay
-- until they're next seen live (the same graceful-degradation the rest
-- of this table already leans on).
alter table public.form_widget_patterns
  add column if not exists signature jsonb,
  add column if not exists needs_review boolean not null default false,
  add column if not exists flagged_count integer not null default 0,
  add column if not exists last_flagged_at timestamptz;

comment on column public.form_widget_patterns.signature is
  'The widget''s own raw structural shape (tag/role/ariaAttrs/childShape/classHint), stored so a flagged or stale row can be re-classified without needing to encounter it live again. Never the question text or any personal data -- the identical sanitized shape auto_apply_classify_widgets already trusts.';
comment on column public.form_widget_patterns.needs_review is
  'True once flagged_count crosses the review threshold, or set directly by the periodic retrain sweep for a stale ai-confidence row. classifyWidgets treats this as a cache miss even on a hash match, forcing a fresh classification.';

-- A real record of every real flag, not just a running count on the
-- pattern row -- lets an admin (or a future audit) see who flagged what
-- and when, and survives even if the pattern row itself later changes
-- shape. No RLS policies granted to anon/authenticated, same
-- service-role-only shape as form_widget_patterns itself: a flag is
-- recorded server-side, inside resume-hub, after the same auth/rate-limit
-- gates every other action already runs through, never written directly
-- by a client over PostgREST.
create table if not exists public.form_widget_pattern_flags (
  id uuid primary key default gen_random_uuid(),
  signature_hash text not null,
  flagged_by uuid references auth.users(id) on delete set null,
  note text,
  created_at timestamptz not null default now()
);

alter table public.form_widget_pattern_flags enable row level security;

comment on table public.form_widget_pattern_flags is
  'One row per real user flag against a cached form_widget_patterns classification. Service-role only.';

create index if not exists form_widget_pattern_flags_hash_idx
  on public.form_widget_pattern_flags (signature_hash);

-- Atomic, not a read-then-write from the edge function -- two flags
-- landing at nearly the same moment (plausible: the same wrong-looking
-- widget shape shown to several real users at once on a popular ATS
-- platform) must not silently lose one of them to a race. Returns the
-- row's new flagged_count and whether this call is what just crossed
-- the review threshold, so the caller can log/alert on that transition
-- without a second query. service_role only, matching every other
-- function this table's own access pattern already uses.
create or replace function public.increment_widget_pattern_flag(
  p_hash text,
  p_threshold integer default 2
) returns table(new_count integer, now_needs_review boolean)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
    update public.form_widget_patterns
    set flagged_count = flagged_count + 1,
        last_flagged_at = now(),
        needs_review = needs_review or (flagged_count + 1) >= p_threshold
    where signature_hash = p_hash
    returning flagged_count, needs_review;
end;
$$;

revoke all on function public.increment_widget_pattern_flag(text, integer) from public;
grant execute on function public.increment_widget_pattern_flag(text, integer) to service_role;
