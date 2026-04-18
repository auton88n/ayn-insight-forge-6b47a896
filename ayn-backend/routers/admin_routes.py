"""
routers/admin_routes.py — full admin API
Covers: PIN, credits, users, tickets, contact messages, custom orders,
        LLM stats, test results, rate limits, notification log, NDAs,
        system config, AI assistant
"""
import hashlib
import logging
from datetime import datetime, timezone
from typing import Any, Optional, List
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from core.auth_new import get_user_id, get_current_user
from core.database import fetchrow, fetchval, execute, fetch
from core.llm import gemini

router = APIRouter(prefix="/admin", tags=["admin"])
log = logging.getLogger("ayn.admin")


# ── Pydantic models ────────────────────────────────────────────────────────────

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


# ── PIN management ─────────────────────────────────────────────────────────────

@router.post("/verify-pin")
async def verify_admin_pin(req: PinRequest, user: dict = Depends(get_current_user)):
    """Verify admin PIN. Accepts both regular JWT (from adminSupabase) and admin JWT (from /admin/login)."""
    try:
        record = await fetchrow("SELECT value FROM app_settings WHERE key = 'admin_pin'")
        if not record:
            # No PIN set yet — accept default "123456"
            valid = req.pin == "123456"
            return {"valid": valid, "success": valid, "lockoutRemaining": 0}
        valid = record["value"] == _hash_pin(req.pin)
        return {"valid": valid, "success": valid, "lockoutRemaining": 0}
    except Exception as e:
        log.error(f"[admin] verify pin: {e}")
        raise HTTPException(500, str(e))


@router.post("/set-pin")
async def set_admin_pin(req: SetPinRequest, user_id: str = Depends(get_user_id)):
    record = await fetchrow("SELECT value FROM app_settings WHERE key = 'admin_pin'")
    current_valid = (not record and req.pin == "123456") or \
                    (record and record["value"] == _hash_pin(req.pin))
    if not current_valid:
        raise HTTPException(403, "Current PIN incorrect")
    if len(req.new_pin) < 4:
        raise HTTPException(400, "PIN must be at least 4 digits")
    await execute("""
        INSERT INTO app_settings (key, value, updated_at)
        VALUES ('admin_pin', $1, NOW())
        ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = NOW()
    """, _hash_pin(req.new_pin))
    return {"ok": True}


# ── Credits / users ────────────────────────────────────────────────────────────

@router.post("/add-credits")
async def gift_credits(req: GiftCreditsRequest, user: dict = Depends(get_current_user)):
    try:
        await execute("""
            UPDATE user_ai_limits
            SET bonus_credits = COALESCE(bonus_credits, 0) + $2, updated_at = NOW()
            WHERE user_id = $1::uuid
        """, req.user_id, req.credits)
        new_balance = await fetchval(
            "SELECT COALESCE(bonus_credits, 0) FROM user_ai_limits WHERE user_id = $1::uuid",
            req.user_id
        )
        return {"success": True, "new_balance": new_balance or 0}
    except Exception as e:
        raise HTTPException(500, str(e))


@router.post("/unblock-user")
async def unblock_user(req: UnblockUserRequest, user: dict = Depends(get_current_user)):
    try:
        await execute("""
            UPDATE user_sessions SET expires_at = NOW() - INTERVAL '1 second'
            WHERE user_id = $1::uuid
        """, req.user_id)
        return {"success": True}
    except Exception as e:
        raise HTTPException(500, str(e))


@router.get("/users")
async def get_admin_users(user: dict = Depends(get_current_user)):
    try:
        rows = await fetch("""
            SELECT u.id, u.email, u.first_name, u.last_name, u.created_at,
                   s.subscription_tier, s.status,
                   l.daily_messages, l.current_daily_messages, l.bonus_credits
            FROM users u
            LEFT JOIN user_subscriptions s ON s.user_id = u.id
            LEFT JOIN user_ai_limits l ON l.user_id = u.id
            ORDER BY u.created_at DESC LIMIT 200
        """)
        return {"users": [dict(r) for r in rows] if rows else []}
    except Exception as e:
        raise HTTPException(500, str(e))


