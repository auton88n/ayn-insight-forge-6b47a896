"""
core/scheduler.py — APScheduler replacing all Supabase cron jobs

All intelligence jobs run inside the Railway process.
No separate services, no Supabase cron, no cold starts.
Jobs share the same DB client and LLM client.
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
    """Register all jobs and start the scheduler. Called at app startup."""
    scheduler = get_scheduler()

    # ── World Intelligence — replaces ayn-world-intelligence cron jobs ────────
    from services.intelligence import run_world_intelligence
    for domain in ["geopolitics", "economy", "conflicts", "technology",
                   "jobs", "regions", "business", "warnings", "history", "opportunities"]:
        scheduler.add_job(
            run_world_intelligence,
            CronTrigger(hour=5, minute={"geopolitics": 0, "economy": 2, "technology": 4,
                                        "jobs": 6, "business": 8, "regions": 10,
                                        "warnings": 12, "history": 14, "opportunities": 16,
                                        "conflicts": 18}.get(domain, 0)),
            args=[domain],
            id=f"world-intel-{domain}",
            replace_existing=True,
            misfire_grace_time=300,
        )

    # ── Pulse Engine — replaces ayn-pulse-engine (every 4h) ──────────────────
    from services.intelligence import run_pulse_engine
    scheduler.add_job(
        run_pulse_engine,
        CronTrigger(hour="*/4", minute=0),
        id="pulse-engine",
        replace_existing=True,
        misfire_grace_time=300,
    )

    # ── Market Prices — replaces ayn-market-prices-2h (every 2h) ─────────────
    from services.intelligence import run_market_prices
    scheduler.add_job(
        run_market_prices,
        CronTrigger(hour="*/2", minute=0),
        id="market-prices",
        replace_existing=True,
        misfire_grace_time=120,
    )

    # ── World Signals — replaces ayn-world-signals-6h ────────────────────────
    from services.intelligence import run_world_signals
    scheduler.add_job(
        run_world_signals,
        CronTrigger(hour="*/6", minute=0),
        id="world-signals",
        replace_existing=True,
        misfire_grace_time=300,
    )

    # ── Prediction Engine — replaces ayn-predictions-daily ───────────────────
    from services.predictions import run_prediction_engine
    scheduler.add_job(
        run_prediction_engine,
        CronTrigger(hour=6, minute=0),
        id="predictions-daily",
        replace_existing=True,
        misfire_grace_time=600,
    )

    # ── Prediction Resolver — replaces ayn-prediction-resolver (every 6h) ────
    from services.predictions import run_prediction_resolver
    scheduler.add_job(
        run_prediction_resolver,
        CronTrigger(hour="*/6", minute=0),
        id="prediction-resolver",
        replace_existing=True,
        misfire_grace_time=300,
    )

    # ── Agent Society trigger — replaces ayn-agent-society-signal-trigger ─────
    from services.intelligence import run_agent_society_trigger
    scheduler.add_job(
        run_agent_society_trigger,
        CronTrigger(hour="*/4", minute=55),
        id="agent-society-trigger",
        replace_existing=True,
        misfire_grace_time=300,
    )

    # ── Daily log cleanup ─────────────────────────────────────────────────────
    from services.admin import run_log_cleanup
    scheduler.add_job(
        run_log_cleanup,
        CronTrigger(hour=3, minute=0),
        id="log-cleanup",
        replace_existing=True,
        misfire_grace_time=600,
    )

    scheduler.start()
    log.info(f"✅ Scheduler started — {len(scheduler.get_jobs())} jobs registered")
