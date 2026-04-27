"""
routers/realtime.py — WebSocket endpoints
Replaces: supabase.channel().on('postgres_changes') realtime subscriptions
"""
import json
import logging
import asyncio
import os
import uuid
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from core.auth_new import verify_access_token
from core.database import fetchval
from core.redis_client import get_redis

router = APIRouter(prefix="/ws", tags=["realtime"])
log = logging.getLogger("ayn.realtime")
INSTANCE_ID = os.getenv("APP_INSTANCE_ID", str(uuid.uuid4())[:8])

# Connection managers (local only)
admin_connections: list[WebSocket] = []
chat_connections: dict[str, list[WebSocket]] = {}
prediction_connections: list[WebSocket] = []
_predictions_broadcaster_task: asyncio.Task | None = None
_redis_listener_task: asyncio.Task | None = None

CHANNEL_ADMIN = "realtime:admin"
CHANNEL_CHAT = "realtime:chat"
CHANNEL_PREDICTIONS = "realtime:predictions"


async def start_realtime_bus():
    global _redis_listener_task
    if _redis_listener_task is not None:
        return

    redis = await get_redis()
    if not redis:
        log.warning("[ws] Redis not configured; fanout is instance-local only")
        return

    async def _listener():
        pubsub = redis.pubsub()
        await pubsub.subscribe(CHANNEL_ADMIN, CHANNEL_CHAT, CHANNEL_PREDICTIONS)
        try:
            while True:
                msg = await pubsub.get_message(ignore_subscribe_messages=True, timeout=1.0)
                if not msg:
                    await asyncio.sleep(0.05)
                    continue
                try:
                    payload = json.loads(msg["data"])
                    if payload.get("source") == INSTANCE_ID:
                        continue
                    ch = msg["channel"]
                    if ch == CHANNEL_ADMIN:
                        await _broadcast_admin_local(payload.get("event", {}))
                    elif ch == CHANNEL_CHAT:
                        await _broadcast_chat_local(payload.get("session_id", ""), payload.get("event", {}))
                    elif ch == CHANNEL_PREDICTIONS:
                        await _broadcast_predictions_local(payload.get("event", {}))
                except Exception as e:
                    log.debug(f"[ws] redis listener decode error: {e}")
        finally:
            await pubsub.close()

    _redis_listener_task = asyncio.create_task(_listener())


async def stop_realtime_bus():
    global _redis_listener_task
    if _redis_listener_task:
        _redis_listener_task.cancel()
        try:
            await _redis_listener_task
        except Exception:
            pass
        _redis_listener_task = None


async def _auth_ws(websocket: WebSocket) -> str | None:
    """Authenticate a WebSocket connection via query param or first message."""
    auth_header = websocket.headers.get("authorization", "")
    token = None
    if auth_header.startswith("Bearer "):
        token = auth_header.removeprefix("Bearer ").strip()
    if not token:
        token = websocket.query_params.get("token")
    if token:
        try:
            payload = verify_access_token(token)
            return payload["sub"]
        except Exception:
            await websocket.close(code=1008)
            return None
    return "anonymous"


async def _predictions_broadcaster():
    """Single broadcaster loop to avoid one DB polling loop per connection."""
    global _predictions_broadcaster_task
    try:
        while prediction_connections:
            try:
                count = await fetchval(
                    "SELECT COUNT(*) FROM ayn_world_predictions WHERE status='active'"
                )
                event = {"type": "predictions_update", "count": count or 0}
                await _broadcast_predictions_local(event)
                await _publish(CHANNEL_PREDICTIONS, {"event": event})
            except Exception:
                pass
            await asyncio.sleep(60)
    finally:
        _predictions_broadcaster_task = None


async def _is_admin(user_id: str) -> bool:
    if user_id in ("anonymous", "internal"):
        return False
    try:
        flag = await fetchval("SELECT is_admin FROM users WHERE id = $1::uuid", user_id)
        return bool(flag)
    except Exception:
        return False


async def _publish(channel: str, payload: dict):
    redis = await get_redis()
    if not redis:
        return
    await redis.publish(channel, json.dumps({"source": INSTANCE_ID, **payload}))


async def _broadcast_admin_local(event: dict):
    dead = []
    for ws in admin_connections:
        try:
            await ws.send_json(event)
        except Exception:
            dead.append(ws)
    for ws in dead:
        if ws in admin_connections:
            admin_connections.remove(ws)


async def _broadcast_chat_local(session_id: str, event: dict):
    conns = chat_connections.get(session_id, [])
    dead = []
    for ws in conns:
        try:
            await ws.send_json(event)
        except Exception:
            dead.append(ws)
    for ws in dead:
        if ws in conns:
            conns.remove(ws)


async def _broadcast_predictions_local(event: dict):
    dead = []
    for ws in prediction_connections:
        try:
            await ws.send_json(event)
        except Exception:
            dead.append(ws)
    for ws in dead:
        if ws in prediction_connections:
            prediction_connections.remove(ws)


@router.websocket("/admin")
async def ws_admin(websocket: WebSocket):
    """Admin real-time updates. Replaces supabase.channel('admin')."""
    await websocket.accept()
    user_id = await _auth_ws(websocket)
    if not user_id:
        return
    if not await _is_admin(user_id):
        await websocket.close(code=1008)
        return
    admin_connections.append(websocket)
    log.info(f"[ws] Admin connected: {user_id[:8]}")
    try:
        while True:
            await asyncio.sleep(30)
            await websocket.send_json({"type": "heartbeat", "ts": asyncio.get_event_loop().time()})
    except WebSocketDisconnect:
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
            await websocket.send_json({"type": "ack", "data": data})
    except WebSocketDisconnect:
        if session_id in chat_connections and websocket in chat_connections[session_id]:
            chat_connections[session_id].remove(websocket)


@router.websocket("/predictions")
async def ws_predictions(websocket: WebSocket):
    """Prediction updates. Replaces supabase.channel('predictions')."""
    await websocket.accept()
    user_id = await _auth_ws(websocket)
    if not user_id:
        return
    prediction_connections.append(websocket)
    global _predictions_broadcaster_task
    if _predictions_broadcaster_task is None:
        _predictions_broadcaster_task = asyncio.create_task(_predictions_broadcaster())
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        if websocket in prediction_connections:
            prediction_connections.remove(websocket)


async def broadcast_admin(event: dict):
    """Broadcast event to all admin websockets across instances."""
    await _broadcast_admin_local(event)
    await _publish(CHANNEL_ADMIN, {"event": event})


async def broadcast_chat(session_id: str, event: dict):
    """Broadcast event to all chat subscribers across instances."""
    await _broadcast_chat_local(session_id, event)
    await _publish(CHANNEL_CHAT, {"session_id": session_id, "event": event})
