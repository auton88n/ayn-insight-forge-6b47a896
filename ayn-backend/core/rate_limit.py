"""
core/rate_limit.py — lightweight per-IP request limiter middleware.

Note: In-memory limiter is process-local. It still provides meaningful abuse
protection and can be replaced with Redis when distributed coordination is added.
"""
from collections import defaultdict, deque
from time import time
from fastapi import Request
from fastapi.responses import JSONResponse

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


async def rate_limit_middleware(request: Request, call_next):
    path = request.url.path
    conf = _limit_for_path(path)
    if not conf:
        return await call_next(request)

    max_req, window = conf
    key = f"{_client_ip(request)}:{path}"
    q = _hits[key]
    now = time()

    while q and (now - q[0]) > window:
        q.popleft()

    if len(q) >= max_req:
        retry_after = int(window - (now - q[0])) if q else window
        return JSONResponse(
            status_code=429,
            content={"error": "Rate limit exceeded"},
            headers={"Retry-After": str(max(1, retry_after))},
        )

    q.append(now)
    return await call_next(request)
