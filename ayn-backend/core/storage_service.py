"""
core/storage_service.py — durable storage service abstraction (Railway Postgres)
"""
import base64
import logging
from typing import Optional, Dict, Any, Tuple
from core.database import fetchrow, execute

log = logging.getLogger("ayn.storage_service")

class StorageService:
    @staticmethod
    async def store_asset(user_id: str, asset_key: str, data: Any, mime_type: str = "image/jpeg") -> Dict[str, Any]:
        """
        Store binary data in the user_assets table.
        Accepts raw bytes or base64 data.
        Returns {ok: bool, asset_key: str}
        """
        try:
            # Handle base64 if needed
            if isinstance(data, str):
                # Clean prefix if exists (e.g. data:image/png;base64,...)
                clean_data = data.split(",")[-1] if "," in data else data
                raw_data = base64.b64decode(clean_data)
            else:
                raw_data = data

            await execute("""
                INSERT INTO user_assets (user_id, asset_key, mime_type, file_data, updated_at)
                VALUES ($1, $2, $3, $4, NOW())
                ON CONFLICT (user_id, asset_key) 
                DO UPDATE SET mime_type = $3, file_data = $4, updated_at = NOW()
            """, user_id, asset_key, mime_type, raw_data)

            log.info(f"[storage] Asset '{asset_key}' stored for user {user_id}")
            return {"ok": True, "asset_key": asset_key}

        except Exception as e:
            log.error(f"[storage] Failed to store asset: {e}")
            return {"ok": False, "error": str(e)}

    @staticmethod
    async def get_asset(user_id: str, asset_key: str) -> Optional[Tuple[bytes, str]]:
        """
        Retrieve binary data and mime_type from the user_assets table.
        Returns (bytes, mime_type) or None
        """
        try:
            row = await fetchrow("""
                SELECT file_data, mime_type FROM user_assets 
                WHERE user_id = $1 AND asset_key = $2
            """, user_id, asset_key)
            
            if row:
                return row['file_data'], row['mime_type']
            return None
        except Exception as e:
            log.error(f"[storage] Failed to retrieve asset: {e}")
            return None

    @staticmethod
    async def delete_asset(user_id: str, asset_key: str) -> bool:
        """Delete an asset from the user_assets table."""
        try:
            await execute("DELETE FROM user_assets WHERE user_id = $1 AND asset_key = $2", user_id, asset_key)
            return True
        except Exception as e:
            log.error(f"[storage] Failed to delete asset: {e}")
            return False

    @staticmethod
    async def upload_avatar(user_id: str, data: Any, mime_type: str = "image/jpeg") -> Dict[str, Any]:
        """Specific helper for user avatars."""
        return await StorageService.store_asset(user_id, "avatar", data, mime_type)

    @staticmethod
    async def get_avatar(user_id: str) -> Optional[Tuple[bytes, str]]:
        """Specific helper for user avatars."""
        return await StorageService.get_asset(user_id, "avatar")
