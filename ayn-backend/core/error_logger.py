"""
core/error_logger.py — centralized error logging to Supabase error_logs table

Usage anywhere in the backend:
    from core.error_logger import log_error
    await log_error("chat", "LLM failed", error=e, context={"user_id": user_id})
"""
import traceback
import asyncio
import logging
import json
from typing import Optional
from core.database import execute

log = logging.getLogger("ayn.errors")


async def log_error(
    source: str,
    message: str,
    error: Optional[Exception] = None,
    severity: str = "error",
    endpoint: str = None,
    context: dict = None,
    user_id: str = None,
):
    """Log an error to Supabase error_logs table. Fire and forget."""
    try:
        stack = traceback.format_exc() if error else None
        if stack and stack.strip() == "NoneType: None":
            stack = None

        await execute("""
            INSERT INTO error_logs
                (source, severity, error_message, error_stack, endpoint, context, user_id, status, created_at)
            VALUES
                ($1, $2, $3, $4, $5, $6::jsonb, $7::uuid, 'open', NOW())
        """,
            source,
            severity,
            str(message)[:2000],
            stack[:5000] if stack else None,
            endpoint,
            json.dumps(context or {}),
            user_id if user_id and user_id != "internal" else None,
        )
    except Exception as e:
        log.warning(f"[error_logger] Failed to log error: {e}")


def log_error_sync(source: str, message: str, **kwargs):
    """Sync wrapper — use in non-async contexts."""
    try:
        loop = asyncio.get_event_loop()
        if loop.is_running():
            asyncio.create_task(log_error(source, message, **kwargs))
        else:
            loop.run_until_complete(log_error(source, message, **kwargs))
    except Exception:
        pass