@router.get("/user-messages")
async def get_user_messages(user_id: str, limit: int = 10, user: dict = Depends(get_current_user)):
    try:
        rows = await fetch("""
            SELECT m.id, m.content, m.role, m.created_at, cs.title
            FROM messages m
            JOIN chat_sessions cs ON cs.session_id = m.session_id
            WHERE cs.user_id = $1::uuid
            ORDER BY m.created_at DESC LIMIT $2
        """, user_id, limit)
        return {"messages": [dict(r) for r in rows] if rows else []}
    except Exception as e:
        raise HTTPException(500, str(e))


# ── Tickets & Contact ──────────────────────────────────────────────────────────

@router.get("/tickets")
async def get_support_tickets(limit: int = 200, offset: int = 0, user: dict = Depends(get_current_user)):
    try:
        # Read from Supabase DB via SDK
        from core.db import get_db
        import asyncio
        db = get_db()
        r = await asyncio.to_thread(
            lambda: db.from_("support_tickets").select("*").order("created_at", desc=True)
                       .range(offset, offset + limit - 1).execute()
        )
        return {"tickets": r.data or []}
    except Exception as e:
        raise HTTPException(500, str(e))


@router.get("/contact-messages")
async def get_contact_messages(limit: int = 200, user: dict = Depends(get_current_user)):
    try:
        from core.db import get_db
        import asyncio
        db = get_db()
        r = await asyncio.to_thread(
            lambda: db.from_("contact_messages").select("*").order("created_at", desc=True).limit(limit).execute()
        )
        return {"messages": r.data or []}
    except Exception as e:
        raise HTTPException(500, str(e))


# ── Custom Orders ──────────────────────────────────────────────────────────────

@router.get("/orders")
async def get_custom_orders(user: dict = Depends(get_current_user)):
    try:
        from core.db import get_db
        import asyncio
        db = get_db()
        r = await asyncio.to_thread(
            lambda: db.from_("custom_orders").select("*").order("created_at", desc=True).execute()
        )
        return {"orders": r.data or []}
    except Exception as e:
        raise HTTPException(500, str(e))


# ── Stats / Analytics ──────────────────────────────────────────────────────────

@router.get("/stats")
async def get_admin_stats(user: dict = Depends(get_current_user)):
    try:
        users = await fetchval("SELECT COUNT(*) FROM users") or 0
        sessions = await fetchval("SELECT COUNT(*) FROM user_sessions WHERE expires_at > NOW()") or 0
        messages = await fetchval("SELECT COUNT(*) FROM messages") or 0
        return {
            "total_users": int(users),
            "active_sessions": int(sessions),
            "total_messages": int(messages),
        }
    except Exception as e:
        return {"total_users": 0, "active_sessions": 0, "total_messages": 0}


@router.get("/llm")
async def get_llm_stats(user: dict = Depends(get_current_user)):
    try:
        from core.db import get_db
        import asyncio
        db = get_db()
        r = await asyncio.to_thread(
            lambda: db.from_("llm_usage_logs").select("*").order("created_at", desc=True).limit(100).execute()
        )
        return {"logs": r.data or [], "models": [], "total_cost": 0}
    except Exception as e:
        return {"logs": [], "models": [], "total_cost": 0}


@router.get("/test-results")
async def get_test_results(user: dict = Depends(get_current_user)):
    try:
        from core.db import get_db
        import asyncio
        db = get_db()
        r = await asyncio.to_thread(
            lambda: db.from_("test_results").select("*").order("created_at", desc=True).limit(50).execute()
        )
        return {"results": r.data or []}
    except Exception as e:
        return {"results": []}


@router.get("/rate-limits")
async def get_rate_limits(user: dict = Depends(get_current_user)):
    try:
        from core.db import get_db
        import asyncio
        db = get_db()
        r = await asyncio.to_thread(
            lambda: db.from_("api_rate_limits").select("*").order("updated_at", desc=True).limit(100).execute()
        )
        return {"rate_limits": r.data or []}
    except Exception as e:
        return {"rate_limits": []}


@router.get("/notification-log")
async def get_notification_log(user: dict = Depends(get_current_user)):
    try:
        from core.db import get_db
        import asyncio
        db = get_db()
        r = await asyncio.to_thread(
            lambda: db.from_("admin_notification_log").select("*").order("created_at", desc=True).limit(100).execute()
        )
        return {"logs": r.data or []}
    except Exception as e:
        return {"logs": []}


@router.get("/ndas")
async def get_ndas(user: dict = Depends(get_current_user)):
    try:
        from core.db import get_db
        import asyncio
        db = get_db()
        r = await asyncio.to_thread(
            lambda: db.from_("nda_agreements").select("*").order("created_at", desc=True).execute()
        )
        return {"ndas": r.data or []}
    except Exception as e:
        return {"ndas": []}


# ── System Config ──────────────────────────────────────────────────────────────

@router.get("/config")
async def get_system_config(user: dict = Depends(get_current_user)):
    try:
        from core.db import get_db
        import asyncio
        db = get_db()
        r = await asyncio.to_thread(
            lambda: db.from_("system_config").select("*").execute()
        )
        return {"config": r.data or []}
    except Exception as e:
        return {"config": []}


@router.post("/config")
async def upsert_system_config(req: SystemConfigRequest, user: dict = Depends(get_current_user)):
    try:
        from core.db import get_db
        import asyncio
        db = get_db()
        await asyncio.to_thread(
            lambda: db.from_("system_config").upsert({"key": req.key, "value": req.value}).execute()
        )
        return {"ok": True}
    except Exception as e:
        raise HTTPException(500, str(e))


# ── AI Assistant ───────────────────────────────────────────────────────────────

@router.post("/ai-assistant")
async def admin_ai(req: AIAssistantRequest, user: dict = Depends(get_current_user)):
    try:
        stats = await get_admin_stats(user)
        system = f"""You are AYN's internal admin AI. You have access to platform stats:
Total users: {stats.get('total_users', 0)}
Active sessions: {stats.get('active_sessions', 0)}
Total messages: {stats.get('total_messages', 0)}
Context: {req.context}
Be concise and specific."""
        result = await gemini(
            [{"role": "user", "content": req.message}],
            system_prompt=system, max_tokens=1000
        )
        return {"response": result.get("content", ""), "ok": True}
    except Exception as e:
        return {"response": str(e), "ok": False}


# ── Memory ─────────────────────────────────────────────────────────────────────

@router.post("/user/memory")
async def save_user_memory(req: MemoryRequest, user_id: str = Depends(get_user_id)):
    try:
        import json
        await execute("""
            INSERT INTO user_memory (user_id, memory_key, memory_data, memory_type, updated_at)
            VALUES ($1::uuid, $2, $3::jsonb, 'user', NOW())
            ON CONFLICT (user_id, memory_key)
            DO UPDATE SET memory_data = $3::jsonb, updated_at = NOW()
        """, user_id, req.key, json.dumps(req.value))
        return {"ok": True}
    except Exception as e:
        raise HTTPException(500, str(e))


@router.get("/analytics/summary")
async def get_analytics_summary(days: int = 30, user: dict = Depends(get_current_user)):
    try:
        from core.db import get_db
        import asyncio
        db = get_db()
        r = await asyncio.to_thread(
            lambda: db.from_("visitor_analytics").select("*").order("created_at", desc=True).limit(500).execute()
        )
        return {"analytics": r.data or [], "days": days}
    except Exception as e:
        return {"analytics": [], "days": days}
