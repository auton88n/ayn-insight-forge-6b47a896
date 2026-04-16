"""
routers/auth.py — self-hosted auth endpoints

POST /auth/register
POST /auth/login
POST /auth/refresh
POST /auth/logout
GET  /auth/me
POST /auth/forgot-password
POST /auth/reset-password
"""
import secrets
import logging
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, HTTPException, Depends, Header
from pydantic import BaseModel

from core.database import fetch, fetchrow, execute, fetchval
from core.auth_new import (
    hash_password, verify_password,
    create_access_token, create_refresh_token, verify_access_token,
    get_current_user
)

router = APIRouter(prefix="/auth", tags=["auth"])
log = logging.getLogger("ayn.auth")


# ── Request models ─────────────────────────────────────────────────────────────

class RegisterRequest(BaseModel):
    email: str
    password: str
    first_name: str = ""
    last_name: str = ""

class LoginRequest(BaseModel):
    email: str
    password: str

class RefreshRequest(BaseModel):
    refresh_token: str

class ForgotPasswordRequest(BaseModel):
    email: str

class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str


# ── Helpers ────────────────────────────────────────────────────────────────────

async def _init_user_limits(user_id: str):
    """Create default limits for new user."""
    await execute("""
        INSERT INTO user_ai_limits 
            (user_id, daily_messages, monthly_messages, bonus_credits, 
             current_daily_messages, current_monthly_messages, updated_at)
        VALUES ($1, 5, 5, 0, 0, 0, NOW())
        ON CONFLICT (user_id) DO NOTHING
    """, user_id)

async def _init_user_subscription(user_id: str):
    await execute("""
        INSERT INTO user_subscriptions (user_id, subscription_tier, status, updated_at)
        VALUES ($1, 'free', 'active', NOW())
        ON CONFLICT (user_id) DO NOTHING
    """, user_id)


# ── Endpoints ──────────────────────────────────────────────────────────────────

@router.post("/register")
async def register(req: RegisterRequest):
    # Check email taken
    existing = await fetchval("SELECT id FROM users WHERE email = $1", req.email.lower())
    if existing:
        raise HTTPException(400, "Email already registered")

    if len(req.password) < 8:
        raise HTTPException(400, "Password must be at least 8 characters")

    # Create user
    user_id = await fetchval("""
        INSERT INTO users (email, password_hash, first_name, last_name, created_at, updated_at)
        VALUES ($1, $2, $3, $4, NOW(), NOW())
        RETURNING id
    """, req.email.lower(), hash_password(req.password), req.first_name, req.last_name)

    # Initialize limits + subscription
    await _init_user_limits(str(user_id))
    await _init_user_subscription(str(user_id))

    access_token = create_access_token(str(user_id), req.email.lower())
    refresh_token = await create_refresh_token(str(user_id))

    log.info(f"[auth] Registered: {req.email}")
    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "token_type": "bearer",
        "user": {"id": str(user_id), "email": req.email.lower(),
                 "first_name": req.first_name, "last_name": req.last_name}
    }


@router.post("/login")
async def login(req: LoginRequest):
    user = await fetchrow(
        "SELECT id, email, password_hash, first_name, last_name FROM users WHERE email = $1",
        req.email.lower()
    )
    if not user or not verify_password(req.password, user["password_hash"]):
        raise HTTPException(401, "Invalid email or password")

    access_token = create_access_token(str(user["id"]), user["email"])
    refresh_token = await create_refresh_token(str(user["id"]))

    log.info(f"[auth] Login: {req.email}")
    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "token_type": "bearer",
        "user": {
            "id": str(user["id"]), "email": user["email"],
            "first_name": user["first_name"] or "", "last_name": user["last_name"] or ""
        }
    }


