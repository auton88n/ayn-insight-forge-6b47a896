import os
import unittest
from unittest.mock import patch

from core.runtime import (
    get_runtime_config,
    should_enable_scheduler,
    should_enable_realtime,
    should_run_migrations,
    validate_environment,
)


class RuntimeConfigTests(unittest.TestCase):
    def test_invalid_role_fails(self):
        with patch.dict(os.environ, {"APP_ROLE": "bad-role"}, clear=False):
            with self.assertRaises(RuntimeError):
                get_runtime_config()

    def test_production_requires_database_and_jwt_for_web(self):
        env = {
            "APP_ENV": "production",
            "APP_ROLE": "web",
            "STRICT_ENV_VALIDATION": "true",
            "DATABASE_URL": "",
            "AYN_JWT_SECRET": "",
        }
        with patch.dict(os.environ, env, clear=False):
            cfg = get_runtime_config()
            with self.assertRaises(RuntimeError):
                validate_environment(cfg)

    def test_scheduler_and_migration_role_switches(self):
        self.assertTrue(should_enable_scheduler("scheduler", True))
        self.assertFalse(should_enable_scheduler("web", True))
        self.assertTrue(should_run_migrations("migrate", False))
        self.assertTrue(should_run_migrations("web", True))
        self.assertFalse(should_enable_realtime("web"))


if __name__ == "__main__":
    unittest.main()
