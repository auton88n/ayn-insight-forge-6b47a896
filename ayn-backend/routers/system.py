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

PUBLIC_CONFIG_KEYS = {
    "maintenance_mode",
    "maintenance_message",
    "maintenance_start_time",
    "maintenance_end_time",
    "pre_maintenance_notice",
    "pre_maintenance_message",
    "beta_mode",
    "beta_feedback_reward",
}


@router.get("/config")
async def get_system_config(keys: Optional[str] = None,
                             user_id: str = Depends(get_user_id_optional)):
    """
    Get system config values.
    - Public callers can only read PUBLIC_CONFIG_KEYS and must pass ?keys=...
    - Authenticated callers can read any requested keys.
    """
    try:
        rows = await fetch("SELECT key, value FROM system_config")
        config_map = {r["key"]: r["value"] for r in rows}

        requested_keys = []
        if keys:
            requested_keys = [k.strip() for k in keys.split(",") if k.strip()]
            # Anonymous mode: only allow explicitly whitelisted keys
            if user_id == "anonymous":
                requested_keys = [k for k in requested_keys if k in PUBLIC_CONFIG_KEYS]
            config_map = {k: config_map.get(k) for k in requested_keys}
        elif user_id == "anonymous":
            # No keys passed and no auth -> return only public keys
            config_map = {k: config_map.get(k) for k in PUBLIC_CONFIG_KEYS}

        # Backward compatibility:
        # - map form: {"config": {...}}
        # - list form for older frontend parsers: {"items": [{"key","value"}]}
        items = [{"key": k, "value": v} for k, v in config_map.items()]
        return {"config": config_map, "items": items}
    except Exception as e:
        log.error(f"[system] config error: {e}")
        return {"config": {}, "items": []}
