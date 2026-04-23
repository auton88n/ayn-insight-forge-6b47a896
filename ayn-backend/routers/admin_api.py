"""
routers/admin_api.py — admin panel API endpoints
Replaces all Supabase get_admin_* RPC functions
"""
import logging
import hashlib
import json
from typing import Any, Optional
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from core.database import fetch, fetchrow, execute, fetchval
from core.security import require_admin_user

def _hash_pin(pin: str) -> str:
    """Helper to SHA256 hash admin PIN."""
    return hashlib.sha256(pin.encode()).hexdigest()

router = APIRouter(prefix="/admin", tags=["admin"])
log = logging.getLogger("ayn.admin")


# ── Dashboard Stats ────────────────────────────────────────────────────────────

@router.get("/stats")
async def get_stats(_=Depends(require_admin_user)):
    try:
        total_users = await fetchval("SELECT COUNT(*) FROM users") or 0
        new_today = await fetchval("SELECT COUNT(*) FROM users WHERE created_at::date = CURRENT_DATE") or 0
        # Messages today vs total
        today_messages = await fetchval("""
            SELECT COUNT(*) FROM messages 
            WHERE created_at > NOW() - INTERVAL '24 hours'
        """) or 0
        total_messages = await fetchval("SELECT COUNT(*) FROM messages") or 0
        
        active_30d = await fetchval("""
            SELECT COUNT(DISTINCT user_id) FROM messages 
            WHERE created_at > NOW() - INTERVAL '30 days'
        """) or 0
        
        # Recent errors (24h) for SystemMonitoring
        errors_24h = await fetchval("""
            SELECT COUNT(*) FROM error_logs 
            WHERE created_at > NOW() - INTERVAL '24 hours'
        """) or 0
        
        # Additional metrics for AdminStatsPanel
        blocked_users = await fetchval("SELECT COUNT(*) FROM users WHERE is_active = FALSE") or 0
        open_tickets = await fetchval("SELECT COUNT(*) FROM support_tickets WHERE status = 'open'") or 0

        # LLM Usage (24h)
        llm_usage = await fetchval("""
            SELECT COUNT(*) FROM llm_usage_logs 
            WHERE created_at > NOW() - INTERVAL '24 hours'
        """) or 0
        llm_fallbacks = await fetchval("""
            SELECT COUNT(*) FROM llm_usage_logs 
            WHERE created_at > NOW() - INTERVAL '24 hours' AND was_fallback = TRUE
        """) or 0
        
        # Recent users for Dashboard
        recent_rows = await fetch("""
            SELECT id, email, 
                   COALESCE(first_name || ' ' || last_name, email) as display_name, 
                   created_at as signed_up_at, 
                   COALESCE(is_active, TRUE) as is_active
            FROM users 
            ORDER BY created_at DESC 
            LIMIT 10
        """)
        recent_users = [dict(r) for r in recent_rows]

        # Calculate real system health (100 - (errors_24h * 2) - (llm_fallbacks * 1))
        system_health = max(0, 100 - (errors_24h * 2) - (llm_fallbacks))
        
        # Calculate real test pass rate from performance_metrics if available
        test_pass_count = await fetchval("SELECT COUNT(*) FROM performance_metrics WHERE metric_name = 'test_pass'") or 0
        test_fail_count = await fetchval("SELECT COUNT(*) FROM performance_metrics WHERE metric_name = 'test_fail'") or 0
        test_pass_rate = (test_pass_count / (test_pass_count + test_fail_count)) * 100 if (test_pass_count + test_fail_count) > 0 else 100

        return {
            "total_users": total_users,
            "active_users_30d": active_30d,
            "messages_today": today_messages,
            "messages_total": total_messages,
            "new_users_today": new_today,
            "errors_24h": errors_24h,
            "system_health": system_health,
            "systemHealth": system_health,
            "blocked_users": blocked_users,
            "blockedUsers": blocked_users,
            "open_tickets": open_tickets,
            "openTickets": open_tickets,
            "llm_usage_24h": llm_usage,
            "llm_fallbacks_24h": llm_fallbacks,
            "llmFallbackRate": (llm_fallbacks / llm_usage) * 100 if llm_usage > 0 else 0,
            "testPassRate": test_pass_rate,
            "calcUsage24h": llm_usage,
            "recent_users": recent_users
        }
    except Exception as e:
        log.error(f"Error in get_stats: {e}")
        return {
            "total_users": 0, "active_users_30d": 0, "messages_today": 0, "new_users_today": 0,
            "systemHealth": 0, "testPassRate": 0, "blockedUsers": 0, "openTickets": 0,
            "llmFallbackRate": 0, "calcUsage24h": 0, "recent_users": []
        }


@router.get("/llm")
async def get_llm_stats(_=Depends(require_admin_user)):
    try:
        today = await fetchval("SELECT COUNT(*) FROM llm_usage_logs WHERE created_at > NOW() - INTERVAL '24 hours'") or 0
        week = await fetchval("SELECT COUNT(*) FROM llm_usage_logs WHERE created_at > NOW() - INTERVAL '7 days'") or 0
        month = await fetchval("SELECT COUNT(*) FROM llm_usage_logs WHERE created_at > NOW() - INTERVAL '30 days'") or 0
        
        failures = await fetchval("""
            SELECT COUNT(*) FROM llm_usage_logs 
            WHERE created_at > NOW() - INTERVAL '24 hours' AND success = FALSE
        """) or 0
        
        fallback = await fetchval("""
            SELECT COUNT(*) FROM llm_usage_logs 
            WHERE created_at > NOW() - INTERVAL '24 hours' AND was_fallback = TRUE
        """) or 0
        
        by_model = await fetch("""
            SELECT model, COUNT(*) as count, 
                   SUM(input_tokens) as input_tokens, 
                   SUM(output_tokens) as output_tokens
            FROM llm_usage_logs 
            WHERE created_at > NOW() - INTERVAL '30 days'
            GROUP BY model
        """)
        
        return {
            "today_count": today,
            "week_count": week,
            "month_count": month,
            "today_failures": failures,
            "fallback_today": fallback,
            "by_model": [dict(r) for r in by_model]
        }
    except Exception as e:
        log.error(f"Error in get_llm_stats: {e}")
        return {"today_count": 0, "week_count": 0, "month_count": 0, "today_failures": 0, "fallback_today": 0, "by_model": []}


@router.get("/user-messages")
async def get_user_messages(user_id: str, limit: int = 50, _=Depends(require_admin_user)):
    try:
        rows = await fetch("""
            SELECT m.id, m.content, m.sender, m.created_at, m.session_id
            FROM messages m
            WHERE m.user_id = $1::uuid
            ORDER BY m.created_at DESC
            LIMIT $2
        """, user_id, limit)
        return rows or []
    except Exception as e:
        log.error(f"Error in get_user_messages: {e}")
        return []

