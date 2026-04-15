"""
routers/intelligence.py — world intelligence endpoints
Expose manual triggers and data reads for the frontend.
"""
from fastapi import APIRouter, Depends
from core.auth import verify_token
from core.db import get_db

router = APIRouter(prefix="/intelligence")


@router.get("/snapshot")
async def get_snapshot():
    """Get current market snapshot."""
    db = get_db()
    r = db.table("ayn_market_snapshot").select("*").eq("singleton_key", 1).maybe_single().execute()
    return {"snapshot": r.data or {}}


@router.get("/signals")
async def get_signals(limit: int = 30, severity: str = None):
    """Get active world signals."""
    db = get_db()
    q = db.table("ayn_world_signals").select("*").eq("status", "active").order("created_at", desc=True).limit(limit)
    if severity:
        q = q.eq("severity", severity)
    r = q.execute()
    return {"signals": r.data or []}


@router.get("/predictions")
async def get_predictions(domain: str = None, limit: int = 20):
    """Get active world predictions."""
    db = get_db()
    q = db.table("ayn_world_predictions").select("*").eq("status", "active").order("created_at", desc=True).limit(limit)
    if domain:
        q = q.eq("domain", domain)
    r = q.execute()
    return {"predictions": r.data or []}


@router.get("/market-predictions")
async def get_market_predictions(horizon: str = "1_week", asset: str = None):
    """Get market price predictions."""
    db = get_db()
    q = (db.table("ayn_consensus_predictions").select("*")
         .eq("status", "active").eq("horizon", horizon)
         .order("consensus_confidence", desc=True).limit(30))
    if asset:
        q = q.eq("asset", asset)
    r = q.execute()
    return {"predictions": r.data or []}


@router.get("/master-predictions")
async def get_master_predictions(limit: int = 12):
    """Get master predictions from graph engine."""
    db = get_db()
    r = db.table("ayn_master_predictions").select("*").order("created_at", desc=True).limit(limit).execute()
    return {"predictions": r.data or []}


@router.get("/countries")
async def get_country_intelligence(limit: int = 20):
    """Get country intelligence profiles."""
    db = get_db()
    r = db.table("ayn_country_intelligence").select("*").limit(limit).execute()
    return {"countries": r.data or []}


@router.post("/trigger/{job}", dependencies=[Depends(verify_token)])
async def trigger_job(job: str):
    """Manually trigger an intelligence job (admin only)."""
    import asyncio
    from services import intelligence, predictions

    jobs = {
        "pulse": intelligence.run_pulse_engine,
        "signals": intelligence.run_world_signals,
        "predictions": predictions.run_prediction_engine,
        "resolver": predictions.run_prediction_resolver,
    }
    for domain in ["geopolitics", "economy", "conflicts", "technology", "jobs",
                   "regions", "business", "warnings", "history", "opportunities"]:
        jobs[f"world-{domain}"] = lambda d=domain: intelligence.run_world_intelligence(d)

    fn = jobs.get(job)
    if not fn:
        return {"error": f"Unknown job: {job}. Available: {list(jobs.keys())}"}

    asyncio.create_task(fn())
    return {"status": "triggered", "job": job}
