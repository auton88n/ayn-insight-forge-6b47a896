"""
routers/admin_api.py — admin panel API endpoints
Replaces all Supabase get_admin_* RPC functions
"""
import logging
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from core.database import fetch, fetchrow, execute, fetchval
from core.security import require_admin_user

router = APIRouter(prefix="/admin", tags=["admin"])
log = logging.getLogger("ayn.admin")


# ── Dashboard Stats ────────────────────────────────────────────────────────────

@router.get("/stats")
async def get_stats(_=Depends(require_admin_user)):
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
async def get_users(_=Depends(require_admin_user)):
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


# ── Support Tickets ────────────────────────────────────────────────────────────

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
async def mark_order_paid(order_id: str, _=Depends(require_admin_user)):
    await execute("""
        UPDATE custom_orders 
        SET status = 'paid', updated_at = NOW() 
        WHERE id = $1
    """, order_id)
    return {"ok": True}


@router.post("/custom-orders/{order_id}/pdf")
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


# ── NDA Management ─────────────────────────────────────────────────────────────

@router.get("/nda-agreements")
async def get_nda_agreements(_=Depends(require_admin_user)):
    rows = await fetch("SELECT * FROM nda_agreements ORDER BY created_at DESC")
    return rows or []

@router.post("/nda-agreements")
async def create_nda(data: dict, admin=Depends(require_admin_user)):
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
async def get_system_config(_=Depends(require_admin_user)):
    rows = await fetch("SELECT key, value, updated_at FROM system_config ORDER BY key")
    return rows or []

class SystemConfigRequest(BaseModel):
    key: str
    value: dict

@router.post("/system-config")
async def upsert_system_config(req: SystemConfigRequest, admin=Depends(require_admin_user)):
    import json
    await execute("""
        INSERT INTO system_config (key, value, updated_by, updated_at)
        VALUES ($1, $2, $3, NOW())
        ON CONFLICT (key) DO UPDATE SET value = $2, updated_by = $3, updated_at = NOW()
    """, req.key, json.dumps(req.value), admin['user_id'])
    return {"ok": True}


# ── Service Applications ───────────────────────────────────────────────────────

@router.get("/service-applications")
async def get_service_applications(_=Depends(require_admin_user)):
    rows = await fetch("SELECT * FROM service_applications ORDER BY created_at DESC")
    return rows or []


# ── LLM Usage Stats ────────────────────────────────────────────────────────────

@router.get("/llm-stats")
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

@router.get("/visitor-analytics")
async def get_visitor_analytics(_=Depends(require_admin_user)):
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