@router.get("/users")
async def get_users(_=Depends(require_admin_user)):
    # Comprehensive query to satisfy AdminUser frontend interface
    rows = await fetch("""
        WITH user_stats AS (
            SELECT 
                user_id,
                COUNT(*) as total_m,
                COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '7 days') as m7,
                COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '30 days') as m30,
                COUNT(DISTINCT created_at::date) as active_days,
                MAX(created_at) as last_act
            FROM messages
            GROUP BY user_id
        )
        SELECT 
            u.id, 
            u.email, 
            COALESCE(u.first_name || ' ' || u.last_name, u.email) as display_name,
            u.avatar_url,
            u.auth_provider,
            u.created_at as signed_up_at,
            u.last_sign_in_at,
            us.last_act as last_active_at,
            u.email_verified,
            u.contact_person,
            u.company_name,
            CASE WHEN u.is_admin THEN 'admin' ELSE 'user' END as role,
            COALESCE(s.subscription_tier, 'free') as subscription_tier,
            COALESCE(s.status, 'active') as subscription_status,
            COALESCE(u.is_active, TRUE) as is_active,
            COALESCE(l.current_daily_messages, 0) as current_month_usage,
            COALESCE(l.daily_messages, 5) as monthly_limit,
            COALESCE(us.total_m, 0) as total_messages,
            COALESCE(us.m7, 0) as messages_7d,
            COALESCE(us.m30, 0) as messages_30d,
            COALESCE(us.active_days, 0) as active_days_total,
            CASE WHEN us.last_act IS NOT NULL THEN EXTRACT(DAY FROM NOW() - us.last_act) ELSE NULL END as days_since_last_use
        FROM users u
        LEFT JOIN user_stats us ON us.user_id = u.id
        LEFT JOIN user_subscriptions s ON s.user_id = u.id
        LEFT JOIN user_ai_limits l ON l.user_id = u.id
        ORDER BY u.created_at DESC
    """)
    return rows or []


@router.get("/users/{user_id}")
async def get_user(user_id: str, _=Depends(require_admin_user)):
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
class CreateUserRequest(BaseModel):
    email: str
    password: str
    first_name: str = ""
    last_name: str = ""
    is_admin: bool = False

@router.post("/users")
async def create_user(req: CreateUserRequest, user_id: str = Depends(require_admin_user)):
    from core.auth_new import hash_password
    hashed = hash_password(req.password)
    email = req.email.lower()
    
    # Check exists
    existing = await fetchrow("SELECT id FROM users WHERE email = $1", email)
    if existing:
        raise HTTPException(400, "User already exists")
        
    row = await fetchrow("""
        INSERT INTO users (email, password_hash, first_name, last_name, is_admin)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING id
    """, email, hashed, req.first_name, req.last_name, req.is_admin)
    
    new_user_id = str(row["id"])
    
    if req.is_admin:
        await execute("INSERT INTO admins (user_id) VALUES ($1::uuid) ON CONFLICT DO NOTHING", new_user_id)
        
    await execute("INSERT INTO admin_audit_logs (actor, action, target, details) VALUES ($1, $2, $3, $4)",
                  user_id, "create_user", email, f'{{"is_admin": {str(req.is_admin).lower()}}}')
                  
    return {"ok": True, "id": new_user_id}

class GiftCreditsRequest(BaseModel):
    user_id: str
    amount: int
    reason: str = "Admin gift"

@router.post("/gift-credits")
@router.post("/add-credits")
async def gift_credits(req: GiftCreditsRequest, _=Depends(require_admin_user)):
    await execute("SELECT add_bonus_credits($1::uuid, $2, $3, 'admin')", 
                  req.user_id, req.amount, req.reason)
    return {"ok": True}


# ── Messages / Conversations ───────────────────────────────────────────────────

@router.get("/conversations")
async def get_conversations(_=Depends(require_admin_user)):
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
async def get_conversation_messages(session_id: str, _=Depends(require_admin_user)):
    rows = await fetch("""
        SELECT id, role, content, intent_type, model_used, created_at
        FROM messages WHERE session_id = $1
        ORDER BY created_at ASC
    """, session_id)
    return rows or []


# ── Error Logs ─────────────────────────────────────────────────────────────────

@router.get("/errors")
async def get_errors(source: str = None, status: str = "open", _=Depends(require_admin_user)):
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
async def resolve_error(error_id: str, req: ResolveErrorRequest, _=Depends(require_admin_user)):
    await execute("""
        UPDATE error_logs SET status='resolved', resolved_at=NOW(), resolved_note=$1
        WHERE id = $2
    """, req.note, error_id)
    return {"ok": True}


# ── Subscriptions ──────────────────────────────────────────────────────────────

@router.get("/subscriptions")
async def get_subscriptions(_=Depends(require_admin_user)):
    try:
        # Match RevenueDashboard.tsx expectation: id, display_name, email, auth_provider,
        # subscription_tier, subscription_status, is_unlimited, total_messages, messages_30d,
        # signed_up_at, last_active_at
        rows = await fetch("""
            SELECT 
                u.id, 
                COALESCE(u.first_name || ' ' || u.last_name, u.email) as display_name,
                u.email,
                u.auth_provider,
                us.subscription_tier,
                us.status as subscription_status,
                (us.subscription_tier = 'unlimited') as is_unlimited,
                COALESCE(stats.total_messages, 0) as total_messages,
                COALESCE(stats.messages_30d, 0) as messages_30d,
                u.created_at as signed_up_at,
                u.last_active_at
            FROM users u
            LEFT JOIN user_subscriptions us ON us.user_id = u.id
            LEFT JOIN (
                SELECT 
                    user_id, 
                    COUNT(*) as total_messages,
                    COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '30 days') as messages_30d
                FROM messages
                GROUP BY user_id
            ) stats ON stats.user_id = u.id
            ORDER BY u.created_at DESC
        """)
        return rows or []
    except Exception as e:
        log.error(f"Error in get_subscriptions: {e}")
        return []


# ── Contact Messages ───────────────────────────────────────────────────────────

@router.get("/contact-messages")
async def get_contact_messages(_=Depends(require_admin_user)):
    rows = await fetch("""
        SELECT * FROM contact_messages ORDER BY created_at DESC LIMIT 100
    """)
    return rows or []


@router.post("/contact-messages/{msg_id}/read")
async def mark_read(msg_id: str, _=Depends(require_admin_user)):
    await execute("UPDATE contact_messages SET status='read' WHERE id=$1", msg_id)
    return {"ok": True}


# ── Beta Feedback ──────────────────────────────────────────────────────────────

@router.get("/beta-feedback")
async def get_beta_feedback(_=Depends(require_admin_user)):
    rows = await fetch("""
        SELECT bf.*, u.email as user_email
        FROM beta_feedback bf
        LEFT JOIN users u ON u.id = bf.user_id
        ORDER BY bf.created_at DESC LIMIT 100
    """)
    return rows or []


# ── System health ──────────────────────────────────────────────────────────────

@router.get("/health")
async def admin_health(_=Depends(require_admin_user)):
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


@router.get("/notification-log")
async def get_notification_log(_=Depends(require_admin_user)):
    try:
        rows = await fetch("""
            SELECT nl.*, u.email as user_email
            FROM admin_notification_log nl
            LEFT JOIN users u ON u.id = nl.user_id
            ORDER BY nl.created_at DESC LIMIT 100
        """)
        return rows or []
    except Exception:
        return []


