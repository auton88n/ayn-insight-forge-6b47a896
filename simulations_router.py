"""
simulations_router.py — MiroFish-compatible /simulations API

Bridges the gap between what the Lovable frontend expects
and what the existing AYN simulation engine provides.
"""

import asyncio
import json
import uuid
from datetime import datetime, timezone
from typing import Optional, Any
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

router = APIRouter(prefix="/simulations")

# ── In-memory simulation store ────────────────────────────────────────────────
# Maps sim_id → simulation state dict
_sims: dict[str, dict] = {}


class CreateSimInput(BaseModel):
    seed: str
    question: str
    rounds: Optional[int] = 3
    agents: Optional[int] = 20


class ChatInput(BaseModel):
    message: str


class InjectInput(BaseModel):
    variable: str
    value: Any


def _get_engine():
    from main import get_engine
    engine = get_engine()
    if not engine:
        raise HTTPException(503, "Simulation engine not ready")
    return engine


def _make_meta(sim_id: str, question: str, seed: str, status: str = "pending",
               rounds_total: int = 3, rounds_done: int = 0) -> dict:
    return {
        "sim_id": sim_id,
        "status": status,
        "question": question,
        "seed_excerpt": seed[:200],
        "rounds_total": rounds_total,
        "rounds_done": rounds_done,
        "agent_count": None,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }


@router.post("")
async def create_simulation(body: CreateSimInput):
    """
    Create and kick off a new simulation.
    Returns SimulationMeta immediately, runs simulation in background.
    """
    engine = _get_engine()
    sim_id = str(uuid.uuid4())

    # Build the event string from seed + question
    event = f"{body.question}. Context: {body.seed[:300]}"

    meta = _make_meta(
        sim_id=sim_id,
        question=body.question,
        seed=body.seed,
        status="building_graph",
        rounds_total=body.rounds or 3,
    )
    meta["agent_count"] = len(engine.agents)
    _sims[sim_id] = {
        "meta": meta,
        "event": event,
        "result": None,
        "graph": None,
        "agents": None,
        "signals": [],
        "emotions": {},
    }

    # Run simulation in background
    asyncio.create_task(_run_sim(sim_id, event, engine))

    return meta


async def _run_sim(sim_id: str, event: str, engine):
    """Background task: runs simulation and stores result."""
    sim = _sims.get(sim_id)
    if not sim:
        return
    try:
        sim["meta"]["status"] = "running"
        result = await engine.run_simulation(event=event, signal_id=None)
        sim["result"] = result
        sim["meta"]["status"] = "completed"
        sim["meta"]["rounds_done"] = sim["meta"]["rounds_total"]

        # Build graph from agents
        sim["graph"] = _build_graph(engine, result)

        # Build agents list with emotions from simulation
        sim["agents"] = _build_agents(engine, result)

        # Extract signals from messages
        sim["signals"] = _extract_signals(result)

    except Exception as e:
        sim["meta"]["status"] = "failed"
        sim["meta"]["error"] = str(e)


def _build_graph(engine, result: dict) -> dict:
    """Build a knowledge graph from agent interactions."""
    nodes = []
    edges = []
    seen_agents = set()

    for msg in result.get("messages", [])[:40]:
        aid = msg.get("agent_id")
        if aid and aid not in seen_agents:
            seen_agents.add(aid)
            agent = engine.agents.get(aid)
            nodes.append({
                "id": aid,
                "label": msg.get("agent_name", aid),
                "type": agent.category if agent else "other",
                "weight": abs(msg.get("belief_score", 0)) / 100,
            })
        # Edge from responding_to
        responding = msg.get("responding_to")
        if responding and aid and responding != aid:
            edges.append({
                "source": responding,
                "target": aid,
                "type": "response",
                "weight": msg.get("emotion_intensity", 50) / 100,
            })

    return {"nodes": nodes, "edges": edges}


def _build_agents(engine, result: dict) -> list:
    """Build agent list with current emotions from simulation."""
    emotion_map = {}
    for msg in result.get("messages", []):
        aid = msg.get("agent_id")
        if aid:
            emotion_map[aid] = {
                "emotion": msg.get("emotion", "neutral"),
                "emotion_intensity": msg.get("emotion_intensity", 50) / 100,
            }

    agents = []
    for aid, agent in engine.agents.items():
        em = emotion_map.get(aid, {})
        agents.append({
            "id": aid,
            "name": agent.name,
            "category": agent.category,
            "flag": agent.flag,
            "emotion": em.get("emotion", "neutral"),
            "emotion_intensity": em.get("emotion_intensity", 0),
            "bio": agent.fears,
        })
    return agents


