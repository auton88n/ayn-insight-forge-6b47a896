import unittest
from unittest.mock import AsyncMock, patch

from routers import payments


class PaymentWebhookTests(unittest.IsolatedAsyncioTestCase):
    async def test_mark_webhook_processed_is_conflict_safe(self):
        with patch.object(payments, "execute", AsyncMock()) as exec_mock:
            await payments._mark_webhook_processed("evt_123")

        sql = exec_mock.await_args.args[0]
        self.assertIn("ON CONFLICT (event_type, stripe_id) DO NOTHING", sql)
        self.assertEqual(exec_mock.await_args.args[1], "evt_123")


if __name__ == "__main__":
    unittest.main()
