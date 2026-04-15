"""
routers/simulation.py — Agent Society simulation endpoints
Proxies to engine.aynn.io (the existing Railway simulation service).
Also exposes conversation history directly from Supabase.
"""
import os
import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional
from core.auth import verify_token
from core.db import get_db

router = APIRouter(prefix="/simulation")

ENGINE_URL = os.getenv("ENGINE_URL", "https://engine.aynn.io")
ENGINE_TIMEOUT = 300.0  # 5 min — simulations can run long


class SimulationRequest(BaseModel):
    event: str
    signal_id: Optional[str] = None
    mode: str = "full"
    use_ayn_data: bool = True
    use_reflection: bool = False
    focus_categories: list[str] = []
    focus_races: list[str] = []
    focus_countries: list[str] = []
    focus_classes: list[str] = []
    focus_genders: list[str] = []
    crowd_size: int = 15
    visibility: str = "private"


@router.post("/run")
async def run_simulation(body: SimulationRequest, user_id: str = Depends(verify_token)):
    """Proxy to engine.aynn.io /simulate. Attaches user_id for data isolation."""
    async with httpx.AsyncClient(timeout=ENGINE_TIMEOUT) as client:
        try:
            r = await client.post(
                f"{ENGINE_URL}/simulate",
                json={**body.model_dump(), "user_id": user_id},
            )
            if not r.is_success:
                raise HTTPException(r.status_code, r.text[:200])
            return r.json()
        except httpx.TimeoutException:
            raise HTTPException(504, "Simulation timed out")
        except httpx.ConnectError:
            raise HTTPException(503, "Simulation engine unavailable")


@router.get("/conversations")
async def get_conversations(
    limit: int = 20,
    status: str = "complete",
    user_id: str = Depends(verify_token),
):
    """Get agent conversations — public ones + user's own."""
    db = get_db()
    q = (db.table("ayn_agent_conversations")
         .select("id,topic,status,created_at,signal_id,metadata,visibility,user_id")
         .order("created_at", desc=True)
         .limit(limit))

    if user_id != "internal":
        # Return public + user's own
        q = q.or_(f"visibility.eq.public,user_id.eq.{user_id}")
    if status:
        q = q.eq("status", status)

    r = q.execute()
    return {"conversations": r.data or []}


@router.get("/conversations/{conv_id}/messages")
async def get_conversation_messages(conv_id: str, user_id: str = Depends(verify_token)):
    """Get all messages for a conversation."""
    db = get_db()
    # Verify access
    conv = db.table("ayn_agent_conversations").select("visibility,user_id").eq("id", conv_id).maybe_single().execute()
    if conv.data:
        visibility = conv.data.get("visibility", "private")
        owner = conv.data.get("user_id")
        if visibility == "private" and owner != user_id and user_id != "internal":
            raise HTTPException(403, "Access denied")

    r = (db.table("ayn_agent_messages")
         .select("*")
         .eq("conversation_id", conv_id)
         .order("sequence_order")
         .execute())
    return {"messages": r.data or []}


@router.get("/agents")
async def list_agents():
    """List all agents from the simulation engine."""
    async with httpx.AsyncClient(timeout=10.0) as client:
        try:
            r = await client.get(f"{ENGINE_URL}/agents")
            return r.json()
        except Exception:
            return {"agents": [], "error": "Engine unavailable"}


@router.get("/health")
async def simulation_health():
    """Check simulation engine health."""
    async with httpx.AsyncClient(timeout=5.0) as client:
        try:
            r = await client.get(f"{ENGINE_URL}/health")
            return r.json()
        except Exception:
            return {"status": "unavailable"}
