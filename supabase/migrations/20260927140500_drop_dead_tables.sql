-- Dead-code cleanup, dated 2026-09-27.
--
-- Tier 1: zero references anywhere -- no application code (repo grep),
-- no live Postgres function body, no trigger, nothing. Leftovers from
-- the pre-pivot chat/consulting platform and the old (pre-v3.20.0)
-- admin dashboard, confirmed dead independently of each other:
--   admin_ai_conversations   -- old AdminAIAssistant, deleted v3.20.0
--   agent_telegram_bots      -- pre-pivot Telegram bot personalities
--   ats_config               -- unidentified old-platform config, zero refs
--   ayn_mind                 -- pre-pivot "AYN Mind" subsystem
--   cc_inbox, cc_updates     -- unidentified old internal notes/changelog
--   news_cache               -- old World Intelligence-adjacent cache
--   security_incidents       -- superseded by security_logs/security_audit_logs
--   test_results, test_runs  -- old TestResultsDashboard, deleted v3.20.0
--   application_replies      -- tied to the deprecated applications table
--   admin_notification_log   -- zero refs, unlike admin_notification_config
--   pending_pin_changes      -- only consumer, approve-pin-change, deleted v3.83.0
--
-- Tier 2: referenced ONLY by erase_account_core (cleanup-only, just
-- edited above to drop these lines) or by the pre-Stripe "message tier"
-- signup trigger (handle_new_user, also just edited):
--   job_applications, applications -- named deprecated in this app's own
--                                      standing global rule (CLAUDE.md #1)
--   message_ratings, favorite_chats, beta_feedback -- old chat platform
--   device_fingerprints      -- superseded by real auth.sessions, v3.35.0
--   user_subscriptions, user_ai_limits -- the whole pre-Stripe message-
--     tier billing system: handle_new_user no longer inserts into either,
--     and their own trigger functions (sync_limits_on_tier_change,
--     sync_user_limits_on_subscription_change) plus four fully orphaned
--     sibling counters (increment_messages_daily/monthly,
--     increment_engineering_daily/monthly -- zero trigger attachments,
--     zero callers, zero repo references) go with them.
--
-- Verified before this ran: a real signup against the just-updated
-- handle_new_user, and a real erase_account_core call against that same
-- account, both succeeded cleanly with the new function bodies.

begin;

-- Trigger functions attached to user_subscriptions must be dropped
-- explicitly -- dropping the table drops the trigger, not the function
-- the trigger calls.
drop function if exists public.sync_limits_on_tier_change() cascade;
drop function if exists public.sync_user_limits_on_subscription_change() cascade;
drop function if exists public.increment_messages_daily() cascade;
drop function if exists public.increment_messages_monthly() cascade;
drop function if exists public.increment_engineering_daily() cascade;
drop function if exists public.increment_engineering_monthly() cascade;

drop table if exists public.user_subscriptions cascade;
drop table if exists public.user_ai_limits cascade;
drop table if exists public.job_applications cascade;
drop table if exists public.applications cascade;
drop table if exists public.message_ratings cascade;
drop table if exists public.favorite_chats cascade;
drop table if exists public.beta_feedback cascade;
drop table if exists public.device_fingerprints cascade;

drop table if exists public.admin_ai_conversations cascade;
drop table if exists public.agent_telegram_bots cascade;
drop table if exists public.ats_config cascade;
drop table if exists public.ayn_mind cascade;
drop table if exists public.cc_inbox cascade;
drop table if exists public.cc_updates cascade;
drop table if exists public.news_cache cascade;
drop table if exists public.security_incidents cascade;
drop table if exists public.test_results cascade;
drop table if exists public.test_runs cascade;
drop table if exists public.application_replies cascade;
drop table if exists public.admin_notification_log cascade;
drop table if exists public.pending_pin_changes cascade;

commit;
