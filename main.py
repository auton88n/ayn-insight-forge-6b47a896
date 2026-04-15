"""
AYN Python Simulation Engine — Main Server

FastAPI backend replacing Supabase edge functions for the Agent Society.
Agents persist in memory across calls — real belief states, real ChromaDB memory.

Deploy: Railway / Render / any VPS
"""

import os
import asyncio
from contextlib import asynccontextmanager
from typing import Optional
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from openai import AsyncOpenAI

load_dotenv()

# ── Config ────────────────────────────────────────────────────────────────────
OPENAI_API_KEY  = os.getenv("OPENAI_API_KEY", "")
LLM_BASE_URL    = os.getenv("LLM_BASE_URL", None)
LLM_MODEL       = os.getenv("LLM_MODEL", "gpt-4o-mini")
SUPABASE_URL    = os.getenv("SUPABASE_URL", "")
SUPABASE_KEY    = os.getenv("SUPABASE_SERVICE_KEY", "")
PORT            = int(os.getenv("PORT", 8000))
ALLOWED_ORIGINS = os.getenv("ALLOWED_ORIGINS", "*").split(",")

# ── Global engine singleton ────────────────────────────────────────────────────
_engine = None

def get_engine():
    return _engine


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _engine

    print("🚀 Starting AYN Simulation Engine...")
    print(f"   LLM model  : {LLM_MODEL}")
    print(f"   LLM base   : {LLM_BASE_URL or 'OpenAI default'}")
    print(f"   Supabase   : {SUPABASE_URL[:40]}..." if SUPABASE_URL else "   Supabase   : NOT SET ⚠️")

    llm_kwargs: dict = {"api_key": OPENAI_API_KEY}
    if LLM_BASE_URL:
        llm_kwargs["base_url"] = LLM_BASE_URL

    llm_client = AsyncOpenAI(**llm_kwargs)

    from layers.simulation_engine import SimulationEngine

    _engine = SimulationEngine(
        llm_client=llm_client,
        model=LLM_MODEL,
        supabase_url=SUPABASE_URL,
        supabase_key=SUPABASE_KEY,
    )

    print(f"✅ Engine ready — {len(_engine.agents)} agents loaded")
    yield
    print("🛑 AYN engine shutting down")


