"""
routers/sse.py — Server-Sent Events (Railway Postgres only)
Admin SSE polls Railway tables. User SSE streams limits from Railway.
"""
import asyncio
import hashlib
import logging
import json
from typing import AsyncGenerator
from fastapi import APIRouter, Query, HTTPException
from fastapi.responses import StreamingResponse
from core.auth_new import verify_access_token
from core.database import fetchrow, fetchval

router = APIRouter(prefix="/sse", tags=["sse"])
log = logging.getLogger("ayn.sse")

POLL_INTERVAL = 3.0
PING_INTERVAL = 25.0
MAX_DURATION = 4 * 60

ALLOWED_TABLES = {
    "support_tickets", "contact_messages", "service_applications",
    "application_replies", "ayn_activity_log", "ayn_dev_messages",
    "ayn_mind", "admin_notification_log", "twitter_posts",
    "ticket_messages", "ayn_world_signals", "ayn_world_predictions",
    "ayn_agent_messages",
}


async def _get_table_digest(table: str) -> str:
    """Hash of table's current state via Railway Postgres."""
    try:
        count = await fetchval(f'SELECT COUNT(*) FROM "{table}"') or 0
        row = await fetchrow(f'SELECT id FROM "{table}" ORDER BY created_at DESC LIMIT 1')
        latest_id = str(row["id"]) if row else ""
        return hashlib.md5(f"{count}:{latest_id}".encode()).hexdigest()
    except Exception:
        return ""


async def admin_sse_stream(tables: list[str], user_id: str):
    digests = {t: "" for t in tables}
    elapsed = 0.0
    last_ping = 0.0
    yield "event: connected\ndata: {}\n\n"

    while elapsed < MAX_DURATION:
        await asyncio.sleep(POLL_INTERVAL)
        elapsed += POLL_INTERVAL

        if elapsed - last_ping >= PING_INTERVAL:
            yield "event: ping\ndata: {}\n\n"
            last_ping = elapsed

        for table in tables:
            try:
                new_digest = await _get_table_digest(table)
                if new_digest and new_digest != digests[table]:
                    digests[table] = new_digest
                    payload = json.dumps({"table": table, "at": int(elapsed * 1000)})
                    yield f"event: change\ndata: {payload}\n\n"
            except Exception as e:
                log.debug(f"[sse] poll error {table}: {e}")

    yield "event: reconnect\ndata: {}\n\n"


@router.get("/admin")
async def admin_sse(
    tables: str = Query("support_tickets,contact_messages"),
    token: str = Query(""),
):
    try:
        payload = verify_access_token(token)
        user_id = payload["sub"]
        if not payload.get("is_admin"):
             raise HTTPException(403, "Admin access required for this stream")
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(401, "Invalid token")

    requested = [t.strip() for t in tables.split(",") if t.strip()]
    valid_tables = [t for t in requested if t in ALLOWED_TABLES] or ["support_tickets"]
    log.info(f"[sse] Admin connected: user={user_id[:8]}, tables={valid_tables}")

    return StreamingResponse(
        admin_sse_stream(valid_tables, user_id),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no", "Connection": "keep-alive"},
    )


@router.get("/user")
async def user_sse(token: str = Query("")):
    try:
        payload = verify_access_token(token)
        user_id = payload["sub"]
    except Exception:
        raise HTTPException(401, "Invalid token")

    log.info(f"[sse/user] Connected: user={user_id[:8]}")

    async def _fetch_limits(uid: str):
        row = await fetchrow(
            "SELECT daily_messages, current_daily_messages, bonus_credits, monthly_messages "
            "FROM user_ai_limits WHERE user_id=$1::uuid", uid)
        return dict(row) if row else None

    async def stream():
        elapsed = 0.0
        last_ping = 0.0
        last_limits = None
        since_poll = 0.0

        try:
            data = await _fetch_limits(user_id)
            if data:
                last_limits = data
                yield f"event: limits\ndata: {json.dumps(data)}\n\n"
        except Exception as e:
            log.debug(f"[sse/user] initial error: {e}")

        yield "event: connected\ndata: {}\n\n"

        while elapsed < MAX_DURATION:
            await asyncio.sleep(POLL_INTERVAL)
            elapsed += POLL_INTERVAL
            since_poll += POLL_INTERVAL

            if elapsed - last_ping >= PING_INTERVAL:
                yield "event: ping\ndata: {}\n\n"
                last_ping = elapsed

            if since_poll >= 15.0:
                since_poll = 0.0
                try:
                    data = await _fetch_limits(user_id)
                    if data and data != last_limits:
                        last_limits = data
                        yield f"event: limits\ndata: {json.dumps(data)}\n\n"
                except Exception as e:
                    log.debug(f"[sse/user] poll error: {e}")

        yield "event: reconnect\ndata: {}\n\n"

    return StreamingResponse(
        stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no", "Connection": "keep-alive"},
    )
