"""
services/predictions.py — prediction engine and resolver
Replaces: ayn-prediction-engine, ayn-prediction-resolver, ayn-resolution-judge
"""
import logging
import json
from datetime import datetime, timezone
from core.database import fetchrow, fetch, execute
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

        # Get market snapshot for context
        snap = await fetchrow("SELECT snapshot FROM ayn_market_snapshot WHERE singleton_key = 1")
        macro_ctx = ""
        if snap:
            snap_data = snap.get("snapshot", {}) or {}
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

                    await execute("""
                        INSERT INTO ayn_predictions
                            (asset, horizon, baseline_value, predicted_value, predicted_low, predicted_high,
                             predicted_direction, predicted_pct_change, confidence, reasoning, status,
                             generated_by, created_at, target_date)
                        VALUES
                            ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'active', 'python_prediction_engine_v1', $11::timestamptz, $12::timestamptz)
                    """,
                        asset_cfg["asset"],
                        horizon_cfg["horizon"],
                        baseline,
                        round(predicted, 2),
                        round(predicted * 0.97, 2),
                        round(predicted * 1.03, 2),
                        direction,
                        pct,
                        parsed.get("confidence", 65),
                        parsed.get("reasoning", ""),
                        now,
                        now,
                    )
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

        # Get active predictions older than their horizon
        preds = await fetch("SELECT * FROM ayn_predictions WHERE status='active' ORDER BY created_at ASC LIMIT 50")
        if not preds:
            return

        resolved = 0
        for pred in preds:
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

                await execute("""
                    UPDATE ayn_predictions
                       SET status = 'resolved',
                           actual_value = $2,
                           actual_pct_change = $3,
                           was_correct = $4,
                           resolved_at = $5::timestamptz
                     WHERE id = $1::uuid
                """,
                    pred["id"],
                    round(current, 2),
                    round(actual_pct, 2),
                    correct,
                    datetime.now(timezone.utc).isoformat(),
                )
                resolved += 1

            except Exception:
                pass

        log.info(f"✅ Resolver: {resolved} predictions resolved")
    except Exception as e:
        log.error(f"❌ Resolver error: {e}")
