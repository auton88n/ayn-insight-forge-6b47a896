"""
routers/email_router.py — all email endpoints
Replaces: send-email, send-ticket-reply, send-reply-email, 
          send-ticket-notification, send-application-email, send-contact-email
"""
import logging
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from typing import Any, Optional
from core.auth_new import get_user_id, get_current_user
from services.email import send_email
from services.email_queue import enqueue_email
from core.database import execute, fetchrow
import asyncio

router = APIRouter(prefix="/email", tags=["email"])
log = logging.getLogger("ayn.email")


class SendEmailRequest(BaseModel):
    to: str
    subject: str
    template: str = "generic"
    data: Any = {}


class TicketReplyRequest(BaseModel):
    ticket_id: str
    content: str
    user_email: str


class ReplyEmailRequest(BaseModel):
    application_id: str
    content: str
    email: str


@router.post("/send")
async def send_email_endpoint(req: SendEmailRequest, user: dict = Depends(get_current_user)):
    """Generic send email. Replaces send-email edge function."""
    try:
        queued = await enqueue_email(req.to, req.template, req.data)
        if not queued:
            asyncio.create_task(send_email(req.to, req.template, req.data))
        return {"ok": True}
    except Exception as e:
        log.error(f"[email] send error: {e}")
        return {"ok": False, "error": str(e)}


@router.post("/ticket-reply")
async def send_ticket_reply(req: TicketReplyRequest, user: dict = Depends(get_current_user)):
    """Send ticket reply email. Replaces send-ticket-reply edge function."""
    try:
        await execute("""
            INSERT INTO ticket_messages (ticket_id, content, sender_type, created_at)
            VALUES ($1::uuid, $2, 'admin', NOW())
        """, req.ticket_id, req.content)
        payload = {"content": req.content, "ticket_id": req.ticket_id}
        queued = await enqueue_email(req.user_email, "ticket_reply", payload)
        if not queued:
            asyncio.create_task(send_email(req.user_email, "ticket_reply", payload))
        return {"ok": True}
    except Exception as e:
        log.error(f"[email] ticket reply error: {e}")
        return {"ok": False, "error": str(e)}


@router.post("/reply")
async def send_reply_email(req: ReplyEmailRequest, user: dict = Depends(get_current_user)):
    """Send application reply email. Replaces send-reply-email edge function."""
    try:
        payload = {"content": req.content, "application_id": req.application_id}
        queued = await enqueue_email(req.email, "application_reply", payload)
        if not queued:
            asyncio.create_task(send_email(req.email, "application_reply", payload))
        return {"ok": True}
    except Exception as e:
        return {"ok": False, "error": str(e)}
