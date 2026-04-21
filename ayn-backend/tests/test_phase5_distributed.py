import unittest
from unittest.mock import AsyncMock, patch

from fastapi import Request

from core import rate_limit
from services import email_queue


class _FakeRedis:
    def __init__(self, count=0, ttl=30):
        self.count = count
        self.ttl_val = ttl

    async def incr(self, key):
        self.count += 1
        return self.count

    async def expire(self, key, window):
        return True

    async def ttl(self, key):
        return self.ttl_val


class DistributedRateLimitTests(unittest.IsolatedAsyncioTestCase):
    async def test_redis_backed_rate_limit_blocks_after_threshold(self):
        fake = _FakeRedis(count=15, ttl=12)
        with patch("core.rate_limit.get_redis", AsyncMock(return_value=fake)):
            ok, retry = await rate_limit._redis_limit("k", 15, 60)
        self.assertFalse(ok)
        self.assertEqual(retry, 12)

    async def test_email_queue_returns_false_without_redis(self):
        with patch("core.task_queue.get_redis", AsyncMock(return_value=None)):
            queued = await email_queue.enqueue_email("a@b.com", "welcome", {})
        self.assertFalse(queued)


if __name__ == "__main__":
    unittest.main()
