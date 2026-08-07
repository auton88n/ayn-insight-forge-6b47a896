-- Follow-up to 20260807183526: a post-deletion verification pass (querying
-- information_schema for every remaining ayn_% table) caught two World
-- Intelligence companion tables that slipped past the original search --
-- ayn_job_market and ayn_supply_chain, confirmed as dead cron-fed tables
-- with zero real callers and tiny row counts (6 and 1 rows respectively).
drop table if exists public.ayn_job_market;
drop table if exists public.ayn_supply_chain;