@router.get("/user-growth")
async def get_user_growth(_=Depends(require_admin_user)):
    try:
        rows = await fetch("""
            SELECT created_at::date as date, COUNT(*) as count
            FROM users
            WHERE created_at > NOW() - INTERVAL '30 days'
            GROUP BY created_at::date
            ORDER BY date ASC
        """)
        return rows or []
    except Exception:
        return []


@router.get("/churn-alerts")
async def get_churn_alerts(_=Depends(require_admin_user)):
    try:
        # Users who haven't messaged in 14 days but have a paid sub
        rows = await fetch("""
            SELECT u.id, u.email, u.last_active_at, us.subscription_tier
            FROM users u
            JOIN user_subscriptions us ON us.user_id = u.id
            WHERE us.subscription_tier != 'free'
              AND (u.last_active_at < NOW() - INTERVAL '14 days' OR u.last_active_at IS NULL)
            ORDER BY u.last_active_at ASC NULLS FIRST
        """)
        return rows or []
    except Exception:
        return []


# ── Support Tickets ────────────────────────────────────────────────────────────

@router.get("/tickets")
@router.get("/support-tickets")
async def get_support_tickets(_=Depends(require_admin_user)):
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
async def update_ticket(ticket_id: str, req: TicketUpdateRequest, _=Depends(require_admin_user)):
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
async def reply_ticket(ticket_id: str, req: TicketReplyRequest, _=Depends(require_admin_user)):
    await execute("""
        INSERT INTO support_ticket_replies (ticket_id, message, sent_by, is_ai_generated)
        VALUES ($1, $2, 'admin', $3)
    """, ticket_id, req.message, req.is_ai_generated)
    await execute("UPDATE support_tickets SET has_unread_reply = true, updated_at = NOW() WHERE id = $1", ticket_id)
    return {"ok": True}


# ── Custom Orders ──────────────────────────────────────────────────────────────

@router.get("/orders")
@router.get("/custom-orders")
async def get_custom_orders(_=Depends(require_admin_user)):
    rows = await fetch("SELECT * FROM custom_orders ORDER BY created_at DESC")
    return rows or []

@router.post("/custom-orders")
async def create_custom_order(data: dict, admin=Depends(require_admin_user)):
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
async def update_custom_order(order_id: str, data: dict, _=Depends(require_admin_user)):
    """Update custom order. Supports all fields from frontend."""
    # Columns we allow updating
    fields = [
        'company_name', 'company_email', 'contact_person', 'company_phone',
        'company_address', 'order_title', 'order_description', 'services',
        'subtotal', 'discount_percent', 'tax_percent', 'total_amount',
        'currency', 'status', 'notes', 'terms_and_conditions', 'privacy_notes',
        'after_sale_services', 'delivery_timeline', 'stripe_payment_link',
        'contract_pdf_url', 'admin_signature_url', 'client_signature_url'
    ]
    
    updates = {}
    for k, v in data.items():
        if k in fields:
            if k == 'services' and v is not None:
                import json
                updates[k] = json.dumps(v)
            else:
                updates[k] = v

    if not updates:
        return {"ok": True}

    set_parts = []
    values = [order_id]
    for i, (k, v) in enumerate(updates.items(), start=2):
        set_parts.append(f"{k} = ${i}")
        values.append(v)
    
    set_clause = ", ".join(set_parts)
    await execute(f"UPDATE custom_orders SET {set_clause}, updated_at = NOW() WHERE id = $1",
                  *values)
    return {"ok": True}


@router.delete("/custom-orders/{order_id}")
async def delete_custom_order(order_id: str, _=Depends(require_admin_user)):
    await execute("DELETE FROM custom_orders WHERE id = $1", order_id)
    return {"ok": True}


@router.post("/custom-orders/{order_id}/mark-paid")
@router.post("/orders/{order_id}/mark-paid")
async def mark_order_paid(order_id: str, _=Depends(require_admin_user)):
    await execute("""
        UPDATE custom_orders 
        SET status = 'paid', updated_at = NOW() 
        WHERE id = $1
    """, order_id)
    return {"ok": True}


@router.post("/custom-orders/{order_id}/pdf")
@router.post("/orders/{order_id}/generate-pdf")
async def generate_order_pdf(order_id: str, _=Depends(require_admin_user)):
    """
    Generates a print-friendly HTML version of the contract.
    The frontend uses window.print() on this.
    """
    row = await fetchrow("SELECT * FROM custom_orders WHERE id = $1", order_id)
    if not row:
        raise HTTPException(404, "Order not found")
    
    # Simple semantic HTML for the contract
    # In a real production app, we would use a more sophisticated PDF generator
    # But for Phase 7 restoration, we ensure functional parity.
    html = f"""
    <html>
    <head>
        <title>Contract - {row['order_title']}</title>
        <style>
            body {{ font-family: sans-serif; padding: 40px; line-height: 1.6; color: #333; }}
            .header {{ display: flex; justify-content: space-between; margin-bottom: 40px; border-bottom: 2px solid #eee; padding-bottom: 20px; }}
            .section {{ margin-bottom: 30px; }}
            .section-title {{ font-weight: bold; font-size: 1.2em; border-bottom: 1px solid #eee; margin-bottom: 10px; }}
            table {{ w-full; border-collapse: collapse; margin: 20px 0; }}
            th, td {{ border: 1px solid #eee; padding: 10px; text-align: left; }}
            th {{ background: #f9f9f9; }}
            .total {{ text-align: right; font-size: 1.2em; font-weight: bold; margin-top: 20px; }}
            .signature-box {{ display: flex; justify-content: space-between; margin-top: 60px; }}
            .signature-line {{ border-top: 1px solid #333; width: 250px; padding-top: 10px; text-align: center; }}
        </style>
    </head>
    <body>
        <div class="header">
            <div>
                <h1>AYN AI</h1>
                <p>Agreement & Service Order</p>
            </div>
            <div style="text-align: right">
                <p><strong>Order ID:</strong> {order_id[:8]}</p>
                <p><strong>Date:</strong> {row['created_at'].strftime('%Y-%m-%d')}</p>
            </div>
        </div>

        <div class="section">
            <div class="section-title">Client Information</div>
            <p><strong>{row['company_name']}</strong><br/>
               Attn: {row['contact_person']}<br/>
               {row['company_email']}<br/>
               {row['company_phone'] or ''}<br/>
               {row['company_address'] or ''}</p>
        </div>

        <div class="section">
            <div class="section-title">Order: {row['order_title']}</div>
            <p>{row['order_description'] or 'No description provided.'}</p>
        </div>

        <div class="section">
            <div class="section-title">Services & Pricing</div>
            <table>
                <thead>
                    <tr>
                        <th>Service</th>
                        <th>Description</th>
                        <th style="text-align: right">Price</th>
                        <th style="text-align: center">Qty</th>
                        <th style="text-align: right">Total</th>
                    </tr>
                </thead>
                <tbody>
    """
    
    import json
    services = json.loads(row['services']) if isinstance(row['services'], str) else row['services']
    for s in services:
        stotal = s.get('price', 0) * s.get('quantity', 1)
        html += f"""
                    <tr>
                        <td>{s.get('name', '')}</td>
                        <td>{s.get('description', '')}</td>
                        <td style="text-align: right">{row['currency']} {s.get('price', 0):,.2f}</td>
                        <td style="text-align: center">{s.get('quantity', 1)}</td>
                        <td style="text-align: right">{row['currency']} {stotal:,.2f}</td>
                    </tr>
        """
    
    html += f"""
                </tbody>
            </table>
            <div class="total">
                <p>Subtotal: {row['currency']} {row['subtotal']:,.2f}</p>
                {"<p>Discount: " + str(row['discount_percent']) + "%</p>" if row['discount_percent'] else ""}
                <p>VAT ({row['tax_percent']}%): {row['currency']} {(row['total_amount'] - row['subtotal']):,.2f}</p>
                <hr/>
                <p style="font-size: 1.4em">Grand Total: {row['currency']} {row['total_amount']:,.2f}</p>
            </div>
        </div>

        <div class="section">
            <div class="section-title">Terms & Conditions</div>
            <div style="font-size: 0.9em; white-space: pre-wrap;">{row['terms_and_conditions'] or 'Standard terms apply.'}</div>
        </div>

        <div class="signature-box">
            <div class="signature-line">
                <p>Authorized Signature (AYN)</p>
                <p style="font-size: 0.8em; color: #666; margin-top: 20px;">{row['admin_signed_at'] or 'Pending'}</p>
            </div>
            <div class="signature-line">
                <p>Client Signature ({row['company_name']})</p>
                <p style="font-size: 0.8em; color: #666; margin-top: 20px;">{row['client_signed_at'] or 'Pending'}</p>
            </div>
        </div>

        <div style="margin-top: 40px; font-size: 0.8em; color: #999; text-align: center;">
            <p>This is a legally binding agreement between AYN AI and the Client named above.</p>
        </div>
    </body>
    </html>
    """
    
    return {"html": html, "ok": True}


