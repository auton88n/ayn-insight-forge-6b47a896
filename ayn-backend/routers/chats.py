"""
routers/chats.py — chat sessions and messages API

GET  /chats              — list recent chat sessions
GET  /chats/:session_id  — get messages for a session
POST /chats/:session_id  — save a message
DELETE /chats/:session_id — delete a session
"""
import logging
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from core.auth_new import get_user_id
from core.database import fetch, fetchrow, execute

router = APIRouter(prefix="/chats", tags=["chats"])
log = logging.getLogger("ayn.chats")


class SaveMessageRequest(BaseModel):
    role: str
    content: str
    intent_type: str = None
    model_used: str = None
    title: str = None  # updates session title if provided


@router.get("")
async def list_chats(user_id: str = Depends(get_user_id)):
    """List recent chat sessions for sidebar."""
    rows = await fetch("""
        SELECT session_id, title, updated_at
        FROM chat_sessions
        WHERE user_id = $1::uuid
        ORDER BY updated_at DESC
        LIMIT 20
    """, user_id)
    # Convert asyncpg Records to dicts + serialize datetime
    result = []
    for r in (rows or []):
        result.append({
            "session_id": r["session_id"],
            "title": r["title"] or "New Chat",
            "updated_at": r["updated_at"].isoformat() if r["updated_at"] else None,
        })
    return result


@router.get("/{session_id}")
async def get_messages(session_id: str, user_id: str = Depends(get_user_id)):
    """Get all messages for a chat session."""
    rows = await fetch("""
        SELECT id, session_id, role, content, intent_type, model_used, created_at
        FROM messages
        WHERE user_id = $1 AND session_id = $2
        ORDER BY created_at ASC
    """, user_id, session_id)
    return rows or []


@router.post("/{session_id}")
async def save_message(session_id: str, req: SaveMessageRequest, user_id: str = Depends(get_user_id)):
    """Save a message and upsert chat session."""
    # Upsert chat session
    await execute("""
        INSERT INTO chat_sessions (session_id, user_id, title, created_at, updated_at)
        VALUES ($1, $2, $3, NOW(), NOW())
        ON CONFLICT (session_id) DO UPDATE
        SET updated_at = NOW(),
            title = COALESCE(NULLIF($3, ''), chat_sessions.title, 'New Chat')
    """, session_id, user_id, req.title or 'New Chat')

    # Insert message
    msg = await fetchrow("""
        INSERT INTO messages (user_id, session_id, role, content, intent_type, model_used, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, NOW())
        RETURNING id, session_id, role, content, created_at
    """, user_id, session_id, req.role, req.content, req.intent_type, req.model_used)

    return msg


@router.delete("/{session_id}")
async def delete_session(session_id: str, user_id: str = Depends(get_user_id)):
    """Delete a chat session and all its messages."""
    await execute("DELETE FROM messages WHERE user_id = $1 AND session_id = $2", user_id, session_id)
    await execute("DELETE FROM chat_sessions WHERE user_id = $1 AND session_id = $2", user_id, session_id)
    return {"ok": True}


@router.get("/latest/session-id")
async def get_latest_session_id(user_id: str = Depends(get_user_id)):
    """Get the most recent session_id for this user."""
    row = await fetchrow("""
        SELECT session_id FROM messages
        WHERE user_id = $1
        ORDER BY created_at DESC
        LIMIT 1
    """, user_id)
    return {"session_id": row["session_id"] if row else None}
