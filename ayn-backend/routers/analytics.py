"""
routers/analytics.py — visitor tracking + error logging
Replaces: track-visit, google-analytics, log-error, report-vitals
"""
import logging
from fastapi import APIRouter, Request
from pydantic import BaseModel
from typing import Optional
from core.database import execute

router = APIRouter(prefix="/analytics", tags=["analytics"])
log = logging.getLogger("ayn.analytics")


class VisitRequest(BaseModel):
    visitor_id: str
    page_path: str
    referrer: Optional[str] = None
    session_id: Optional[str] = None
    utm_source: Optional[str] = None
    utm_medium: Optional[str] = None
    utm_campaign: Optional[str] = None


@router.post("/track")
async def track_visit(req: VisitRequest, request: Request):
    """Track visitor analytics. Replaces track-visit edge function."""
    try:
        ua = request.headers.get("user-agent", "")
        country = request.headers.get("cf-ipcountry", None)
        await execute("""
            INSERT INTO visitor_analytics 
                (visitor_id, page_path, referrer, session_id, utm_source, utm_medium, utm_campaign,
                 country, browser, created_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
        """, req.visitor_id, req.page_path, req.referrer, req.session_id,
            req.utm_source, req.utm_medium, req.utm_campaign,
            country, ua[:50] if ua else None)
    except Exception as e:
        log.debug(f"[analytics] track error: {e}")
    return {"ok": True}


class ErrorRequest(BaseModel):
    error_message: str
    error_stack: Optional[str] = None
    url: Optional[str] = None
    user_id: Optional[str] = None
    context: Optional[dict] = None


@router.post("/error")
async def log_error(req: ErrorRequest):
    """Log frontend error. Replaces log-error edge function."""
    try:
        await execute("""
            INSERT INTO error_logs (error_message, error_stack, url, user_id, context, source, created_at)
            VALUES ($1, $2, $3, $4, $5, 'frontend', NOW())
        """, req.error_message, req.error_stack, req.url,
            req.user_id, str(req.context or {}))
    except Exception:
        pass
    return {"ok": True}
