"""
routers/system.py — public system config (maintenance mode, beta flags, etc.)
Replaces frontend's old direct supabase.from('system_config') call.
"""
import logging
from fastapi import APIRouter, Query
from core.database import fetch

router = APIRouter(prefix="/system", tags=["system"])
log = logging.getLogger("ayn.system")


@router.get("/config")
async def get_system_config(keys: str = Query("")):
    """Return [{key, value}, ...] for the requested config keys. Public — no auth."""
    key_list = [k.strip() for k in keys.split(",") if k.strip()]
    if not key_list:
        return []
    try:
        rows = await fetch(
            "SELECT key, value FROM system_config WHERE key = ANY($1::text[])",
            key_list,
        )
        return [{"key": r["key"], "value": r["value"]} for r in rows]
    except Exception as e:
        log.warning(f"[system/config] error: {e}")
        return []
