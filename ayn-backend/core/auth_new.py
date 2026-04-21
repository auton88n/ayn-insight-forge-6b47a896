"""
core/auth_new.py — self-hosted JWT auth (replaces Supabase auth)

Issues our own JWTs, stores refresh tokens in DB.
Replaces Supabase Auth entirely.
"""
import os
import secrets
import hashlib
import logging
from datetime import datetime, timedelta, timezone
from typing import Optional

import bcrypt
import jwt
from fastapi import HTTPException, Header

from core.database import fetch, fetchrow, execute, fetchval

log = logging.getLogger("ayn.auth")

# JWT config
JWT_SECRET = os.getenv("AYN_JWT_SECRET", "")
JWT_ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24       # 24h
REFRESH_TOKEN_EXPIRE_DAYS = 30

if not JWT_SECRET:
    log.error("[auth] AYN_JWT_SECRET not set — authentication disabled until configured")


# ── Token creation ─────────────────────────────────────────────────────────────

def create_access_token(user_id: str, email: str, is_admin: bool = False) -> str:
    if not JWT_SECRET:
        raise HTTPException(500, "Auth not configured")
    expire = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    payload = {"sub": user_id, "email": email, "exp": expire, "type": "access"}
    if is_admin:
        payload["is_admin"] = True
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


async def create_refresh_token(user_id: str) -> str:
    token = secrets.token_urlsafe(64)
    expire = datetime.now(timezone.utc) + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)
    await execute(
        """INSERT INTO user_sessions (user_id, refresh_token, expires_at, created_at)
           VALUES ($1, $2, $3, NOW())
           ON CONFLICT DO NOTHING""",
        user_id, token, expire
    )
    return token


def verify_access_token(token: str) -> dict:
    if not JWT_SECRET:
        raise HTTPException(500, "Auth not configured")
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        if payload.get("type") != "access":
            raise HTTPException(401, "Invalid token type")
        return payload
    except jwt.ExpiredSignatureError:
        raise HTTPException(401, "Token expired")
    except jwt.InvalidTokenError as e:
        raise HTTPException(401, f"Invalid token: {e}")


# ── FastAPI dependency ─────────────────────────────────────────────────────────

async def get_current_user(authorization: str = Header(...)) -> dict:
    """FastAPI dependency — returns {"user_id": ..., "email": ...}"""
    if not authorization.startswith("Bearer "):
        raise HTTPException(401, "Missing Bearer token")
    token = authorization.removeprefix("Bearer ").strip()

    # Internal service calls
    internal_key = os.getenv("INTERNAL_SERVICE_KEY", "")
    if internal_key and token == internal_key:
        return {"user_id": "internal", "email": "internal@aynn.io"}

    payload = verify_access_token(token)
    return {
        "user_id": payload["sub"],
        "email": payload.get("email", ""),
        "is_admin": bool(payload.get("is_admin", False)),
    }


async def get_user_id(authorization: str = Header(...)) -> str:
    user = await get_current_user(authorization)
    return user["user_id"]


# ── Password ───────────────────────────────────────────────────────────────────

def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def verify_password(password: str, hashed: str) -> bool:
    return bcrypt.checkpw(password.encode(), hashed.encode())


async def get_user_id_optional(authorization: str = Header(default="")) -> str:
    """Like get_user_id but returns 'anonymous' if no token provided."""
    if not authorization or not authorization.startswith("Bearer "):
        return "anonymous"
    try:
        token = authorization.removeprefix("Bearer ").strip()
        payload = verify_access_token(token)
        return str(payload.get("sub", "anonymous"))
    except Exception:
        return "anonymous"
