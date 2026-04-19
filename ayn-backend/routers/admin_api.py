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
    # Trust JWT claim from /admin/login (verified at issuance)
    if current_user.get("is_admin"):
        return current_user
    if current_user.get("user_id") == "internal":
        return current_user
    # Fallback: DB lookup
    try:
        user = await fetchrow("SELECT is_admin FROM users WHERE id = $1::uuid", current_user["user_id"])
        if user and user["is_admin"]:
            return current_user
    except Exception:
        pass
    raise HTTPException(403, "Admin access required")


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
    await execute("SELECT add_bonus_credits($1::uuid, $2, $3, 'admin')", 
                  req.user_id, req.amount, req.reason)
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


# ── Support Tickets ────────────────────────────────────────────────────────────

@router.get("/support-tickets")
async def get_support_tickets(_=Depends(require_admin)):
    rows = await fetch("""
        SELECT t.*, u.email as user_email,
               (SELECT COUNT(*) FROM ticket_messages tm WHERE tm.ticket_id = t.id) as message_count
        FROM support_tickets t
        LEFT JOIN users u ON u.id = t.user_id
        ORDER BY t.updated_at DESC LIMIT 100
    """)
    return rows or []

class TicketUpdateRequest(BaseModel):
    status: str = None
    assigned_to: str = None
    priority: str = None

@router.patch("/support-tickets/{ticket_id}")
async def update_ticket(ticket_id: str, req: TicketUpdateRequest, _=Depends(require_admin)):
    updates = {k: v for k, v in req.dict().items() if v is not None}
    if not updates:
        return {"ok": True}
    set_clause = ", ".join(f"{k} = ${i+2}" for i, k in enumerate(updates.keys()))
    values = list(updates.values())
    await execute(f"UPDATE support_tickets SET {set_clause}, updated_at = NOW() WHERE id = $1",
                  ticket_id, *values)
    return {"ok": True}

class TicketReplyRequest(BaseModel):
    message: str
    is_ai_generated: bool = False

@router.post("/support-tickets/{ticket_id}/reply")
async def reply_ticket(ticket_id: str, req: TicketReplyRequest, _=Depends(require_admin)):
    await execute("""
        INSERT INTO support_ticket_replies (ticket_id, message, sent_by, is_ai_generated)
        VALUES ($1, $2, 'admin', $3)
    """, ticket_id, req.message, req.is_ai_generated)
    await execute("UPDATE support_tickets SET has_unread_reply = true, updated_at = NOW() WHERE id = $1", ticket_id)
    return {"ok": True}


# ── Custom Orders ──────────────────────────────────────────────────────────────

@router.get("/custom-orders")
async def get_custom_orders(_=Depends(require_admin)):
    rows = await fetch("SELECT * FROM custom_orders ORDER BY created_at DESC")
    return rows or []

@router.post("/custom-orders")
async def create_custom_order(data: dict, admin=Depends(require_admin)):
    row = await fetchrow("""
        INSERT INTO custom_orders (company_name, company_email, contact_person, order_title,
            services, subtotal, total_amount, currency, status, created_by)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'draft', $9)
        RETURNING *
    """, data.get('company_name'), data.get('company_email'), data.get('contact_person'),
        data.get('order_title'), json_or_null(data.get('services', [])),
        data.get('subtotal', 0), data.get('total_amount', 0),
        data.get('currency', 'SAR'), admin['user_id'])
    return dict(row) if row else {}

@router.patch("/custom-orders/{order_id}")
async def update_custom_order(order_id: str, data: dict, _=Depends(require_admin)):
    allowed = ['status', 'notes', 'client_signature_url', 'admin_signature_url', 
               'stripe_payment_link', 'contract_pdf_url']
    updates = {k: v for k, v in data.items() if k in allowed}
    if not updates:
        return {"ok": True}
    set_clause = ", ".join(f"{k} = ${i+2}" for i, k in enumerate(updates.keys()))
    await execute(f"UPDATE custom_orders SET {set_clause}, updated_at = NOW() WHERE id = $1",
                  order_id, *updates.values())
    return {"ok": True}


# ── NDA Management ─────────────────────────────────────────────────────────────

@router.get("/nda-agreements")
async def get_nda_agreements(_=Depends(require_admin)):
    rows = await fetch("SELECT * FROM nda_agreements ORDER BY created_at DESC")
    return rows or []

@router.post("/nda-agreements")
async def create_nda(data: dict, admin=Depends(require_admin)):
    row = await fetchrow("""
        INSERT INTO nda_agreements (company_name, company_email, contact_person, 
            nda_purpose, status, created_by)
        VALUES ($1, $2, $3, $4, 'draft', $5)
        RETURNING *
    """, data.get('company_name'), data.get('company_email'), data.get('contact_person'),
        data.get('nda_purpose'), admin['user_id'])
    return dict(row) if row else {}


# ── System Config ──────────────────────────────────────────────────────────────

@router.get("/system-config")
async def get_system_config(_=Depends(require_admin)):
    rows = await fetch("SELECT key, value, updated_at FROM system_config ORDER BY key")
    return rows or []

class SystemConfigRequest(BaseModel):
    key: str
    value: dict

@router.post("/system-config")
async def upsert_system_config(req: SystemConfigRequest, admin=Depends(require_admin)):
    import json
    await execute("""
        INSERT INTO system_config (key, value, updated_by, updated_at)
        VALUES ($1, $2, $3, NOW())
        ON CONFLICT (key) DO UPDATE SET value = $2, updated_by = $3, updated_at = NOW()
    """, req.key, json.dumps(req.value), admin['user_id'])
    return {"ok": True}


# ── Service Applications ───────────────────────────────────────────────────────

@router.get("/service-applications")
async def get_service_applications(_=Depends(require_admin)):
    rows = await fetch("SELECT * FROM service_applications ORDER BY created_at DESC")
    return rows or []


# ── LLM Usage Stats ────────────────────────────────────────────────────────────

@router.get("/llm-stats")
async def get_llm_stats(_=Depends(require_admin)):
    rows = await fetch("""
        SELECT model_name, intent_type,
               COUNT(*) as request_count,
               SUM(input_tokens) as total_input_tokens,
               SUM(output_tokens) as total_output_tokens,
               SUM(cost_sar) as total_cost_sar,
               AVG(response_time_ms) as avg_response_ms
        FROM llm_usage_logs
        WHERE created_at > NOW() - INTERVAL '30 days'
        GROUP BY model_name, intent_type
        ORDER BY request_count DESC
    """)
    return rows or []


# ── Visitor Analytics ──────────────────────────────────────────────────────────

@router.get("/visitor-analytics")
async def get_visitor_analytics(_=Depends(require_admin)):
    stats = await fetchrow("""
        SELECT 
            COUNT(DISTINCT visitor_id) as unique_visitors,
            COUNT(*) as total_pageviews,
            COUNT(DISTINCT session_id) as sessions,
            COUNT(DISTINCT CASE WHEN created_at > NOW() - INTERVAL '24 hours' 
                                THEN visitor_id END) as visitors_today
        FROM visitor_analytics
        WHERE created_at > NOW() - INTERVAL '30 days'
    """)
    pages = await fetch("""
        SELECT page_path, COUNT(*) as views
        FROM visitor_analytics
        WHERE created_at > NOW() - INTERVAL '7 days'
        GROUP BY page_path ORDER BY views DESC LIMIT 20
    """)
    return {"stats": dict(stats) if stats else {}, "top_pages": pages or []}


def json_or_null(val):
    import json
    if val is None:
        return None
    if isinstance(val, str):
        return val
    return json.dumps(val)
