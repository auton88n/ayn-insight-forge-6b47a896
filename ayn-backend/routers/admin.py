"""
routers/admin.py — admin API
Replaces 30+ Supabase admin edge functions with a proper REST API.
All endpoints require a valid JWT + admin role check.
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from typing import Optional
from core.auth import verify_token
from core.db import get_db

router = APIRouter(prefix="/admin")


# ── Admin role guard ──────────────────────────────────────────────────────────
async def require_admin(user_id: str = Depends(verify_token)) -> str:
    if user_id == "internal":
        return user_id
    db = get_db()
    try:
        r = db.table("user_roles").select("role").eq("user_id", user_id).maybe_single().execute()
        if not r.data or r.data.get("role") not in ("admin", "super_admin"):
            raise HTTPException(403, "Admin access required")
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(403, "Admin access required")
    return user_id


# ── Users ─────────────────────────────────────────────────────────────────────
@router.get("/users")
async def list_users(
    limit: int = Query(50, le=200),
    offset: int = 0,
    search: Optional[str] = None,
    _: str = Depends(require_admin),
):
    db = get_db()
    q = (db.table("profiles").select(
        "id,email,contact_person,company_name,created_at,is_admin"
    ).order("created_at", desc=True).range(offset, offset + limit - 1))
    r = q.execute()
    return {"users": r.data or [], "offset": offset, "limit": limit}


@router.get("/users/{user_id}")
async def get_user(user_id: str, _: str = Depends(require_admin)):
    db = get_db()
    profile = db.table("profiles").select("*").eq("id", user_id).maybe_single().execute()
    limits  = db.table("user_ai_limits").select("*").eq("user_id", user_id).maybe_single().execute()
    sub     = db.table("user_subscriptions").select("*").eq("user_id", user_id).maybe_single().execute()
    return {
        "profile": profile.data,
        "limits": limits.data,
        "subscription": sub.data,
    }


@router.get("/users/{user_id}/messages")
async def get_user_messages(user_id: str, limit: int = 50, _: str = Depends(require_admin)):
    db = get_db()
    r = (db.table("messages").select("id,content,sender,created_at,session_id")
         .eq("user_id", user_id).order("created_at", desc=True).limit(limit).execute())
    return {"messages": r.data or []}


# ── Credits ───────────────────────────────────────────────────────────────────
class CreditGiftBody(BaseModel):
    user_id: str
    amount: int
    reason: Optional[str] = None


@router.post("/credits/gift")
async def gift_credits(body: CreditGiftBody, admin_id: str = Depends(require_admin)):
    db = get_db()
    # Add to bonus_credits
    db.rpc("add_bonus_credits", {
        "_user_id": body.user_id,
        "_amount": body.amount,
    }).execute()
    db.table("credit_gifts").insert({
        "user_id": body.user_id,
        "amount": body.amount,
        "reason": body.reason or "Admin gift",
        "gifted_by": admin_id,
    }).execute()
    return {"ok": True, "gifted": body.amount}


@router.get("/credits/history")
async def credit_gift_history(_: str = Depends(require_admin)):
    db = get_db()
    r = db.table("credit_gifts").select("*").order("created_at", desc=True).limit(100).execute()
    return {"history": r.data or []}


# ── Subscriptions ─────────────────────────────────────────────────────────────
@router.get("/subscriptions")
async def list_subscriptions(
    status: Optional[str] = None,
    limit: int = 100,
    _: str = Depends(require_admin),
):
    db = get_db()
    q = db.table("user_subscriptions").select("*").order("created_at", desc=True).limit(limit)
    if status:
        q = q.eq("status", status)
    r = q.execute()
    return {"subscriptions": r.data or []}


# ── Support ───────────────────────────────────────────────────────────────────
@router.get("/tickets")
async def list_tickets(
    status: Optional[str] = "open",
    limit: int = 50,
    _: str = Depends(require_admin),
):
    db = get_db()
    q = db.table("support_tickets").select("*").order("created_at", desc=True).limit(limit)
    if status:
        q = q.eq("status", status)
    r = q.execute()
    return {"tickets": r.data or []}


@router.get("/tickets/{ticket_id}")
async def get_ticket(ticket_id: str, _: str = Depends(require_admin)):
    db = get_db()
    ticket = db.table("support_tickets").select("*").eq("id", ticket_id).maybe_single().execute()
    replies = db.table("ticket_messages").select("*").eq("ticket_id", ticket_id).order("created_at").execute()
    return {"ticket": ticket.data, "replies": replies.data or []}


class TicketReplyBody(BaseModel):
    ticket_id: str
    message: str
    close_ticket: bool = False


@router.post("/tickets/reply")
async def reply_ticket(body: TicketReplyBody, admin_id: str = Depends(require_admin)):
    db = get_db()
    db.table("ticket_messages").insert({
        "ticket_id": body.ticket_id,
        "sender": "admin",
        "message": body.message,
        "sender_id": admin_id,
    }).execute()
    if body.close_ticket:
        db.table("support_tickets").update({"status": "resolved"}).eq("id", body.ticket_id).execute()
    return {"ok": True}


# ── System config ─────────────────────────────────────────────────────────────
@router.get("/config")
async def get_config(_: str = Depends(require_admin)):
    db = get_db()
    r = db.table("system_config").select("key,value").execute()
    return {"config": {row["key"]: row["value"] for row in (r.data or [])}}


class ConfigUpdateBody(BaseModel):
    key: str
    value: object


@router.put("/config")
async def update_config(body: ConfigUpdateBody, _: str = Depends(require_admin)):
    db = get_db()
    db.table("system_config").upsert(
        {"key": body.key, "value": body.value},
        on_conflict="key"
    ).execute()
    return {"ok": True}


# ── LLM management ────────────────────────────────────────────────────────────
@router.get("/llm/models")
async def get_llm_models(_: str = Depends(require_admin)):
    db = get_db()
    r = db.table("llm_models").select("*").execute()
    return {"models": r.data or []}


@router.get("/llm/usage")
async def get_llm_usage(days: int = 7, _: str = Depends(require_admin)):
    db = get_db()
    from datetime import datetime, timezone, timedelta
    since = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
    r = db.table("llm_usage_logs").select("model_name,response_time_ms,was_fallback,created_at") \
        .gte("created_at", since).order("created_at", desc=True).limit(1000).execute()
    return {"usage": r.data or []}


@router.get("/llm/failures")
async def get_llm_failures(limit: int = 100, _: str = Depends(require_admin)):
    db = get_db()
    r = db.table("llm_failures").select("*").order("created_at", desc=True).limit(limit).execute()
    return {"failures": r.data or []}


# ── Errors ────────────────────────────────────────────────────────────────────
@router.get("/errors")
async def get_errors(
    limit: int = 100,
    severity: Optional[str] = None,
    _: str = Depends(require_admin),
):
    db = get_db()
    q = db.table("error_logs").select("*").order("created_at", desc=True).limit(limit)
    if severity:
        q = q.eq("severity", severity)
    r = q.execute()
    return {"errors": r.data or []}


# ── Stats ─────────────────────────────────────────────────────────────────────
@router.get("/stats")
async def get_stats(_: str = Depends(require_admin)):
    db = get_db()
    from datetime import datetime, timezone, timedelta
    ago24h = (datetime.now(timezone.utc) - timedelta(hours=24)).isoformat()
    ago7d  = (datetime.now(timezone.utc) - timedelta(days=7)).isoformat()

    users_total  = db.table("profiles").select("id", count="exact").execute()
    msgs_24h     = db.table("messages").select("id", count="exact").gte("created_at", ago24h).execute()
    msgs_7d      = db.table("messages").select("id", count="exact").gte("created_at", ago7d).execute()
    open_tickets = db.table("support_tickets").select("id", count="exact").eq("status", "open").execute()
    active_subs  = db.table("user_subscriptions").select("id", count="exact").eq("status", "active").execute()
    llm_failures = db.table("llm_failures").select("id", count="exact").gte("created_at", ago24h).execute()

    return {
        "users_total":     users_total.count or 0,
        "messages_24h":    msgs_24h.count or 0,
        "messages_7d":     msgs_7d.count or 0,
        "open_tickets":    open_tickets.count or 0,
        "active_subs":     active_subs.count or 0,
        "llm_failures_24h": llm_failures.count or 0,
    }


# ── Contact messages ──────────────────────────────────────────────────────────
@router.get("/contacts")
async def get_contacts(limit: int = 50, _: str = Depends(require_admin)):
    db = get_db()
    r = db.table("contact_messages").select("*").order("created_at", desc=True).limit(limit).execute()
    return {"contacts": r.data or []}


# ── Beta feedback ─────────────────────────────────────────────────────────────
@router.get("/feedback")
async def get_feedback(limit: int = 50, _: str = Depends(require_admin)):
    db = get_db()
    r = db.table("beta_feedback").select("*").order("created_at", desc=True).limit(limit).execute()
    return {"feedback": r.data or []}
