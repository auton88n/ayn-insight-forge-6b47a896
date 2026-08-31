-- v3.316.0 -- closes the one real gap the auto-apply Answer Library had:
-- everything to answer a known screening question (KNOWN_QUESTIONS in
-- applicationAnswers.ts, the 12-question Screening section in
-- ProfileTab.tsx, the screening_answers jsonb column) already existed --
-- what never existed was the write-back. A person typing a real answer
-- into a "not on file" field during a live application review
-- (AutoApplyPanel's own review step) had that answer used once, for that
-- one application, and thrown away; the identical question on the next
-- real application showed the same empty prompt again. This function is
-- the one missing piece: an atomic, concurrency-safe merge of newly
-- learned answers into the person's own profile, same pattern already
-- proven by record_widget_domain/increment_widget_pattern_flag -- a plain
-- read-then-write from the edge function would race against a concurrent
-- Profile save; `||` merge inside one UPDATE cannot.
create or replace function public.merge_screening_answers(p_user_id uuid, p_answers jsonb)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.user_profile_canonical (user_id, screening_answers, updated_at)
  values (p_user_id, p_answers, now())
  on conflict (user_id) do update
    set screening_answers = user_profile_canonical.screening_answers || excluded.screening_answers,
        updated_at = now();
$$;

revoke all on function public.merge_screening_answers(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.merge_screening_answers(uuid, jsonb) to service_role;
