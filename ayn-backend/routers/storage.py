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
from core.db import get_db
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
    """Upload file to Supabase Storage. Replaces supabase.storage.from().upload()"""
    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        raise HTTPException(503, "Storage not configured")
    try:
        raw = base64.b64decode(req.data.split(",")[-1] if "," in req.data else req.data)
        url = f"{SUPABASE_URL}/storage/v1/object/{req.bucket}/{req.path}"
        method = "PUT" if req.upsert else "POST"
        async with httpx.AsyncClient() as client:
            r = await client.request(
                method, url,
                content=raw,
                headers={
                    "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
                    "Content-Type": req.content_type,
                    "x-upsert": "true" if req.upsert else "false",
                }
            )
        if not r.is_success:
            raise HTTPException(r.status_code, r.text)
        public_url = f"{SUPABASE_URL}/storage/v1/object/public/{req.bucket}/{req.path}"
        return {"ok": True, "path": req.path, "public_url": public_url}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, str(e))


@router.get("/url")
async def get_public_url(bucket: str, path: str, user_id: str = Depends(get_user_id)):
    """Get public URL for a file. Replaces supabase.storage.from().getPublicUrl()"""
    public_url = f"{SUPABASE_URL}/storage/v1/object/public/{bucket}/{path}"
    return {"public_url": public_url}


@router.get("/list")
async def list_files(bucket: str, prefix: str = "", user_id: str = Depends(get_user_id)):
    """List files in bucket. Replaces supabase.storage.from().list()"""
    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        return {"files": []}
    try:
        url = f"{SUPABASE_URL}/storage/v1/object/list/{bucket}"
        async with httpx.AsyncClient() as client:
            r = await client.post(url,
                json={"prefix": prefix, "limit": 100},
                headers={"Authorization": f"Bearer {SUPABASE_SERVICE_KEY}"}
            )
        return {"files": r.json() if r.is_success else []}
    except Exception:
        return {"files": []}


@router.delete("/delete")
async def delete_file(bucket: str, path: str, user_id: str = Depends(get_user_id)):
    """Delete file. Replaces supabase.storage.from().remove()"""
    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        raise HTTPException(503, "Storage not configured")
    try:
        url = f"{SUPABASE_URL}/storage/v1/object/{bucket}"
        async with httpx.AsyncClient() as client:
            r = await client.delete(
                url,
                json={"prefixes": [path]},
                headers={"Authorization": f"Bearer {SUPABASE_SERVICE_KEY}"}
            )
        return {"ok": r.is_success}
    except Exception as e:
        raise HTTPException(500, str(e))
