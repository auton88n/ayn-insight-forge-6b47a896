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
    from services.email_queue import enqueue_email
    import asyncio
    try:
        await execute("""
            INSERT INTO contact_messages (name, email, message, status, created_at, updated_at)
            VALUES ($1, $2, $3, 'new', NOW(), NOW())
        """, req.name, req.email, req.message)
    except Exception:
        pass
    queued = await enqueue_email(req.email, "contact_confirmation", {"userName": req.name})
    if not queued:
        asyncio.create_task(send_email(req.email, "contact_confirmation", {"userName": req.name}))
    return {"ok": True}


# ── Support Tickets (user-facing) ─────────────────────────────────────────────
class TicketRequest(BaseModel):
    subject: str
    message: str
    category: str = "general"
    priority: str = "normal"


@router.post("/tickets")
async def create_ticket(req: TicketRequest, user_id: str = Depends(get_user_id)):
    """Create a support ticket."""
    from services.email import send_email
    from services.email_queue import enqueue_email
    import asyncio
    try:
        row = await fetchrow("""
            INSERT INTO support_tickets (user_id, subject, message, category, priority, status, created_at, updated_at)
            VALUES ($1::uuid, $2, $3, $4, $5, 'open', NOW(), NOW())
            RETURNING id, subject, status
        """, user_id, req.subject, req.message, req.category, req.priority)
        ticket = dict(row) if row else {}
        # Notify team
        payload = {"subject": req.subject, "ticket_id": str(ticket.get("id", ""))}
        queued = await enqueue_email("support@aynn.io", "new_ticket", payload)
        if not queued:
            asyncio.create_task(send_email("support@aynn.io", "new_ticket", payload))
        return {"ok": True, "ticket": ticket}
    except Exception as e:
        log.error(f"[support] create ticket: {e}")
        return {"ok": False, "error": str(e)}


@router.get("/tickets/{ticket_id}")
async def get_ticket(ticket_id: str, user_id: str = Depends(get_user_id)):
    """Get a specific ticket with messages."""
    ticket = await fetchrow(
        "SELECT * FROM support_tickets WHERE id=$1::uuid AND user_id=$2::uuid",
        ticket_id, user_id)
    if not ticket:
        from fastapi import HTTPException
        raise HTTPException(404, "Ticket not found")
    messages = await fetch(
        "SELECT * FROM ticket_messages WHERE ticket_id=$1::uuid ORDER BY created_at",
        ticket_id)
    return {"ticket": dict(ticket), "messages": [dict(m) for m in messages]}


@router.get("/tickets/{ticket_id}/messages")
async def get_ticket_messages(ticket_id: str, user_id: str = Depends(get_user_id)):
    """Get messages for a ticket."""
    messages = await fetch(
        "SELECT * FROM ticket_messages WHERE ticket_id=$1::uuid ORDER BY created_at",
        ticket_id)
    return {"messages": [dict(m) for m in messages]}


@router.post("/tickets/{ticket_id}")
async def reply_to_ticket(ticket_id: str, body: dict, user_id: str = Depends(get_user_id)):
    """User replies to a ticket."""
    message = body.get("message", "")
    if not message:
        from fastapi import HTTPException
        raise HTTPException(400, "Message required")
    await execute("""
        INSERT INTO ticket_messages (ticket_id, message, sender, sender_id, created_at)
        VALUES ($1::uuid, $2, 'user', $3::uuid, NOW())
    """, ticket_id, message, user_id)
    await execute(
        "UPDATE support_tickets SET status='awaiting_reply', updated_at=NOW() WHERE id=$1::uuid",
        ticket_id)
    return {"ok": True}


@router.post("/tickets/{ticket_id}/mark-read")
async def mark_ticket_read(ticket_id: str, user_id: str = Depends(get_user_id)):
    """Mark ticket messages as read."""
    await execute(
        "UPDATE support_tickets SET has_unread_reply=FALSE WHERE id=$1::uuid AND user_id=$2::uuid",
        ticket_id, user_id)
    return {"ok": True}


@router.delete("/tickets/{ticket_id}")
async def close_ticket(ticket_id: str, user_id: str = Depends(get_user_id)):
    """Close/delete a ticket."""
    await execute(
        "UPDATE support_tickets SET status='closed', updated_at=NOW() "
        "WHERE id=$1::uuid AND user_id=$2::uuid",
        ticket_id, user_id)
    return {"ok": True}
