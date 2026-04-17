"""
routers/files.py — file handling endpoints
Replaces: file-upload Supabase edge function
"""
import logging
import base64
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional
from core.auth_new import get_user_id

router = APIRouter(prefix="/upload", tags=["upload"])
log = logging.getLogger("ayn.files")

MAX_SIZE = 10 * 1024 * 1024  # 10MB


class FileUploadRequest(BaseModel):
    data: str          # base64 encoded file content
    name: str          # original filename
    type: str          # mime type
    size: Optional[int] = None


@router.post("")
async def upload_file(req: FileUploadRequest, user_id: str = Depends(get_user_id)):
    """Upload a file for use in chat. Returns data URL for LLM."""
    try:
        # Validate size
        raw = base64.b64decode(req.data.split(",")[-1] if "," in req.data else req.data)
        if len(raw) > MAX_SIZE:
            raise HTTPException(400, "File too large (max 10MB)")

        # Build data URL
        data_url = f"data:{req.type};base64,{base64.b64encode(raw).decode()}"
        log.info(f"[upload] {req.name} ({len(raw)} bytes) user={user_id[:8]}")
        return {"url": data_url, "name": req.name, "type": req.type, "size": len(raw)}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, str(e))