def _extract_signals(result: dict) -> list:
    """Extract notable signals from simulation messages."""
    signals = []
    for i, msg in enumerate(result.get("messages", [])[:20]):
        pred = msg.get("numerical_prediction", "")
        if pred and "Unable" not in pred:
            signals.append({
                "id": str(i),
                "turn": msg.get("round", 1),
                "headline": pred,
                "summary": msg.get("public_statement", "")[:120],
                "severity": "high" if abs(msg.get("belief_score", 0)) > 50 else "medium",
                "region": None,
                "tags": [msg.get("agent_category", "")],
                "created_at": msg.get("timestamp"),
            })
    return signals[:10]


def _build_report(result: dict, question: str) -> dict:
    """Build EnginReport from simulation synthesis."""
    synthesis = result.get("synthesis", {})
    predictions = result.get("predictions", [])
    financial = result.get("financial_snapshot", {})

    # Build outcomes from synthesis
    outcomes = []
    prob_map = {"Very High": 0.85, "High": 0.70, "Medium": 0.50, "Low": 0.25}
    prob_str = synthesis.get("probability", "Medium")
    prob = prob_map.get(prob_str, 0.50)

    headline = synthesis.get("headline_outcome", "")
    if headline:
        outcomes.append({"label": headline, "probability": prob, "rationale": synthesis.get("human_impact", "")})

    for pred in predictions[:4]:
        outcomes.append({"label": pred, "probability": round(prob * 0.8, 2), "rationale": None})

    # Build drivers from financial data
    drivers = []
    for asset, data in (financial.items() if isinstance(financial, dict) else []):
        if isinstance(data, dict) and "price" in data:
            chg = data.get("change_pct", 0)
            drivers.append({
                "label": f"{asset.upper()} ${data['price']}",
                "weight": min(abs(chg) / 10, 1.0),
                "direction": "up" if chg > 0 else "down" if chg < 0 else "neutral",
            })

    # Dissenting views
    messages = result.get("messages", [])
    dissent = []
    for msg in messages:
        if msg.get("belief_score", 0) < -30:
            dissent.append({
                "agent_id": msg.get("agent_id", ""),
                "agent_name": msg.get("agent_name", ""),
                "view": msg.get("inner_thought", msg.get("public_statement", ""))[:150],
            })
    dissent = dissent[:3]

    return {
        "question": question,
        "outcomes": outcomes[:5],
        "drivers": drivers[:6],
        "confidence": synthesis.get("confidence_score", 50) / 100,
        "summary": synthesis.get("headline_outcome", "Simulation complete."),
        "timeline": [
            {"t": "0-24h", "event": "Primary economic reactions"},
            {"t": "1-7d",  "event": "Institutional response"},
            {"t": "weeks", "event": "Behavioral shifts"},
        ],
        "dissent": dissent,
    }


# ── Routes ────────────────────────────────────────────────────────────────────

@router.get("/{sim_id}")
async def get_simulation(sim_id: str):
    sim = _sims.get(sim_id)
    if not sim:
        raise HTTPException(404, f"Simulation {sim_id} not found")
    return sim["meta"]


@router.get("/{sim_id}/graph")
async def get_graph(sim_id: str):
    sim = _sims.get(sim_id)
    if not sim:
        raise HTTPException(404, f"Simulation {sim_id} not found")
    # Wait up to 30s for graph to be ready
    for _ in range(30):
        if sim.get("graph") is not None:
            return sim["graph"]
        if sim["meta"]["status"] == "failed":
            raise HTTPException(500, "Simulation failed")
        await asyncio.sleep(1)
    return {"nodes": [], "edges": []}


@router.get("/{sim_id}/agents")
async def get_agents(sim_id: str):
    sim = _sims.get(sim_id)
    if not sim:
        raise HTTPException(404, f"Simulation {sim_id} not found")
    engine = _get_engine()
    # Return agents immediately (engine agents are always available)
    if sim.get("agents"):
        return sim["agents"]
    # Return base agents while sim is running
    return [
        {"id": aid, "name": a.name, "category": a.category,
         "flag": a.flag, "emotion": "neutral", "emotion_intensity": 0, "bio": a.fears}
        for aid, a in engine.agents.items()
    ]


