"""
core/auth.py — JWT verification and credit limit check

Verifies Supabase JWT locally (no round-trip).
Same logic as ayn-unified index.ts auth block.
"""
import jwt
from fastapi import HTTPException, Header
from core.config import SUPABASE_JWT_SECRET, SUPABASE_URL, SUPABASE_SERVICE_KEY
from core.db import get_db


def verify_token(authorization: str = Header(...)) -> str:
    """
    FastAPI dependency — verifies Bearer JWT, returns user_id.
    Raises 401 if invalid.
    """
    if not authorization.startswith("Bearer "):
        raise HTTPException(401, "Missing Bearer token")

    token = authorization.removeprefix("Bearer ").strip()

    # Internal service call (from cron jobs etc.)
    if token == SUPABASE_SERVICE_KEY:
        return "internal"

    try:
        payload = jwt.decode(
            token,
            SUPABASE_JWT_SECRET,
            algorithms=["HS256"],
            options={"verify_aud": False},  # Supabase non-standard aud
        )
        user_id = payload.get("sub")
        if not user_id:
            raise HTTPException(401, "Invalid token: no sub")
        return user_id
    except jwt.ExpiredSignatureError:
        raise HTTPException(401, "Token expired")
    except jwt.InvalidTokenError as e:
        raise HTTPException(401, f"Invalid token: {e}")


async def check_user_limit(user_id: str, intent: str) -> dict:
    """
    Check and atomically increment user AI limit.
    Mirrors checkUserLimit from contextBuilder.ts.
    Calls check_user_ai_limit RPC — single source of truth.
    Fails open (returns allowed=True) on any DB error.
    """
    if user_id == "internal":
        return {"allowed": True}
    try:
        db = get_db()
        result = db.rpc("check_user_ai_limit", {
            "_user_id": user_id,
            "_intent_type": intent or "chat",
        }).execute()
        data = result.data
        if not data or not data.get("allowed"):
            return {"allowed": False, "reason": data.get("error", "Limit reached") if data else "Limit reached"}
        return {"allowed": True}
    except Exception as e:
        print(f"[auth] check_user_limit error (fail open): {e}")
        return {"allowed": True}
