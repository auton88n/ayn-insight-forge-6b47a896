"""
routers/admin.py — admin API (Railway Postgres only, no Supabase)
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from typing import Optional
import datetime
from core.database import fetch, fetchrow, fetchval, execute
from core.security import require_admin_user

router = APIRouter(prefix="/admin")


# ── Scheduler ─────────────────────────────────────────────────────────────────
@router.get("/scheduler/status")
async def scheduler_status(_: dict = Depends(require_admin_user)):
    from core.scheduler import get_scheduler
    scheduler = get_scheduler()
    if not scheduler:
        return {"running": False, "jobs": []}
    jobs = [{"id": j.id, "name": j.name,
             "next_run": str(j.next_run_time) if j.next_run_time else None}
            for j in scheduler.get_jobs()]
    return {"running": scheduler.running, "jobs": jobs}


@router.post("/scheduler/run/{job_id}")
async def run_scheduler_job(job_id: str, _: dict = Depends(require_admin_user)):
    from core.scheduler import get_scheduler
    scheduler = get_scheduler()
    job = scheduler.get_job(job_id) if scheduler else None
    if not job:
        raise HTTPException(404, f"Job '{job_id}' not found")
    job.modify(next_run_time=datetime.datetime.now(datetime.timezone.utc))
    return {"ok": True, "job": job_id}


# ── Users ─────────────────────────────────────────────────────────────────────
# De-conflicted in favor of admin_api.py
# @router.get("/users")
async def list_users(limit: int = Query(50, le=200), offset: int = 0,
                     search: Optional[str] = None, _: dict = Depends(require_admin_user)):
    if search:
        rows = await fetch(
            "SELECT id,email,first_name,last_name,is_admin,created_at FROM users "
            "WHERE email ILIKE $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3",
            f"%{search}%", limit, offset)
    else:
        rows = await fetch(
            "SELECT id,email,first_name,last_name,is_admin,created_at FROM users "
            "ORDER BY created_at DESC LIMIT $1 OFFSET $2", limit, offset)
    return {"users": [dict(r) for r in rows], "offset": offset, "limit": limit}


# De-conflicted in favor of admin_api.py
# @router.get("/users/{user_id}")
async def get_user(user_id: str, _: dict = Depends(require_admin_user)):
    profile = await fetchrow("SELECT * FROM users WHERE id = $1::uuid", user_id)
    limits = await fetchrow("SELECT * FROM user_ai_limits WHERE user_id = $1::uuid", user_id)
    return {"profile": dict(profile) if profile else None,
            "limits": dict(limits) if limits else None}


@router.get("/users/{user_id}/messages")
async def get_user_messages(user_id: str, limit: int = 50, _: dict = Depends(require_admin_user)):
    rows = await fetch(
        "SELECT id,content,sender,created_at FROM messages "
        "WHERE user_id=$1::uuid ORDER BY created_at DESC LIMIT $2", user_id, limit)
    return {"messages": [dict(r) for r in rows]}


@router.patch("/users/{user_id}/subscription")
async def update_user_subscription(user_id: str, body: dict, _: dict = Depends(require_admin_user)):
    if body.get("status"):
        await execute("UPDATE user_subscriptions SET status=$1 WHERE user_id=$2::uuid",
                      body["status"], user_id)
    return {"ok": True}


# ── Credits ───────────────────────────────────────────────────────────────────
class CreditGiftBody(BaseModel):
    user_id: str
    amount: int
    reason: Optional[str] = None


@router.post("/credits/gift")
async def gift_credits(body: CreditGiftBody, admin_user: dict = Depends(require_admin_user)):
    admin_id = admin_user.get("user_id", "")
    await execute(
        "INSERT INTO credit_gifts (user_id,amount,reason,gifted_by,created_at) "
        "VALUES ($1::uuid,$2,$3,$4::uuid,NOW())",
        body.user_id, body.amount, body.reason or "Admin gift", admin_id
    )
    return {"ok": True, "gifted": body.amount}


@router.get("/credits/history")
async def credit_gift_history(_: dict = Depends(require_admin_user)):
    rows = await fetch("SELECT * FROM credit_gifts ORDER BY created_at DESC LIMIT 100")
    return {"history": [dict(r) for r in rows]}


# ── Subscriptions ─────────────────────────────────────────────────────────────
@router.get("/subscriptions")
async def list_subscriptions(status: Optional[str] = None, limit: int = 100,
                              _: dict = Depends(require_admin_user)):
    if status:
        rows = await fetch("SELECT * FROM user_subscriptions WHERE status=$1 "
                           "ORDER BY created_at DESC LIMIT $2", status, limit)
    else:
        rows = await fetch("SELECT * FROM user_subscriptions ORDER BY created_at DESC LIMIT $1", limit)
    return {"subscriptions": [dict(r) for r in rows]}


# ── Support ───────────────────────────────────────────────────────────────────
@router.get("/tickets")
async def list_tickets(status: Optional[str] = "open", limit: int = 50,
                       _: dict = Depends(require_admin_user)):
    if status:
        rows = await fetch("SELECT * FROM support_tickets WHERE status=$1 "
                           "ORDER BY created_at DESC LIMIT $2", status, limit)
    else:
        rows = await fetch("SELECT * FROM support_tickets ORDER BY created_at DESC LIMIT $1", limit)
    return {"tickets": [dict(r) for r in rows]}


@router.get("/tickets/{ticket_id}")
async def get_ticket(ticket_id: str, _: dict = Depends(require_admin_user)):
    ticket = await fetchrow("SELECT * FROM support_tickets WHERE id=$1::uuid", ticket_id)
    replies = await fetch("SELECT * FROM ticket_messages WHERE ticket_id=$1::uuid "
                          "ORDER BY created_at", ticket_id)
    return {"ticket": dict(ticket) if ticket else None,
            "replies": [dict(r) for r in replies]}


class TicketReplyBody(BaseModel):
    ticket_id: str
    message: str
    close_ticket: bool = False


@router.post("/tickets/reply")
async def reply_ticket(body: TicketReplyBody, admin_user: dict = Depends(require_admin_user)):
    admin_id = admin_user.get("user_id", "")
    await execute(
        "INSERT INTO ticket_messages (ticket_id,sender,message,sender_id,created_at) "
        "VALUES ($1::uuid,'admin',$2,$3::uuid,NOW())",
        body.ticket_id, body.message, admin_id)
    if body.close_ticket:
        await execute("UPDATE support_tickets SET status='resolved' WHERE id=$1::uuid",
                      body.ticket_id)
    return {"ok": True}


# ── Config ────────────────────────────────────────────────────────────────────
@router.get("/config")
async def get_config(_: dict = Depends(require_admin_user)):
    rows = await fetch("SELECT key,value FROM system_config")
    return {"config": {r["key"]: r["value"] for r in rows}}


class ConfigUpdateBody(BaseModel):
    key: str
    value: object


@router.put("/config")
async def update_config(body: ConfigUpdateBody, _: dict = Depends(require_admin_user)):
    await execute("INSERT INTO system_config (key,value) VALUES ($1,$2) "
                  "ON CONFLICT (key) DO UPDATE SET value=$2", body.key, str(body.value))
    return {"ok": True}


# ── LLM ───────────────────────────────────────────────────────────────────────
@router.get("/llm")
async def get_llm_overview(_: dict = Depends(require_admin_user)):
    models = await fetch("SELECT * FROM llm_models")
    usage = await fetch(
        "SELECT model_name, COUNT(*) as calls, AVG(response_time_ms) as avg_ms "
        "FROM llm_usage_logs WHERE created_at > NOW() - INTERVAL '7 days' "
        "GROUP BY model_name ORDER BY calls DESC")
    failures_count = await fetchval(
        "SELECT COUNT(*) FROM llm_failures WHERE created_at > NOW() - INTERVAL '24 hours'")
    return {"models": [dict(r) for r in models],
            "usage": [dict(r) for r in usage],
            "failures_24h": failures_count or 0}


@router.get("/llm/models")
async def get_llm_models(_: dict = Depends(require_admin_user)):
    rows = await fetch("SELECT * FROM llm_models")
    return {"models": [dict(r) for r in rows]}


@router.get("/llm/usage")
async def get_llm_usage(days: int = 7, _: dict = Depends(require_admin_user)):
    rows = await fetch(
        "SELECT model_name,response_time_ms,was_fallback,created_at FROM llm_usage_logs "
        "WHERE created_at > NOW() - ($1 || ' days')::interval "
        "ORDER BY created_at DESC LIMIT 1000", str(days))
    return {"usage": [dict(r) for r in rows]}


@router.get("/llm/failures")
async def get_llm_failures(limit: int = 100, _: dict = Depends(require_admin_user)):
    rows = await fetch("SELECT * FROM llm_failures ORDER BY created_at DESC LIMIT $1", limit)
    return {"failures": [dict(r) for r in rows]}


# ── Errors ────────────────────────────────────────────────────────────────────
@router.get("/errors")
async def get_errors(limit: int = 100, severity: Optional[str] = None,
                     _: dict = Depends(require_admin_user)):
    if severity:
        rows = await fetch("SELECT * FROM error_logs WHERE severity=$1 "
                           "ORDER BY created_at DESC LIMIT $2", severity, limit)
    else:
        rows = await fetch("SELECT * FROM error_logs ORDER BY created_at DESC LIMIT $1", limit)
    return {"errors": [dict(r) for r in rows]}


class ErrorActionBody(BaseModel):
    pattern: str
    status: str = "resolved"
    note: Optional[str] = None


@router.post("/errors/resolve")
async def resolve_errors(body: ErrorActionBody, _: dict = Depends(require_admin_user)):
    await execute("UPDATE error_logs SET status=$1 WHERE message ILIKE $2",
                  body.status, f"%{body.pattern}%")
    return {"ok": True}


@router.post("/errors/reopen")
async def reopen_errors(body: ErrorActionBody, _: dict = Depends(require_admin_user)):
    await execute("UPDATE error_logs SET status='open' WHERE message ILIKE $1",
                  f"%{body.pattern}%")
    return {"ok": True}


# ── Stats ─────────────────────────────────────────────────────────────────────
# De-conflicted in favor of admin_api.py
# @router.get("/stats")
async def get_stats(_: dict = Depends(require_admin_user)):
    return {
        "users_total": await fetchval("SELECT COUNT(*) FROM users") or 0,
        "messages_24h": await fetchval(
            "SELECT COUNT(*) FROM messages WHERE created_at > NOW() - INTERVAL '24 hours'") or 0,
        "messages_7d": await fetchval(
            "SELECT COUNT(*) FROM messages WHERE created_at > NOW() - INTERVAL '7 days'") or 0,
        "open_tickets": await fetchval(
            "SELECT COUNT(*) FROM support_tickets WHERE status='open'") or 0,
        "active_subs": await fetchval(
            "SELECT COUNT(*) FROM user_subscriptions WHERE status='active'") or 0,
        "llm_failures_24h": await fetchval(
            "SELECT COUNT(*) FROM llm_failures WHERE created_at > NOW() - INTERVAL '24 hours'") or 0,
        "intelligence_predictions": await fetchval(
            "SELECT COUNT(*) FROM ayn_world_predictions WHERE status='active'") or 0,
        "world_signals": await fetchval(
            "SELECT COUNT(*) FROM ayn_world_signals WHERE status='active'") or 0,
    }


# ── Contacts & Feedback ───────────────────────────────────────────────────────
@router.get("/contacts")
async def get_contacts(limit: int = 50, _: dict = Depends(require_admin_user)):
    rows = await fetch("SELECT * FROM contact_messages ORDER BY created_at DESC LIMIT $1", limit)
    return {"contacts": [dict(r) for r in rows]}


@router.get("/feedback")
async def get_feedback(limit: int = 50, _: dict = Depends(require_admin_user)):
    rows = await fetch("SELECT * FROM beta_feedback ORDER BY created_at DESC LIMIT $1", limit)
    return {"feedback": [dict(r) for r in rows]}


# ── Twitter ───────────────────────────────────────────────────────────────────
@router.get("/twitter/posts")
async def get_twitter_posts(limit: int = 50, _: dict = Depends(require_admin_user)):
    rows = await fetch("SELECT * FROM twitter_posts ORDER BY created_at DESC LIMIT $1", limit)
    return {"posts": [dict(r) for r in rows]}


@router.delete("/twitter/posts/{post_id}")
async def delete_twitter_post(post_id: str, _: dict = Depends(require_admin_user)):
    await execute("DELETE FROM twitter_posts WHERE id=$1::uuid", post_id)
    return {"ok": True}


@router.post("/twitter/posts/{post_id}/retry")
async def retry_twitter_post(post_id: str, _: dict = Depends(require_admin_user)):
    await execute("UPDATE twitter_posts SET status='pending',error=NULL WHERE id=$1::uuid", post_id)
    return {"ok": True}


@router.post("/twitter/posts/{post_id}/schedule")
async def schedule_twitter_post(post_id: str, body: dict, _: dict = Depends(require_admin_user)):
    await execute("UPDATE twitter_posts SET scheduled_for=$1 WHERE id=$2::uuid",
                  body.get("scheduled_for"), post_id)
    return {"ok": True}


# ── Custom Orders ─────────────────────────────────────────────────────────────
@router.get("/custom-orders")
async def list_custom_orders(_: dict = Depends(require_admin_user)):
    rows = await fetch("SELECT * FROM custom_orders ORDER BY created_at DESC")
    return [dict(r) for r in rows]


@router.post("/custom-orders")
async def create_custom_order(body: dict, _: dict = Depends(require_admin_user)):
    import json
    fields = ["client_name","client_email","service_type","description",
              "price","currency","status","notes","services"]
    cols = [k for k in fields if k in body]
    vals = [json.dumps(body[k]) if isinstance(body[k], (dict, list)) else body[k]
            for k in cols]
    ph = ", ".join(f"${i+1}" for i in range(len(cols)))
    cn = ", ".join(f'"{c}"' for c in cols)
    row = await fetchrow(
        f'INSERT INTO custom_orders ({cn}, created_at) VALUES ({ph}, NOW()) RETURNING id',
        *vals)
    return {"ok": True, "id": str(row["id"]) if row else None}


@router.patch("/custom-orders/{order_id}")
async def update_custom_order(order_id: str, body: dict, _: dict = Depends(require_admin_user)):
    import json
    fields = ["client_name","client_email","service_type","description",
              "price","currency","status","notes","services","paid"]
    cols = [k for k in fields if k in body]
    if not cols:
        return {"ok": True}
    vals = [json.dumps(body[k]) if isinstance(body[k], (dict, list)) else body[k]
            for k in cols]
    sets = ", ".join(f'"{c}"=${i+2}' for i, c in enumerate(cols))
    await execute(f'UPDATE custom_orders SET {sets} WHERE id=$1::uuid', order_id, *vals)
    return {"ok": True}


@router.delete("/custom-orders/{order_id}")
async def delete_custom_order(order_id: str, _: dict = Depends(require_admin_user)):
    await execute("DELETE FROM custom_orders WHERE id=$1::uuid", order_id)
    return {"ok": True}


@router.post("/custom-orders/{order_id}/mark-paid")
async def mark_order_paid(order_id: str, _: dict = Depends(require_admin_user)):
    await execute(
        "UPDATE custom_orders SET paid=TRUE, paid_at=NOW(), status='paid' WHERE id=$1::uuid",
        order_id)
    return {"ok": True}


@router.post("/custom-orders/{order_id}/pdf")
async def generate_order_pdf(order_id: str, _: dict = Depends(require_admin_user)):
    row = await fetchrow("SELECT * FROM custom_orders WHERE id=$1::uuid", order_id)
    if not row:
        from fastapi import HTTPException
        raise HTTPException(404, "Order not found")
    order = dict(row)
    # Return order data for frontend PDF generation
    return {"ok": True, "order": order, "html": None}


# ── Predictions ───────────────────────────────────────────────────────────────
@router.get("/predictions/master")
async def get_master_predictions(_: dict = Depends(require_admin_user)):
    rows = await fetch(
        "SELECT * FROM ayn_world_predictions ORDER BY created_at DESC LIMIT 200")
    return [dict(r) for r in rows]


@router.get("/predictions/scorecard")
async def get_predictions_scorecard(_: dict = Depends(require_admin_user)):
    total = await fetchval("SELECT COUNT(*) FROM ayn_world_predictions") or 0
    correct = await fetchval(
        "SELECT COUNT(*) FROM ayn_world_predictions WHERE resolution_correct=TRUE") or 0
    resolved = await fetchval(
        "SELECT COUNT(*) FROM ayn_world_predictions WHERE status='resolved'") or 0
    return {
        "total": total, "resolved": resolved,
        "correct": correct,
        "accuracy_pct": round((correct / resolved * 100) if resolved > 0 else 0, 1)
    }


@router.post("/predictions/run-checker")
async def run_prediction_checker(body: dict = {}, _: dict = Depends(require_admin_user)):
    from core.scheduler import get_scheduler
    scheduler = get_scheduler()
    job = scheduler.get_job("prediction-resolver") if scheduler else None
    if job:
        import datetime
        job.modify(next_run_time=datetime.datetime.now(datetime.timezone.utc))
        return {"ok": True, "triggered": "prediction-resolver"}
    return {"ok": False, "error": "Scheduler job not found"}


@router.patch("/predictions/{prediction_id}")
async def update_prediction(prediction_id: str, body: dict,
                             _: dict = Depends(require_admin_user)):
    allowed = ["admin_notes", "check_status", "admin_override", "status",
               "resolution_correct", "resolution_notes"]
    cols = [k for k in allowed if k in body]
    if not cols:
        return {"ok": True}
    sets = ", ".join(f'"{c}"=${i+2}' for i, c in enumerate(cols))
    vals = [body[k] for k in cols]
    await execute(
        f'UPDATE ayn_world_predictions SET {sets} WHERE id=$1::uuid',
        prediction_id, *vals)
    return {"ok": True}


# ── Service Applications ──────────────────────────────────────────────────────
@router.get("/service-applications")
async def get_service_applications(_: dict = Depends(require_admin_user)):
    rows = await fetch("SELECT * FROM service_applications ORDER BY created_at DESC")
    return rows or []


# ── NDA Agreements ────────────────────────────────────────────────────────────
@router.post("/nda-agreements")
async def create_nda(body: dict, admin_id: dict = Depends(require_admin_user)):
    import json as _json
    row = await fetchrow("""
        INSERT INTO nda_agreements (company_name, company_email, contact_person,
            nda_purpose, status, created_by, created_at)
        VALUES ($1, $2, $3, $4, 'draft', $5::uuid, NOW())
        RETURNING *
    """, body.get('company_name'), body.get('company_email'),
        body.get('contact_person'), body.get('nda_purpose'), admin_id)
    return dict(row) if row else {}


# ── Beta Feedback ─────────────────────────────────────────────────────────────
@router.get("/beta-feedback")
async def get_beta_feedback(_: dict = Depends(require_admin_user)):
    rows = await fetch("""
        SELECT bf.*, u.email as user_email
        FROM beta_feedback bf
        LEFT JOIN users u ON u.id = bf.user_id
        ORDER BY bf.created_at DESC LIMIT 100
    """)
    return rows or []


# ── Visitor Analytics ─────────────────────────────────────────────────────────
@router.get("/analytics/summary")
async def get_analytics_summary(_: dict = Depends(require_admin_user)):
    stats = await fetchrow("""
        SELECT
            COUNT(DISTINCT visitor_id) as unique_visitors,
            COUNT(*) as total_pageviews,
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


