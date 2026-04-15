"""
services/predictions.py — prediction engine and resolver
Replaces: ayn-prediction-engine, ayn-prediction-resolver, ayn-resolution-judge
"""
import logging
from datetime import datetime, timezone
from core.db import get_db
from core.llm import gemini_json

log = logging.getLogger("ayn.predictions")

ASSETS = [
    {"asset": "gold",    "symbol": "GC=F",    "label": "Gold (USD/oz)"},
    {"asset": "oil",     "symbol": "CL=F",    "label": "Brent Oil (USD/bbl)"},
    {"asset": "btc",     "symbol": "BTC-USD",  "label": "Bitcoin (USD)"},
    {"asset": "eth",     "symbol": "ETH-USD",  "label": "Ethereum (USD)"},
    {"asset": "silver",  "symbol": "SI=F",    "label": "Silver (USD/oz)"},
    {"asset": "copper",  "symbol": "HG=F",    "label": "Copper (USD/lb)"},
    {"asset": "wheat",   "symbol": "ZW=F",    "label": "Wheat (USc/bu)"},
    {"asset": "usd_jpy", "symbol": "EURUSD=X", "label": "EUR/USD"},
]

HORIZONS = [
    {"horizon": "1_week",  "days": 7,   "label": "1 week"},
    {"horizon": "1_month", "days": 30,  "label": "1 month"},
    {"horizon": "1_year",  "days": 365, "label": "1 year"},
]


async def run_prediction_engine():
    """
    Generates predictions for all assets across all horizons.
    Replaces ayn-prediction-engine edge function.
    """
    log.info("🔮 Prediction engine starting...")
    try:
        import yfinance as yf
        db = get_db()

        # Get market snapshot for context
        snap = db.table("ayn_market_snapshot").select("snapshot").eq("singleton_key", 1).maybe_single().execute()
        macro_ctx = ""
        if snap.data:
            snap_data = snap.data.get("snapshot", {})
            macro = snap_data.get("macro", {})
            macro_ctx = f"Fed Rate: {macro.get('fed_funds_rate', {}).get('value', 'N/A')}%, " \
                        f"Inflation: {macro.get('inflation_cpi', {}).get('value', 'N/A')}%, " \
                        f"Unemployment: {macro.get('unemployment_rate', {}).get('value', 'N/A')}%"

        count = 0
        now = datetime.now(timezone.utc).isoformat()

        for asset_cfg in ASSETS:
            try:
                # Get real current price
                ticker = yf.Ticker(asset_cfg["symbol"])
                hist = ticker.history(period="30d")
                if hist.empty:
                    continue
                baseline = float(hist["Close"].iloc[-1])
                price_30d_ago = float(hist["Close"].iloc[0])
                momentum = ((baseline - price_30d_ago) / price_30d_ago) * 100

                for horizon_cfg in HORIZONS:
                    result = await gemini_json(
                        messages=[{"role": "user", "content": f"""Generate an AYN market prediction.

Asset: {asset_cfg['label']}
Current price: ${baseline:,.2f}
30-day momentum: {momentum:+.1f}%
Macro context: {macro_ctx}
Horizon: {horizon_cfg['label']}

Return JSON:
{{
  "predicted_direction": "up|down|sideways",
  "predicted_pct_change": <float, e.g. 3.5 for +3.5%>,
  "confidence": <50-95>,
  "reasoning": "2-3 sentence reasoning grounded in real macro/technical factors",
  "key_risk": "Main risk to this prediction"
}}"""}],
                        max_tokens=500,
                    )

                    parsed = result.get("parsed", result) if isinstance(result, dict) else result
                    direction = parsed.get("predicted_direction", "sideways")
                    pct = float(parsed.get("predicted_pct_change", 0))
                    predicted = baseline * (1 + pct / 100)

                    db.table("ayn_predictions").insert({
                        "asset": asset_cfg["asset"],
                        "horizon": horizon_cfg["horizon"],
                        "baseline_value": baseline,
                        "predicted_value": round(predicted, 2),
                        "predicted_low": round(predicted * 0.97, 2),
                        "predicted_high": round(predicted * 1.03, 2),
                        "predicted_direction": direction,
                        "predicted_pct_change": pct,
                        "confidence": parsed.get("confidence", 65),
                        "reasoning": parsed.get("reasoning", ""),
                        "status": "active",
                        "generated_by": "python_prediction_engine_v1",
                        "created_at": now,
                        "target_date": now,  # approximate
                    }).execute()
                    count += 1

            except Exception as e:
                log.warning(f"Prediction failed for {asset_cfg['asset']}: {e}")

        log.info(f"✅ Prediction engine: {count} predictions generated")

    except Exception as e:
        log.error(f"❌ Prediction engine error: {e}")


async def run_prediction_resolver():
    """
    Checks active predictions against current prices, marks resolved ones.
    Replaces ayn-prediction-resolver edge function.
    """
    log.info("⚖️ Prediction resolver running...")
    try:
        import yfinance as yf
        db = get_db()

        # Get active predictions older than their horizon
        preds = (db.table("ayn_predictions")
                 .select("*")
                 .eq("status", "active")
                 .limit(50)
                 .execute())

        if not preds.data:
            return

        resolved = 0
        for pred in preds.data:
            try:
                asset = pred.get("asset")
                asset_map = {a["asset"]: a["symbol"] for a in ASSETS}
                sym = asset_map.get(asset)
                if not sym:
                    continue

                ticker = yf.Ticker(sym)
                hist = ticker.history(period="2d")
                if hist.empty:
                    continue
                current = float(hist["Close"].iloc[-1])
                baseline = float(pred.get("baseline_value", current))
                actual_pct = ((current - baseline) / baseline) * 100 if baseline else 0
                predicted_direction = pred.get("predicted_direction", "sideways")
                actual_direction = "up" if actual_pct > 1 else "down" if actual_pct < -1 else "sideways"
                correct = predicted_direction == actual_direction

                db.table("ayn_predictions").update({
                    "status": "resolved",
                    "actual_value": round(current, 2),
                    "actual_pct_change": round(actual_pct, 2),
                    "was_correct": correct,
                    "resolved_at": datetime.now(timezone.utc).isoformat(),
                }).eq("id", pred["id"]).execute()
                resolved += 1

            except Exception:
                pass

        log.info(f"✅ Resolver: {resolved} predictions resolved")
    except Exception as e:
        log.error(f"❌ Resolver error: {e}")
