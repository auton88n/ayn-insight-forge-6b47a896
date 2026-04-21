import unittest
from unittest.mock import AsyncMock, patch

from core.task_queue import queue_summary
from routers import admin_ops


class _FakeRedis:
    async def llen(self, key):
        return {"queue:email": 4, "queue:email:processing": 2, "queue:email:dlq": 1}.get(key, 0)

    async def lindex(self, key, idx):
        return '{"enqueued_at": 1, "attempts": 2}'

    async def keys(self, pattern):
        return []


class OpsTests(unittest.IsolatedAsyncioTestCase):
    async def test_queue_summary_counts(self):
        with patch("core.task_queue.get_redis", AsyncMock(return_value=_FakeRedis())):
            s = await queue_summary("queue:email")
        self.assertEqual(s["pending"], 4)
        self.assertEqual(s["processing"], 2)
        self.assertEqual(s["dead_letter"], 1)

    async def test_operations_summary_degraded_when_redis_down(self):
        with patch.object(admin_ops, "redis_health", AsyncMock(return_value={"configured": True, "connected": False})), \
             patch.object(admin_ops, "queue_summary", AsyncMock(return_value={"dead_letter": 0, "pending": 0})), \
             patch.object(admin_ops, "list_workers", AsyncMock(return_value=[])), \
             patch.object(admin_ops, "redis_required", lambda: True):
            out = await admin_ops.operations_summary({"is_admin": True})
        self.assertTrue(out["degraded"])
        self.assertIn("redis_disconnected", out["degraded_reasons"])


if __name__ == "__main__":
    unittest.main()
