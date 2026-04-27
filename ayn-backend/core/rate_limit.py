"""Distributed rate limiting middleware with Redis-backed counters.

Falls back to process-local limiter when Redis is unavailable and strict mode is off.
"""
from collections import defaultdict, deque
from time import time
from fastapi import Request
from fastapi.responses import JSONResponse

from core.redis_client import get_redis

# endpoint prefix -> (max requests, window seconds)
RATE_LIMITS = {
    "/auth/login": (15, 60),
    "/auth/register": (10, 60),
    "/auth/forgot-password": (8, 60),
    "/chat": (60, 60),
    "/payments/checkout": (10, 60),
    "/payments/refund": (5, 60),
}

_hits: dict[str, deque] = defaultdict(deque)


def _client_ip(request: Request) -> str:
    fwd = request.headers.get("x-forwarded-for", "")
    if fwd:
        return fwd.split(",")[0].strip()
    if request.client and request.client.host:
        return request.client.host
    return "unknown"


def _limit_for_path(path: str):
    for prefix, conf in RATE_LIMITS.items():
        if path.startswith(prefix):
            return conf
    return None


async def _redis_limit(key: str, max_req: int, window: int):
    redis = await get_redis()
    if not redis:
        return None

    current = await redis.incr(key)
    if current == 1:
        await redis.expire(key, window)

    if current > max_req:
        ttl = await redis.ttl(key)
        return False, max(1, ttl if ttl and ttl > 0 else window)
    return True, None


def _local_limit(key: str, max_req: int, window: int):
    q = _hits[key]
    now = time()
    while q and (now - q[0]) > window:
        q.popleft()
    if len(q) >= max_req:
        retry_after = int(window - (now - q[0])) if q else window
        return False, max(1, retry_after)
    q.append(now)
    return True, None


async def rate_limit_middleware(request: Request, call_next):
    path = request.url.path
    conf = _limit_for_path(path)
    if not conf:
        return await call_next(request)

    max_req, window = conf
    key_base = f"{_client_ip(request)}:{path}"
    redis_key = f"ratelimit:{key_base}:{window}"

    allowed = None
    retry_after = None

    # Distributed path first
    try:
        res = await _redis_limit(redis_key, max_req, window)
        if res is not None:
            allowed, retry_after = res
    except Exception:
        allowed = None

    # Fallback local path
    if allowed is None:
        allowed, retry_after = _local_limit(key_base, max_req, window)

    if not allowed:
        return JSONResponse(
            status_code=429,
            content={"error": "Rate limit exceeded"},
            headers={"Retry-After": str(retry_after or window)},
        )

    return await call_next(request)
