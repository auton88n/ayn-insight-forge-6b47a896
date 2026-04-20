"""
routers/applications.py — service application submissions
"""
import logging
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from typing import Optional
from core.auth_new import get_user_id_optional
from core.database import execute, fetch, fetchrow

router = APIRouter(prefix="/applications", tags=["applications"])
log = logging.getLogger("ayn.applications")


class ApplicationRequest(BaseModel):
    service_type: str
    full_name: str
    email: str
    phone: Optional[str] = None
    message: Optional[str] = None
    custom_fields: dict = {}


@router.post("")
async def submit_application(req: ApplicationRequest,
                              user_id: str = Depends(get_user_id_optional)):
    """Submit a service application."""
    import json
    try:
        row = await fetchrow("""
            INSERT INTO service_applications
                (user_id, service_type, full_name, email, phone, message, custom_fields, status, created_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, 'pending', NOW())
            RETURNING id, status
        """,
            None if user_id == "anonymous" else user_id,
            req.service_type, req.full_name, req.email,
            req.phone, req.message, json.dumps(req.custom_fields))

        from services.email import send_email
        import asyncio
        asyncio.create_task(send_email(req.email, "application_received", {
            "userName": req.full_name, "service": req.service_type
        }))
        return {"ok": True, "id": str(row["id"]) if row else None}
    except Exception as e:
        log.error(f"[applications] submit error: {e}")
        return {"ok": False, "error": str(e)}
