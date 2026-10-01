-- Retire AYN Autofill and replace the abandoned browser-event writer with a
-- consent-gated, first-party visitor measurement path.
--
-- The former direct INSERT policy let any public client write arbitrary rows
-- to visitor_analytics. Events now arrive only through visitor-track, which
-- validates a deliberately small payload and invokes the service-role-only
-- record_visitor_pageview RPC. The admin report is aggregate-only.

-- The public Terms/Privacy documents are updated in the same release to
-- remove the retired feature. Server-side enforcement must require exactly
-- the versions the browser now presents; otherwise signups and reacceptance
-- would drift apart.
insert into public.system_config (key, value, updated_at)
values (
  'legal_versions',
  '{"terms_version":"1.3","privacy_version":"2.5"}'::jsonb,
  now()
)
on conflict (key) do update
set value = excluded.value,
    updated_at = excluded.updated_at;

-- ── Retired autofill feature ──────────────────────────────────────────────
drop function if exists public.get_admin_ext_diagnostics(integer);
drop function if exists public.merge_screening_answers(uuid, jsonb);
drop function if exists public.increment_widget_pattern_flag(text, integer);
drop function if exists public.record_widget_domain(text, text, integer);

-- These tables were retired once before, but the feature is being removed
-- completely now. Keep the migration idempotent so an older production
-- database cannot retain historical extension credentials or run telemetry.
drop table if exists public.extension_tokens cascade;
drop table if exists public.extension_link_codes cascade;
drop table if exists public.ext_ask_messages cascade;
drop table if exists public.autofill_runs cascade;
drop table if exists public.ext_diagnostics;
drop table if exists public.user_answer_bank;
drop table if exists public.auto_apply_consent;
drop table if exists public.form_widget_pattern_flags;
drop table if exists public.form_widget_patterns;

alter table public.jobs
  drop column if exists auto_apply_charged_at;

alter table public.user_profile_canonical
  drop column if exists screening_answers;

-- The old public INSERT policy and its visitor-id-only rate limit are no
-- longer part of the ingestion path. This also removes its security-log
-- writes, which stored a caller-controlled visitor id.
drop policy if exists "Allow public inserts for tracking" on public.visitor_analytics;
drop policy if exists "Allow rate-limited public inserts for tracking" on public.visitor_analytics;
drop policy if exists "Allow validated visitor analytics inserts" on public.visitor_analytics;
drop function if exists public.check_visitor_analytics_rate_limit(text);
revoke insert, update, delete, truncate, references, trigger
  on public.visitor_analytics from anon, authenticated;

-- ── Consent-gated first-party analytics ───────────────────────────────────
create table if not exists public.visitor_analytics_rate_limits (
  source_hash text primary key check (source_hash ~ '^[0-9a-f]{64}$'),
  window_started_at timestamptz not null default now(),
  event_count integer not null default 1 check (event_count >= 1),
  last_seen_at timestamptz not null default now()
);

alter table public.visitor_analytics_rate_limits enable row level security;
revoke all on public.visitor_analytics_rate_limits from public, anon, authenticated;

