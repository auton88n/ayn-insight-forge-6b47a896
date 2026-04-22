"""
routers/admin_routes.py — admin API (fully Railway Postgres, no Supabase)
"""
import hashlib
import logging
import json
import os
from typing import Any, Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from core.auth_new import get_user_id
from core.security import require_admin_user
from core.database import fetchrow, fetchval, execute, fetch
from core.llm import gemini

router = APIRouter(prefix="/admin", tags=["admin"])
log = logging.getLogger("ayn.admin")


class PinRequest(BaseModel):
    pin: str

class SetPinRequest(BaseModel):
    pin: str
    new_pin: str

class GiftCreditsRequest(BaseModel):
    user_id: str
    credits: int
    reason: str = ""

class UnblockUserRequest(BaseModel):
    user_id: str

class BlockUserRequest(BaseModel):
    user_id: str

class AIAssistantRequest(BaseModel):
    message: str
    context: str = ""

class SystemConfigRequest(BaseModel):
    key: str
    value: Any

class MemoryRequest(BaseModel):
    key: str
    value: str


def _hash_pin(pin: str) -> str:
    return hashlib.sha256(pin.encode()).hexdigest()


# ── PIN ───────────────────────────────────────────────────────────────────────
@router.post("/verify-pin")
async def verify_admin_pin(req: PinRequest, user: dict = Depends(require_admin_user)):
    try:
        record = await fetchrow(
            "SELECT value FROM app_settings WHERE key='admin_pin' LIMIT 1")
        stored = (record["value"] if record else "") or ""
        if not stored:
            # ONLY allow default in dev. In prod, this is a hard 503 until seeded.
            if os.getenv("APP_ENV", "development").lower() != "development":
                raise HTTPException(503, "Admin PIN not initialized — contact system owner")
            valid = req.pin == "1234"
        else:
            valid = stored == _hash_pin(req.pin)
        return {"valid": valid, "success": valid, "lockoutRemaining": 0}
    except HTTPException:
        raise
    except Exception as e:
        log.error(f"[admin] verify pin: {e}")
        raise HTTPException(500, str(e))


@router.post("/set-pin")
async def set_admin_pin(req: SetPinRequest, user: dict = Depends(require_admin_user)):
    record = await fetchrow("SELECT value FROM app_settings WHERE key='admin_pin' LIMIT 1")
    stored = (record["value"] if record else "") or ""
    if not stored and os.getenv("APP_ENV", "development").lower() == "production":
        raise HTTPException(503, "Admin PIN not initialized")
    current_valid = (not stored and req.pin == "1234") or \
                    (stored and stored == _hash_pin(req.pin))
    if not current_valid:
        raise HTTPException(403, "Current PIN incorrect")
    if len(req.new_pin) < 4:
        raise HTTPException(400, "PIN must be at least 4 digits")
    await execute(
        "INSERT INTO app_settings (key,value,updated_at) VALUES ('admin_pin',$1,NOW()) "
        "ON CONFLICT (key) DO UPDATE SET value=$1, updated_at=NOW()",
        _hash_pin(req.new_pin))
    return {"ok": True}


# ── Credits / Users ───────────────────────────────────────────────────────────
@router.post("/legacy/add-credits")
async def gift_credits(req: GiftCreditsRequest, user: dict = Depends(require_admin_user)):
    await execute(
        "UPDATE user_ai_limits SET bonus_credits=COALESCE(bonus_credits,0)+$2, updated_at=NOW() "
        "WHERE user_id=$1::uuid", req.user_id, req.credits)
    new_balance = await fetchval(
        "SELECT COALESCE(bonus_credits,0) FROM user_ai_limits WHERE user_id=$1::uuid", req.user_id)
    return {"success": True, "new_balance": new_balance or 0}


@router.post("/legacy/block-user")
async def block_user(req: BlockUserRequest, user: dict = Depends(require_admin_user)):
    """Deactivate user and kill all sessions."""
    await execute("UPDATE users SET is_active=FALSE, updated_at=NOW() WHERE id=$1::uuid", req.user_id)
    # Force logout by killing all sessions
    await execute("DELETE FROM user_sessions WHERE user_id=$1::uuid", req.user_id)
    return {"success": True, "status": "blocked"}


@router.post("/legacy/unblock-user")
async def unblock_user(req: UnblockUserRequest, user: dict = Depends(require_admin_user)):
    """Reactivate user."""
    await execute("UPDATE users SET is_active=TRUE, updated_at=NOW() WHERE id=$1::uuid", req.user_id)
    return {"success": True, "status": "active"}


# De-conflicted in favor of admin_api.py
# @router.get("/users")
async def get_admin_users(user: dict = Depends(require_admin_user)):
    rows = await fetch("""
        SELECT u.id, u.email, u.first_name, u.last_name, u.created_at, u.is_admin,
               s.subscription_tier, s.status,
               l.daily_messages, l.current_daily_messages, l.bonus_credits
        FROM users u
        LEFT JOIN user_subscriptions s ON s.user_id = u.id
        LEFT JOIN user_ai_limits l ON l.user_id = u.id
        ORDER BY u.created_at DESC LIMIT 200
    """)
    return {"users": [dict(r) for r in rows]}


@router.get("/legacy/user-messages")
async def get_user_messages(user_id: str, limit: int = 10, user: dict = Depends(require_admin_user)):
    rows = await fetch(
        "SELECT id,content,role,created_at FROM messages "
        "WHERE user_id=$1::uuid ORDER BY created_at DESC LIMIT $2",
        user_id, limit)
    return {"messages": [dict(r) for r in rows]}


