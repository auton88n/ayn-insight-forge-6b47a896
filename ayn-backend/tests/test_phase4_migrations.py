import unittest
from unittest.mock import patch

from core import migrate


class _Tx:
    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc, tb):
        return False


class FakeConn:
    def __init__(self, lock_ok: bool):
        self.lock_ok = lock_ok
        self.executed = []

    async def fetchval(self, query, *args):
        if "pg_try_advisory_lock" in query:
            return self.lock_ok
        return None

    async def fetch(self, query, *args):
        return []

    async def execute(self, query, *args):
        self.executed.append((query, args))
        return "OK"

    def transaction(self):
        return _Tx()


class _Acquire:
    def __init__(self, conn):
        self.conn = conn

    async def __aenter__(self):
        return self.conn

    async def __aexit__(self, exc_type, exc, tb):
        return False


class FakePool:
    def __init__(self, conn):
        self.conn = conn

    def acquire(self):
        return _Acquire(self.conn)


class MigrationLockTests(unittest.IsolatedAsyncioTestCase):
    async def test_migration_skips_if_lock_held(self):
        conn = FakeConn(lock_ok=False)
        pool = FakePool(conn)

        with patch.object(migrate.os.path, "exists", return_value=True), patch.object(migrate.os, "listdir", return_value=[]):
            await migrate.run_migrations(pool, use_advisory_lock=True, fail_if_locked=False)

        self.assertFalse(any("_migrations" in q for q, _ in conn.executed))

    async def test_migration_fails_if_lock_required(self):
        conn = FakeConn(lock_ok=False)
        pool = FakePool(conn)

        with patch.object(migrate.os.path, "exists", return_value=True), patch.object(migrate.os, "listdir", return_value=[]):
            with self.assertRaises(RuntimeError):
                await migrate.run_migrations(pool, use_advisory_lock=True, fail_if_locked=True)


if __name__ == "__main__":
    unittest.main()
