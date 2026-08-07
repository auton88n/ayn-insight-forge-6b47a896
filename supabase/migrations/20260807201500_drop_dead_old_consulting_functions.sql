-- Drops confirmed-dead SECURITY DEFINER functions left over from the old
-- consulting/AI-chat product (message-tier billing, chat memory, encrypted
-- alert subsystem, old client-intake fields, generic admin-audit helpers
-- superseded by their get_admin_* replacements, and a handful of World
-- Intelligence-era functions that already reference tables dropped in the
-- v3.81.0 cleanup). Every one of these was confirmed via raw pg_proc.proacl
-- to be granted to service_role/postgres only -- none are directly callable
-- by any signed-in or anonymous user via PostgREST, so this is dead-code
-- cleanup, not a security fix (the security fix, closing credit_grant and
-- its siblings, already happened in an earlier migration this session).
--
-- Deliberately NOT included: call_agent_if_not_debounced() and the 9
-- trigger_* functions that call it, since two of those triggers
-- (on error_logs and inbound_email_replies) are a real, live, currently-
-- broken piece of the product (referencing a table dropped back in June),
-- and fixing that is a separate founder decision, not a dead-code sweep.
-- extract_memories_from_message() is dropped here because its own trigger
-- is being dropped in the same statement, and its only writer (ayn-unified)
-- was already deleted in v3.81.0 -- this one really is just dead.

drop trigger if exists extract_memories_on_message on public.messages;
drop function if exists public.extract_memories_from_message();

drop function if exists public.apply_credit_topup(uuid, integer);
drop function if exists public.add_bonus_credits(uuid, integer, text, text, uuid);
drop function if exists public.check_usage_limit(uuid);
drop function if exists public.check_user_ai_limit(uuid, text);
drop function if exists public.get_user_context(uuid);
drop function if exists public.upsert_user_memory(uuid, text, text, jsonb, integer);
drop function if exists public.delete_user_chat_sessions(uuid, uuid[]);
drop function if exists public.cleanup_expired_memories();
drop function if exists public.get_profile_business_context(uuid, text);
drop function if exists public.update_profile_business_context(uuid, text, text);
drop function if exists public.create_system_alert(text, text, text, text, uuid, jsonb);
drop function if exists public.get_alert_history_with_emails(uuid, text);
drop function if exists public.encrypt_email(text, text);
drop function if exists public.encrypt_text(text, text);
drop function if exists public.decrypt_email(bytea, text);
drop function if exists public.decrypt_text(bytea, text);
drop function if exists public.cc_lookup_user_by_email(text);
-- CASCADE: service_applications' own "Rate limited applications" INSERT
-- policy calls this function directly in its WITH CHECK clause. The table
-- is confirmed empty (0 rows) and a second deprecated applications tracker
-- alongside applications/job_applications (see CLAUDE.md global rule #3),
-- so the policy is dead weight too, not a live gate being removed.
drop function if exists public.check_application_rate_limit(text) cascade;
drop function if exists public.get_user_status(uuid);
drop function if exists public.get_user_profile_secure(uuid);
drop function if exists public.get_usage_stats(uuid);
drop function if exists public.manage_user_role(uuid, app_role);
drop function if exists public.get_rate_limit_stats();
drop function if exists public.get_extension_security_status();
drop function if exists public.get_security_extension_audit();
-- check_visitor_analytics_rate_limit(text) is EXCLUDED from this cleanup:
-- unlike its sibling below, this one is genuinely live. visitor_analytics
-- holds 1,926 rows with 235 written in just the last 7 days (most recent
-- 2026-08-03), gated by an INSERT policy that calls this function directly
-- -- confirmed by re-checking real row activity before dropping, not by
-- trusting the earlier audit's "dead, generic" classification, which was
-- wrong here. Left alone.
drop function if exists public.check_webhook_rate_limit(uuid, text);
drop function if exists public.get_global_intelligence_dashboard();
drop function if exists public.get_predictions_by_domain(text, text);
drop function if exists public.ayn_adjust_trust(text, text, integer);
drop function if exists public.mark_email_opened(uuid);
drop function if exists public.increment_template_usage(uuid);