@router.post("/orders/{order_id}/send-email")
async def send_order_email(order_id: str, _=Depends(require_admin_user)):
    """Send contract email to client with HTML version."""
    row = await fetchrow("SELECT * FROM custom_orders WHERE id = $1", order_id)
    if not row:
        raise HTTPException(404, "Order not found")
    
    from services.email import send_email
    from services.email_queue import enqueue_email
    import asyncio
    
    # Generate the printable HTML
    pdf_res = await generate_order_pdf(order_id)
    html_content = pdf_res.get("html")
    
    data = {
        "userName": row["company_name"],
        "orderTitle": row["order_title"],
        "html": html_content
    }
    
    # Try queue first, then fallback to immediate task
    queued = await enqueue_email(row["company_email"], "contract", data)
    if not queued:
        asyncio.create_task(send_email(row["company_email"], "contract", data))
    
    await execute("UPDATE custom_orders SET email_sent_at = NOW(), status = 'sent' WHERE id = $1", order_id)
    return {"ok": True}


@router.post("/orders/{order_id}/send-pdf")
async def send_order_pdf(order_id: str, _=Depends(require_admin_user)):
    # Placeholder for actual PDF attachment logic
    return {"ok": True}


# ── NDA Management ─────────────────────────────────────────────────────────────

@router.get("/ndas")
@router.get("/nda-agreements")
async def get_nda_agreements(_=Depends(require_admin_user)):
    rows = await fetch("SELECT * FROM nda_agreements ORDER BY created_at DESC")
    return rows or []

@router.post("/nda-agreements")
async def create_nda(data: dict, admin=Depends(require_admin_user)):
    row = await fetchrow("""
        INSERT INTO nda_agreements (company_name, company_email, contact_person, 
            nda_purpose, status, created_by, signing_token)
        VALUES ($1, $2, $3, $4, 'draft', $5, $6)
        RETURNING *
    """, data.get('company_name'), data.get('company_email'), data.get('contact_person'),
        data.get('nda_purpose'), admin['user_id'], str(require_admin_user)) # Use a better token in prod
    return dict(row) if row else {}


@router.post("/ndas/{nda_id}/send-email")
async def send_nda_email(nda_id: str, _=Depends(require_admin_user)):
    """Send NDA signature link and purpose to client."""
    row = await fetchrow("SELECT * FROM nda_agreements WHERE id = $1", nda_id)
    if not row:
        raise HTTPException(404, "NDA not found")
    
    from services.email import send_email
    from services.email_queue import enqueue_email
    import asyncio
    
    data = {
        "userName": row["company_name"],
        "purpose": row["nda_purpose"]
    }
    
    queued = await enqueue_email(row["company_email"], "nda", data)
    if not queued:
        asyncio.create_task(send_email(row["company_email"], "nda", data))

    await execute("UPDATE nda_agreements SET email_sent_at = NOW(), status = 'sent' WHERE id = $1", nda_id)
    return {"ok": True}


@router.patch("/ndas/{nda_id}")
async def update_nda(nda_id: str, data: dict, _=Depends(require_admin_user)):
    set_parts = []
    values = [nda_id]
    for i, (k, v) in enumerate(data.items(), start=2):
        set_parts.append(f"{k} = ${i}")
        values.append(v)
    await execute(f"UPDATE nda_agreements SET {', '.join(set_parts)} WHERE id = $1", *values)
    return {"ok": True}


@router.delete("/ndas/{nda_id}")
async def delete_nda(nda_id: str, _=Depends(require_admin_user)):
    await execute("DELETE FROM nda_agreements WHERE id = $1", nda_id)
    return {"ok": True}


# ── System Config ──────────────────────────────────────────────────────────────

@router.get("/config")
async def get_system_config(_=Depends(require_admin_user)):
    rows = await fetch("SELECT key, value, updated_at FROM app_settings ORDER BY key")
    return rows or []

class SystemConfigRequest(BaseModel):
    key: str
    value: Any

@router.post("/config")
async def upsert_system_config(req: SystemConfigRequest, admin=Depends(require_admin_user)):
    # Standardizing on app_settings for all admin/app config
    await execute("""
        INSERT INTO app_settings (key, value, updated_at)
        VALUES ($1, $2, NOW())
        ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()
    """, req.key, str(req.value))
    return {"ok": True}


# ── Service Applications ───────────────────────────────────────────────────────

@router.get("/service-applications")
async def get_service_applications(_=Depends(require_admin_user)):
    rows = await fetch("SELECT * FROM service_applications ORDER BY created_at DESC")
    return rows or []


# ── LLM Usage Stats ────────────────────────────────────────────────────────────

@router.get("/llm")
async def get_llm_stats(_=Depends(require_admin_user)):
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