# ── Support / Orders ──────────────────────────────────────────────────────────
@router.get("/legacy/tickets")
async def get_support_tickets(limit: int = 200, offset: int = 0, user: dict = Depends(require_admin_user)):
    rows = await fetch(
        "SELECT * FROM support_tickets ORDER BY created_at DESC LIMIT $1 OFFSET $2", limit, offset)
    return {"tickets": [dict(r) for r in rows]}


@router.get("/legacy/contact-messages")
async def get_contact_messages(limit: int = 200, user: dict = Depends(require_admin_user)):
    rows = await fetch("SELECT * FROM contact_messages ORDER BY created_at DESC LIMIT $1", limit)
    return {"messages": [dict(r) for r in rows]}


# De-conflicted in favor of admin_api.py
# @router.get("/orders")
async def get_custom_orders(user: dict = Depends(require_admin_user)):
    rows = await fetch("SELECT * FROM custom_orders ORDER BY created_at DESC")
    return {"orders": [dict(r) for r in rows]}


# ── Stats ─────────────────────────────────────────────────────────────────────
# De-conflicted in favor of admin_api.py
# @router.get("/stats")
async def get_admin_stats(user: dict = Depends(require_admin_user)):
    return {
        "total_users": await fetchval("SELECT COUNT(*) FROM users") or 0,
        "active_sessions": await fetchval(
            "SELECT COUNT(*) FROM user_sessions WHERE expires_at > NOW()") or 0,
        "total_messages": await fetchval("SELECT COUNT(*) FROM messages") or 0,
        "intelligence_predictions": await fetchval(
            "SELECT COUNT(*) FROM ayn_world_predictions WHERE status='active'") or 0,
    }


@router.get("/legacy/llm")
async def get_llm_stats(user: dict = Depends(require_admin_user)):
    logs = await fetch(
        "SELECT model_name,response_time_ms,was_fallback,created_at FROM llm_usage_logs "
        "ORDER BY created_at DESC LIMIT 100")
    return {"logs": [dict(r) for r in logs], "models": [], "total_cost": 0}


@router.get("/legacy/test-results")
async def get_test_results(user: dict = Depends(require_admin_user)):
    rows = await fetch("SELECT * FROM test_results ORDER BY created_at DESC LIMIT 50")
    return {"results": [dict(r) for r in rows]}


@router.get("/legacy/rate-limits")
async def get_rate_limits(user: dict = Depends(require_admin_user)):
    rows = await fetch("SELECT * FROM api_rate_limits ORDER BY updated_at DESC LIMIT 100")
    return {"rate_limits": [dict(r) for r in rows]}


@router.get("/legacy/notification-log")
async def get_notification_log(user: dict = Depends(require_admin_user)):
    rows = await fetch(
        "SELECT * FROM admin_notification_log ORDER BY created_at DESC LIMIT 100")
    return {"logs": [dict(r) for r in rows]}


@router.get("/legacy/ndas")
async def get_ndas(user: dict = Depends(require_admin_user)):
    rows = await fetch("SELECT * FROM nda_agreements ORDER BY created_at DESC")
    return {"ndas": [dict(r) for r in rows]}


# ── Config ────────────────────────────────────────────────────────────────────
@router.get("/legacy/config")
async def get_system_config(user: dict = Depends(require_admin_user)):
    rows = await fetch("SELECT * FROM system_config")
    return {"config": [dict(r) for r in rows]}


@router.post("/legacy/config")
async def upsert_system_config(req: SystemConfigRequest, user: dict = Depends(require_admin_user)):
    await execute(
        "INSERT INTO system_config (key,value) VALUES ($1,$2) "
        "ON CONFLICT (key) DO UPDATE SET value=$2",
        req.key, str(req.value))
    return {"ok": True}


# ── AI Assistant ──────────────────────────────────────────────────────────────
@router.post("/legacy/ai-assistant")
async def admin_ai(req: AIAssistantRequest, user: dict = Depends(require_admin_user)):
    try:
        stats = {
            "total_users": await fetchval("SELECT COUNT(*) FROM users") or 0,
            "total_messages": await fetchval("SELECT COUNT(*) FROM messages") or 0,
            "predictions": await fetchval(
                "SELECT COUNT(*) FROM ayn_world_predictions WHERE status='active'") or 0,
        }
        prompt = f"""You are AYN's internal admin AI assistant.
Platform stats: {stats}
Context: {req.context}
User question: {req.message}
Be concise and specific."""
        result = await gemini([{"role": "user", "content": prompt}], max_tokens=1000)
        return {"response": result.get("content", ""), "ok": True}
    except Exception as e:
        return {"response": str(e), "ok": False}


# ── Memory ────────────────────────────────────────────────────────────────────
@router.post("/legacy/user/memory")
async def save_user_memory(req: MemoryRequest, user_id: str = Depends(get_user_id)):
    await execute("""
        INSERT INTO user_memory (user_id, memory_key, memory_data, memory_type, updated_at)
        VALUES ($1::uuid, $2, $3::jsonb, 'user', NOW())
        ON CONFLICT (user_id, memory_key)
        DO UPDATE SET memory_data=$3::jsonb, updated_at=NOW()
    """, user_id, req.key, json.dumps(req.value))
    return {"ok": True}


# ── Analytics ─────────────────────────────────────────────────────────────────
@router.get("/legacy/analytics/summary")
async def get_analytics_summary(days: int = 30, user: dict = Depends(require_admin_user)):
    rows = await fetch(
        "SELECT * FROM visitor_analytics ORDER BY created_at DESC LIMIT 500")
    return {"analytics": [dict(r) for r in rows], "days": days}
