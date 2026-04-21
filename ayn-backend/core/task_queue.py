"""Lightweight Redis-backed task queue with retries, DLQ, and worker observability."""
import asyncio
import json
import logging
import os
import time
import uuid
from typing import Awaitable, Callable

from core.redis_client import get_redis

log = logging.getLogger("ayn.queue")

Handler = Callable[[dict], Awaitable[None]]


class RedisTaskQueue:
    def __init__(self, name: str, max_retries: int = 3):
        self.name = name
        self.processing = f"{name}:processing"
        self.dlq = f"{name}:dlq"
        self.max_retries = max_retries
        self._running = False
        self._task: asyncio.Task | None = None
        self.worker_id = f"{os.getenv('APP_ROLE', 'worker')}:{os.getenv('APP_INSTANCE_ID', str(uuid.uuid4())[:8])}:{name}"
        self.worker_key = f"workers:{self.worker_id}"

    async def enqueue(self, payload: dict):
        redis = await get_redis()
        if not redis:
            return False
        now = int(time.time())
        await redis.lpush(self.name, json.dumps({**payload, "attempts": 0, "enqueued_at": now}))
        return True

    async def start_worker(self, handler: Handler, poll_timeout: int = 5):
        if self._running:
            return
        self._running = True

        async def _heartbeat(redis, processed_inc=0, failed_inc=0):
            await redis.hset(
                self.worker_key,
                mapping={
                    "queue": self.name,
                    "role": os.getenv("APP_ROLE", "worker"),
                    "instance": os.getenv("APP_INSTANCE_ID", "unknown"),
                    "last_heartbeat": int(time.time()),
                },
            )
            if processed_inc:
                await redis.hincrby(self.worker_key, "jobs_processed", processed_inc)
            if failed_inc:
                await redis.hincrby(self.worker_key, "jobs_failed", failed_inc)
            await redis.expire(self.worker_key, 120)

        async def _loop():
            while self._running:
                redis = await get_redis()
                if not redis:
                    await asyncio.sleep(1)
                    continue
                await _heartbeat(redis)
                item = await redis.brpoplpush(self.name, self.processing, timeout=poll_timeout)
                if not item:
                    continue
                try:
                    payload = json.loads(item)
                    await handler(payload)
                    await redis.lrem(self.processing, 1, item)
                    await _heartbeat(redis, processed_inc=1)
                except Exception as e:
                    payload = json.loads(item)
                    attempts = int(payload.get("attempts", 0)) + 1
                    payload["attempts"] = attempts
                    payload["last_error"] = str(e)[:300]
                    payload["last_failed_at"] = int(time.time())
                    await redis.lrem(self.processing, 1, item)
                    await _heartbeat(redis, failed_inc=1)
                    if attempts >= self.max_retries:
                        await redis.lpush(self.dlq, json.dumps(payload))
                        log.error(f"[queue:{self.name}] moved to DLQ after {attempts} attempts: {e}")
                    else:
                        await redis.lpush(self.name, json.dumps(payload))
                        log.warning(f"[queue:{self.name}] retry {attempts}: {e}")

        self._task = asyncio.create_task(_loop())

    async def stop_worker(self):
        self._running = False
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except Exception:
                pass
            self._task = None


async def queue_summary(queue_name: str) -> dict:
    redis = await get_redis()
    if not redis:
        return {"name": queue_name, "available": False}

    processing = f"{queue_name}:processing"
    dlq = f"{queue_name}:dlq"
    pending_count, processing_count, dlq_count = await asyncio.gather(
        redis.llen(queue_name), redis.llen(processing), redis.llen(dlq)
    )
    oldest_age = 0
    retries = 0
    sample = await redis.lindex(queue_name, -1)
    if sample:
        try:
            payload = json.loads(sample)
            enq = int(payload.get("enqueued_at", 0))
            oldest_age = max(0, int(time.time()) - enq) if enq else 0
            retries = int(payload.get("attempts", 0))
        except Exception:
            pass

    return {
        "name": queue_name,
        "available": True,
        "pending": pending_count,
        "processing": processing_count,
        "dead_letter": dlq_count,
        "oldest_job_age_sec": oldest_age,
        "sample_retry_count": retries,
    }


async def list_dlq(queue_name: str, limit: int = 100) -> list[dict]:
    redis = await get_redis()
    if not redis:
        return []
    items = await redis.lrange(f"{queue_name}:dlq", 0, max(0, limit - 1))
    out = []
    for raw in items:
        try:
            out.append(json.loads(raw))
        except Exception:
            out.append({"raw": raw})
    return out


async def requeue_dlq_item(queue_name: str, index: int) -> bool:
    redis = await get_redis()
    if not redis:
        return False
    dlq_key = f"{queue_name}:dlq"
    raw = await redis.lindex(dlq_key, index)
    if not raw:
        return False
    await redis.lset(dlq_key, index, "__REMOVED__")
    await redis.lrem(dlq_key, 1, "__REMOVED__")
    await redis.lpush(queue_name, raw)
    return True


async def list_workers() -> list[dict]:
    redis = await get_redis()
    if not redis:
        return []
    keys = await redis.keys("workers:*")
    workers = []
    now = int(time.time())
    for k in keys:
        data = await redis.hgetall(k)
        hb = int(data.get("last_heartbeat", 0) or 0)
        workers.append(
            {
                "worker_id": k.replace("workers:", ""),
                "queue": data.get("queue", ""),
                "role": data.get("role", ""),
                "instance": data.get("instance", ""),
                "last_heartbeat": hb,
                "jobs_processed": int(data.get("jobs_processed", 0) or 0),
                "jobs_failed": int(data.get("jobs_failed", 0) or 0),
                "stalled": (now - hb) > 90 if hb else True,
            }
        )
    return workers
