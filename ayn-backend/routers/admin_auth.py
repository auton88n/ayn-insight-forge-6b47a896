"""
routers/admin_auth.py — Admin-specific auth endpoints

POST /admin/login    → verifies credentials + admin status → returns JWT with is_admin: true
POST /admin/refresh  → rotates tokens
POST /admin/logout   → invalidates session
GET  /admin/session  → validates current admin token

Frontend stores tokens under: ayn_admin_token / ayn_admin_refresh_token / ayn_admin_user
(separate namespace from regular user tokens)

This allows full removal of adminSupabase.ts from the frontend.
"""
import logging
from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException, Header
from pydantic import BaseModel

from core.database import fetchrow, execute
from core.security import is_admin_user_id
from core.auth_new import (
    hash_password, verify_password,
    create_access_token, create_refresh_token, verify_access_token
)

router = APIRouter(prefix="/admin", tags=["admin-auth"])
log = logging.getLogger("ayn.admin_auth")


# ── Request models ─────────────────────────────────────────────────────────────

class AdminLoginRequest(BaseModel):
    email: str
    password: str

class AdminRefreshRequest(BaseModel):
    refresh_token: str


# ── Admin check helper ─────────────────────────────────────────────────────────

async def _is_admin(user_id: str, email: str) -> bool:
    """Check admin status from explicit DB flag only."""
    return await is_admin_user_id(user_id)


# ── Endpoints ──────────────────────────────────────────────────────────────────

@router.post("/login")
async def admin_login(req: AdminLoginRequest):
    """
    Admin login. Verifies credentials AND admin status.
    Returns JWT with is_admin: true claim.
    Frontend stores under ayn_admin_token (separate from main app tokens).
    """
    user = await fetchrow(
        "SELECT id, email, password_hash, first_name, last_name FROM users WHERE email = $1",
        req.email.lower()
    )
    if not user or not verify_password(req.password, user["password_hash"]):
        raise HTTPException(401, "Invalid email or password")

    user_id = str(user["id"])
    email = user["email"]

    # Verify admin
    if not await _is_admin(user_id, email):
        raise HTTPException(403, "Access denied — admin only")

    # Issue tokens with is_admin claim
    access_token = create_access_token(user_id, email, is_admin=True)
    refresh_token = await create_refresh_token(user_id)

    log.info(f"[admin-auth] Admin login: {email}")
    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "token_type": "bearer",
        "user": {
            "id": user_id,
            "email": email,
            "first_name": user["first_name"] or "",
            "last_name": user["last_name"] or "",
            "is_admin": True,
        }
    }


@router.post("/refresh")
async def admin_refresh(req: AdminRefreshRequest):
    """Refresh admin tokens."""
    session = await fetchrow("""
        SELECT user_id, expires_at FROM user_sessions
        WHERE refresh_token = $1
    """, req.refresh_token)

    if not session:
        raise HTTPException(401, "Invalid refresh token")
    if session["expires_at"] < datetime.now(timezone.utc):
        await execute("DELETE FROM user_sessions WHERE refresh_token = $1", req.refresh_token)
        raise HTTPException(401, "Session expired — please log in again")

    user = await fetchrow(
        "SELECT id, email FROM users WHERE id = $1", session["user_id"]
    )
    if not user:
        raise HTTPException(401, "User not found")

    user_id = str(user["id"])
    email = user["email"]

    # Re-verify admin on refresh (security: admin status may have changed)
    if not await _is_admin(user_id, email):
        raise HTTPException(403, "Access denied — admin only")

    # Rotate tokens
    await execute("DELETE FROM user_sessions WHERE refresh_token = $1", req.refresh_token)
    new_refresh = await create_refresh_token(user_id)
    access_token = create_access_token(user_id, email, is_admin=True)

    return {
        "access_token": access_token,
        "refresh_token": new_refresh,
        "token_type": "bearer",
    }


@router.post("/logout")
async def admin_logout(req: AdminRefreshRequest):
    """Invalidate admin session."""
    await execute("DELETE FROM user_sessions WHERE refresh_token = $1", req.refresh_token)
    return {"ok": True}


@router.get("/session")
async def admin_session(authorization: str = Header(...)):
    """
    Validate current admin token.
    Returns user info if valid admin JWT, 401 otherwise.
    """
    if not authorization.startswith("Bearer "):
        raise HTTPException(401, "Missing Bearer token")
    token = authorization.removeprefix("Bearer ").strip()

    try:
        payload = verify_access_token(token)
    except HTTPException:
        raise HTTPException(401, "Invalid or expired token")

    if not payload.get("is_admin"):
        raise HTTPException(403, "Not an admin token")

    user = await fetchrow(
        "SELECT id, email, first_name, last_name FROM users WHERE id = $1::uuid",
        payload["sub"]
    )
    if not user:
        raise HTTPException(401, "User not found")

    return {
        "user": {
            "id": str(user["id"]),
            "email": user["email"],
            "first_name": user["first_name"] or "",
            "last_name": user["last_name"] or "",
            "is_admin": True,
        }
    }
