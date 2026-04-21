"""
core/scheduler.py — APScheduler background jobs
All jobs are wrapped defensively — a crash in any job cannot bring down the server.

Also tracks per-job run history (last_run, last_error, success/failure counts)
in-memory so /admin/scheduler/status can report cron health without DB hits.
"""
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from datetime import datetime, timezone
import logging
import inspect

log = logging.getLogger("ayn.scheduler")
_scheduler: AsyncIOScheduler | None = None

# In-memory per-job stats: { job_id: { last_run, last_success, last_error, success_count, failure_count, last_duration_ms } }
JOB_STATS: dict[str, dict] = {}


def get_scheduler() -> AsyncIOScheduler:
    global _scheduler
    if _scheduler is None:
        _scheduler = AsyncIOScheduler(timezone="UTC")
    return _scheduler


def _wrap(job_id: str, fn):
    """Wrap a job to track stats and swallow exceptions."""
    async def wrapper():
        start = datetime.now(timezone.utc)
        stats = JOB_STATS.setdefault(job_id, {
            "success_count": 0, "failure_count": 0,
            "last_run": None, "last_success": None, "last_error": None,
            "last_duration_ms": None,
        })
        stats["last_run"] = start.isoformat()
        try:
            if inspect.iscoroutinefunction(fn):
                await fn()
            else:
                fn()
            stats["success_count"] += 1
            stats["last_success"] = datetime.now(timezone.utc).isoformat()
            stats["last_error"] = None
        except Exception as e:
            stats["failure_count"] += 1
            stats["last_error"] = f"{type(e).__name__}: {str(e)[:200]}"
            log.error(f"[scheduler] job {job_id} failed: {e}")
        finally:
            stats["last_duration_ms"] = int((datetime.now(timezone.utc) - start).total_seconds() * 1000)
    wrapper.__name__ = f"wrapped_{job_id}"
    return wrapper


# Registry of all jobs — used by /admin/scheduler/run/{job_id} for manual triggers
JOB_REGISTRY: dict[str, callable] = {}


def start_scheduler():
    scheduler = get_scheduler()
    if scheduler.running:
        log.info("Scheduler already running")
        return

    from services.intelligence import (
        run_world_intelligence, run_pulse_engine, run_market_prices,
        run_world_signals, run_prediction_engine, run_prediction_resolver,
        run_agent_society_trigger, run_log_cleanup,
    )

    jobs = [
        ("world-intel", run_world_intelligence, CronTrigger(hour="*/6", minute=0), 600),
        ("pulse-engine", run_pulse_engine, CronTrigger(hour="*/4", minute=30), 300),
        ("market-prices", run_market_prices, CronTrigger(hour="*/2", minute=15), 120),
        ("world-signals", run_world_signals, CronTrigger(hour="*/6", minute=45), 300),
        ("predictions-daily", run_prediction_engine, CronTrigger(hour=6, minute=0), 600),
        ("prediction-resolver", run_prediction_resolver, CronTrigger(hour="*/6", minute=20), 300),
        ("agent-society", run_agent_society_trigger, CronTrigger(hour="*/4", minute=55), 300),
        ("log-cleanup", run_log_cleanup, CronTrigger(hour=3, minute=0), 600),
    ]

    for job_id, fn, trigger, grace in jobs:
        JOB_REGISTRY[job_id] = fn
        scheduler.add_job(
            _wrap(job_id, fn), trigger,
            id=job_id, replace_existing=True, misfire_grace_time=grace,
        )

    scheduler.start()
    log.info(f"✅ Scheduler started — {len(scheduler.get_jobs())} jobs registered")
