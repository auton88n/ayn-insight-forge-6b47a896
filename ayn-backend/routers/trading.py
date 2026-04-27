"""
routers/trading.py — trading data endpoints
Replaces: get-klines edge function
"""
import logging
import httpx
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from typing import Optional
from core.auth_new import get_user_id

router = APIRouter(prefix="/trading", tags=["trading"])
log = logging.getLogger("ayn.trading")


class KlinesRequest(BaseModel):
    symbol: str = "BTCUSDT"
    interval: str = "1h"
    limit: int = 100


@router.post("/klines")
async def get_klines(req: KlinesRequest, user_id: str = Depends(get_user_id)):
    """Get candlestick data from Binance. Replaces get-klines edge function."""
    try:
        url = "https://api.binance.com/api/v3/klines"
        async with httpx.AsyncClient(timeout=10.0) as client:
            r = await client.get(url, params={
                "symbol": req.symbol.upper(),
                "interval": req.interval,
                "limit": req.limit
            })
        if r.is_success:
            raw = r.json()
            klines = [{
                "time": k[0], "open": float(k[1]), "high": float(k[2]),
                "low": float(k[3]), "close": float(k[4]), "volume": float(k[5])
            } for k in raw]
            return {"klines": klines, "symbol": req.symbol, "interval": req.interval}
        return {"klines": [], "error": r.text}
    except Exception as e:
        log.error(f"[trading] klines error: {e}")
        return {"klines": [], "error": str(e)}


@router.get("/klines")
async def get_klines_query(
    symbol: str = "BTCUSDT",
    interval: str = "1h",
    limit: int = 100,
    user_id: str = Depends(get_user_id)
):
    """GET version of klines endpoint."""
    return await get_klines(KlinesRequest(symbol=symbol, interval=interval, limit=limit), user_id)
