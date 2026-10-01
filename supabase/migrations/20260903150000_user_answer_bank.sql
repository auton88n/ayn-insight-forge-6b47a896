-- v3.328.0 -- "remember what I typed for next time," a real, distinct
-- capability from AI-invented answers: this only ever stores a value the
-- person actually typed themselves, into a field AYN had already told
-- them it had nothing on file for. A later, differently-worded question
-- on a different application is matched by real embedding similarity
-- (the same pgvector/HNSW pattern candidate_index already uses), not
-- exact text, so a paraphrase of a question already answered once is
-- recognized the second time.

-- ── user_answer_bank ────────────────────────────────────────────────
create table if not exists public.user_answer_bank (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  question_label text not null,
  answer_text text not null,
  embedding vector(768),
  embedding_model text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

grant select, insert, update, delete on public.user_answer_bank to authenticated;
grant all on public.user_answer_bank to service_role;

alter table public.user_answer_bank enable row level security;

-- Owner-only, every direction. This is the person's own real answers to
-- their own real applications -- nobody else, including an employer,
-- ever has any reason to read this table.
create policy "answer_bank_select_own" on public.user_answer_bank
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "answer_bank_insert_own" on public.user_answer_bank
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "answer_bank_update_own" on public.user_answer_bank
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "answer_bank_delete_own" on public.user_answer_bank
  for delete to authenticated using ((select auth.uid()) = user_id);

create index if not exists user_answer_bank_embedding_hnsw
  on public.user_answer_bank using hnsw (embedding vector_cosine_ops);
create index if not exists user_answer_bank_user_id_idx
  on public.user_answer_bank (user_id);

-- v3.328.0 -- the same rule this app's own history has hit and fixed
-- more than once already (CLAUDE.md's own note: "the single most
-- repeated bug class in this app's history"): a new table holding a
-- real user_id column needs a matching line in erase_account_core, in
-- the same migration that creates the table, not a follow-up fix later.
-- The full body below is the real, current, live definition (pulled
-- directly from the database, not reconstructed from an older
-- migration file, which would risk silently reverting an unrelated
-- later change) with exactly one line added.
CREATE OR REPLACE FUNCTION public.erase_account_core(p_user_id uuid, p_actor uuid, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  DECLARE
    v_email text;
    v_files integer := 0;
    v_ref text := 'erased-' || left(replace(p_user_id::text,'-',''), 8);
    v_org_ids uuid[];
  BEGIN
    SELECT email INTO v_email FROM auth.users WHERE id = p_user_id;
    IF v_email IS NULL THEN RAISE EXCEPTION 'No such account'; END IF;

    DELETE FROM public.resume_versions      WHERE user_id = p_user_id;
    DELETE FROM public.resumes              WHERE user_id = p_user_id;
    DELETE FROM public.cover_letters        WHERE user_id = p_user_id;
    DELETE FROM public.jobs                 WHERE user_id = p_user_id;
    DELETE FROM public.job_matches          WHERE user_id = p_user_id;
    DELETE FROM public.skills_to_learn      WHERE user_id = p_user_id;
    DELETE FROM public.job_postings_seen    WHERE user_id = p_user_id;
    DELETE FROM public.job_applications     WHERE user_id = p_user_id;
    DELETE FROM public.applications         WHERE user_id = p_user_id;
    DELETE FROM public.user_profile_data    WHERE user_id = p_user_id;
    DELETE FROM public.user_profile_canonical WHERE user_id = p_user_id;
    DELETE FROM public.candidate_index      WHERE user_id = p_user_id;
    DELETE FROM public.candidate_skills     WHERE user_id = p_user_id;
    DELETE FROM public.talent_pool_consent  WHERE user_id = p_user_id;
    DELETE FROM public.ai_result_cache      WHERE user_id = p_user_id;
    DELETE FROM public.user_memory          WHERE user_id = p_user_id;
    DELETE FROM public.user_preferences     WHERE user_id = p_user_id;
    DELETE FROM public.user_settings        WHERE user_id = p_user_id;
    DELETE FROM public.user_ai_limits       WHERE user_id = p_user_id;
    DELETE FROM public.user_answer_bank     WHERE user_id = p_user_id;
    DELETE FROM public.message_ratings      WHERE user_id = p_user_id;
    DELETE FROM public.favorite_chats       WHERE user_id = p_user_id;
    DELETE FROM public.messages             WHERE user_id = p_user_id;
    DELETE FROM public.chat_sessions        WHERE user_id = p_user_id;
    DELETE FROM public.beta_feedback        WHERE user_id = p_user_id;
    DELETE FROM public.ticket_messages      WHERE ticket_id IN (SELECT id FROM public.support_tickets WHERE user_id = p_user_id);
    DELETE FROM public.support_ticket_replies WHERE ticket_id IN (SELECT id FROM public.support_tickets WHERE user_id = p_user_id);
    DELETE FROM public.support_admin_reads  WHERE ticket_id IN (SELECT id FROM public.support_tickets WHERE user_id = p_user_id);
    DELETE FROM public.support_tickets      WHERE user_id = p_user_id;
    DELETE FROM public.device_fingerprints  WHERE user_id = p_user_id;
    DELETE FROM public.email_logs           WHERE user_id = p_user_id;
    DELETE FROM public.upgrade_intents      WHERE user_id = p_user_id;
    DELETE FROM public.access_grants        WHERE user_id = p_user_id;
    DELETE FROM public.user_subscriptions   WHERE user_id = p_user_id;
    DELETE FROM public.api_rate_limits      WHERE user_id = p_user_id;
    DELETE FROM public.rate_limits          WHERE user_id = p_user_id;
    DELETE FROM public.threat_detection     WHERE user_id = p_user_id;
    DELETE FROM public.terms_consent_log    WHERE user_id = p_user_id;
    DELETE FROM public.employer_accounts    WHERE user_id = p_user_id;
    DELETE FROM public.user_usage_daily     WHERE user_id = p_user_id;
    DELETE FROM public.usage_logs           WHERE user_id = p_user_id;
    DELETE FROM public.admin_totp_secrets   WHERE user_id = p_user_id;

    SELECT array_agg(org_id) INTO v_org_ids FROM public.org_members WHERE user_id = p_user_id;
    DELETE FROM public.org_members          WHERE user_id = p_user_id;
    DELETE FROM public.orgs
     WHERE id = ANY(v_org_ids)
       AND NOT EXISTS (SELECT 1 FROM public.org_members om WHERE om.org_id = orgs.id);

    DELETE FROM public.account_restrictions WHERE user_id = p_user_id;
    DELETE FROM public.account_limit_overrides WHERE user_id = p_user_id;
    DELETE FROM public.profiles             WHERE user_id = p_user_id OR id = p_user_id;
    DELETE FROM public.user_roles           WHERE user_id = p_user_id;
    DELETE FROM public.llm_usage_logs       WHERE user_id = p_user_id;

    v_files := public.admin_erase_storage(p_user_id);

    UPDATE public.ai_call_telemetry SET user_id = NULL WHERE user_id = p_user_id;
    UPDATE public.error_logs        SET user_id = NULL WHERE user_id = p_user_id;
    UPDATE public.security_logs     SET user_id = NULL WHERE user_id = p_user_id;
    UPDATE public.system_logs       SET user_id = NULL WHERE user_id = p_user_id;
    UPDATE public.cookie_consent_log SET user_id = NULL WHERE user_id = p_user_id;

    UPDATE public.reveal_requests SET candidate_ref = v_ref WHERE candidate_user_id = p_user_id;
    UPDATE public.assessments     SET candidate_ref = v_ref WHERE candidate_user_id = p_user_id;

    UPDATE auth.users SET
      banned_until = now() + interval '100 years',
      email = 'erased+' || replace(p_user_id::text,'-','') || '@erased.invalid',
      phone = NULL,
      raw_user_meta_data = '{}'::jsonb,
      email_change = '', phone_change = '',
      updated_at = now()
    WHERE id = p_user_id;
    DELETE FROM auth.identities WHERE user_id = p_user_id;
    DELETE FROM auth.sessions   WHERE user_id = p_user_id;

    INSERT INTO public.account_erasures (user_id, email_at_erasure, reason, erased_by)
    VALUES (p_user_id, v_email, btrim(p_reason), p_actor)
    ON CONFLICT (user_id) DO UPDATE
      SET reason = excluded.reason, erased_by = excluded.erased_by, erased_at = now(), updated_at = now();

    RETURN jsonb_build_object('ok', true, 'erased', true, 'email', v_email,
                              'candidate_ref', v_ref, 'files_removed', v_files);
  END; $function$;