@router.post("/refresh")
async def refresh_token(req: RefreshRequest):
    session = await fetchrow("""
        SELECT user_id, expires_at FROM user_sessions
        WHERE refresh_token = $1
    """, req.refresh_token)

    if not session:
        raise HTTPException(401, "Invalid refresh token")
    if session["expires_at"] < datetime.now(timezone.utc):
        await execute("DELETE FROM user_sessions WHERE refresh_token = $1", req.refresh_token)
        raise HTTPException(401, "Refresh token expired — please log in again")

    user = await fetchrow("SELECT id, email FROM users WHERE id = $1", session["user_id"])
    if not user:
        raise HTTPException(401, "User not found")

    # Rotate refresh token
    await execute("DELETE FROM user_sessions WHERE refresh_token = $1", req.refresh_token)
    new_refresh = await create_refresh_token(str(user["id"]))
    access_token = create_access_token(str(user["id"]), user["email"])

    return {
        "access_token": access_token,
        "refresh_token": new_refresh,
        "token_type": "bearer"
    }


@router.post("/logout")
async def logout(req: RefreshRequest):
    await execute("DELETE FROM user_sessions WHERE refresh_token = $1", req.refresh_token)
    return {"ok": True}


@router.get("/me")
async def me(current_user: dict = Depends(get_current_user)):
    user = await fetchrow("""
        SELECT u.id, u.email, u.first_name, u.last_name, u.created_at,
               s.subscription_tier, s.status as subscription_status,
               l.daily_messages, l.current_daily_messages,
               l.monthly_messages, l.bonus_credits
        FROM users u
        LEFT JOIN user_subscriptions s ON s.user_id = u.id
        LEFT JOIN user_ai_limits l ON l.user_id = u.id
        WHERE u.id = $1
    """, current_user["user_id"])

    if not user:
        raise HTTPException(404, "User not found")

    return {
        "id": str(user["id"]),
        "email": user["email"],
        "first_name": user["first_name"] or "",
        "last_name": user["last_name"] or "",
        "subscription": {
            "tier": user["subscription_tier"] or "free",
            "status": user["subscription_status"] or "active",
        },
        "limits": {
            "daily_messages": user["daily_messages"] or 5,
            "current_daily_messages": user["current_daily_messages"] or 0,
            "monthly_messages": user["monthly_messages"] or 5,
            "bonus_credits": user["bonus_credits"] or 0,
        }
    }


@router.post("/forgot-password")
async def forgot_password(req: ForgotPasswordRequest):
    user = await fetchrow("SELECT id, email FROM users WHERE email = $1", req.email.lower())
    # Always return success (don't leak email existence)
    if user:
        reset_token = secrets.token_urlsafe(32)
        expire = datetime.now(timezone.utc) + timedelta(hours=2)
        await execute("""
            INSERT INTO password_reset_tokens (user_id, token, expires_at, created_at)
            VALUES ($1, $2, $3, NOW())
            ON CONFLICT (user_id) DO UPDATE SET token=$2, expires_at=$3
        """, user["id"], reset_token, expire)
        # TODO: send email via spine email service
        log.info(f"[auth] Password reset requested: {req.email} token={reset_token}")
    return {"ok": True, "message": "If that email exists, a reset link has been sent"}


@router.post("/reset-password")
async def reset_password(req: ResetPasswordRequest):
    record = await fetchrow("""
        SELECT user_id, expires_at FROM password_reset_tokens WHERE token = $1
    """, req.token)

    if not record or record["expires_at"] < datetime.now(timezone.utc):
        raise HTTPException(400, "Invalid or expired reset token")

    if len(req.new_password) < 8:
        raise HTTPException(400, "Password must be at least 8 characters")

    await execute(
        "UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2",
        hash_password(req.new_password), record["user_id"]
    )
    await execute("DELETE FROM password_reset_tokens WHERE token = $1", req.token)
    # Invalidate all sessions
    await execute("DELETE FROM user_sessions WHERE user_id = $1", record["user_id"])

    return {"ok": True, "message": "Password reset successfully — please log in"}
