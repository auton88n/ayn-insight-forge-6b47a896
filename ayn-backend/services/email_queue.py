import logging
from core.task_queue import RedisTaskQueue
from services.email import send_email

log = logging.getLogger("ayn.email_queue")

email_queue = RedisTaskQueue("queue:email", max_retries=4)


async def enqueue_email(to: str, template: str, data: dict) -> bool:
    return await email_queue.enqueue({"to": to, "template": template, "data": data})


async def _handle_email_task(task: dict):
    ok = await send_email(task.get("to", ""), task.get("template", ""), task.get("data", {}))
    if not ok:
        raise RuntimeError("send_email returned false")


async def start_email_worker():
    await email_queue.start_worker(_handle_email_task)
    log.info("[email-queue] worker started")


async def stop_email_worker():
    await email_queue.stop_worker()
