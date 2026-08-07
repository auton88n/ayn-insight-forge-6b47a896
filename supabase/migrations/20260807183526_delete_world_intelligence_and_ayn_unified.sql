-- Deletes the old-build "World Intelligence" / prediction-engine system and
-- the ayn-agent-society backend that powered it, on direct request ("delete
-- old build"). Confirmed dead: 21 pg_cron jobs whose target edge functions
-- (ayn-agent-society and a family of intelligence-gathering functions) no
-- longer exist or were never real product surface, plus every table those
-- crons and the agent-society function wrote to. Also removes the ENTIRE
-- archive schema (48 tables), discovered mid-audit via a foreign-key
-- dependency check -- it holds the pre-pivot engineering-consulting tool's
-- data (building codes, calculation history, climate zones, material
-- prices) plus old pivot-era company/founder-context/outreach data, none of
-- it reachable from any live route or edge function. Confirmed with the
-- founder via two rounds of explicit confirmation before deleting.
--
-- Left deliberately untouched: ayn_activity_log, ayn_error_log (real,
-- used by cleanup_old_logs()/refresh_daily_summaries()), the 4 crons that
-- call real live generic functions (ayn-daily-report, daily-log-cleanup,
-- keep-warm, refresh-daily-summaries), and resource-monitor-hourly (also
-- dead, but not World-Intelligence-domain-named, out of this scope).
-- cc_inbox, cc_updates, ats_config, ayn_sales_pipeline, ayn_mind,
-- news_cache, agent_telegram_bots were also left alone as ambiguous.

-- 1. Unschedule the 21 dead World Intelligence cron jobs.
select cron.unschedule(jobname) from (values
  ('ayn-consumer-weekly'), ('ayn-follow-up-agent-loop'), ('ayn-geo-daily'),
  ('ayn-global-intelligence-daily'), ('ayn-gov-daily'), ('ayn-health-weekly'),
  ('ayn-jobs-daily'), ('ayn-market-prices-2h'), ('ayn-news-twice-daily'),
  ('ayn-osint-fast-6h'), ('ayn-osint-gdelt-6h'), ('ayn-proactive-loop-heartbeat'),
  ('ayn-pulse-engine-cron'), ('ayn-realestate-weekly'), ('ayn-refresh-intelligence-brief'),
  ('ayn-sectors-3day'), ('ayn-startups-daily'), ('ayn-supply-daily'),
  ('ayn-tech-daily'), ('ayn-trade-flows-weekly'), ('ayn-world-signals-6h')
) as jobs(jobname)
where exists (select 1 from cron.job where cron.job.jobname = jobs.jobname);

-- 2. Drop the dead placeholder function the intelligence-brief cron called.
drop function if exists public.refresh_intelligence_brief();

-- 3. Drop the entire archive schema (old engineering-consulting tool data
--    plus old pivot-era company/founder-context/outreach data). CASCADE
--    handles the one legitimate cross-schema foreign key.
drop schema if exists archive cascade;

-- 4. Drop the 24 public-schema World Intelligence / agent-society tables.
drop table if exists public.agent_society_messages;
drop table if exists public.agent_society_news_feed;
drop table if exists public.agent_society_runs;
drop table if exists public.agent_society_state;
drop table if exists public.ayn_accuracy_dashboard;
drop table if exists public.ayn_business_news;
drop table if exists public.ayn_consumer_sentiment;
drop table if exists public.ayn_country_intelligence;
drop table if exists public.ayn_geopolitical;
drop table if exists public.ayn_gov_policies;
drop table if exists public.ayn_health_intel;
drop table if exists public.ayn_market_prices;
drop table if exists public.ayn_market_snapshot;
drop table if exists public.ayn_prediction_context;
drop table if exists public.ayn_prediction_outcomes;
drop table if exists public.ayn_prediction_scorecard;
drop table if exists public.ayn_prediction_vote_counts;
drop table if exists public.ayn_real_estate;
drop table if exists public.ayn_sector_intel;
drop table if exists public.ayn_startup_intel;
drop table if exists public.ayn_tech_disruption;
drop table if exists public.ayn_trade_flows;
drop table if exists public.ayn_world_signals;
drop table if exists public.world_personas;