# ── Conversations (admin view) ────────────────────────────────────────────────
@router.get("/conversations")
async def get_admin_conversations(_: dict = Depends(require_admin_user)):
    rows = await fetch("""
        SELECT cs.session_id, cs.title, cs.created_at, cs.updated_at,
               u.email as user_email,
               COUNT(m.id) as message_count
        FROM chat_sessions cs
        JOIN users u ON u.id = cs.user_id
        LEFT JOIN messages m ON m.session_id = cs.session_id
        GROUP BY cs.session_id, cs.title, cs.created_at, cs.updated_at, u.email
        ORDER BY cs.updated_at DESC LIMIT 100
    """)
    return rows or []


@router.get("/conversations/{session_id}")
async def get_conversation_messages(session_id: str, _: dict = Depends(require_admin_user)):
    rows = await fetch("""
        SELECT id, role, content, created_at FROM messages
        WHERE session_id = $1 ORDER BY created_at ASC
    """, session_id)
    return rows or []


# ── Health ────────────────────────────────────────────────────────────────────
@router.get("/health")
async def admin_health(_: dict = Depends(require_admin_user)):
    from core.database import get_pool
    pool = await get_pool()
    return {
        "status": "healthy",
        "db": "railway_postgresql",
        "pool_size": pool.get_size(),
        "users": await fetchval("SELECT COUNT(*) FROM users") or 0,
        "messages": await fetchval("SELECT COUNT(*) FROM messages") or 0,
        "open_errors": await fetchval("SELECT COUNT(*) FROM error_logs WHERE status='open'") or 0,
    }


