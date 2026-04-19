"""
routers/intelligence.py — World Intelligence data endpoints

All data now reads from Railway Postgres (spine owns it).
Schedulers write to Railway, frontend reads from Railway via spine.
"""
import asyncio
import logging
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from core.auth_new import get_user_id
from core.database import fetch, fetchrow, fetchval, execute

router = APIRouter(prefix="/intelligence", tags=["intelligence"])
log = logging.getLogger("ayn.intelligence")


@router.get("/all")
async def get_all_intelligence(user_id: str = Depends(get_user_id)):
    """Get all world intelligence data for the dashboard."""
    try:
        results = await asyncio.gather(
            fetchrow("SELECT snapshot, fetched_at FROM ayn_market_snapshot WHERE singleton_key = 1"),
            fetch("SELECT * FROM ayn_world_signals WHERE status = 'active' ORDER BY created_at DESC LIMIT 30"),
            fetch("SELECT * FROM ayn_master_predictions ORDER BY created_at DESC LIMIT 8"),
            fetch("""SELECT id, asset, asset_category, consensus_direction, consensus_strength,
                           ayn_direction, ayn_reasoning, horizon, status, consensus_confidence,
                           created_at FROM ayn_consensus_predictions
                     WHERE status = 'active' ORDER BY consensus_confidence DESC LIMIT 60"""),
            fetch("SELECT * FROM ayn_country_intelligence LIMIT 20"),
            fetch("SELECT * FROM ayn_accuracy_calibration ORDER BY updated_at DESC LIMIT 10"),
            return_exceptions=True
        )

        return {
            "market_snapshot": results[0] if not isinstance(results[0], Exception) else None,
            "world_signals":   results[1] if not isinstance(results[1], Exception) else [],
            "master_predictions": results[2] if not isinstance(results[2], Exception) else [],
            "consensus_predictions": results[3] if not isinstance(results[3], Exception) else [],
            "country_intelligence": results[4] if not isinstance(results[4], Exception) else [],
            "accuracy": results[5] if not isinstance(results[5], Exception) else [],
        }
    except Exception as e:
        log.error(f"[intelligence] get_all error: {e}")
        raise HTTPException(500, str(e))


@router.get("/market-snapshot")
async def get_market_snapshot(user_id: str = Depends(get_user_id)):
    row = await fetchrow("SELECT * FROM ayn_market_snapshot WHERE singleton_key = 1")
    return row or {}


@router.get("/signals")
async def get_world_signals(
    limit: int = Query(30, le=100),
    severity: str = Query(None),
    user_id: str = Depends(get_user_id)
):
    if severity:
        rows = await fetch(
            "SELECT * FROM ayn_world_signals WHERE status = 'active' AND severity = $1 ORDER BY created_at DESC LIMIT $2",
            severity, limit
        )
    else:
        rows = await fetch(
            "SELECT * FROM ayn_world_signals WHERE status = 'active' ORDER BY created_at DESC LIMIT $1",
            limit
        )
    return rows


@router.get("/predictions")
async def get_world_predictions(
    limit: int = Query(30, le=100),
    domain: str = Query(None),
    user_id: str = Depends(get_user_id)
):
    if domain:
        rows = await fetch(
            "SELECT * FROM ayn_world_predictions WHERE status = 'active' AND domain = $1 ORDER BY created_at DESC LIMIT $2",
            domain, limit
        )
    else:
        rows = await fetch(
            "SELECT * FROM ayn_world_predictions WHERE status = 'active' ORDER BY created_at DESC LIMIT $1",
            limit
        )
    return rows


@router.get("/consensus")
async def get_consensus_predictions(
    horizon: str = Query("1W"),
    asset: str = Query(None),
    user_id: str = Depends(get_user_id)
):
    if asset:
        rows = await fetch(
            """SELECT * FROM ayn_consensus_predictions
               WHERE status = 'active' AND horizon = $1 AND asset = $2
               ORDER BY consensus_confidence DESC LIMIT 30""",
            horizon, asset
        )
    else:
        rows = await fetch(
            """SELECT * FROM ayn_consensus_predictions
               WHERE status = 'active' AND horizon = $1
               ORDER BY consensus_confidence DESC LIMIT 30""",
            horizon
        )
    return rows


@router.get("/master-predictions")
async def get_master_predictions(
    limit: int = Query(10, le=50),
    user_id: str = Depends(get_user_id)
):
    rows = await fetch(
        "SELECT * FROM ayn_master_predictions ORDER BY created_at DESC LIMIT $1",
        limit
    )
    return rows


@router.get("/country-intelligence")
async def get_country_intelligence(
    limit: int = Query(20, le=100),
    user_id: str = Depends(get_user_id)
):
    rows = await fetch("SELECT * FROM ayn_country_intelligence LIMIT $1", limit)
    return rows


@router.get("/accuracy")
async def get_accuracy(user_id: str = Depends(get_user_id)):
    rows = await fetch(
        "SELECT * FROM ayn_accuracy_calibration ORDER BY updated_at DESC LIMIT 20"
    )
    return rows


@router.get("/agent-messages")
async def get_agent_messages(
    conversation_id: str = Query(None),
    limit: int = Query(50, le=200),
    user_id: str = Depends(get_user_id)
):
    if conversation_id:
        rows = await fetch(
            "SELECT * FROM ayn_agent_messages WHERE conversation_id = $1 ORDER BY created_at DESC LIMIT $2",
            conversation_id, limit
        )
    else:
        rows = await fetch(
            "SELECT * FROM ayn_agent_messages ORDER BY created_at DESC LIMIT $1",
            limit
        )
    return rows


@router.get("/mind")
async def get_ayn_mind(user_id: str = Depends(get_user_id)):
    rows = await fetch("SELECT * FROM ayn_mind ORDER BY created_at DESC LIMIT 50")
    return rows


@router.get("/opportunity-alerts")
async def get_opportunity_alerts(user_id: str = Depends(get_user_id)):
    rows = await fetch(
        "SELECT * FROM ayn_opportunity_alerts ORDER BY created_at DESC LIMIT 30"
    )
    return rows


class VoteRequest(BaseModel):
    pred_id: str
    vote: str
    user_id: str = ""


@router.post("/vote")
async def vote_prediction(req: VoteRequest, uid: str = Depends(get_user_id)):
    """Vote on a prediction."""
    try:
        await execute(
            """INSERT INTO ayn_prediction_votes (prediction_id, user_id, vote, created_at)
               VALUES ($1::uuid, $2::uuid, $3, NOW())
               ON CONFLICT (prediction_id, user_id) DO UPDATE SET vote = $3""",
            req.pred_id, uid, req.vote
        )
        return {"ok": True}
    except Exception as e:
        raise HTTPException(500, str(e))


@router.post("/simulate")
async def trigger_simulation(body: dict, user_id: str = Depends(get_user_id)):
    """
    Proxy to simulation engine for WorldSimulator.tsx.
    Delegates to /simulation/run.
    """
    import httpx, os
    ENGINE_URL = os.getenv("ENGINE_URL", "https://engine.aynn.io")
    try:
        async with httpx.AsyncClient(timeout=300.0) as client:
            r = await client.post(
                f"{ENGINE_URL}/simulate",
                json={**body, "user_id": user_id},
            )
            if not r.is_success:
                raise HTTPException(r.status_code, r.text[:200])
            return r.json()
    except httpx.TimeoutException:
        raise HTTPException(504, "Simulation timed out")
    except httpx.ConnectError:
        raise HTTPException(503, "Simulation engine unavailable")