# ── App ───────────────────────────────────────────────────────────────────────
app = FastAPI(
    title="AYN Simulation Engine",
    description="7-layer world simulation with persistent agents",
    version="2.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Request models ────────────────────────────────────────────────────────────
class SimulationRequest(BaseModel):
    event: str
    signal_id: Optional[str] = None
    mode: str = "full"


class ChatRequest(BaseModel):
    agent_id: str
    message: str
    history: list[dict] = []


class InjectSignalRequest(BaseModel):
    """Supabase-compatible payload — mirrors old edge function inject_event mode."""
    mode: str = "inject_event"
    event: Optional[str] = None
    signal_id: Optional[str] = None
    signal_headline: Optional[str] = None
    signal_summary: Optional[str] = None


# ── Routes ────────────────────────────────────────────────────────────────────
@app.get("/")
async def root():
    engine = get_engine()
    return {
        "status": "running",
        "version": "2.1.0",
        "agents": len(engine.agents) if engine else 0,
        "engine_ready": engine is not None,
    }


@app.get("/health")
async def health():
    engine = get_engine()
    from llm_gateway import check_providers
    providers = await check_providers()
    return {
        "status": "healthy",
        "engine_ready": engine is not None,
        "agent_count": len(engine.agents) if engine else 0,
        "providers": providers,
    }


@app.post("/simulate")
async def simulate(request: SimulationRequest):
    """Run full 7-layer simulation on any event."""
    engine = get_engine()
    if not engine:
        raise HTTPException(503, "Engine not initialized")
    if not request.event or len(request.event.strip()) < 5:
        raise HTTPException(400, "Event too short")

    try:
        result = await engine.run_simulation(
            event=request.event,
            signal_id=request.signal_id,
        )
        return result
    except Exception as e:
        raise HTTPException(500, str(e))


@app.post("/inject")
async def inject_signal(request: InjectSignalRequest):
    """Compat endpoint — called by AgentSociety when a live world signal fires."""
    engine = get_engine()
    if not engine:
        raise HTTPException(503, "Engine not initialized")

    event = request.event or request.signal_headline or ""
    if request.signal_summary:
        event = f"{event}. {request.signal_summary}".strip(". ")
    if not event:
        raise HTTPException(400, "No event provided")

    try:
        result = await engine.run_simulation(event=event, signal_id=request.signal_id)
        return result
    except Exception as e:
        raise HTTPException(500, str(e))


@app.post("/chat")
async def chat_with_agent(request: ChatRequest):
    """Chat with a specific agent using their persistent memory."""
    engine = get_engine()
    if not engine:
        raise HTTPException(503, "Engine not initialized")
    if request.agent_id not in engine.agents:
        raise HTTPException(404, f"Agent '{request.agent_id}' not found")

    agent = engine.agents[request.agent_id]

    try:
        memories = await agent.get_relevant_memories(request.message)

        llm_kwargs: dict = {"api_key": OPENAI_API_KEY}
        if LLM_BASE_URL:
            llm_kwargs["base_url"] = LLM_BASE_URL
        llm = AsyncOpenAI(**llm_kwargs)

        response = await llm.chat.completions.create(
            model=LLM_MODEL,
            messages=[
                {"role": "system", "content": agent._build_system_prompt(memories)},
                *request.history[-10:],
                {"role": "user", "content": request.message},
            ],
            temperature=0.8,
            max_tokens=400,
        )

        return {
            "response": response.choices[0].message.content,
            "agent_id": request.agent_id,
            "agent_name": agent.name,
            "agent_flag": agent.flag,
            "belief_score": agent.belief_score,
        }
    except Exception as e:
        raise HTTPException(500, str(e))


@app.get("/agents")
async def list_agents():
    engine = get_engine()
    if not engine:
        raise HTTPException(503, "Engine not initialized")

    return {
        "agents": [
            {
                "id": aid,
                "name": a.name,
                "flag": a.flag,
                "category": a.category,
                "belief_score": a.belief_score,
                "memory_count": a.memory.count() if hasattr(a.memory, "count") else 0,
            }
            for aid, a in engine.agents.items()
        ]
    }


@app.get("/agents/{agent_id}")
async def get_agent(agent_id: str):
    engine = get_engine()
    if not engine:
        raise HTTPException(503, "Engine not initialized")
    if agent_id not in engine.agents:
        raise HTTPException(404, f"Agent '{agent_id}' not found")

    a = engine.agents[agent_id]
    return {
        "id": agent_id,
        "name": a.name,
        "flag": a.flag,
        "category": a.category,
        "voice": a.voice,
        "fears": a.fears,
        "bias": a.bias,
        "exposed_to": a.exposed_to,
        "belief_score": a.belief_score,
        "belief_history": a.belief_history,
        "memory_count": a.memory.count() if hasattr(a.memory, "count") else 0,
    }


@app.get("/agents/{agent_id}/memories")
async def get_agent_memories(agent_id: str, query: str = "recent events"):
    engine = get_engine()
    if not engine:
        raise HTTPException(503, "Engine not initialized")
    if agent_id not in engine.agents:
        raise HTTPException(404, f"Agent '{agent_id}' not found")

    a = engine.agents[agent_id]
    memories = await a.get_relevant_memories(query, n=10)
    return {
        "agent_id": agent_id,
        "agent_name": a.name,
        "belief_score": a.belief_score,
        "belief_history": a.belief_history,
        "memories": memories,
    }


@app.get("/conversations")
async def get_conversations(limit: int = 20, status: str = "complete"):
    """Read conversations from Supabase — used by AgentSociety React component."""
    engine = get_engine()
    if not engine:
        raise HTTPException(503, "Engine not initialized")

    try:
        result = (
            engine.supabase.table("ayn_agent_conversations")
            .select("id,topic,status,created_at,signal_id,metadata")
            .eq("status", status)
            .order("created_at", desc=True)
            .limit(limit)
            .execute()
        )
        return {"conversations": result.data or []}
    except Exception as e:
        raise HTTPException(500, str(e))


@app.get("/conversations/{conv_id}/messages")
async def get_conversation_messages(conv_id: str):
    engine = get_engine()
    if not engine:
        raise HTTPException(503, "Engine not initialized")

    try:
        result = (
            engine.supabase.table("ayn_agent_messages")
            .select("*")
            .eq("conversation_id", conv_id)
            .order("sequence_order")
            .execute()
        )
        return {"messages": result.data or []}
    except Exception as e:
        raise HTTPException(500, str(e))


# ── Entry point ───────────────────────────────────────────────────────────────
if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=PORT, reload=False)