# ── Support tickets (admin) ───────────────────────────────────────────────────
@router.get("/support-tickets")
async def get_admin_support_tickets(_: dict = Depends(require_admin_user)):
    rows = await fetch("""
        SELECT t.*, u.email as user_email,
               (SELECT COUNT(*) FROM ticket_messages tm WHERE tm.ticket_id = t.id) as message_count
        FROM support_tickets t
        LEFT JOIN users u ON u.id = t.user_id
        ORDER BY t.updated_at DESC NULLS LAST LIMIT 100
    """)
    return rows or []


@router.patch("/support-tickets/{ticket_id}")
async def update_support_ticket(ticket_id: str, body: dict,
                                 _: dict = Depends(require_admin_user)):
    allowed = ["status", "priority", "assigned_to"]
    cols = [k for k in allowed if k in body]
    if not cols:
        return {"ok": True}
    sets = ", ".join(f'"{c}"=${i+2}' for i, c in enumerate(cols))
    vals = [body[k] for k in cols]
    await execute(f'UPDATE support_tickets SET {sets}, updated_at=NOW() WHERE id=$1::uuid',
                  ticket_id, *vals)
    return {"ok": True}


@router.post("/support-tickets/{ticket_id}/reply")
async def admin_reply_ticket(ticket_id: str, body: dict,
                              admin_user: dict = Depends(require_admin_user)):
    admin_id = admin_user.get("user_id", "")
    await execute("""
        INSERT INTO ticket_messages (ticket_id, message, sender, sender_id, created_at)
        VALUES ($1::uuid, $2, 'admin', $3::uuid, NOW())
    """, ticket_id, body.get("message", ""), admin_id)
    await execute(
        "UPDATE support_tickets SET has_unread_reply=TRUE, status='waiting_reply', "
        "updated_at=NOW() WHERE id=$1::uuid", ticket_id)
    return {"ok": True}


