"""
routers/intelligence.py — world intelligence endpoints
Expose manual triggers and data reads for the frontend.
"""
from fastapi import APIRouter, Depends
from core.auth import verify_token
from core.db import get_db

router = APIRouter(prefix="/intelligence")




@router.get("/all")
async def get_all_intelligence(user_id: str = None):
    """
    Single endpoint returning all world intelligence data in one request.
    Replaces 5 separate Supabase calls in WorldIntelligence.tsx.
    All queries run in parallel — total time = slowest single query.
    """
    import asyncio
    db = get_db()

    async def fetch_snapshot():
        try:
            r = db.table("ayn_market_snapshot").select("snapshot,fetched_at").eq("singleton_key", 1).maybe_single().execute()
            return r.data or {}
        except Exception:
            return {}

    async def fetch_signals():
        try:
            r = db.table("ayn_world_signals").select("*").eq("status", "active").order("created_at", desc=True).limit(30).execute()
            return r.data or []
        except Exception:
            return []

    async def fetch_master_predictions():
        try:
            r = db.table("ayn_master_predictions").select("*").order("created_at", desc=True).limit(8).execute()
            return r.data or []
        except Exception:
            return []

    async def fetch_consensus_predictions():
        try:
            r = db.table("ayn_consensus_predictions").select(
                "id,asset,horizon,target_date,baseline_value,consensus_direction,"
                "consensus_pct_change,consensus_confidence,consensus_strength,"
                "ayn_reasoning,agreement,fusion_method,boost_factor"
            ).eq("status", "active").order("consensus_confidence", desc=True).limit(60).execute()
            return r.data or []
        except Exception:
            return []

    async def fetch_country_intel():
        try:
            r = db.table("ayn_country_intelligence").select(
                "country_code,country_name,intelligence_brief,economy,hot_sectors,opportunities"
            ).limit(20).execute()
            return r.data or []
        except Exception:
            return []

    async def fetch_calibration():
        try:
            r = db.table("ayn_accuracy_calibration").select(
                "asset,real_accuracy_pct,reliability_tier,should_show_uncertainty,calibration_factor"
            ).execute()
            return r.data or []
        except Exception:
            return []

    # Run all queries in parallel
    snapshot, signals, master_preds, consensus_preds, country_intel, calibration = await asyncio.gather(
        fetch_snapshot(),
        fetch_signals(),
        fetch_master_predictions(),
        fetch_consensus_predictions(),
        fetch_country_intel(),
        fetch_calibration(),
        return_exceptions=True,
    )

    return {
        "snapshot":           snapshot if not isinstance(snapshot, Exception) else {},
        "signals":            signals if not isinstance(signals, Exception) else [],
        "master_predictions": master_preds if not isinstance(master_preds, Exception) else [],
        "consensus_predictions": consensus_preds if not isinstance(consensus_preds, Exception) else [],
        "country_intel":      country_intel if not isinstance(country_intel, Exception) else [],
        "calibration":        calibration if not isinstance(calibration, Exception) else [],
    }

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
