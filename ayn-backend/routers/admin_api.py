"""
routers/admin_api.py — admin panel API endpoints
Replaces all Supabase get_admin_* RPC functions
"""
import logging
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from core.auth_new import get_current_user
from core.database import fetch, fetchrow, execute, fetchval

router = APIRouter(prefix="/admin", tags=["admin"])
log = logging.getLogger("ayn.admin")


async def require_admin(current_user: dict = Depends(get_current_user)):
    user = await fetchrow("SELECT is_admin FROM users WHERE id = $1", current_user["user_id"])
    if not user or not user["is_admin"]:
        raise HTTPException(403, "Admin access required")
    return current_user


# ── Dashboard Stats ────────────────────────────────────────────────────────────

@router.get("/stats")
async def get_stats(_=Depends(require_admin)):
    total_users = await fetchval("SELECT COUNT(*) FROM users") or 0
    active_today = await fetchval("""
        SELECT COUNT(DISTINCT user_id) FROM messages 
        WHERE created_at > NOW() - INTERVAL '24 hours'
    """) or 0
    total_messages = await fetchval("SELECT COUNT(*) FROM messages") or 0
    new_today = await fetchval("""
        SELECT COUNT(*) FROM users WHERE created_at > NOW() - INTERVAL '24 hours'
    """) or 0
    return {
        "total_users": total_users,
        "active_today": active_today,
        "total_messages": total_messages,
        "new_users_today": new_today,
    }


# ── Users ──────────────────────────────────────────────────────────────────────

@router.get("/users")
async def get_users(_=Depends(require_admin)):
    rows = await fetch("""
        SELECT u.id, u.email, u.first_name, u.last_name, u.is_admin, u.created_at,
               COALESCE(s.subscription_tier, 'free') as subscription_tier,
               COALESCE(s.status, 'active') as subscription_status,
               COALESCE(l.daily_messages, 5) as daily_messages,
               COALESCE(l.current_daily_messages, 0) as current_daily_messages,
               COALESCE(l.bonus_credits, 0) as bonus_credits,
               (SELECT COUNT(*) FROM messages m WHERE m.user_id = u.id) as message_count
        FROM users u
        LEFT JOIN user_subscriptions s ON s.user_id = u.id
        LEFT JOIN user_ai_limits l ON l.user_id = u.id
        ORDER BY u.created_at DESC
    """)
    return rows or []


@router.get("/users/{user_id}")
async def get_user(user_id: str, _=Depends(require_admin)):
    row = await fetchrow("""
        SELECT u.*, 
               COALESCE(s.subscription_tier, 'free') as subscription_tier,
               l.daily_messages, l.current_daily_messages, l.bonus_credits
        FROM users u
        LEFT JOIN user_subscriptions s ON s.user_id = u.id
        LEFT JOIN user_ai_limits l ON l.user_id = u.id
        WHERE u.id = $1
    """, user_id)
    return dict(row) if row else {}


class GiftCreditsRequest(BaseModel):
    user_id: str
    amount: int
    reason: str = "Admin gift"

@router.post("/gift-credits")
async def gift_credits(req: GiftCreditsRequest, _=Depends(require_admin)):
    await execute("""
        INSERT INTO user_ai_limits (user_id, bonus_credits)
        VALUES ($1, $2)
        ON CONFLICT (user_id) DO UPDATE
        SET bonus_credits = user_ai_limits.bonus_credits + $2, updated_at = NOW()
    """, req.user_id, req.amount)
    return {"ok": True}


# ── Messages / Conversations ───────────────────────────────────────────────────

@router.get("/conversations")
async def get_conversations(_=Depends(require_admin)):
    rows = await fetch("""
        SELECT cs.session_id, cs.title, cs.created_at, cs.updated_at,
               u.email as user_email,
               COUNT(m.id) as message_count
        FROM chat_sessions cs
        JOIN users u ON u.id = cs.user_id
        LEFT JOIN messages m ON m.session_id = cs.session_id
        GROUP BY cs.session_id, cs.title, cs.created_at, cs.updated_at, u.email
        ORDER BY cs.updated_at DESC
        LIMIT 100
    """)
    return rows or []


@router.get("/conversations/{session_id}")
async def get_conversation_messages(session_id: str, _=Depends(require_admin)):
    rows = await fetch("""
        SELECT id, role, content, intent_type, model_used, created_at
        FROM messages WHERE session_id = $1
        ORDER BY created_at ASC
    """, session_id)
    return rows or []


# ── Error Logs ─────────────────────────────────────────────────────────────────

@router.get("/errors")
async def get_errors(source: str = None, status: str = "open", _=Depends(require_admin)):
    where = "WHERE status = $1"
    params = [status]
    if source:
        where += " AND source = $2"
        params.append(source)
    rows = await fetch(f"""
        SELECT id, source, severity, error_message, error_stack, endpoint, 
               context, user_id, url, status, created_at, resolved_at, resolved_note
        FROM error_logs {where}
        ORDER BY created_at DESC LIMIT 200
    """, *params)
    return rows or []


class ResolveErrorRequest(BaseModel):
    error_id: str
    note: str = ""

@router.post("/errors/{error_id}/resolve")
async def resolve_error(error_id: str, req: ResolveErrorRequest, _=Depends(require_admin)):
    await execute("""
        UPDATE error_logs SET status='resolved', resolved_at=NOW(), resolved_note=$1
        WHERE id = $2
    """, req.note, error_id)
    return {"ok": True}


# ── Subscriptions ──────────────────────────────────────────────────────────────

@router.get("/subscriptions")
async def get_subscriptions(_=Depends(require_admin)):
    rows = await fetch("""
        SELECT u.email, u.first_name, s.subscription_tier, s.status,
               s.stripe_customer_id, s.stripe_subscription_id, 
               s.current_period_end, s.updated_at
        FROM user_subscriptions s
        JOIN users u ON u.id = s.user_id
        ORDER BY s.updated_at DESC
    """)
    return rows or []


# ── Contact Messages ───────────────────────────────────────────────────────────

@router.get("/contact-messages")
async def get_contact_messages(_=Depends(require_admin)):
    rows = await fetch("""
        SELECT * FROM contact_messages ORDER BY created_at DESC LIMIT 100
    """)
    return rows or []


@router.post("/contact-messages/{msg_id}/read")
async def mark_read(msg_id: str, _=Depends(require_admin)):
    await execute("UPDATE contact_messages SET status='read' WHERE id=$1", msg_id)
    return {"ok": True}


# ── Beta Feedback ──────────────────────────────────────────────────────────────

@router.get("/beta-feedback")
async def get_beta_feedback(_=Depends(require_admin)):
    rows = await fetch("""
        SELECT bf.*, u.email as user_email
        FROM beta_feedback bf
        LEFT JOIN users u ON u.id = bf.user_id
        ORDER BY bf.created_at DESC LIMIT 100
    """)
    return rows or []


# ── System health ──────────────────────────────────────────────────────────────

@router.get("/health")
async def admin_health(_=Depends(require_admin)):
    user_count = await fetchval("SELECT COUNT(*) FROM users") or 0
    message_count = await fetchval("SELECT COUNT(*) FROM messages") or 0
    error_count = await fetchval("SELECT COUNT(*) FROM error_logs WHERE status='open'") or 0
    return {
        "users": user_count,
        "messages": message_count,
        "open_errors": error_count,
        "db": "railway_postgresql",
        "status": "healthy"
    }
