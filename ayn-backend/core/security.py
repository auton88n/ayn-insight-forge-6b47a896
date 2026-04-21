"""
core/security.py — shared security dependencies
"""
import os
from fastapi import Depends, Header, HTTPException
from core.auth_new import get_current_user
from core.database import fetchval


async def is_admin_user_id(user_id: str) -> bool:
    """Return True only when the user has explicit admin privileges."""
    if user_id == "internal":
        return True
    try:
        return bool(await fetchval("SELECT is_admin FROM users WHERE id = $1::uuid", user_id))
    except Exception:
        return False


async def require_admin_user(current_user: dict = Depends(get_current_user)) -> dict:
    """Require authenticated admin user."""
    user_id = current_user.get("user_id", "")
    if current_user.get("is_admin") and user_id:
        return current_user
    if await is_admin_user_id(user_id):
        return {**current_user, "is_admin": True}
    raise HTTPException(403, "Admin access required")


def require_internal_service(authorization: str = Header(...)) -> str:
    """
    Require INTERNAL_SERVICE_KEY bearer token for machine-to-machine endpoints.
    """
    if not authorization.startswith("Bearer "):
        raise HTTPException(401, "Missing Bearer token")
    token = authorization.removeprefix("Bearer ").strip()
    internal_key = os.getenv("INTERNAL_SERVICE_KEY", "")
    if not internal_key or token != internal_key:
        raise HTTPException(403, "Internal service access required")
    return "internal"
