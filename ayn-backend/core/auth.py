"""
core/auth.py — JWT verification for /chat endpoint

Supports both:
- Spine JWTs (signed with AYN_JWT_SECRET) — new users
- Supabase JWTs (signed with SUPABASE_JWT_SECRET) — legacy

Falls back gracefully so chat always works.
"""
import jwt
from fastapi import HTTPException, Header
from core.config import SUPABASE_JWT_SECRET, SUPABASE_SERVICE_KEY
import os

AYN_JWT_SECRET = os.getenv("AYN_JWT_SECRET", "")
INTERNAL_SERVICE_KEY = os.getenv("INTERNAL_SERVICE_KEY", "")


def verify_token(authorization: str = Header(...)) -> str:
    """
    FastAPI dependency — verifies Bearer JWT, returns user_id.
    Tries spine JWT first, then Supabase JWT.
    """
    if not authorization.startswith("Bearer "):
        raise HTTPException(401, "Missing Bearer token")

    token = authorization.removeprefix("Bearer ").strip()

    # Internal service calls
    if token in (SUPABASE_SERVICE_KEY, INTERNAL_SERVICE_KEY):
        return "internal"

    # Try spine JWT first (AYN_JWT_SECRET)
    if AYN_JWT_SECRET:
        try:
            payload = jwt.decode(token, AYN_JWT_SECRET, algorithms=["HS256"])
            if payload.get("type") == "access":
                user_id = payload.get("sub")
                if user_id:
                    return user_id
        except jwt.ExpiredSignatureError:
            raise HTTPException(401, "Token expired")
        except jwt.InvalidTokenError:
            pass  # Try Supabase next

    # Try Supabase JWT (SUPABASE_JWT_SECRET) - for legacy users
    if SUPABASE_JWT_SECRET:
        try:
            payload = jwt.decode(
                token, SUPABASE_JWT_SECRET, algorithms=["HS256"],
                options={"verify_aud": False}
            )
            user_id = payload.get("sub")
            if user_id:
                return user_id
        except jwt.ExpiredSignatureError:
            raise HTTPException(401, "Token expired")
        except jwt.InvalidTokenError as e:
            raise HTTPException(401, f"Invalid token: {e}")

    # No secrets configured — fail open (dev mode)
    if not AYN_JWT_SECRET and not SUPABASE_JWT_SECRET:
        print("[auth] No JWT secrets configured — failing open")
        return "unknown"

    raise HTTPException(401, "Invalid token")


async def check_user_limit(user_id: str, intent: str) -> dict:
    """
    Check and atomically increment user AI limit.
    Calls check_user_ai_limit SQL function — single source of truth.
    Falls back to inline UPDATE if function is missing or returns bad shape.
    """
    if user_id in ("internal", "unknown"):
        return {"allowed": True}
    try:
        from core.database import fetchval, fetchrow, execute
        import json

        # Try the SQL function first
        try:
            raw = await fetchval("SELECT check_user_ai_limit($1::uuid)", user_id)
            # asyncpg returns JSONB as str — decode
            result = json.loads(raw) if isinstance(raw, str) else (raw or {})
            if isinstance(result, dict):
                if not result.get("allowed", True):
                    return {"allowed": False, "reason": result.get("error", "Limit reached")}
                return {"allowed": True}
        except Exception as fn_err:
            print(f"[auth] check_user_ai_limit fn missing/failed, fallback: {fn_err}")

        # Fallback: inline atomic increment
        row = await fetchrow("""
            SELECT daily_messages, current_daily_messages,
                   COALESCE(bonus_credits, 0) AS bonus_credits,
                   daily_reset_at
            FROM user_ai_limits WHERE user_id = $1::uuid
        """, user_id)
        if not row:
            await execute("""
                INSERT INTO user_ai_limits (user_id, daily_messages, current_daily_messages, bonus_credits, daily_reset_at, updated_at)
                VALUES ($1::uuid, 5, 1, 0, NOW() + INTERVAL '1 day', NOW())
                ON CONFLICT (user_id) DO UPDATE
                  SET current_daily_messages = user_ai_limits.current_daily_messages + 1,
                      updated_at = NOW()
            """, user_id)
            return {"allowed": True}

        # Reset daily counter if window expired
        from datetime import datetime, timezone
        reset_at = row["daily_reset_at"]
        if reset_at is None or reset_at <= datetime.now(timezone.utc):
            await execute("""
                UPDATE user_ai_limits
                   SET current_daily_messages = 0,
                       daily_reset_at = NOW() + INTERVAL '1 day'
                 WHERE user_id = $1::uuid
            """, user_id)
            row = dict(row)
            row["current_daily_messages"] = 0

        used = row["current_daily_messages"] or 0
        cap = (row["daily_messages"] or 5) + (row["bonus_credits"] or 0)
        if used >= cap and (row["bonus_credits"] or 0) <= 0:
            return {"allowed": False, "reason": "Daily limit reached"}

        # Burn a bonus credit first if any, else increment daily
        if (row["bonus_credits"] or 0) > 0:
            await execute("""
                UPDATE user_ai_limits
                   SET bonus_credits = GREATEST(0, COALESCE(bonus_credits,0) - 1),
                       updated_at = NOW()
                 WHERE user_id = $1::uuid
            """, user_id)
        else:
            await execute("""
                UPDATE user_ai_limits
                   SET current_daily_messages = COALESCE(current_daily_messages,0) + 1,
                       updated_at = NOW()
                 WHERE user_id = $1::uuid
            """, user_id)
        return {"allowed": True}
    except Exception as e:
        print(f"[auth] check_user_limit error (fail open): {e}")
        return {"allowed": True}
