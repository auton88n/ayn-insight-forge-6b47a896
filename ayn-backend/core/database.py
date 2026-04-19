"""
core/database.py — asyncpg connection pool for Railway PostgreSQL

Replaces supabase-py for all DB operations.
Connection string from DATABASE_URL env var (Railway auto-sets this).
"""
import asyncio
import asyncpg
import logging
import os
from typing import Any, Optional

log = logging.getLogger("ayn.db")

_pool: Optional[asyncpg.Pool] = None


async def get_pool() -> asyncpg.Pool:
    global _pool
    if _pool is None:
        db_url = os.getenv("DATABASE_URL", "")
        if not db_url:
            raise RuntimeError("DATABASE_URL not set — add PostgreSQL to Railway project")
        # Determine SSL: Railway needs ssl=True, not "require" (avoids cert verification issues)
        use_ssl = True if ("railway" in db_url or "amazonaws" in db_url or "rlwy.net" in db_url) else None
        _pool = await asyncio.wait_for(
            asyncpg.create_pool(
                db_url,
                min_size=1,
                max_size=10,
                command_timeout=30,
                server_settings={"application_name": "ayn-spine"},
                ssl=use_ssl,
            ),
            timeout=20.0
        )
        log.info("[db] PostgreSQL pool created")
    return _pool


async def fetch(query: str, *args) -> list[dict]:
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(query, *args)
        return [dict(r) for r in rows]


async def fetchrow(query: str, *args) -> Optional[dict]:
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(query, *args)
        return dict(row) if row else None


async def fetchval(query: str, *args) -> Any:
    pool = await get_pool()
    async with pool.acquire() as conn:
        return await conn.fetchval(query, *args)


async def execute(query: str, *args) -> str:
    pool = await get_pool()
    async with pool.acquire() as conn:
        return await conn.execute(query, *args)


async def executemany(query: str, args_list: list) -> None:
    pool = await get_pool()
    async with pool.acquire() as conn:
        await conn.executemany(query, args_list)


async def close_pool():
    global _pool
    if _pool:
        await _pool.close()
        _pool = None
        log.info("[db] PostgreSQL pool closed")