@router.get("/{sim_id}/report")
async def get_report(sim_id: str):
    sim = _sims.get(sim_id)
    if not sim:
        raise HTTPException(404, f"Simulation {sim_id} not found")
    # Wait up to 120s for simulation to complete
    for _ in range(120):
        if sim["meta"]["status"] == "completed" and sim.get("result"):
            return _build_report(sim["result"], sim["meta"]["question"])
        if sim["meta"]["status"] == "failed":
            raise HTTPException(500, "Simulation failed")
        await asyncio.sleep(1)
    raise HTTPException(408, "Simulation timed out waiting for report")


@router.post("/{sim_id}/agents/{agent_id}/chat")
async def chat_with_agent(sim_id: str, agent_id: str, body: ChatInput):
    engine = _get_engine()
    if agent_id not in engine.agents:
        raise HTTPException(404, f"Agent '{agent_id}' not found")
    agent = engine.agents[agent_id]
    memories = await agent.get_relevant_memories(body.message)

    from llm_gateway import call_with_fallback
    import os
    result = await call_with_fallback(
        intent="chat",
        messages=[
            {"role": "system", "content": agent._build_system_prompt(memories)},
            {"role": "user", "content": body.message},
        ],
        temperature=0.8,
        max_tokens=400,
    )
    return {"reply": result.get("content", "")}


@router.post("/{sim_id}/report/chat")
async def chat_with_report(sim_id: str, body: ChatInput):
    sim = _sims.get(sim_id)
    if not sim or sim["meta"]["status"] != "completed":
        raise HTTPException(400, "Simulation not complete yet")
    result = sim.get("result", {})
    synthesis = result.get("synthesis", {})
    context = json.dumps(synthesis, indent=2)[:1000]

    from llm_gateway import call_with_fallback
    llm_result = await call_with_fallback(
        intent="chat",
        messages=[
            {"role": "system", "content": f"You are the AYN simulation report analyst. The simulation found: {context}. Answer questions about this simulation's findings concisely."},
            {"role": "user", "content": body.message},
        ],
        temperature=0.7,
        max_tokens=400,
    )
    return {"reply": llm_result.get("content", "")}


@router.post("/{sim_id}/inject")
async def inject_variable(sim_id: str, body: InjectInput):
    sim = _sims.get(sim_id)
    if not sim:
        raise HTTPException(404, f"Simulation {sim_id} not found")
    # Store injection for context in future rounds
    sim.setdefault("injections", []).append({"variable": body.variable, "value": body.value})
    return {"ok": True}


@router.get("/{sim_id}/stream")
async def stream_simulation(sim_id: str, request: Request):
    """SSE stream of simulation progress events."""
    sim = _sims.get(sim_id)
    if not sim:
        raise HTTPException(404, f"Simulation {sim_id} not found")

    async def event_generator():
        last_round = 0
        last_msg_count = 0
        for _ in range(300):  # 5 min max
            if await request.is_disconnected():
                break

            sim_data = _sims.get(sim_id, {})
            meta = sim_data.get("meta", {})
            result = sim_data.get("result")
            status = meta.get("status", "pending")

            # Emit turn events
            rounds_done = meta.get("rounds_done", 0)
            if rounds_done > last_round:
                last_round = rounds_done
                data = json.dumps({"turn": rounds_done, "total": meta.get("rounds_total", 3)})
                yield f"event: turn\ndata: {data}\n\n"

            # Emit signal events from new messages
            if result:
                messages = result.get("messages", [])
                for msg in messages[last_msg_count:]:
                    pred = msg.get("numerical_prediction", "")
                    if pred and "Unable" not in pred:
                        sig = {
                            "id": msg.get("agent_id", ""),
                            "headline": pred,
                            "severity": "high" if abs(msg.get("belief_score", 0)) > 50 else "medium",
                            "turn": msg.get("round", 1),
                        }
                        yield f"event: signal\ndata: {json.dumps(sig)}\n\n"

                    # Emit emotion events
                    em_data = {
                        "agent_id": msg.get("agent_id", ""),
                        "emotion": msg.get("emotion", "neutral"),
                        "intensity": msg.get("emotion_intensity", 50) / 100,
                    }
                    yield f"event: emotion\ndata: {json.dumps(em_data)}\n\n"

                last_msg_count = len(messages)

            if status == "completed":
                report = None
                if result:
                    report = _build_report(result, meta.get("question", ""))
                yield f"event: done\ndata: {json.dumps({'report': report})}\n\n"
                break
            elif status == "failed":
                yield f"event: done\ndata: {json.dumps({'error': 'Simulation failed'})}\n\n"
                break

            await asyncio.sleep(1)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
