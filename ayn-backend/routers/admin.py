"""
routers/admin.py — admin API (Railway Postgres only, no Supabase)
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from typing import Optional
import datetime
from core.auth_new import get_current_user
from core.database import fetch, fetchrow, fetchval, execute

router = APIRouter(prefix="/admin")


async def require_admin(current_user: dict = Depends(get_current_user)) -> str:
    user_id = current_user.get("sub") or current_user.get("user_id", "")
    if user_id == "internal":
        return user_id
    if current_user.get("is_admin"):
        return user_id
    try:
        is_admin = await fetchval("SELECT is_admin FROM users WHERE id = $1::uuid", user_id)
        if is_admin:
            return user_id
    except Exception:
        pass
    raise HTTPException(403, "Admin access required")


# ── Scheduler ─────────────────────────────────────────────────────────────────
@router.get("/scheduler/status")
async def scheduler_status(_: str = Depends(require_admin)):
    from core.scheduler import get_scheduler
    scheduler = get_scheduler()
    if not scheduler:
        return {"running": False, "jobs": []}
    jobs = [{"id": j.id, "name": j.name,
             "next_run": str(j.next_run_time) if j.next_run_time else None}
            for j in scheduler.get_jobs()]
    return {"running": scheduler.running, "jobs": jobs}


@router.post("/scheduler/run/{job_id}")
async def run_scheduler_job(job_id: str, _: str = Depends(require_admin)):
    from core.scheduler import get_scheduler
    scheduler = get_scheduler()
    job = scheduler.get_job(job_id) if scheduler else None
    if not job:
        raise HTTPException(404, f"Job '{job_id}' not found")
    job.modify(next_run_time=datetime.datetime.now(datetime.timezone.utc))
    return {"ok": True, "job": job_id}


# ── Users ─────────────────────────────────────────────────────────────────────
@router.get("/users")
async def list_users(limit: int = Query(50, le=200), offset: int = 0,
                     search: Optional[str] = None, _: str = Depends(require_admin)):
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


@router.get("/users/{user_id}")
async def get_user(user_id: str, _: str = Depends(require_admin)):
    profile = await fetchrow("SELECT * FROM users WHERE id = $1::uuid", user_id)
    limits = await fetchrow("SELECT * FROM user_ai_limits WHERE user_id = $1::uuid", user_id)
    return {"profile": dict(profile) if profile else None,
            "limits": dict(limits) if limits else None}


@router.get("/users/{user_id}/messages")
async def get_user_messages(user_id: str, limit: int = 50, _: str = Depends(require_admin)):
    rows = await fetch(
        "SELECT id,content,sender,created_at FROM messages "
        "WHERE user_id=$1::uuid ORDER BY created_at DESC LIMIT $2", user_id, limit)
    return {"messages": [dict(r) for r in rows]}


@router.patch("/users/{user_id}/subscription")
async def update_user_subscription(user_id: str, body: dict, _: str = Depends(require_admin)):
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
async def gift_credits(body: CreditGiftBody, admin_id: str = Depends(require_admin)):
    await execute(
        "INSERT INTO credit_gifts (user_id,amount,reason,gifted_by,created_at) "
        "VALUES ($1::uuid,$2,$3,$4::uuid,NOW())",
        body.user_id, body.amount, body.reason or "Admin gift", admin_id)
    return {"ok": True, "gifted": body.amount}


@router.get("/credits/history")
async def credit_gift_history(_: str = Depends(require_admin)):
    rows = await fetch("SELECT * FROM credit_gifts ORDER BY created_at DESC LIMIT 100")
    return {"history": [dict(r) for r in rows]}


# ── Subscriptions ─────────────────────────────────────────────────────────────
@router.get("/subscriptions")
async def list_subscriptions(status: Optional[str] = None, limit: int = 100,
                              _: str = Depends(require_admin)):
    if status:
        rows = await fetch("SELECT * FROM user_subscriptions WHERE status=$1 "
                           "ORDER BY created_at DESC LIMIT $2", status, limit)
    else:
        rows = await fetch("SELECT * FROM user_subscriptions ORDER BY created_at DESC LIMIT $1", limit)
    return {"subscriptions": [dict(r) for r in rows]}


# ── Support ───────────────────────────────────────────────────────────────────
@router.get("/tickets")
async def list_tickets(status: Optional[str] = "open", limit: int = 50,
                       _: str = Depends(require_admin)):
    if status:
        rows = await fetch("SELECT * FROM support_tickets WHERE status=$1 "
                           "ORDER BY created_at DESC LIMIT $2", status, limit)
    else:
        rows = await fetch("SELECT * FROM support_tickets ORDER BY created_at DESC LIMIT $1", limit)
    return {"tickets": [dict(r) for r in rows]}


@router.get("/tickets/{ticket_id}")
async def get_ticket(ticket_id: str, _: str = Depends(require_admin)):
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
async def reply_ticket(body: TicketReplyBody, admin_id: str = Depends(require_admin)):
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
async def get_config(_: str = Depends(require_admin)):
    rows = await fetch("SELECT key,value FROM system_config")
    return {"config": {r["key"]: r["value"] for r in rows}}


class ConfigUpdateBody(BaseModel):
    key: str
    value: object


@router.put("/config")
async def update_config(body: ConfigUpdateBody, _: str = Depends(require_admin)):
    await execute("INSERT INTO system_config (key,value) VALUES ($1,$2) "
                  "ON CONFLICT (key) DO UPDATE SET value=$2", body.key, str(body.value))
    return {"ok": True}


# ── LLM ───────────────────────────────────────────────────────────────────────
@router.get("/llm")
async def get_llm_overview(_: str = Depends(require_admin)):
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
async def get_llm_models(_: str = Depends(require_admin)):
    rows = await fetch("SELECT * FROM llm_models")
    return {"models": [dict(r) for r in rows]}


@router.get("/llm/usage")
async def get_llm_usage(days: int = 7, _: str = Depends(require_admin)):
    rows = await fetch(
        "SELECT model_name,response_time_ms,was_fallback,created_at FROM llm_usage_logs "
        "WHERE created_at > NOW() - ($1 || ' days')::interval "
        "ORDER BY created_at DESC LIMIT 1000", str(days))
    return {"usage": [dict(r) for r in rows]}


@router.get("/llm/failures")
async def get_llm_failures(limit: int = 100, _: str = Depends(require_admin)):
    rows = await fetch("SELECT * FROM llm_failures ORDER BY created_at DESC LIMIT $1", limit)
    return {"failures": [dict(r) for r in rows]}


# ── Errors ────────────────────────────────────────────────────────────────────
@router.get("/errors")
async def get_errors(limit: int = 100, severity: Optional[str] = None,
                     _: str = Depends(require_admin)):
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
async def resolve_errors(body: ErrorActionBody, _: str = Depends(require_admin)):
    await execute("UPDATE error_logs SET status=$1 WHERE message ILIKE $2",
                  body.status, f"%{body.pattern}%")
    return {"ok": True}


@router.post("/errors/reopen")
async def reopen_errors(body: ErrorActionBody, _: str = Depends(require_admin)):
    await execute("UPDATE error_logs SET status='open' WHERE message ILIKE $1",
                  f"%{body.pattern}%")
    return {"ok": True}


# ── Stats ─────────────────────────────────────────────────────────────────────
@router.get("/stats")
async def get_stats(_: str = Depends(require_admin)):
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
async def get_contacts(limit: int = 50, _: str = Depends(require_admin)):
    rows = await fetch("SELECT * FROM contact_messages ORDER BY created_at DESC LIMIT $1", limit)
    return {"contacts": [dict(r) for r in rows]}


@router.get("/feedback")
async def get_feedback(limit: int = 50, _: str = Depends(require_admin)):
    rows = await fetch("SELECT * FROM beta_feedback ORDER BY created_at DESC LIMIT $1", limit)
    return {"feedback": [dict(r) for r in rows]}


# ── Twitter ───────────────────────────────────────────────────────────────────
@router.get("/twitter/posts")
async def get_twitter_posts(limit: int = 50, _: str = Depends(require_admin)):
    rows = await fetch("SELECT * FROM twitter_posts ORDER BY created_at DESC LIMIT $1", limit)
    return {"posts": [dict(r) for r in rows]}


@router.delete("/twitter/posts/{post_id}")
async def delete_twitter_post(post_id: str, _: str = Depends(require_admin)):
    await execute("DELETE FROM twitter_posts WHERE id=$1::uuid", post_id)
    return {"ok": True}


@router.post("/twitter/posts/{post_id}/retry")
async def retry_twitter_post(post_id: str, _: str = Depends(require_admin)):
    await execute("UPDATE twitter_posts SET status='pending',error=NULL WHERE id=$1::uuid", post_id)
    return {"ok": True}


@router.post("/twitter/posts/{post_id}/schedule")
async def schedule_twitter_post(post_id: str, body: dict, _: str = Depends(require_admin)):
    await execute("UPDATE twitter_posts SET scheduled_for=$1 WHERE id=$2::uuid",
                  body.get("scheduled_for"), post_id)
    return {"ok": True}


# ── Custom Orders ─────────────────────────────────────────────────────────────
@router.get("/custom-orders")
async def list_custom_orders(_: str = Depends(require_admin)):
    rows = await fetch("SELECT * FROM custom_orders ORDER BY created_at DESC")
    return [dict(r) for r in rows]


@router.post("/custom-orders")
async def create_custom_order(body: dict, _: str = Depends(require_admin)):
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
async def update_custom_order(order_id: str, body: dict, _: str = Depends(require_admin)):
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
async def delete_custom_order(order_id: str, _: str = Depends(require_admin)):
    await execute("DELETE FROM custom_orders WHERE id=$1::uuid", order_id)
    return {"ok": True}


@router.post("/custom-orders/{order_id}/mark-paid")
async def mark_order_paid(order_id: str, _: str = Depends(require_admin)):
    await execute(
        "UPDATE custom_orders SET paid=TRUE, paid_at=NOW(), status='paid' WHERE id=$1::uuid",
        order_id)
    return {"ok": True}


@router.post("/custom-orders/{order_id}/pdf")
async def generate_order_pdf(order_id: str, _: str = Depends(require_admin)):
    row = await fetchrow("SELECT * FROM custom_orders WHERE id=$1::uuid", order_id)
    if not row:
        from fastapi import HTTPException
        raise HTTPException(404, "Order not found")
    order = dict(row)
    # Return order data for frontend PDF generation
    return {"ok": True, "order": order, "html": None}


# ── Predictions ───────────────────────────────────────────────────────────────
@router.get("/predictions/master")
async def get_master_predictions(_: str = Depends(require_admin)):
    rows = await fetch(
        "SELECT * FROM ayn_world_predictions ORDER BY created_at DESC LIMIT 200")
    return [dict(r) for r in rows]


@router.get("/predictions/scorecard")
async def get_predictions_scorecard(_: str = Depends(require_admin)):
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
async def run_prediction_checker(body: dict = {}, _: str = Depends(require_admin)):
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
                             _: str = Depends(require_admin)):
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
