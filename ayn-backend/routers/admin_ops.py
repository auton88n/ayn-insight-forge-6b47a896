"""Admin operations center endpoints."""
from fastapi import APIRouter, Depends, HTTPException
from core.security import require_admin_user
from core.redis_client import redis_health, redis_required, get_redis
from core.task_queue import queue_summary, list_workers, list_dlq, requeue_dlq_item

router = APIRouter(prefix="/admin/ops", tags=["admin-ops"])

EMAIL_QUEUE = "queue:email"


@router.get("/summary")
async def operations_summary(_: dict = Depends(require_admin_user)):
    redis = await redis_health()
    q = await queue_summary(EMAIL_QUEUE)
    workers = await list_workers()

    degraded_reasons = []
    if not redis.get("connected"):
        degraded_reasons.append("redis_disconnected")
    if q.get("dead_letter", 0) > 0:
        degraded_reasons.append("dlq_non_empty")
    if q.get("pending", 0) > 500:
        degraded_reasons.append("queue_backlog_high")
    if any(w.get("stalled") for w in workers):
        degraded_reasons.append("worker_stalled")

    return {
        "strict_mode": redis_required(),
        "degraded": len(degraded_reasons) > 0,
        "degraded_reasons": degraded_reasons,
        "infra": {"redis": redis},
        "queues": {"email": q},
        "workers": workers,
        "alerts": [
            {"level": "critical" if r in {"redis_disconnected", "worker_stalled"} else "warning", "code": r}
            for r in degraded_reasons
        ],
    }


@router.get("/queues/{queue_name}/dlq")
async def queue_dlq(queue_name: str, limit: int = 100, _: dict = Depends(require_admin_user)):
    if queue_name != "email":
        raise HTTPException(404, "Unsupported queue")
    items = await list_dlq(f"queue:{queue_name}", limit=limit)
    return {"items": items, "count": len(items)}


@router.post("/queues/{queue_name}/dlq/{index}/requeue")
async def queue_requeue(queue_name: str, index: int, _: dict = Depends(require_admin_user)):
    if queue_name != "email":
        raise HTTPException(404, "Unsupported queue")
    ok = await requeue_dlq_item(f"queue:{queue_name}", index)
    if not ok:
        raise HTTPException(404, "DLQ item not found")
    return {"ok": True}


@router.delete("/queues/{queue_name}/dlq/{index}")
async def queue_resolve(queue_name: str, index: int, _: dict = Depends(require_admin_user)):
    if queue_name != "email":
        raise HTTPException(404, "Unsupported queue")
    redis = await get_redis()
    if not redis:
        raise HTTPException(503, "Redis unavailable")
    key = f"queue:{queue_name}:dlq"
    raw = await redis.lindex(key, index)
    if not raw:
        raise HTTPException(404, "DLQ item not found")
    await redis.lset(key, index, "__RESOLVED__")
    await redis.lrem(key, 1, "__RESOLVED__")
    return {"ok": True}
