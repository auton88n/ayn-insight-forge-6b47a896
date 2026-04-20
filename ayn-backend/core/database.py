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
        # Railway Postgres needs SSL but with cert verification disabled
        use_ssl = None
        if "railway" in db_url or "rlwy.net" in db_url or "amazonaws" in db_url:
            import ssl as _ssl_mod
            ctx = _ssl_mod.create_default_context()
            ctx.check_hostname = False
            ctx.verify_mode = _ssl_mod.CERT_NONE
            use_ssl = ctx
        _pool = await asyncio.wait_for(
            asyncpg.create_pool(
                db_url,
                min_size=3,        # keep 3 connections warm at all times
                max_size=20,       # scale up to 20 under load
                max_inactive_connection_lifetime=300,  # recycle idle connections
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