create or replace function public.record_visitor_pageview(
  p_visitor_id text,
  p_page_path text,
  p_referrer text,
  p_source_hash text
) returns boolean
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_event_count integer;
begin
  -- This RPC is an internal seam between visitor-track and Postgres. A
  -- browser cannot call it through PostgREST, even if it knows its name.
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Service role required';
  end if;

  if p_visitor_id !~ '^[A-Za-z0-9-]{20,80}$'
    or p_page_path !~ '^/[^?#]{0,299}$'
    or p_source_hash !~ '^[0-9a-f]{64}$'
    or (p_referrer is not null and p_referrer !~ '^https?://[^/?#]{1,200}$') then
    raise exception 'Invalid visitor event';
  end if;

  -- Source hashes are only useful for the short rate-limit window. Expire
  -- inactive entries in small batches so this table does not become a
  -- long-lived network identifier store.
  delete from public.visitor_analytics_rate_limits
  where source_hash in (
    select source_hash
    from public.visitor_analytics_rate_limits
    where last_seen_at < now() - interval '2 days'
    order by last_seen_at
    limit 100
  );

  insert into public.visitor_analytics_rate_limits as limits
    (source_hash, window_started_at, event_count, last_seen_at)
  values (p_source_hash, now(), 1, now())
  on conflict (source_hash) do update
    set window_started_at = case
          when limits.window_started_at < now() - interval '1 minute' then now()
          else limits.window_started_at
        end,
        event_count = case
          when limits.window_started_at < now() - interval '1 minute' then 1
          else limits.event_count + 1
        end,
        last_seen_at = now()
  returning event_count into v_event_count;

  -- Page navigation can legitimately be fast in an SPA. Sixty events per
  -- source per minute is comfortably above normal use but bounds spam.
  if v_event_count > 60 then
    return false;
  end if;

  insert into public.visitor_analytics (visitor_id, page_path, referrer)
  values (p_visitor_id, p_page_path, p_referrer);
  return true;
end;
$function$;

