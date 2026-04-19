"""
routers/intelligence.py — World Intelligence data endpoints

All data now reads from Railway Postgres (spine owns it).
Schedulers write to Railway, frontend reads from Railway via spine.
"""
import asyncio
import logging
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from core.auth_new import get_user_id, get_user_id_optional
from core.database import fetch, fetchrow, fetchval, execute

router = APIRouter(prefix="/intelligence", tags=["intelligence"])
log = logging.getLogger("ayn.intelligence")


@router.get("/all")
async def get_all_intelligence(user_id: str = Depends(get_user_id_optional)):
    """Get all world intelligence data for the dashboard."""
    try:
        results = await asyncio.gather(
            fetchrow("SELECT snapshot, fetched_at, intelligence_brief FROM ayn_market_snapshot WHERE singleton_key = 1"),
            fetch("SELECT * FROM ayn_world_signals WHERE status = 'active' ORDER BY created_at DESC LIMIT 50"),
            fetch("SELECT * FROM ayn_world_predictions WHERE status = 'active' ORDER BY created_at DESC LIMIT 100"),
            fetch("SELECT * FROM ayn_mind ORDER BY created_at DESC LIMIT 50"),
            fetch("SELECT * FROM ayn_opportunity_alerts ORDER BY created_at DESC LIMIT 30"),
            fetch("SELECT * FROM ayn_market_prices WHERE singleton_key = 1 LIMIT 1"),
            fetch("SELECT * FROM ayn_predictions WHERE status = 'active' ORDER BY created_at DESC LIMIT 50"),
            fetch("SELECT * FROM ayn_country_intelligence LIMIT 20"),
            fetch("SELECT * FROM ayn_accuracy_calibration ORDER BY last_updated DESC NULLS LAST LIMIT 50"),
            return_exceptions=True
        )

        def safe(r, default=[]):
            return r if not isinstance(r, Exception) else default

        return {
            "market_snapshot":       safe(results[0], None),
            "world_signals":         safe(results[1]),
            "world_predictions":     safe(results[2]),
            "mind":                  safe(results[3]),
            "opportunity_alerts":    safe(results[4]),
            "market_prices":         safe(results[5], [None])[0] if safe(results[5]) else None,
            "predictions":           safe(results[6]),
            "country_intelligence":  safe(results[7]),
            "accuracy":              safe(results[8]),
            # Legacy aliases so old frontend code still works
            "master_predictions":    safe(results[2])[:8],
            "consensus_predictions": safe(results[6])[:60],
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
async def get_accuracy(user_id: str = Depends(get_user_id_optional)):
    try:
        rows = await fetch(
            "SELECT * FROM ayn_accuracy_calibration ORDER BY last_updated DESC NULLS LAST LIMIT 50"
        )
        return rows
    except Exception:
        return []


@router.get("/prediction-outcomes")
async def get_prediction_outcomes(
    limit: int = Query(200, le=500),
    user_id: str = Depends(get_user_id_optional)
):
    """Resolved prediction outcomes joined with the original prediction."""
    try:
        rows = await fetch(
            """
            SELECT o.was_direction_correct, o.accuracy_score, o.actual_date,
                   o.actual_direction, o.actual_pct_change, o.value_error_pct,
                   o.prediction_id,
                   p.asset, p.horizon, p.predicted_direction, p.predicted_pct_change
            FROM ayn_prediction_outcomes o
            LEFT JOIN ayn_predictions p ON p.id = o.prediction_id
            ORDER BY o.actual_date DESC NULLS LAST
            LIMIT $1
            """,
            limit,
        )
        # Reshape to mimic the legacy nested ayn_predictions object the frontend expects
        out = []
        for r in rows:
            d = dict(r)
            d["ayn_predictions"] = {
                "asset": d.pop("asset", None),
                "horizon": d.pop("horizon", None),
                "predicted_direction": d.pop("predicted_direction", None),
                "predicted_pct_change": d.pop("predicted_pct_change", None),
            }
            out.append(d)
        return out
    except Exception as e:
        log.error(f"[intelligence] prediction-outcomes error: {e}")
        return []


@router.get("/agent-conversations")
async def get_agent_conversations(
    limit: int = Query(20, le=100),
    user_id: str = Depends(get_user_id_optional)
):
    try:
        rows = await fetch(
            "SELECT * FROM ayn_agent_conversations ORDER BY created_at DESC LIMIT $1",
            limit,
        )
        return rows
    except Exception:
        return []


@router.get("/agent-states")
async def get_agent_states(
    limit: int = Query(100, le=500),
    user_id: str = Depends(get_user_id_optional)
):
    try:
        rows = await fetch("SELECT * FROM ayn_agent_states LIMIT $1", limit)
        return rows
    except Exception:
        return []


@router.get("/critical-signals")
async def get_critical_signals(
    limit: int = Query(8, le=50),
    user_id: str = Depends(get_user_id_optional)
):
    """High/critical world signals for the AgentSociety trigger panel."""
    try:
        rows = await fetch(
            """SELECT id, signal_type, severity, headline, region,
                      impact_on_oil, impact_on_gold, impact_on_btc, created_at
               FROM ayn_world_signals
               WHERE status = 'active' AND severity IN ('critical','high')
               ORDER BY created_at DESC LIMIT $1""",
            limit,
        )
        return rows
    except Exception:
        return []


@router.get("/world-simulations")
async def get_world_simulations(
    limit: int = Query(10, le=50),
    user_id: str = Depends(get_user_id_optional)
):
    try:
        rows = await fetch(
            "SELECT * FROM ayn_world_simulations ORDER BY created_at DESC LIMIT $1",
            limit,
        )
        return rows
    except Exception:
        return []


@router.get("/world-events")
async def get_world_events(
    simulation_run_id: str = Query(...),
    user_id: str = Depends(get_user_id_optional)
):
    try:
        rows = await fetch(
            "SELECT * FROM ayn_world_events WHERE simulation_run_id = $1::uuid ORDER BY cascade_depth ASC",
            simulation_run_id,
        )
        return rows
    except Exception:
        return []


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
