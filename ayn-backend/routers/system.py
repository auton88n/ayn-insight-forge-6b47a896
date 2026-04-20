"""
routers/system.py — system config (maintenance mode, beta flags etc)
"""
import logging
from fastapi import APIRouter, Depends
from typing import Optional
from core.database import fetch, execute
from core.auth_new import get_user_id_optional

router = APIRouter(prefix="/system", tags=["system"])
log = logging.getLogger("ayn.system")


@router.get("/config")
async def get_system_config(keys: Optional[str] = None,
                             _: str = Depends(get_user_id_optional)):
    """Get system config values. Optionally filter by comma-separated keys."""
    try:
        rows = await fetch("SELECT key, value FROM system_config")
        config_map = {r["key"]: r["value"] for r in rows}

        if keys:
            key_list = [k.strip() for k in keys.split(",")]
            config_map = {k: config_map.get(k) for k in key_list}

        return {"config": config_map}
    except Exception as e:
        log.error(f"[system] config error: {e}")
        return {"config": {}}