revoke all on function public.record_visitor_pageview(text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.record_visitor_pageview(text, text, text, text)
  to service_role;

create or replace function public.get_admin_visitor_analytics()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if not has_role((select auth.uid()), 'admin'::app_role) then
    raise exception 'Admin access required';
  end if;

  return jsonb_build_object(
    'visitors24h', (
      select count(distinct visitor_id) from public.visitor_analytics
      where created_at >= now() - interval '24 hours'
    ),
    'visitors7d', (
      select count(distinct visitor_id) from public.visitor_analytics
      where created_at >= now() - interval '7 days'
    ),
    'visitors30d', (
      select count(distinct visitor_id) from public.visitor_analytics
      where created_at >= now() - interval '30 days'
    ),
    'pageviews30d', (
      select count(*) from public.visitor_analytics
      where created_at >= now() - interval '30 days'
    ),
    'daily', coalesce((
      select jsonb_agg(row_to_json(day_row) order by day_row.day)
      from (
        select
          created_at::date as day,
          count(*) as pageviews,
          count(distinct visitor_id) as visitors
        from public.visitor_analytics
        where created_at >= now() - interval '14 days'
        group by created_at::date
      ) day_row
    ), '[]'::jsonb),
    'topPaths', coalesce((
      select jsonb_agg(row_to_json(path_row) order by path_row.pageviews desc, path_row.page_path)
      from (
        select
          page_path,
          count(*) as pageviews,
          count(distinct visitor_id) as visitors
        from public.visitor_analytics
        where created_at >= now() - interval '30 days'
        group by page_path
        order by count(*) desc, page_path
        limit 20
      ) path_row
    ), '[]'::jsonb)
  );
end;
$function$;

revoke all on function public.get_admin_visitor_analytics() from public, anon;
grant execute on function public.get_admin_visitor_analytics() to authenticated;

-- Updated current erasure body. visitor_analytics is deliberately not tied
-- to an account id, and the retired tables above no longer exist.
create or replace function public.erase_account_core(p_user_id uuid, p_actor uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
  declare
    v_email text;
    v_files integer := 0;
    v_ref text := 'erased-' || left(replace(p_user_id::text,'-',''), 8);
    v_org_ids uuid[];
  begin
    select email into v_email from auth.users where id = p_user_id;
    if v_email is null then raise exception 'No such account'; end if;

    delete from public.resume_versions where user_id = p_user_id;
    delete from public.resumes where user_id = p_user_id;
    delete from public.cover_letters where user_id = p_user_id;
    delete from public.jobs where user_id = p_user_id;
    delete from public.job_matches where user_id = p_user_id;
    delete from public.skills_to_learn where user_id = p_user_id;
    delete from public.job_postings_seen where user_id = p_user_id;
    delete from public.job_applications where user_id = p_user_id;
    delete from public.applications where user_id = p_user_id;
    delete from public.user_profile_data where user_id = p_user_id;
    delete from public.user_profile_canonical where user_id = p_user_id;
    delete from public.candidate_index where user_id = p_user_id;
    delete from public.candidate_skills where user_id = p_user_id;
    delete from public.talent_pool_consent where user_id = p_user_id;
    delete from public.ai_result_cache where user_id = p_user_id;
    delete from public.user_memory where user_id = p_user_id;
    delete from public.user_preferences where user_id = p_user_id;
    delete from public.user_settings where user_id = p_user_id;
    delete from public.user_ai_limits where user_id = p_user_id;
    delete from public.message_ratings where user_id = p_user_id;
    delete from public.favorite_chats where user_id = p_user_id;
    delete from public.messages where user_id = p_user_id;
    delete from public.chat_sessions where user_id = p_user_id;
    delete from public.beta_feedback where user_id = p_user_id;
    delete from public.ticket_messages where ticket_id in (select id from public.support_tickets where user_id = p_user_id);
    delete from public.support_ticket_replies where ticket_id in (select id from public.support_tickets where user_id = p_user_id);
    delete from public.support_admin_reads where ticket_id in (select id from public.support_tickets where user_id = p_user_id);
    delete from public.support_tickets where user_id = p_user_id;
    delete from public.device_fingerprints where user_id = p_user_id;
    delete from public.email_logs where user_id = p_user_id;
    delete from public.upgrade_intents where user_id = p_user_id;
    delete from public.access_grants where user_id = p_user_id;
    delete from public.user_subscriptions where user_id = p_user_id;
    delete from public.api_rate_limits where user_id = p_user_id;
    delete from public.rate_limits where user_id = p_user_id;
    delete from public.threat_detection where user_id = p_user_id;
    delete from public.terms_consent_log where user_id = p_user_id;
    delete from public.employer_accounts where user_id = p_user_id;
    delete from public.user_usage_daily where user_id = p_user_id;
    delete from public.usage_logs where user_id = p_user_id;
    delete from public.admin_totp_secrets where user_id = p_user_id;

    select array_agg(org_id) into v_org_ids from public.org_members where user_id = p_user_id;
    delete from public.org_members where user_id = p_user_id;
    delete from public.orgs
      where id = any(v_org_ids)
        and not exists (select 1 from public.org_members om where om.org_id = orgs.id);

    delete from public.account_restrictions where user_id = p_user_id;
    delete from public.account_limit_overrides where user_id = p_user_id;
    delete from public.profiles where user_id = p_user_id or id = p_user_id;
    delete from public.user_roles where user_id = p_user_id;
    delete from public.llm_usage_logs where user_id = p_user_id;

    v_files := public.admin_erase_storage(p_user_id);

    update public.ai_call_telemetry set user_id = null where user_id = p_user_id;
    update public.error_logs set user_id = null where user_id = p_user_id;
    update public.security_logs set user_id = null where user_id = p_user_id;
    update public.system_logs set user_id = null where user_id = p_user_id;
    update public.cookie_consent_log set user_id = null where user_id = p_user_id;

    update public.reveal_requests set candidate_ref = v_ref where candidate_user_id = p_user_id;
    update public.assessments set candidate_ref = v_ref where candidate_user_id = p_user_id;

    update auth.users set
      banned_until = now() + interval '100 years',
      email = 'erased+' || replace(p_user_id::text,'-','') || '@erased.invalid',
      phone = null,
      raw_user_meta_data = '{}'::jsonb,
      email_change = '', phone_change = '',
      updated_at = now()
    where id = p_user_id;
    delete from auth.identities where user_id = p_user_id;
    delete from auth.sessions where user_id = p_user_id;

    insert into public.account_erasures (user_id, email_at_erasure, reason, erased_by)
    values (p_user_id, v_email, btrim(p_reason), p_actor)
    on conflict (user_id) do update
      set reason = excluded.reason, erased_by = excluded.erased_by, erased_at = now(), updated_at = now();

    return jsonb_build_object('ok', true, 'erased', true, 'email', v_email,
      'candidate_ref', v_ref, 'files_removed', v_files);
  end;
$function$;