# ── LLM Stats ─────────────────────────────────────────────────────────────────
@router.get("/llm-stats")
async def get_llm_stats_detailed(_: dict = Depends(require_admin_user)):
    rows = await fetch("""
        SELECT model_name, COUNT(*) as calls,
               AVG(response_time_ms) as avg_ms,
               SUM(CASE WHEN was_fallback THEN 1 ELSE 0 END) as fallbacks
        FROM llm_usage_logs
        WHERE created_at > NOW() - INTERVAL '30 days'
        GROUP BY model_name ORDER BY calls DESC
    """)
    return rows or []


# ── User Growth ───────────────────────────────────────────────────────────────
@router.get("/user-growth")
async def get_user_growth(_: dict = Depends(require_admin_user)):
    rows = await fetch("""
        SELECT DATE(created_at) as date, COUNT(*) as new_users
        FROM users
        WHERE created_at > NOW() - INTERVAL '30 days'
        GROUP BY DATE(created_at) ORDER BY date ASC
    """)
    return rows or []


# ── Credit Gifts ──────────────────────────────────────────────────────────────
@router.get("/credit-gifts")
async def get_credit_gifts(_: dict = Depends(require_admin_user)):
    rows = await fetch("""
        SELECT cg.*, u.email as user_email
        FROM credit_gifts cg
        LEFT JOIN users u ON u.id = cg.user_id
        ORDER BY cg.created_at DESC LIMIT 100
    """)
    return rows or []