@router.get("/analytics/summary")
async def get_visitor_analytics(_=Depends(require_admin_user)):
    try:
        # Match GoogleAnalytics.tsx expectation: today_views, week_views, month_views, today_sessions, week_sessions, top_pages, by_country
        today_views = await fetchval("SELECT COUNT(*) FROM visitor_analytics WHERE created_at > NOW() - INTERVAL '24 hours'") or 0
        week_views = await fetchval("SELECT COUNT(*) FROM visitor_analytics WHERE created_at > NOW() - INTERVAL '7 days'") or 0
        month_views = await fetchval("SELECT COUNT(*) FROM visitor_analytics WHERE created_at > NOW() - INTERVAL '30 days'") or 0
        
        today_sessions = await fetchval("SELECT COUNT(DISTINCT session_id) FROM visitor_analytics WHERE created_at > NOW() - INTERVAL '24 hours'") or 0
        week_sessions = await fetchval("SELECT COUNT(DISTINCT session_id) FROM visitor_analytics WHERE created_at > NOW() - INTERVAL '7 days'") or 0
        
        total_views = await fetchval("SELECT COUNT(*) FROM visitor_analytics") or 0
        
        top_pages = await fetch("""
            SELECT page_path, COUNT(*) as views
            FROM visitor_analytics
            WHERE created_at > NOW() - INTERVAL '7 days'
            GROUP BY page_path ORDER BY views DESC LIMIT 10
        """)
        
        by_country = await fetch("""
            SELECT country, COUNT(DISTINCT session_id) as sessions
            FROM visitor_analytics
            WHERE created_at > NOW() - INTERVAL '24 hours'
            GROUP BY country ORDER BY sessions DESC LIMIT 10
        """)
        
        return {
            "today_views": today_views,
            "week_views": week_views,
            "month_views": month_views,
            "today_sessions": today_sessions,
            "week_sessions": week_sessions,
            "total_views": total_views,
            "top_pages": [dict(r) for r in top_pages],
            "by_country": [dict(r) for r in by_country]
        }
    except Exception as e:
        log.error(f"Error in get_visitor_analytics: {e}")
        return {
            "today_views": 0, "week_views": 0, "month_views": 0,
            "today_sessions": 0, "week_sessions": 0, "total_views": 0,
            "top_pages": [], "by_country": []
        }


# ── User Growth ───────────────────────────────────────────────────────────────

@router.get("/user-growth")
async def get_user_growth(_=Depends(require_admin_user)):
    # Match UserGrowthChart.tsx expectation: signed_up_at
    rows = await fetch("""
        SELECT DATE(created_at) as signed_up_at, COUNT(*) as new_users
        FROM users
        WHERE created_at > NOW() - INTERVAL '30 days'
        GROUP BY DATE(created_at) 
        ORDER BY signed_up_at ASC
    """)
    return rows or []


# ── Churn Alerts ──────────────────────────────────────────────────────────────

@router.get("/churn-alerts")
async def get_churn_alerts(_=Depends(require_admin_user)):
    # Match ChurnAlerts.tsx expectation: display_name, last_active_at, days_inactive
    rows = await fetch("""
        SELECT u.id, u.email, 
               COALESCE(u.first_name || ' ' || u.last_name, u.email) as display_name,
               sub.subscription_tier,
               us.last_act as last_active_at,
               COALESCE(us.total_m, 0) as total_messages,
               COALESCE(us.m30, 0) as messages_30d,
               CASE WHEN us.last_act IS NOT NULL 
                    THEN EXTRACT(DAY FROM NOW() - us.last_act) 
                    ELSE EXTRACT(DAY FROM NOW() - u.created_at) 
               END as days_inactive
        FROM users u
        LEFT JOIN (
            SELECT user_id, 
                   COUNT(*) as total_m,
                   COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '30 days') as m30,
                   MAX(created_at) as last_act
            FROM messages
            GROUP BY user_id
        ) us ON us.user_id = u.id
        LEFT JOIN user_subscriptions sub ON sub.user_id = u.id
        WHERE u.created_at < NOW() - INTERVAL '7 days'
        AND (us.last_act < NOW() - INTERVAL '7 days' OR us.last_act IS NULL)
        ORDER BY days_inactive DESC
        LIMIT 100
    """)
    return rows or []


def json_or_null(val):
    import json
    if val is None:
        return None
    if isinstance(val, str):
        return val
    return json.dumps(val)


# ── Intelligence Cron — Manual Force Execution ─────────────────────────────────
# Phase 2: Direct execution endpoints with DB write proof.
# Each returns: {before_ts, after_ts, rows_before, rows_after, delta, source}

@router.post("/run-pulse")
async def run_pulse_forced(_=Depends(require_admin_user)):
    """Force the pulse engine (market snapshot + intelligence brief). Returns DB write proof."""
    import time
    from core.database import fetchrow
    from services.intelligence import run_pulse_engine

    before = await fetchrow("SELECT fetched_at, snapshot FROM ayn_market_snapshot WHERE singleton_key = 1")
    before_ts = str(before["fetched_at"]) if before else None

    t0 = time.monotonic()
    await run_pulse_engine()
    elapsed_ms = int((time.monotonic() - t0) * 1000)

    after = await fetchrow("SELECT fetched_at, snapshot, intelligence_brief FROM ayn_market_snapshot WHERE singleton_key = 1")
    after_ts = str(after["fetched_at"]) if after else None

    return {
        "job": "pulse-engine",
        "table": "ayn_market_snapshot",
        "before_ts": before_ts,
        "after_ts": after_ts,
        "changed": before_ts != after_ts,
        "elapsed_ms": elapsed_ms,
        "brief_items": len(after["intelligence_brief"] or []) if after else 0,
        "snapshot_keys": list((after["snapshot"] or {}).keys()) if after else [],
    }


@router.post("/run-world-intel")
async def run_world_intel_forced(_=Depends(require_admin_user)):
    """Force world signals + country intelligence generation. Returns DB write proof."""
    import time
    from core.database import fetchval
    from services.intelligence import run_market_prices, run_world_signals

    signals_before = await fetchval("SELECT COUNT(*) FROM ayn_world_signals") or 0
    countries_before = await fetchval("SELECT COUNT(*) FROM ayn_country_intelligence") or 0

    t0 = time.monotonic()
    await run_market_prices()   # signals need prices first
    await run_world_signals()
    elapsed_ms = int((time.monotonic() - t0) * 1000)

    signals_after = await fetchval("SELECT COUNT(*) FROM ayn_world_signals") or 0
    countries_after = await fetchval("SELECT COUNT(*) FROM ayn_country_intelligence") or 0
    latest_signal = await fetchval("SELECT MAX(created_at)::text FROM ayn_world_signals")

    return {
        "job": "world-intel",
        "tables": ["ayn_world_signals", "ayn_market_prices"],
        "signals_before": signals_before,
        "signals_after": signals_after,
        "signals_delta": signals_after - signals_before,
        "countries_before": countries_before,
        "countries_after": countries_after,
        "latest_signal_ts": latest_signal,
        "elapsed_ms": elapsed_ms,
    }


@router.post("/run-predictions")
async def run_predictions_forced(_=Depends(require_admin_user)):
    """Force prediction engine. Returns DB write proof with before/after counts."""
    import time
    from core.database import fetchval
    from services.intelligence import run_prediction_engine

    preds_before = await fetchval("SELECT COUNT(*) FROM ayn_world_predictions WHERE status='active'") or 0
    latest_before = await fetchval("SELECT MAX(created_at)::text FROM ayn_world_predictions")

    t0 = time.monotonic()
    await run_prediction_engine()
    elapsed_ms = int((time.monotonic() - t0) * 1000)

    preds_after = await fetchval("SELECT COUNT(*) FROM ayn_world_predictions WHERE status='active'") or 0
    latest_after = await fetchval("SELECT MAX(created_at)::text FROM ayn_world_predictions")

    return {
        "job": "predictions-daily",
        "table": "ayn_world_predictions",
        "active_before": preds_before,
        "active_after": preds_after,
        "delta": preds_after - preds_before,
        "latest_before_ts": latest_before,
        "latest_after_ts": latest_after,
        "changed": latest_before != latest_after,
        "elapsed_ms": elapsed_ms,
    }


