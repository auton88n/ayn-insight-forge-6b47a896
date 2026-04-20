from typing import Any, Optional, List
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
from core.database import fetch, fetchrow, fetchval, execute
from fastapi import HTTPException

router = APIRouter(prefix="/user", tags=["user"])
log = logging.getLogger("ayn.user")


@router.get("/limits")
async def get_limits(user_id: str = Depends(get_user_id)):
    """Get user AI limits + subscription — single row guaranteed."""
    row = await fetchrow("""
        SELECT 
            COALESCE(l.daily_messages, 5)            AS daily_messages,
            COALESCE(l.current_daily_messages, 0)    AS current_daily_messages,
            COALESCE(l.monthly_messages, 5)          AS monthly_messages,
            COALESCE(l.current_monthly_messages, 0)  AS current_monthly_messages,
            COALESCE(l.bonus_credits, 0)             AS bonus_credits,
            l.daily_reset_at, l.monthly_reset_at, l.updated_at,
            COALESCE((SELECT subscription_tier FROM user_subscriptions
                      WHERE user_id = $1::uuid
                      ORDER BY updated_at DESC NULLS LAST LIMIT 1), 'free') AS subscription_tier,
            COALESCE((SELECT status FROM user_subscriptions
                      WHERE user_id = $1::uuid
                      ORDER BY updated_at DESC NULLS LAST LIMIT 1), 'active') AS subscription_status
        FROM user_ai_limits l
        WHERE l.user_id = $1::uuid
    """, user_id)

    if not row:
        # Auto-create limits for new user
        await execute("""
            INSERT INTO user_ai_limits (user_id, daily_messages, current_daily_messages, 
                monthly_messages, bonus_credits, daily_reset_at, updated_at)
            VALUES ($1::uuid, 5, 0, 5, 0, NOW() + INTERVAL '1 day', NOW())
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


# ── Avatar Upload (base64 JSON) ──────────────────────────────────────────────

class AvatarRequest(BaseModel):
    avatar_data: str  # base64 encoded image
    mime_type: str = "image/jpeg"

@router.post("/avatar")
async def upload_avatar(req: AvatarRequest, user_id: str = Depends(get_user_id)):
    import os, base64
    # Validate it's actual base64
    try:
        data = base64.b64decode(req.avatar_data)
    except Exception:
        raise HTTPException(400, "Invalid base64 data")
    
    ext = "jpg" if "jpeg" in req.mime_type else req.mime_type.split("/")[-1]
    avatar_dir = "/tmp/avatars"
    os.makedirs(avatar_dir, exist_ok=True)
    filename = f"{user_id}.{ext}"
    with open(f"{avatar_dir}/{filename}", 'wb') as f:
        f.write(data)
    
    avatar_url = f"https://spine.aynn.io/user/avatar/{filename}"
    await execute("UPDATE users SET avatar_url = $1, updated_at = NOW() WHERE id = $2",
                  avatar_url, user_id)
    return {"avatar_url": avatar_url, "ok": True}


@router.get("/avatar/{filename}")
async def get_avatar(filename: str):
    import os
    from fastapi.responses import FileResponse
    path = f"/tmp/avatars/{filename}"
    if not os.path.exists(path):
        raise HTTPException(404, "Not found")
    return FileResponse(path)


# ── Contact form ──────────────────────────────────────────────────────────────
class ContactRequest(BaseModel):
    name: str
    email: str
    message: str
    subject: str = ""

@router.post("/contact")
async def submit_contact(req: ContactRequest):
    await execute("""
        INSERT INTO contact_messages (name, email, message, status, created_at)
        VALUES ($1, $2, $3, 'unread', NOW())
    """, req.name, req.email, req.message)
    return {"ok": True}


# ── Memory CRUD ────────────────────────────────────────────────────────────────

class MemoryUpsertRequest(BaseModel):
    key: str
    value: Any
    memory_type: str = "user"

@router.get("/memory")
async def get_user_memory(user_id: str = Depends(get_user_id)):
    """Get all user memory entries."""
    try:
        rows = await fetch(
            "SELECT memory_key, memory_data, memory_type, updated_at FROM user_memory WHERE user_id = $1::uuid",
            user_id
        )
        return {"memory": [dict(r) for r in rows] if rows else []}
    except Exception as e:
        return {"memory": []}

@router.post("/memory")
async def upsert_user_memory(req: MemoryUpsertRequest, user_id: str = Depends(get_user_id)):
    """Upsert a memory entry. Replaces upsert_user_memory RPC."""
    try:
        import json
        val = json.dumps(req.value) if not isinstance(req.value, str) else f'"{req.value}"'
        await execute("""
            INSERT INTO user_memory (user_id, memory_key, memory_data, memory_type, updated_at)
            VALUES ($1::uuid, $2, $3::jsonb, $4, NOW())
            ON CONFLICT (user_id, memory_key)
            DO UPDATE SET memory_data = $3::jsonb, memory_type = $4, updated_at = NOW()
        """, user_id, req.key, val, req.memory_type)
        return {"ok": True}
    except Exception as e:
        raise HTTPException(500, str(e))

@router.delete("/memory/{key}")
async def delete_user_memory(key: str, user_id: str = Depends(get_user_id)):
    """Delete a memory entry."""
    try:
        await execute(
            "DELETE FROM user_memory WHERE user_id = $1::uuid AND memory_key = $2",
            user_id, key
        )
        return {"ok": True}
    except Exception as e:
        raise HTTPException(500, str(e))


# ── Settings / Preferences ─────────────────────────────────────────────────────

class SettingsRequest(BaseModel):
    settings: dict

@router.get("/settings")
async def get_user_settings(user_id: str = Depends(get_user_id)):
    try:
        row = await fetchrow(
            "SELECT settings FROM user_settings WHERE user_id = $1::uuid", user_id
        )
        return {"settings": row["settings"] if row else {}}
    except Exception:
        return {"settings": {}}

@router.post("/settings")
async def save_user_settings(req: SettingsRequest, user_id: str = Depends(get_user_id)):
    try:
        import json
        await execute("""
            INSERT INTO user_settings (user_id, settings, updated_at)
            VALUES ($1::uuid, $2::jsonb, NOW())
            ON CONFLICT (user_id) DO UPDATE SET settings = $2::jsonb, updated_at = NOW()
        """, user_id, json.dumps(req.settings))
        return {"ok": True}
    except Exception as e:
        raise HTTPException(500, str(e))

@router.get("/preferences")
async def get_user_preferences(user_id: str = Depends(get_user_id)):
    try:
        from core.database import fetchrow
        row = await fetchrow("SELECT * FROM user_preferences WHERE user_id=$1::uuid", user_id)
        return {"preferences": dict(row) if row else {}}
    except Exception:
        return {"preferences": {}}

@router.post("/preferences")
async def save_user_preferences(body: dict, user_id: str = Depends(get_user_id)):
    try:
        from core.database import execute
        import json as _json
        cols = ["user_id"] + [k for k in body.keys() if k.isidentifier()]
        vals = [user_id] + [_json.dumps(v) if isinstance(v, (dict, list)) else v
                            for k, v in body.items() if k.isidentifier()]
        ph = ", ".join(f"${i+1}" for i in range(len(cols)))
        cn = ", ".join(f'"{c}"' for c in cols)
        updates = ", ".join(f'"{c}"=${i+2}' for i, c in enumerate(cols[1:]))
        await execute(
            f"INSERT INTO user_preferences ({cn}) VALUES ({ph}) "
            f"ON CONFLICT (user_id) DO UPDATE SET {updates}",
            *vals)
        return {"ok": True}
    except Exception as e:
        raise HTTPException(500, str(e))


# ── Beta Feedback ──────────────────────────────────────────────────────────────

class BetaFeedbackRequest(BaseModel):
    overall_rating: int = 5
    favorite_features: list = []
    improvement_suggestions: str = ""
    bugs_encountered: str = ""
    would_recommend: bool = True
    additional_comments: str = ""
    credits_awarded: int = 50

@router.post("/beta-feedback")
async def submit_beta_feedback(req: BetaFeedbackRequest, user_id: str = Depends(get_user_id)):
    """Save beta feedback to Railway PG and atomically award bonus credits."""
    try:
        import json
        # 1) Insert/upsert feedback row in Railway PG
        await execute("""
            INSERT INTO beta_feedback
                (user_id, overall_rating, favorite_features, improvement_suggestions,
                 bugs_encountered, would_recommend, additional_comments, credits_awarded, created_at)
            VALUES ($1::uuid, $2, $3::jsonb, $4, $5, $6, $7, $8, NOW())
            ON CONFLICT (user_id) DO UPDATE SET
                overall_rating          = EXCLUDED.overall_rating,
                favorite_features       = EXCLUDED.favorite_features,
                improvement_suggestions = EXCLUDED.improvement_suggestions,
                bugs_encountered        = EXCLUDED.bugs_encountered,
                would_recommend         = EXCLUDED.would_recommend,
                additional_comments     = EXCLUDED.additional_comments,
                credits_awarded         = EXCLUDED.credits_awarded,
                updated_at              = NOW()
        """,
            user_id, req.overall_rating,
            json.dumps(req.favorite_features or []),
            req.improvement_suggestions or "",
            req.bugs_encountered or "",
            req.would_recommend,
            req.additional_comments or "",
            req.credits_awarded,
        )

        # 2) Ensure limits row exists, then add bonus credits atomically
        await execute("""
            INSERT INTO user_ai_limits (user_id, daily_messages, current_daily_messages, bonus_credits, updated_at)
            VALUES ($1::uuid, 5, 0, $2, NOW())
            ON CONFLICT (user_id) DO UPDATE
              SET bonus_credits = COALESCE(user_ai_limits.bonus_credits, 0) + $2,
                  updated_at = NOW()
        """, user_id, req.credits_awarded)

        new_balance = await fetchval(
            "SELECT COALESCE(bonus_credits,0) FROM user_ai_limits WHERE user_id = $1::uuid",
            user_id,
        )
        return {"ok": True, "new_balance": new_balance or 0, "credits_awarded": req.credits_awarded}
    except Exception as e:
        log.error(f"[beta-feedback] failed user={user_id[:8]}: {e}")
        raise HTTPException(500, str(e))

@router.post("/profile")
async def update_user_profile(body: dict, user_id: str = Depends(get_user_id)):
    """Update user profile fields."""
    try:
        allowed = {k: v for k, v in body.items() if k in ("first_name","last_name","company_name","business_type")}
        if allowed:
            sets = ", ".join(f"{k} = ${i+2}" for i, k in enumerate(allowed.keys()))
            vals = list(allowed.values())
            await execute(
                f"UPDATE users SET {sets}, updated_at = NOW() WHERE id = $1::uuid",
                user_id, *vals
            )
        return {"ok": True}
    except Exception as e:
        raise HTTPException(500, str(e))


# ── Account deletion ───────────────────────────────────────────────────────────
@router.delete("/account")
async def delete_account(user_id: str = Depends(get_user_id)):
    """Permanently delete user account and all data."""
    try:
        # Delete in order (FK constraints)
        for table in ["messages", "chat_sessions", "user_memory", "user_ai_limits",
                      "user_subscriptions", "user_settings", "user_preferences",
                      "pinned_chats", "beta_feedback", "user_sessions"]:
            try:
                await execute(f"DELETE FROM {table} WHERE user_id=$1::uuid", user_id)
            except Exception:
                pass
        await execute("DELETE FROM users WHERE id=$1::uuid", user_id)
        return {"ok": True}
    except Exception as e:
        raise HTTPException(500, str(e))


# ── Memory by ID ───────────────────────────────────────────────────────────────
@router.delete("/memory/by-id/{memory_id}")
async def delete_memory_by_id(memory_id: str, user_id: str = Depends(get_user_id)):
    """Delete a specific memory by its ID."""
    await execute(
        "DELETE FROM user_memory WHERE id=$1::uuid AND user_id=$2::uuid",
        memory_id, user_id)
    return {"ok": True}


# ── Beta feedback exists check ────────────────────────────────────────────────
@router.get("/beta-feedback/exists")
async def beta_feedback_exists(user_id: str = Depends(get_user_id)):
    """Check if user has already submitted beta feedback."""
    count = await fetchval(
        "SELECT COUNT(*) FROM beta_feedback WHERE user_id=$1::uuid", user_id)
    return {"exists": (count or 0) > 0}


# ── User feedback (general) ───────────────────────────────────────────────────
@router.post("/feedback")
async def submit_feedback(body: dict, user_id: str = Depends(get_user_id)):
    """Submit general feedback."""
    try:
        import json as _json
        await execute("""
            INSERT INTO beta_feedback (user_id, overall_rating, additional_comments, created_at)
            VALUES ($1::uuid, $2, $3, NOW())
            ON CONFLICT (user_id) DO UPDATE SET
                additional_comments = EXCLUDED.additional_comments,
                updated_at = NOW()
        """, user_id,
            body.get("rating", 5),
            body.get("comment", body.get("message", "")))
        return {"ok": True}
    except Exception as e:
        log.error(f"[feedback] {e}")
        return {"ok": False, "error": str(e)}


# ── Chart analyses ────────────────────────────────────────────────────────────
@router.get("/chart-analyses")
async def get_chart_analyses(user_id: str = Depends(get_user_id),
                              limit: int = 20, offset: int = 0):
    """Get user's chart analysis history."""
    rows = await fetch(
        "SELECT * FROM chart_analyses WHERE user_id=$1::uuid "
        "ORDER BY created_at DESC LIMIT $2 OFFSET $3",
        user_id, limit, offset)
    return {"analyses": [dict(r) for r in rows]}
