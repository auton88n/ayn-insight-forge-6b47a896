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
    Fails open on any DB error.
    """
    if user_id in ("internal", "unknown"):
        return {"allowed": True}
    try:
        from core.database import fetchval
        result = await fetchval(
            "SELECT check_user_ai_limit($1::uuid)",
            user_id
        )
        if not result or not result.get("allowed"):
            return {
                "allowed": False,
                "reason": result.get("error", "Limit reached") if result else "Limit reached"
            }
        return {"allowed": True}
    except Exception as e:
        print(f"[auth] check_user_limit error (fail open): {e}")
        return {"allowed": True}