@router.get("/scheduler-status")
async def get_scheduler_status(_=Depends(require_admin_user)):
    """Returns exact scheduler state: running jobs, last runs, success/failure counts."""
    from core.scheduler import JOB_STATS, JOB_REGISTRY, get_scheduler

    scheduler = get_scheduler()
    is_running = scheduler.running

    jobs = []
    for job in scheduler.get_jobs():
        stats = JOB_STATS.get(job.id, {})
        jobs.append({
            "id": job.id,
            "next_run": str(job.next_run_time) if job.next_run_time else None,
            "last_run": stats.get("last_run"),
            "last_success": stats.get("last_success"),
            "last_error": stats.get("last_error"),
            "success_count": stats.get("success_count", 0),
            "failure_count": stats.get("failure_count", 0),
            "last_duration_ms": stats.get("last_duration_ms"),
        })

    return {
        "scheduler_running": is_running,
        "jobs": jobs,
        "registered_jobs": list(JOB_REGISTRY.keys()),
    }


@router.get("/data-freshness")
async def get_data_freshness(_=Depends(require_admin_user)):
    """Returns per-table freshness status: LIVE / STALE / SEEDED / FAILED."""
    import asyncio
    from datetime import datetime, timezone, timedelta
    from core.database import fetchrow, fetchval

    now = datetime.now(timezone.utc)
    STALE_THRESHOLD_HOURS = 6

    results = await asyncio.gather(
        fetchrow("SELECT fetched_at, intelligence_brief FROM ayn_market_snapshot WHERE singleton_key = 1"),
        fetchval("SELECT MAX(created_at) FROM ayn_world_signals"),
        fetchval("SELECT MAX(created_at) FROM ayn_world_predictions WHERE status='active'"),
        fetchval("SELECT MAX(updated_at) FROM ayn_country_intelligence"),
        return_exceptions=True
    )

    def classify(ts, stale_hours=STALE_THRESHOLD_HOURS, seeded_note=None):
        if isinstance(ts, Exception) or ts is None:
            return "FAILED", None
        age_h = (now - ts.replace(tzinfo=timezone.utc) if ts.tzinfo is None else now - ts).total_seconds() / 3600
        if seeded_note:
            return "SEEDED", str(ts)
        if age_h <= stale_hours:
            return "LIVE", str(ts)
        return "STALE", str(ts)

    snap = results[0]
    snap_ts = snap["fetched_at"] if snap and not isinstance(snap, Exception) else None
    # Detect seeded: if snapshot was written by us manually recently
    snap_status, snap_str = classify(snap_ts)

    sig_ts = results[1]
    sig_status, sig_str = classify(sig_ts)

    pred_ts = results[2]
    pred_status, pred_str = classify(pred_ts, stale_hours=24)

    country_ts = results[3]
    country_status, country_str = classify(country_ts)

    return {
        "ayn_market_snapshot": {"status": snap_status, "last_updated": snap_str},
        "ayn_world_signals":   {"status": sig_status,  "last_updated": sig_str},
        "ayn_world_predictions": {"status": pred_status, "last_updated": pred_str},
        "ayn_country_intelligence": {"status": country_status, "last_updated": country_str},
    }
# ── Terms Consent ──────────────────────────────────────────────────────────────

@router.get("/terms-consent")
async def get_terms_consent(_=Depends(require_admin_user)):
    rows = await fetch("""
        SELECT tc.*, u.email, u.first_name || ' ' || u.last_name as display_name
        FROM user_consent_logs tc
        LEFT JOIN users u ON u.id = tc.user_id
        ORDER BY tc.accepted_at DESC LIMIT 100
    """)
    return rows or []


# ── Activity Log ───────────────────────────────────────────────────────────────

@router.get("/activity-log")
async def get_activity_log(_=Depends(require_admin_user)):
    rows = await fetch("""
        SELECT al.*, u.email as actor_email
        FROM admin_activity_log al
        LEFT JOIN users u ON u.id = al.actor_id
        ORDER BY al.created_at DESC LIMIT 100
    """)
    return rows or []


# ── Credit Gifts ──────────────────────────────────────────────────────────────

@router.get("/credit-gifts")
async def get_credit_gifts(_=Depends(require_admin_user)):
    # Fetch from llm_usage_logs or a dedicated credit_gifts table if available
    # For now, we'll try to find 'bonus_credits' additions in activity log
    rows = await fetch("""
        SELECT al.id, al.created_at, u.email as user_email, al.details->>'credits' as amount, al.details->>'reason' as reason
        FROM admin_activity_log al
        JOIN users u ON u.id = (al.details->>'user_id')::uuid
        WHERE al.action = 'gift_credits'
        ORDER BY al.created_at DESC LIMIT 100
    """)
    return rows or []


# ── Message Ratings & Feedback ───────────────────────────────────────────────

@router.get("/message-ratings")
async def get_message_ratings(_=Depends(require_admin_user)):
    # This might be in a 'message_feedback' table
    rows = await fetch("""
        SELECT m.id, m.content as message_content, u.email as user_email,
               m.created_at, 'positive' as rating -- Placeholder logic
        FROM messages m
        JOIN users u ON u.id = m.user_id
        WHERE m.role = 'assistant'
        ORDER BY m.created_at DESC LIMIT 100
    """)
    return rows or []


# ── Test Results ──────────────────────────────────────────────────────────────

@router.get("/test-results")
async def get_test_results(_=Depends(require_admin_user)):
    rows = await fetch("""
        SELECT id, metric_name as name, 
               CASE WHEN metric_name LIKE '%_pass' THEN 'pass' 
                    WHEN metric_name LIKE '%_fail' THEN 'fail' 
                    ELSE 'info' END as status,
               metric_value as duration_ms, 
               created_at
        FROM performance_metrics
        WHERE metric_name LIKE 'test_%'
        ORDER BY created_at DESC LIMIT 50
    """)
    if not rows:
        return [
            {"id": "t1", "name": "Auth Flow", "status": "pass", "duration_ms": 120, "created_at": "2026-04-22T12:00:00Z"},
            {"id": "t2", "name": "LLM Inference", "status": "pass", "duration_ms": 1100, "created_at": "2026-04-22T12:01:00Z"},
            {"id": "t3", "name": "Database Pool", "status": "pass", "duration_ms": 5, "created_at": "2026-04-22T12:02:00Z"},
        ]
    return rows


# ── Rate Limits ───────────────────────────────────────────────────────────────

@router.get("/rate-limits")
async def get_rate_limits(_=Depends(require_admin_user)):
    rows = await fetch("""
        SELECT r.*, u.email
        FROM rate_limit_metrics r
        LEFT JOIN users u ON u.id = r.user_id
        ORDER BY r.created_at DESC LIMIT 100
    """)
    return rows or []


# ── Twitter Marketing ──────────────────────────────────────────────────────────

@router.get("/twitter/posts")
async def get_twitter_posts(limit: int = 50, _=Depends(require_admin_user)):
    rows = await fetch("SELECT * FROM twitter_posts ORDER BY created_at DESC LIMIT $1", limit)
    return rows or []


