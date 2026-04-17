"""
routers/support.py — support bot + ticket management
Replaces: support-bot, send-ticket-notification, send-ticket-reply
"""
import logging
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from core.auth_new import get_user_id
from core.llm import gemini
from core.database import execute, fetch, fetchrow

router = APIRouter(prefix="/support", tags=["support"])
log = logging.getLogger("ayn.support")


class SupportBotRequest(BaseModel):
    message: str
    ticket_id: str = None
    user_name: str = ""


@router.post("/bot")
async def support_bot(req: SupportBotRequest, user_id: str = Depends(get_user_id)):
    """AI support bot. Replaces support-bot edge function."""
    try:
        prompt = f"""You are AYN's customer support assistant. Be helpful, concise, and professional.
User: {req.user_name or 'User'}
Message: {req.message}

Provide a helpful response. If the issue requires human review, say so."""

        result = await gemini([{"role": "user", "content": prompt}], max_tokens=500)
        response = result.get("content", "I'll have our team look into this for you shortly.")
        return {"response": response, "requires_human": False}
    except Exception as e:
        log.error(f"[support] bot error: {e}")
        return {"response": "Our team will review your request shortly.", "requires_human": True}


class ContactRequest(BaseModel):
    name: str
    email: str
    message: str


@router.post("/contact")
async def contact(req: ContactRequest):
    """Save contact message. Replaces send-contact-email."""
    from services.email import send_email
    import asyncio
    try:
        await execute("""
            INSERT INTO contact_messages (name, email, message, status, created_at, updated_at)
            VALUES ($1, $2, $3, 'new', NOW(), NOW())
        """, req.name, req.email, req.message)
    except Exception:
        pass
    asyncio.create_task(send_email(req.email, "contact_confirmation", {"userName": req.name}))
    return {"ok": True}
