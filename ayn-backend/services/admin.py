"""
services/admin.py — admin background jobs and utilities
"""
import logging
from datetime import datetime, timezone, timedelta
from core.database import execute

log = logging.getLogger("ayn.admin")


async def run_log_cleanup():
    """Delete logs older than 30 days. Replaces daily-log-cleanup cron."""
    log.info("🧹 Log cleanup starting...")
    try:
        cutoff = (datetime.now(timezone.utc) - timedelta(days=30)).isoformat()
        tables = ["security_logs", "usage_logs", "visitor_analytics", "admin_notification_log"]
        for table in tables:
            try:
                await execute(f'DELETE FROM "{table}" WHERE created_at < $1::timestamptz', cutoff)
            except Exception:
                pass
        log.info("✅ Log cleanup complete")
    except Exception as e:
        log.error(f"❌ Log cleanup error: {e}")