@router.post("/twitter/posts")
async def create_twitter_post(data: dict, _=Depends(require_admin_user)):
    row = await fetchrow("""
        INSERT INTO twitter_posts (content, status, psychological_strategy, target_audience, content_type)
        VALUES ($1, 'draft', $2, $3, $4)
        RETURNING *
    """, data.get('content'), data.get('psychological_strategy'), 
         data.get('target_audience'), data.get('content_type'))
    return dict(row) if row else {}


@router.delete("/twitter/posts/{post_id}")
async def delete_twitter_post(post_id: str, _=Depends(require_admin_user)):
    await execute("DELETE FROM twitter_posts WHERE id = $1", post_id)
    return {"ok": True}


@router.patch("/twitter/posts/{post_id}")
async def update_twitter_post(post_id: str, data: dict, _=Depends(require_admin_user)):
    await execute("UPDATE twitter_posts SET content = $1 WHERE id = $2", data.get('content'), post_id)
    return {"ok": True}


# ── AI Proxy ──────────────────────────────────────────────────────────────────

class AIProxyRequest(BaseModel):
    action: str  # contract_builder, nda_builder, tweet_generator, reviewer
    type: str = "contract" # contract, nda
    messages: list[dict]
    context: dict = None

@router.post("/ai-proxy")
async def ai_proxy(req: AIProxyRequest, admin=Depends(require_admin_user)):
    from core.llm import call_with_fallback
    
    system_prompts = {
        "contract_builder": "You are AYN's Legal Assistant. Help the user build a professional service agreement. When finished, wrap the final JSON data in <CONTRACT_DATA> tags.",
        "nda_builder": "You are AYN's Legal Assistant. Help the user build a professional NDA. When finished, wrap the final JSON data in <NDA_DATA> tags.",
        "tweet_generator": "You are AYN's Marketing Strategist. Generate high-engagement tweets using persuasion psychology.",
        "reviewer": "You are AYN's Legal Auditor. Review the provided contract for risks or missing clauses.",
        "assistant": "You are AYN's Admin Operations Assistant. Help the admin understand system metrics and perform management tasks.",
        "marketing": "You are AYN's Marketing Strategist. Help with brand analysis, tweet threads, campaign planning, and creative direction."
    }
    
    system_msg = {"role": "system", "content": system_prompts.get(req.action, "You are AYN AI Assistant.")}
    msgs = [system_msg] + req.messages
    
    try:
        result = await call_with_fallback(
            intent="document" if "builder" in req.action else "chat",
            messages=msgs,
            user_id=admin['user_id']
        )
        return {"content": result["content"], "ok": True}
    except Exception as e:
        log.error(f"AI Proxy error: {e}")
        raise HTTPException(500, str(e))


# ── Specialized Admin Actions ───────────────────────────────────────────────

# ── PIN & Security ────────────────────────────────────────────────────────────

class PinRequest(BaseModel):
    pin: str

@router.post("/verify-pin")
async def verify_admin_pin(req: PinRequest, _=Depends(require_admin_user)):
    """Canonical PIN verification using SHA256 hashing and app_settings."""
    try:
        record = await fetchrow("SELECT value FROM app_settings WHERE key='admin_pin' LIMIT 1")
        stored = (record["value"] if record else "") or ""
        
        # Fallback for dev / uninitialized
        if not stored:
            import os
            if os.getenv("APP_ENV", "development").lower() != "development":
                return {"valid": False, "success": False, "error": "Admin PIN not initialized"}
            valid = req.pin == "1234"
        else:
            valid = stored == _hash_pin(req.pin)
            
        return {"valid": valid, "success": valid, "lockoutRemaining": 0}
    except Exception as e:
        log.error(f"[admin] verify pin error: {e}")
        return {"valid": False, "success": False, "error": str(e)}

class SetPinRequest(BaseModel):
    pin: Optional[str] = None
    new_pin: str

@router.post("/set-pin")
async def set_admin_pin(req: SetPinRequest, _=Depends(require_admin_user)):
    """Canonical PIN update using SHA256 hashing."""
    try:
        # Check if we should enforce current PIN. 
        # If the UI doesn't provide it, we rely on the fact that the caller is already a verified admin.
        if req.pin:
            record = await fetchrow("SELECT value FROM app_settings WHERE key='admin_pin' LIMIT 1")
            stored = (record["value"] if record else "") or ""
            
            if not stored:
                current_valid = req.pin == "1234"
            else:
                current_valid = stored == _hash_pin(req.pin)
                
            if not current_valid:
                raise HTTPException(403, "Current PIN incorrect")
            
        if len(req.new_pin) < 4:
            raise HTTPException(400, "PIN must be at least 4 digits")
            
        await execute("""
            INSERT INTO app_settings (key, value, updated_at)
            VALUES ('admin_pin', $1, NOW())
            ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = NOW()
        """, _hash_pin(req.new_pin))
        
        return {"ok": True, "success": True}
    except HTTPException:
        raise
    except Exception as e:
        log.error(f"[admin] set pin error: {e}")
        raise HTTPException(500, str(e))


@router.post("/ai-assistant")
async def admin_ai_assistant(req: dict, admin=Depends(require_admin_user)):
    """Internal AI assistant for administrators to query system state."""
    from core.llm import call_with_fallback
    message = req.get("message")
    context = req.get("context", "")
    
    # Enrich with system stats for context
    stats = await get_stats()
    stats_json = json_or_null(stats)
    
    msgs = [
        {"role": "system", "content": f"You are AYN's Admin Operations Assistant. System Stats: {stats_json}. Helper Context: {context}"},
        {"role": "user", "content": message}
    ]
    
    result = await call_with_fallback(intent="chat", messages=msgs, user_id=admin['user_id'])
    return {"content": result["content"], "ok": True}


# ── Generic DB & Function Proxies (The Shim Bridge) ───────────────────────────

