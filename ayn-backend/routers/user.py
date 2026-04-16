"""
routers/user.py — user profile, limits, settings
GET  /user/limits       — ai limits + subscription tier
POST /user/limits/reset — reset daily usage (internal)
GET  /user/profile      — full profile
PUT  /user/profile      — update profile
POST /user/terms        — accept terms
"""
import logging
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from core.auth_new import get_user_id, get_current_user
from core.database import fetch, fetchrow, execute

router = APIRouter(prefix="/user", tags=["user"])
log = logging.getLogger("ayn.user")


@router.get("/limits")
async def get_limits(user_id: str = Depends(get_user_id)):
    """Get user AI limits + subscription — replaces direct supabase.from('user_ai_limits')"""
    row = await fetchrow("""
        SELECT 
            l.daily_messages, l.current_daily_messages,
            l.monthly_messages, l.current_monthly_messages,
            l.bonus_credits, l.daily_reset_at, l.monthly_reset_at,
            l.updated_at,
            COALESCE(s.subscription_tier, 'free') as subscription_tier,
            COALESCE(s.status, 'active') as subscription_status
        FROM user_ai_limits l
        LEFT JOIN user_subscriptions s ON s.user_id = l.user_id
        WHERE l.user_id = $1
    """, user_id)

    if not row:
        # Auto-create limits for new user
        await execute("""
            INSERT INTO user_ai_limits (user_id, daily_messages, current_daily_messages, 
                monthly_messages, bonus_credits, updated_at)
            VALUES ($1, 5, 0, 5, 0, NOW())
            ON CONFLICT (user_id) DO NOTHING
        """, user_id)
        return {
            "daily_messages": 5, "current_daily_messages": 0,
            "monthly_messages": 5, "current_monthly_messages": 0,
            "bonus_credits": 0, "daily_reset_at": None, "monthly_reset_at": None,
            "subscription_tier": "free", "subscription_status": "active"
        }

    return dict(row)


@router.get("/profile")
async def get_profile(current_user: dict = Depends(get_current_user)):
    user_id = current_user["user_id"]
    row = await fetchrow("""
        SELECT u.id, u.email, u.first_name, u.last_name, u.avatar_url, u.is_admin,
               COALESCE(s.subscription_tier, 'free') as subscription_tier,
               l.daily_messages, l.current_daily_messages, l.bonus_credits
        FROM users u
        LEFT JOIN user_subscriptions s ON s.user_id = u.id
        LEFT JOIN user_ai_limits l ON l.user_id = u.id
        WHERE u.id = $1
    """, user_id)
    if not row:
        return {"id": user_id, "email": current_user["email"]}
    return dict(row)


class TermsRequest(BaseModel):
    privacy: bool = True
    terms: bool = True
    ai_disclaimer: bool = True

@router.post("/terms")
async def accept_terms(req: TermsRequest, user_id: str = Depends(get_user_id)):
    await execute("""
        INSERT INTO user_settings (user_id, settings, updated_at)
        VALUES ($1, '{"has_accepted_terms": true}', NOW())
        ON CONFLICT (user_id) DO UPDATE 
        SET settings = user_settings.settings || '{"has_accepted_terms": true}',
            updated_at = NOW()
    """, user_id)
    return {"ok": True}


# ── Pinned Chats ──────────────────────────────────────────────────────────────

@router.get("/pinned-chats")
async def get_pinned_chats(user_id: str = Depends(get_user_id)):
    rows = await fetch("""
        SELECT p.session_id, COALESCE(p.title, cs.title, 'Chat') as title, p.pinned_at
        FROM pinned_chats p
        LEFT JOIN chat_sessions cs ON cs.session_id = p.session_id
        WHERE p.user_id = $1
        ORDER BY p.pinned_at DESC
    """, user_id)
    return rows or []


class PinChatRequest(BaseModel):
    session_id: str
    title: str = ""

@router.post("/pinned-chats")
async def pin_chat(req: PinChatRequest, user_id: str = Depends(get_user_id)):
    await execute("""
        INSERT INTO pinned_chats (user_id, session_id, title, pinned_at)
        VALUES ($1, $2, $3, NOW())
        ON CONFLICT (user_id, session_id) DO NOTHING
    """, user_id, req.session_id, req.title)
    return {"ok": True}


@router.delete("/pinned-chats/{session_id}")
async def unpin_chat(session_id: str, user_id: str = Depends(get_user_id)):
    await execute(
        "DELETE FROM pinned_chats WHERE user_id = $1 AND session_id = $2",
        user_id, session_id
    )
    return {"ok": True}


# ── Avatar Upload ─────────────────────────────────────────────────────────────
import os, uuid, base64
from fastapi import UploadFile, File as FastAPIFile

AVATAR_DIR = "/tmp/avatars"
os.makedirs(AVATAR_DIR, exist_ok=True)

@router.post("/avatar")
async def upload_avatar(file: UploadFile = FastAPIFile(...), user_id: str = Depends(get_user_id)):
    # Save file
    ext = file.filename.split('.')[-1] if '.' in (file.filename or '') else 'jpg'
    filename = f"{user_id}.{ext}"
    path = f"{AVATAR_DIR}/{filename}"
    content = await file.read()
    with open(path, 'wb') as f:
        f.write(content)
    
    # Store as base64 data URL in user record
    b64 = base64.b64encode(content).decode()
    mime = file.content_type or 'image/jpeg'
    avatar_url = f"data:{mime};base64,{b64[:100]}..."  # truncated for DB
    
    # Just store a reference - in production use R2/S3
    await execute(
        "UPDATE users SET avatar_url = $1, updated_at = NOW() WHERE id = $2",
        f"/avatars/{filename}", user_id
    )
    return {"avatar_url": f"/avatars/{filename}", "ok": True}


@router.get("/avatar/{filename}")
async def get_avatar(filename: str):
    from fastapi.responses import FileResponse
    path = f"{AVATAR_DIR}/{filename}"
    if not os.path.exists(path):
        raise HTTPException(404, "Avatar not found")
    return FileResponse(path)
