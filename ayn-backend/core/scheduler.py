"""
core/scheduler.py — APScheduler background jobs
All jobs are wrapped defensively — a crash in any job cannot bring down the server.
"""
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
import logging

log = logging.getLogger("ayn.scheduler")
_scheduler: AsyncIOScheduler | None = None


def get_scheduler() -> AsyncIOScheduler:
    global _scheduler
    if _scheduler is None:
        _scheduler = AsyncIOScheduler(timezone="UTC")
    return _scheduler


def start_scheduler():
    scheduler = get_scheduler()

    from services.intelligence import (run_supabase_sync,
        run_world_intelligence, run_pulse_engine, run_market_prices,
        run_world_signals, run_prediction_engine, run_prediction_resolver,
        run_agent_society_trigger, run_log_cleanup,
    )

    # World intelligence — every 6h
    scheduler.add_job(run_world_intelligence, CronTrigger(hour="*/6", minute=0),
        id="world-intel", replace_existing=True, misfire_grace_time=600)

    # Pulse engine — every 4h
    scheduler.add_job(run_pulse_engine, CronTrigger(hour="*/4", minute=30),
        id="pulse-engine", replace_existing=True, misfire_grace_time=300)

    # Market prices — every 2h
    scheduler.add_job(run_market_prices, CronTrigger(hour="*/2", minute=15),
        id="market-prices", replace_existing=True, misfire_grace_time=120)

    # World signals — every 6h
    scheduler.add_job(run_world_signals, CronTrigger(hour="*/6", minute=45),
        id="world-signals", replace_existing=True, misfire_grace_time=300)

    # Predictions — daily at 6am
    scheduler.add_job(run_prediction_engine, CronTrigger(hour=6, minute=0),
        id="predictions-daily", replace_existing=True, misfire_grace_time=600)

    # Prediction resolver — every 6h
    scheduler.add_job(run_prediction_resolver, CronTrigger(hour="*/6", minute=20),
        id="prediction-resolver", replace_existing=True, misfire_grace_time=300)

    # Agent society — every 4h
    scheduler.add_job(run_agent_society_trigger, CronTrigger(hour="*/4", minute=55),
        id="agent-society", replace_existing=True, misfire_grace_time=300)

    # Log cleanup — daily at 3am
    scheduler.add_job(
        run_supabase_sync,
        trigger=IntervalTrigger(minutes=30),
        id="supabase-sync",
        name="Supabase → Railway sync",
        replace_existing=True,
    )
    scheduler.add_job(run_log_cleanup, CronTrigger(hour=3, minute=0),
        id="log-cleanup", replace_existing=True, misfire_grace_time=600)

    scheduler.start()
    log.info(f"✅ Scheduler started — {len(scheduler.get_jobs())} jobs registered")
