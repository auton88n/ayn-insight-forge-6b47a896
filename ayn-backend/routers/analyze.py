"""
routers/analyze.py — chart and document analysis
Replaces: analyze-trading-chart, analyze-floor-plan, parse-pdf-drawing
"""
import logging
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from typing import Optional
from core.auth_new import get_user_id
from core.llm import gemini

router = APIRouter(prefix="/analyze", tags=["analyze"])
log = logging.getLogger("ayn.analyze")


class ChartRequest(BaseModel):
    image: str  # base64
    symbol: str = ""
    timeframe: str = "1h"


class FloorPlanRequest(BaseModel):
    image: str  # base64
    context: Optional[str] = None


@router.post("/chart")
async def analyze_chart(req: ChartRequest, user_id: str = Depends(get_user_id)):
    """Analyze trading chart image. Replaces analyze-trading-chart."""
    try:
        messages = [{"role": "user", "content":
            f"Analyze this trading chart for {req.symbol} on {req.timeframe} timeframe. "
            "Identify: trend, key levels, patterns, signals, recommendation. "
            "Be concise and specific."}]
        result = await gemini(messages, max_tokens=800)
        return {"analysis": result.get("content", ""), "symbol": req.symbol, "ok": True}
    except Exception as e:
        return {"analysis": f"Analysis unavailable: {e}", "ok": False}


@router.post("/floor-plan")
async def analyze_floor_plan(req: FloorPlanRequest, user_id: str = Depends(get_user_id)):
    """Analyze architectural floor plan. Replaces analyze-floor-plan."""
    try:
        messages = [{"role": "user", "content":
            "Analyze this architectural floor plan. Identify: room types, dimensions, "
            "compliance issues, optimization opportunities."}]
        result = await gemini(messages, max_tokens=1000)
        return {"analysis": result.get("content", ""), "ok": True}
    except Exception as e:
        return {"analysis": f"Analysis unavailable: {e}", "ok": False}


# ── Chart analysis history ─────────────────────────────────────────────────────
@router.delete("/chart-analysis/{analysis_id}")
async def delete_chart_analysis(analysis_id: str, user_id: str = Depends(get_user_id)):
    """Delete a chart analysis."""
    from core.database import execute as _execute
    await _execute(
        "DELETE FROM chart_analyses WHERE id=$1::uuid AND user_id=$2::uuid",
        analysis_id, user_id)
    return {"ok": True}
