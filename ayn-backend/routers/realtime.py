"""
routers/realtime.py — WebSocket endpoints
Replaces: supabase.channel().on('postgres_changes') realtime subscriptions
"""
import logging
import asyncio
import json
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from core.auth_new import verify_access_token
from core.db import get_db

router = APIRouter(prefix="/ws", tags=["realtime"])
log = logging.getLogger("ayn.realtime")

# Connection managers
admin_connections: list[WebSocket] = []
chat_connections: dict[str, list[WebSocket]] = {}
prediction_connections: list[WebSocket] = []


async def _auth_ws(websocket: WebSocket) -> str | None:
    """Authenticate a WebSocket connection via query param or first message."""
    token = websocket.query_params.get("token")
    if token:
        try:
            payload = verify_access_token(token)
            return payload["sub"]
        except Exception:
            await websocket.close(code=1008)
            return None
    return "anonymous"


@router.websocket("/admin")
async def ws_admin(websocket: WebSocket):
    """Admin real-time updates. Replaces supabase.channel('admin')."""
    await websocket.accept()
    user_id = await _auth_ws(websocket)
    if not user_id:
        return
    admin_connections.append(websocket)
    log.info(f"[ws] Admin connected: {user_id[:8]}")
    try:
        while True:
            # Send a heartbeat every 30s and listen for client messages
            await asyncio.sleep(30)
            await websocket.send_json({"type": "heartbeat", "ts": asyncio.get_event_loop().time()})
    except WebSocketDisconnect:
        admin_connections.remove(websocket)
    except Exception as e:
        log.debug(f"[ws] Admin disconnected: {e}")
        if websocket in admin_connections:
            admin_connections.remove(websocket)


@router.websocket("/chat/{session_id}")
async def ws_chat(websocket: WebSocket, session_id: str):
    """Chat real-time updates. Replaces supabase.channel('chat-{id}')."""
    await websocket.accept()
    user_id = await _auth_ws(websocket)
    if not user_id:
        return
    if session_id not in chat_connections:
        chat_connections[session_id] = []
    chat_connections[session_id].append(websocket)
    log.info(f"[ws] Chat connected: session={session_id[:8]}")
    try:
        while True:
            data = await websocket.receive_text()
            # Echo back (for debugging)
            await websocket.send_json({"type": "ack", "data": data})
    except WebSocketDisconnect:
        if session_id in chat_connections:
            chat_connections[session_id].remove(websocket)
    except Exception as e:
        log.debug(f"[ws] Chat disconnected: {e}")


@router.websocket("/predictions")
async def ws_predictions(websocket: WebSocket):
    """Prediction updates. Replaces supabase.channel('predictions')."""
    await websocket.accept()
    user_id = await _auth_ws(websocket)
    if not user_id:
        return
    prediction_connections.append(websocket)
    try:
        while True:
            await asyncio.sleep(60)
            # Send latest predictions count
            try:
                db = get_db()
                r = await asyncio.to_thread(
                    lambda: db.from_("ayn_world_predictions").select("id", count="exact")
                               .eq("status", "active").execute()
                )
                await websocket.send_json({
                    "type": "predictions_update",
                    "count": r.count or 0
                })
            except Exception:
                pass
    except WebSocketDisconnect:
        if websocket in prediction_connections:
            prediction_connections.remove(websocket)


async def broadcast_admin(event: dict):
    """Broadcast event to all admin WebSocket connections."""
    dead = []
    for ws in admin_connections:
        try:
            await ws.send_json(event)
        except Exception:
            dead.append(ws)
    for ws in dead:
        admin_connections.remove(ws)


async def broadcast_chat(session_id: str, event: dict):
    """Broadcast to all clients watching a chat session."""
    conns = chat_connections.get(session_id, [])
    dead = []
    for ws in conns:
        try:
            await ws.send_json(event)
        except Exception:
            dead.append(ws)
    for ws in dead:
        conns.remove(ws)
