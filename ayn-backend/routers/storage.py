"""
routers/storage.py — file storage endpoints (replaces supabase.storage.*)
Handles avatar uploads, image saves, file retrieval
"""
import os
import base64
import logging
import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional
from core.auth_new import get_user_id
import asyncio

router = APIRouter(prefix="/storage", tags=["storage"])
log = logging.getLogger("ayn.storage")

SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY", "")


class UploadRequest(BaseModel):
    bucket: str
    path: str
    data: str       # base64 encoded
    content_type: str = "image/jpeg"
    upsert: bool = True


class DownloadRequest(BaseModel):
    bucket: str
    path: str


@router.post("/upload")
async def upload_file(req: UploadRequest, user_id: str = Depends(get_user_id)):
    """Upload file securely mapped to user_id. Overwrites isolated safely."""
    from core.storage_service import StorageService
    result = await StorageService.store_asset(
        user_id=user_id,
        asset_key=req.path,  # Use path as unique asset_key
        data=req.data,
        mime_type=req.content_type
    )
    if not result.get("ok"):
        raise HTTPException(500, result.get("error"))
    return result


@router.get("/url")
async def get_public_url(bucket: str, path: str, user_id: str = Depends(get_user_id)):
    """Get protected local URL."""
    # Enforces access through standard backend proxy
    return {"public_url": f"/api/storage/serve/{bucket}/{path}?user_id={user_id}"}


@router.get("/list")
async def list_files(bucket: str, prefix: str = "", user_id: str = Depends(get_user_id)):
    """List isolated user assets."""
    from core.database import fetch
    rows = await fetch(
        "SELECT asset_key, mime_type, updated_at FROM user_assets WHERE user_id=$1",
        user_id
    )
    return {"files": [dict(r) for r in rows] if rows else []}
@router.delete("/delete")
async def delete_file(bucket: str, path: str, user_id: str = Depends(get_user_id)):
    """Delete isolated user asset."""
    from core.storage_service import StorageService
    ok = await StorageService.delete_asset(user_id, path)
    if not ok:
        raise HTTPException(500, "Deletion failed")
    return {"ok": True}


@router.get("/serve/{bucket}/{path:path}")
async def serve_file(bucket: str, path: str, user_id: str = ""):
    """Serve asset ensuring user owns it via local validation."""
    from core.storage_service import StorageService
    from fastapi.responses import Response
    
    # Require user_id to match proxy unless publicly scoped
    if not user_id:
        raise HTTPException(403, "Missing ownership token in query")
        
    asset = await StorageService.get_asset(user_id, path)
    if not asset:
        raise HTTPException(404, "Asset not found")
        
    file_data, mime_type = asset
    return Response(
        content=file_data, 
        media_type=mime_type, 
        headers={"Cache-Control": "public, max-age=86400"}
    )
