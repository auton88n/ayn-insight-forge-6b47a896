import unittest
from unittest.mock import AsyncMock, patch

from fastapi import HTTPException

from core import security
from routers import admin_auth


class AdminSecurityTests(unittest.IsolatedAsyncioTestCase):
    async def test_require_admin_user_rejects_non_admin_even_with_company_email(self):
        user = {"user_id": "u-1", "email": "person@aynn.io", "is_admin": False}
        with patch.object(security, "is_admin_user_id", AsyncMock(return_value=False)):
            with self.assertRaises(HTTPException) as exc:
                await security.require_admin_user(user)
        self.assertEqual(exc.exception.status_code, 403)

    async def test_admin_auth_is_admin_uses_explicit_db_flag_only(self):
        with patch.object(admin_auth, "is_admin_user_id", AsyncMock(return_value=False)) as mock_fn:
            result = await admin_auth._is_admin("u-1", "person@aynn.io")
        self.assertFalse(result)
        mock_fn.assert_awaited_once_with("u-1")


if __name__ == "__main__":
    unittest.main()
