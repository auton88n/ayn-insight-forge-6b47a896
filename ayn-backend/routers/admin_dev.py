"""
routers/admin_dev.py — Dev Agent state management
Replaces direct Supabase REST calls for dev conversations, messages, and skills.
"""
import logging
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import List, Optional
from core.database import fetch, fetchrow, execute, fetchval
from core.security import require_admin_user

router = APIRouter(prefix="/admin/dev", tags=["admin-dev"])
log = logging.getLogger("ayn.admin_dev")

# ── Models ─────────────────────────────────────────────────────────────────────

class CreateConversationRequest(BaseModel):
    title: str

class CreateMessageRequest(BaseModel):
    role: str
    content: str

class UpdateSkillRequest(BaseModel):
    enabled: bool

# ── Conversations ─────────────────────────────────────────────────────────────

@router.get("/conversations")
async def get_conversations(_=Depends(require_admin_user)):
    rows = await fetch("""
        SELECT id, title, created_at, updated_at
        FROM ayn_dev_conversations
        ORDER BY updated_at DESC
        LIMIT 50
    """)
    return rows or []

@router.post("/conversations")
async def create_conversation(req: CreateConversationRequest, _=Depends(require_admin_user)):
    row = await fetchrow("""
        INSERT INTO ayn_dev_conversations (title)
        VALUES ($1)
        RETURNING id, title, created_at, updated_at
    """, req.title)
    return dict(row)

@router.delete("/conversations/{conv_id}")
async def delete_conversation(conv_id: str, _=Depends(require_admin_user)):
    await execute("DELETE FROM ayn_dev_conversations WHERE id = $1::uuid", conv_id)
    return {"ok": True}

@router.patch("/conversations/{conv_id}")
async def update_conversation_timestamp(conv_id: str, _=Depends(require_admin_user)):
    await execute("UPDATE ayn_dev_conversations SET updated_at = NOW() WHERE id = $1::uuid", conv_id)
    return {"ok": True}

# ── Messages ──────────────────────────────────────────────────────────────────

@router.get("/conversations/{conv_id}/messages")
async def get_conversation_messages(conv_id: str, _=Depends(require_admin_user)):
    rows = await fetch("""
        SELECT id, role, content, created_at
        FROM ayn_dev_messages
        WHERE conversation_id = $1::uuid
        ORDER BY created_at ASC
    """, conv_id)
    return rows or []

@router.post("/conversations/{conv_id}/messages")
async def create_message(conv_id: str, req: CreateMessageRequest, _=Depends(require_admin_user)):
    row = await fetchrow("""
        INSERT INTO ayn_dev_messages (conversation_id, role, content)
        VALUES ($1::uuid, $2, $3)
        RETURNING id, role, content, created_at
    """, conv_id, req.role, req.content)
    
    # Update conversation updated_at
    await execute("UPDATE ayn_dev_conversations SET updated_at = NOW() WHERE id = $1::uuid", conv_id)
    
    return dict(row)

# ── Skills ────────────────────────────────────────────────────────────────────

@router.get("/skills")
async def get_skills(_=Depends(require_admin_user)):
    rows = await fetch("""
        SELECT id, category, name, description, content, enabled, created_at
        FROM ayn_dev_skills
        ORDER BY category, name
    """)
    return rows or []

@router.patch("/skills/{skill_id}")
async def update_skill(skill_id: str, req: UpdateSkillRequest, _=Depends(require_admin_user)):
    await execute("""
        UPDATE ayn_dev_skills
        SET enabled = $1
        WHERE id = $2::uuid
    """, req.enabled, skill_id)
    return {"ok": True}