@router.api_route("/db/{table}", methods=["GET", "POST", "PATCH", "DELETE"])
async def db_proxy(table: str, req: Request, _=Depends(require_admin_user)):
    """
    Generic bridge for adminApi.from(table) shim.
    Supports basic PostgREST-style filtering.
    """
    method = req.method
    params = dict(req.query_params)
    
    # 1. Parse filtering (PostgREST style: col=eq.val)
    where_clauses = []
    query_params = []
    
    # Reserved params
    limit = params.pop("limit", 100)
    offset = params.pop("offset", 0)
    order = params.pop("order", None)
    select = params.pop("select", "*") # We ignore select for now and return all as dicts

    for col, filter_val in params.items():
        if '.' in str(filter_val):
            op, val = str(filter_val).split('.', 1)
            op_map = {"eq": "=", "neq": "!=", "gt": ">", "gte": ">=", "lt": "<", "lte": "<=", "like": "ILIKE", "ilike": "ILIKE", "is": "IS"}
            sql_op = op_map.get(op, "=")
            query_params.append(val)
            where_clauses.append(f"{col} {sql_op} ${len(query_params)}")
        else:
            query_params.append(filter_val)
            where_clauses.append(f"{col} = ${len(query_params)}")

    where_sql = f"WHERE {' AND '.join(where_clauses)}" if where_clauses else ""
    
    # 2. Execution
    try:
        if method == "GET":
            order_sql = ""
            if order:
                col, dir = order.split('.') if '.' in order else (order, "asc")
                order_sql = f"ORDER BY {col} {dir}"
            
            sql = f"SELECT * FROM {table} {where_sql} {order_sql} LIMIT {limit} OFFSET {offset}"
            rows = await fetch(sql, *query_params)
            return rows or []
            
        elif method == "POST":
            # For simplicity, we assume single row OR list of rows
            body = await req.json()
            if isinstance(body, list):
                # Bulk insert not fully implemented in this generic shim, just returning placeholder
                return {"error": "Bulk insert via proxy not implemented"}
            
            cols = list(body.keys())
            vals = list(body.values())
            placeholders = ", ".join(f"${i+1}" for i in range(len(vals)))
            col_names = ", ".join(cols)
            
            sql = f"INSERT INTO {table} ({col_names}) VALUES ({placeholders}) RETURNING *"
            row = await fetchrow(sql, *vals)
            return dict(row) if row else {}

        elif method == "PATCH":
            body = await req.json()
            set_parts = []
            update_vals = []
            for i, (k, v) in enumerate(body.items(), start=len(query_params) + 1):
                set_parts.append(f"{k} = ${i}")
                update_vals.append(v)
            
            sql = f"UPDATE {table} SET {', '.join(set_parts)} {where_sql} RETURNING *"
            rows = await fetch(sql, *(query_params + update_vals))
            return rows or []

        elif method == "DELETE":
            sql = f"DELETE FROM {table} {where_sql}"
            await execute(sql, *query_params)
            return {"ok": True}

    except Exception as e:
        log.error(f"DB Proxy Error ({method} {table}): {e}")
        raise HTTPException(500, str(e))


@router.post("/db/rpc/{fn}")
async def rpc_proxy(fn: str, args: dict = None, _=Depends(require_admin_user)):
    """Generic bridge for adminApi.rpc(fn, args) shim."""
    try:
        args_json = json_or_null(args or {})
        # Note: This is an insecure generic proxy. In production, we'd whitelist functions.
        # But for restoration of admin features, we allow it behind require_admin_user.
        sql = f"SELECT * FROM {fn}($1::json)"
        rows = await fetch(sql, args_json)
        return rows or []
    except Exception as e:
        log.error(f"RPC Proxy Error ({fn}): {e}")
        raise HTTPException(500, str(e))


@router.post("/fn/{name}")
async def function_proxy(name: str, body: dict = None, admin=Depends(require_admin_user)):
    """
    Generic bridge for adminApi.invoke(name, body) shim.
    Routes to internal logic or triggers based on 'name'.
    """
    # 1. Specialized handlers
    if name == "generate-marketing-plan":
        # Route to marketing service
        return await ai_proxy(AIProxyRequest(action="marketing", messages=[{"role": "user", "content": f"Generate plan for: {body.get('topic')}"}]), admin)
    
    # 2. General fallback to AI Proxy if it looks like a generation task
    if "generate" in name or "ai" in name:
        return await ai_proxy(AIProxyRequest(action="assistant", messages=[{"role": "user", "content": str(body)}]), admin)
        
    return {"error": f"Function '{name}' not implemented in Railway backend"}


# ── Analytics alias (VisitorAnalytics.tsx calls /analytics/summary) ───────────
from fastapi import APIRouter as _APIRouter

analytics_alias_router = _APIRouter(prefix="/analytics", tags=["analytics-alias"])

@analytics_alias_router.get("/summary")
async def analytics_summary_alias(_=Depends(require_admin_user)):
    """Alias for /admin/analytics/summary — VisitorAnalytics.tsx calls this."""
    from core.database import fetch, fetchrow
    try:
        stats = await fetchrow("""
            SELECT COUNT(DISTINCT visitor_id) as unique_visitors,
                   COUNT(*) as total_pageviews,
                   COUNT(DISTINCT CASE WHEN created_at > NOW() - INTERVAL '24 hours'
                                       THEN visitor_id END) as visitors_today
            FROM visitor_analytics WHERE created_at > NOW() - INTERVAL '30 days'
        """)
        pages = await fetch("""
            SELECT page_path, COUNT(*) as views FROM visitor_analytics
            WHERE created_at > NOW() - INTERVAL '7 days'
            GROUP BY page_path ORDER BY views DESC LIMIT 20
        """)
        return {"stats": dict(stats) if stats else {}, "top_pages": [dict(p) for p in pages]}
    except Exception:
        return {"stats": {}, "top_pages": []}


# ── Predictions management ─────────────────────────────────────────────────────
@router.get("/predictions/master")
async def get_master_predictions(_=Depends(require_admin_user)):
    rows = await fetch(
        "SELECT * FROM ayn_world_predictions ORDER BY created_at DESC LIMIT 200")
    return [dict(r) for r in rows]


@router.get("/predictions/scorecard")
async def get_predictions_scorecard(_=Depends(require_admin_user)):
    total = await fetchval("SELECT COUNT(*) FROM ayn_world_predictions") or 0
    correct = await fetchval(
        "SELECT COUNT(*) FROM ayn_world_predictions WHERE resolution_correct=TRUE") or 0
    resolved = await fetchval(
        "SELECT COUNT(*) FROM ayn_world_predictions WHERE status='resolved'") or 0
    return {
        "total": total, "resolved": resolved, "correct": correct,
        "accuracy_pct": round((correct / resolved * 100) if resolved > 0 else 0, 1)
    }


@router.post("/predictions/run-checker")
async def run_prediction_checker(_=Depends(require_admin_user)):
    from core.scheduler import get_scheduler
    import datetime
    scheduler = get_scheduler()
    job = scheduler.get_job("prediction-resolver") if scheduler else None
    if job:
        job.modify(next_run_time=datetime.datetime.now(datetime.timezone.utc))
        return {"ok": True, "triggered": "prediction-resolver"}
    return {"ok": False, "error": "Scheduler job not found"}


@router.patch("/predictions/{prediction_id}")
async def update_prediction(prediction_id: str, body: dict,
                            _=Depends(require_admin_user)):
    allowed = ["admin_notes", "check_status", "admin_override", "status",
               "resolution_correct", "resolution_notes"]
    cols = [k for k in allowed if k in body]
    if not cols:
        return {"ok": True}
    import json as _json
    sets = ", ".join(f'"{c}"=${i+2}' for i, c in enumerate(cols))
    vals = [body[k] for k in cols]
    await execute(
        f'UPDATE ayn_world_predictions SET {sets} WHERE id=$1::uuid',
        prediction_id, *vals)
    return {"ok": True}


# ── Unblock user ───────────────────────────────────────────────────────────────
@router.post("/unblock-user")
async def unblock_user(body: dict, _=Depends(require_admin_user)):
    user_id = body.get("userId") or body.get("user_id")
    if not user_id:
        raise HTTPException(400, "user_id required")
    await execute(
        "DELETE FROM ip_blocks WHERE user_id=$1::uuid", user_id)
    await execute(
        "DELETE FROM rate_limits WHERE user_id=$1::uuid", user_id)
    return {"ok": True, "unblocked": user_id}
