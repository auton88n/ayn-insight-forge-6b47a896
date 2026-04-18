"""
routers/sse.py — Server-Sent Events for admin realtime updates
Replaces: supabase/functions/admin-sse edge function

Client subscribes:
  GET /sse/admin?tables=support_tickets,contact_messages&token=<JWT>

Server polls each table every 3s, emits 'change' events when row count/hash changes.
"""
import asyncio
import hashlib
import logging
import json
from typing import AsyncGenerator
from fastapi import APIRouter, Query
from fastapi.responses import StreamingResponse
from core.auth_new import verify_access_token
from core.db import get_db

router = APIRouter(prefix="/sse", tags=["sse"])
log = logging.getLogger("ayn.sse")

POLL_INTERVAL = 3.0       # seconds between polls
PING_INTERVAL = 25.0      # SSE ping to keep connection alive
MAX_DURATION = 4 * 60     # 4 minutes max (Railway has a 5min timeout)

ALLOWED_TABLES = {
    "support_tickets", "contact_messages", "service_applications",
    "application_replies", "ayn_activity_log", "ayn_dev_messages",
    "ayn_dev_conversations", "ayn_mind", "admin_notification_log",
    "twitter_posts", "agent_telegram_bots", "ticket_messages",
    "ayn_world_signals", "ayn_world_predictions", "ayn_agent_messages",
    "ayn_agent_conversations",
}


async def _get_table_digest(table: str) -> str:
    """Get a hash digest of a table's current state via Supabase SDK."""
    try:
        db = get_db()
        r = await asyncio.to_thread(
            lambda: db.from_(table).select("id", count="exact").limit(1).execute()
        )
        count = r.count or 0
        # Get latest row id/updated_at for change detection
        r2 = await asyncio.to_thread(
            lambda: db.from_(table).select("id").order("created_at", desc=True).limit(1).execute()
        )
        latest_id = r2.data[0].get("id", "") if r2.data else ""
        return hashlib.md5(f"{count}:{latest_id}".encode()).hexdigest()
    except Exception:
        return ""


async def admin_sse_stream(tables: list[str], user_id: str) -> AsyncGenerator[str, None]:
    """Generate SSE events for admin table changes."""
    digests = {t: "" for t in tables}
    elapsed = 0.0
    last_ping = 0.0

    yield "event: connected\ndata: {}\n\n"

    while elapsed < MAX_DURATION:
        await asyncio.sleep(POLL_INTERVAL)
        elapsed += POLL_INTERVAL

        # Send ping to keep connection alive
        if elapsed - last_ping >= PING_INTERVAL:
            yield "event: ping\ndata: {}\n\n"
            last_ping = elapsed

        # Check each table for changes
        for table in tables:
            try:
                new_digest = await _get_table_digest(table)
                if new_digest and new_digest != digests[table]:
                    digests[table] = new_digest
                    payload = json.dumps({"table": table, "at": int(asyncio.get_event_loop().time() * 1000)})
                    yield f"event: change\ndata: {payload}\n\n"
            except Exception as e:
                log.debug(f"[sse] poll error {table}: {e}")

    # Signal client to reconnect
    yield "event: reconnect\ndata: {}\n\n"


@router.get("/admin")
async def admin_sse(
    tables: str = Query("support_tickets,contact_messages"),
    token: str = Query(""),
):
    """SSE endpoint for admin realtime. Replaces admin-sse Supabase edge function."""
    # Verify token
    try:
        payload = verify_access_token(token)
        user_id = payload["sub"]
    except Exception:
        from fastapi import HTTPException
        raise HTTPException(401, "Invalid token")

    # Validate and filter tables
    requested = [t.strip() for t in tables.split(",") if t.strip()]
    valid_tables = [t for t in requested if t in ALLOWED_TABLES]
    if not valid_tables:
        valid_tables = ["support_tickets"]

    log.info(f"[sse] Admin SSE connected: user={user_id[:8]}, tables={valid_tables}")

    return StreamingResponse(
        admin_sse_stream(valid_tables, user_id),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )
