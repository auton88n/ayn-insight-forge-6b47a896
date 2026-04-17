"""
routers/admin_routes.py — admin PIN + admin data endpoints
Replaces: verify-admin-pin, set-admin-pin, admin-ai-assistant
"""
import hashlib
import logging
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from core.auth_new import get_user_id
from core.database import fetchrow, execute, fetch
from core.llm import gemini

router = APIRouter(prefix="/admin", tags=["admin"])
log = logging.getLogger("ayn.admin")


class PinRequest(BaseModel):
    pin: str

class SetPinRequest(BaseModel):
    pin: str
    new_pin: str

class AIRequest(BaseModel):
    message: str
    context: str = ""


def _hash_pin(pin: str) -> str:
    return hashlib.sha256(pin.encode()).hexdigest()


@router.post("/verify-pin")
async def verify_admin_pin(req: PinRequest, user_id: str = Depends(get_user_id)):
    """Verify admin PIN. Replaces verify-admin-pin edge function."""
    try:
        record = await fetchrow(
            "SELECT pin_hash FROM app_settings WHERE key = 'admin_pin'"
        )
        if not record:
            # Default PIN on first use: 123456
            if req.pin == "123456":
                return {"valid": True, "message": "Default PIN accepted — please change it"}
            return {"valid": False}
        
        valid = record["pin_hash"] == _hash_pin(req.pin)
        return {"valid": valid}
    except Exception as e:
        log.error(f"[admin] verify pin error: {e}")
        raise HTTPException(500, str(e))


@router.post("/set-pin")
async def set_admin_pin(req: SetPinRequest, user_id: str = Depends(get_user_id)):
    """Set admin PIN. Replaces set-admin-pin edge function."""
    # Verify current PIN first
    record = await fetchrow("SELECT pin_hash FROM app_settings WHERE key = 'admin_pin'")
    current_valid = (not record and req.pin == "123456") or \
                    (record and record["pin_hash"] == _hash_pin(req.pin))
    
    if not current_valid:
        raise HTTPException(403, "Current PIN is incorrect")
    
    if len(req.new_pin) < 4:
        raise HTTPException(400, "PIN must be at least 4 digits")
    
    await execute("""
        INSERT INTO app_settings (key, value, updated_at)
        VALUES ('admin_pin', $1, NOW())
        ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = NOW()
    """, _hash_pin(req.new_pin))
    return {"ok": True}


@router.get("/stats")
async def get_admin_stats(user_id: str = Depends(get_user_id)):
    """Get admin dashboard stats from Railway DB."""
    try:
        users = await fetchrow("SELECT COUNT(*) as count FROM users")
        sessions = await fetchrow("SELECT COUNT(*) as count FROM user_sessions")
        messages = await fetchrow("SELECT COUNT(*) as count FROM messages")
        return {
            "total_users": users["count"] if users else 0,
            "active_sessions": sessions["count"] if sessions else 0,
            "total_messages": messages["count"] if messages else 0,
        }
    except Exception as e:
        return {"error": str(e)}


@router.post("/ai-assistant")  
async def admin_ai_assistant(req: AIRequest, user_id: str = Depends(get_user_id)):
    """Admin AI assistant. Replaces admin-ai-assistant edge function."""
    try:
        messages = [{"role": "user", "content":
            f"You are AYN's internal admin AI assistant. "
            f"Context: {req.context}\n\nAdmin query: {req.message}"}]
        result = await gemini(messages, max_tokens=1000)
        return {"response": result.get("content", ""), "ok": True}
    except Exception as e:
        return {"response": str(e), "ok": False}


@router.post("/user/memory")
async def save_user_memory(body: dict, user_id: str = Depends(get_user_id)):
    """Save user memory. Replaces upsert_user_memory RPC."""
    key = body.get("key", "")
    value = body.get("value", "")
    try:
        await execute("""
            INSERT INTO user_memory (user_id, memory_key, memory_data, memory_type, updated_at)
            VALUES ($1::uuid, $2, $3::jsonb, 'engineering', NOW())
            ON CONFLICT (user_id, memory_key) 
            DO UPDATE SET memory_data = $3::jsonb, updated_at = NOW()
        """, user_id, key, f'"{value}"')
        return {"ok": True}
    except Exception as e:
        return {"ok": False, "error": str(e)}