# ── Message Ratings ────────────────────────────────────────────────────────────
@router.get("/message-ratings")
async def get_message_ratings(_: dict = Depends(require_admin_user)):
    rows = await fetch("""
        SELECT mr.*, u.email as user_email
        FROM message_ratings mr
        LEFT JOIN users u ON u.id = mr.user_id
        ORDER BY mr.created_at DESC LIMIT 200
    """)
    return rows or []


# ── Terms Consent ─────────────────────────────────────────────────────────────
@router.get("/terms-consent")
async def get_terms_consent(_: dict = Depends(require_admin_user)):
    rows = await fetch("""
        SELECT tc.*, u.email as user_email
        FROM terms_consent_log tc
        LEFT JOIN users u ON u.id = tc.user_id
        ORDER BY tc.created_at DESC LIMIT 200
    """)
    return rows or []


# ── Churn Alerts ──────────────────────────────────────────────────────────────
@router.get("/churn-alerts")
async def get_churn_alerts(_: dict = Depends(require_admin_user)):
    # Users who haven't sent a message in 7 days but were active before
    rows = await fetch("""
        SELECT u.id, u.email, u.first_name,
               MAX(m.created_at) as last_message,
               COUNT(m.id) as total_messages,
               s.subscription_tier
        FROM users u
        LEFT JOIN messages m ON m.user_id = u.id
        LEFT JOIN user_subscriptions s ON s.user_id = u.id
        WHERE u.created_at < NOW() - INTERVAL '7 days'
        GROUP BY u.id, u.email, u.first_name, s.subscription_tier
        HAVING MAX(m.created_at) < NOW() - INTERVAL '7 days'
            OR MAX(m.created_at) IS NULL
        ORDER BY last_message DESC NULLS LAST
        LIMIT 100
    """)
    return rows or []
