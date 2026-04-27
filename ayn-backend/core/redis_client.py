"""Shared Redis client for distributed coordination (rate limit, pubsub, queues)."""
import os
import logging
from typing import Optional

log = logging.getLogger("ayn.redis")

Redis = object
_redis: Optional[object] = None


def redis_required() -> bool:
    env = os.getenv("APP_ENV", "development").lower()
    explicit = os.getenv("REDIS_REQUIRED", "").lower() in {"1", "true", "yes", "on"}
    return explicit or env == "production"


async def get_redis() -> Optional[Redis]:
    global _redis
    if _redis is not None:
        return _redis

    url = os.getenv("REDIS_URL", "").strip()
    if not url:
        if redis_required():
            raise RuntimeError("REDIS_URL is required in strict/production mode")
        return None

    try:
        from redis.asyncio import Redis as _Redis
    except Exception:
        if redis_required():
            raise RuntimeError("redis package not installed but REDIS is required")
        return None

    _redis = _Redis.from_url(url, encoding="utf-8", decode_responses=True)
    try:
        await _redis.ping()
    except Exception:
        _redis = None
        if redis_required():
            raise
        log.warning("[redis] unavailable; distributed features degraded")
    return _redis


async def close_redis():
    global _redis
    if _redis is not None:
        await _redis.close()
        _redis = None


async def redis_health() -> dict:
    try:
        r = await get_redis()
        if not r:
            return {"configured": False, "connected": False}
        pong = await r.ping()
        return {"configured": True, "connected": bool(pong)}
    except Exception as e:
        return {"configured": bool(os.getenv("REDIS_URL", "")), "connected": False, "error": str(e)[:120]}
