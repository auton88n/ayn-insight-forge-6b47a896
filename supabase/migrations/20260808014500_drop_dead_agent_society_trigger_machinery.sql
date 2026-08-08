-- Drops the whole call_agent_if_not_debounced() trigger chain. Every one of
-- its 7 live triggers references agent_event_debounce, a table dropped back
-- in mid-June (decommission_dead_features), so every insert into the 5
-- tables below has been silently failing ever since -- confirmed by real
-- row data: none of them have a row newer than the debounce-table drop
-- (error_logs stopped 18 May, inbound_email_replies stopped 25 Feb,
-- ayn_sales_pipeline and ayn_mind both stopped 25 Apr, contact_messages has
-- zero rows ever).
--
-- This was found and documented, not fixed, in the v3.82.0 audit ("real,
-- live, currently-broken piece of the product... fix is either dropping the
-- now-pointless agent-society trigger machinery entirely or restoring the
-- table"). Fixed here because it directly blocked a real, live task: the
-- resend-inbound-webhook function couldn't insert into inbound_email_replies
-- while setting up support@ayn.careers to receive the Chrome Web Store
-- contact-email verification message, confirmed live via edge function logs
-- (every insert attempt was returning a 500).

drop trigger if exists on_error_logged on public.error_logs;
drop trigger if exists on_inbound_reply on public.inbound_email_replies;
drop trigger if exists on_pipeline_contacted on public.ayn_sales_pipeline;
drop trigger if exists on_new_pipeline_lead on public.ayn_sales_pipeline;
drop trigger if exists on_lead_needs_investigation on public.ayn_sales_pipeline;
drop trigger if exists on_new_contact_message on public.contact_messages;
drop trigger if exists on_employee_report on public.ayn_mind;

drop function if exists public.trigger_qa_watchdog();
drop function if exists public.trigger_follow_up_agent_email();
drop function if exists public.trigger_follow_up_agent_pipeline();
drop function if exists public.trigger_sales_outreach();
drop function if exists public.trigger_investigator();
drop function if exists public.trigger_customer_success();
drop function if exists public.trigger_chief_of_staff();
drop function if exists public.trigger_marketing();
drop function if exists public.trigger_outcome_evaluator();
drop function if exists public.call_agent_if_not_debounced(text, text, jsonb, integer);
