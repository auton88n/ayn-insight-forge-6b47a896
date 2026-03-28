"""
AYN Perpetual ML Prediction Engine
===================================
Trains gradient-boosting models (PerpetualBooster) on live market data
and writes calibrated predictions to Supabase ayn_predictions table.

Assets covered: BTC, ETH, SOL (crypto) + SPY, GLD, QQQ, IWM (equity ETFs)
Horizons: 1W (7d), 1M (30d), 3M (90d)
Schedule: runs every 6 hours via GitHub Actions

Features engineered per candle:
  - Returns: 1d, 3d, 7d, 14d, 30d
  - Momentum: RSI-14, MACD signal delta
  - Volatility: 14d realised vol, 30d BB width
  - Volume: 7d volume z-score
  - Macro proxy: BTC dominance (for crypto)
"""

import os
import uuid
import json
import logging
from datetime import datetime, timedelta, timezone

import numpy as np
import pandas as pd
import requests
import yfinance as yf
from perpetual import PerpetualBooster
from supabase import create_client

logging.basicConfig(level=logging.INFO, format="%(asctime)s  %(levelname)s  %(message)s")
log = logging.getLogger("ayn-perpetual")

# ─── CONFIG ──────────────────────────────────────────────────────────────────
SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_SERVICE_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]

ASSETS = [
    {"ticker": "BTC-USD",  "label": "BTC",  "category": "crypto",  "metric": "price_usd"},
    {"ticker": "ETH-USD",  "label": "ETH",  "category": "crypto",  "metric": "price_usd"},
    {"ticker": "SOL-USD",  "label": "SOL",  "category": "crypto",  "metric": "price_usd"},
    {"ticker": "SPY",      "label": "SPY",  "category": "equity",  "metric": "price_usd"},
    {"ticker": "GLD",      "label": "GOLD", "category": "commodity","metric": "price_usd"},
    {"ticker": "QQQ",      "label": "QQQ",  "category": "equity",  "metric": "price_usd"},
]

HORIZONS = [
    {"label": "1W", "days": 7},
    {"label": "1M", "days": 30},
    {"label": "3M", "days": 90},
]

BUDGET = 0.8          # PerpetualBooster accuracy budget (0–1). 0.8 = high accuracy
MIN_TRAIN_ROWS = 200  # Minimum rows to train on
LOOKBACK_YEARS = 3    # Years of historical data


# ─── FEATURE ENGINEERING ─────────────────────────────────────────────────────
def rsi(series: pd.Series, period: int = 14) -> pd.Series:
    delta = series.diff()
    gain = delta.clip(lower=0).rolling(period).mean()
    loss = (-delta.clip(upper=0)).rolling(period).mean()
    rs = gain / (loss + 1e-10)
    return 100 - (100 / (1 + rs))


def engineer_features(df: pd.DataFrame) -> pd.DataFrame:
    c = df["Close"]
    v = df["Volume"]

    # Returns
    for d in [1, 3, 7, 14, 30]:
        df[f"ret_{d}d"] = c.pct_change(d)

    # Momentum
    df["rsi_14"] = rsi(c, 14)
    ema12 = c.ewm(span=12, adjust=False).mean()
    ema26 = c.ewm(span=26, adjust=False).mean()
    macd_line = ema12 - ema26
    macd_signal = macd_line.ewm(span=9, adjust=False).mean()
    df["macd_delta"] = macd_line - macd_signal

    # Volatility
    df["vol_14d"] = c.pct_change().rolling(14).std() * np.sqrt(252)
    sma30 = c.rolling(30).mean()
    std30 = c.rolling(30).std()
    df["bb_width"] = (2 * std30) / (sma30 + 1e-10)

    # Volume z-score
    vol_mean = v.rolling(30).mean()
    vol_std = v.rolling(30).std()
    df["vol_zscore"] = (v - vol_mean) / (vol_std + 1e-10)

    # Price vs moving averages
    df["price_vs_sma30"] = c / (c.rolling(30).mean() + 1e-10) - 1
    df["price_vs_sma90"] = c / (c.rolling(90).mean() + 1e-10) - 1

    return df.dropna()


# ─── DATA FETCH ──────────────────────────────────────────────────────────────
def fetch_ohlcv(ticker: str, years: int = LOOKBACK_YEARS) -> pd.DataFrame:
    end = datetime.now(timezone.utc)
    start = end - timedelta(days=years * 365)
    log.info(f"  Fetching {ticker} ({years}yr OHLCV)...")
    df = yf.download(ticker, start=start.strftime("%Y-%m-%d"), end=end.strftime("%Y-%m-%d"),
                     interval="1d", auto_adjust=True, progress=False)
    if df.empty:
        raise ValueError(f"No data returned for {ticker}")
    df.index = pd.to_datetime(df.index)
    return df


def get_fear_greed() -> float:
    """Returns the current Fear & Greed index (0–100)."""
    try:
        r = requests.get("https://api.alternative.me/fng/?limit=1", timeout=10)
        return float(r.json()["data"][0]["value"])
    except Exception:
        return 50.0


# ─── MODEL TRAINING + PREDICTION ─────────────────────────────────────────────
FEATURE_COLS = [
    "ret_1d", "ret_3d", "ret_7d", "ret_14d", "ret_30d",
    "rsi_14", "macd_delta",
    "vol_14d", "bb_width", "vol_zscore",
    "price_vs_sma30", "price_vs_sma90",
]


def train_and_predict(df: pd.DataFrame, horizon_days: int):
    """
    Trains a PerpetualBooster to predict forward return over horizon_days,
    then predicts on the most recent candle.

    Returns:
      pred_pct_change: predicted % change (float)
      confidence: model confidence proxy (0–1)
      feature_importance: dict of top drivers
    """
    df = df.copy()
    df["target"] = df["Close"].pct_change(horizon_days).shift(-horizon_days)
    df = df.dropna(subset=FEATURE_COLS + ["target"])

    if len(df) < MIN_TRAIN_ROWS:
        raise ValueError(f"Only {len(df)} rows — need {MIN_TRAIN_ROWS}")

    # Walk-forward split: keep last 20% for held-out validation
    split = int(len(df) * 0.80)
    X_train = df[FEATURE_COLS].iloc[:split].values
    y_train = df["target"].iloc[:split].values
    X_val   = df[FEATURE_COLS].iloc[split:].values
    y_val   = df["target"].iloc[split:].values

    model = PerpetualBooster(objective="SquaredLoss", budget=BUDGET)
    model.fit(X_train, y_train, evaluation_data=[(X_val, y_val)])

    # Predict on the most recent row (the live candle)
    X_live = df[FEATURE_COLS].iloc[[-1]].values
    pred_pct = float(model.predict(X_live)[0])

    # Validation RMSE → confidence proxy (lower error = higher confidence)
    val_preds = model.predict(X_val)
    rmse = float(np.sqrt(np.mean((val_preds - y_val) ** 2)))
    # Normalise: rmse of 0.05 (5%) → confidence 0.85; rmse 0.15 → 0.60
    confidence = max(0.50, min(0.95, 1.0 - rmse * 2.5))

    # Feature importance (built into Perpetual)
    importance = model.calculate_feature_importance(method="Gain", normalize=True)
    fi_dict = dict(zip(FEATURE_COLS, importance.tolist()))
    top_drivers = sorted(fi_dict.items(), key=lambda x: -x[1])[:4]

    return pred_pct, confidence, dict(top_drivers), rmse, model


# ─── SUPABASE WRITE ──────────────────────────────────────────────────────────
def write_prediction(supabase_client, asset_cfg: dict, horizon: dict,
                     current_price: float, pred_pct: float, confidence: float,
                     top_drivers: dict, rmse: float, fg_index: float):
    now = datetime.now(timezone.utc)
    target_date = (now + timedelta(days=horizon["days"])).date().isoformat()

    pred_value = current_price * (1 + pred_pct)
    pred_high  = current_price * (1 + pred_pct + rmse)
    pred_low   = current_price * (1 + pred_pct - rmse)
    direction  = "BULLISH" if pred_pct > 0.005 else ("BEARISH" if pred_pct < -0.005 else "NEUTRAL")

    pct_str = f"{pred_pct * 100:+.1f}%"
    reasoning = (
        f"PerpetualBooster ML model predicts {asset_cfg['label']} will move {pct_str} "
        f"over the next {horizon['label']}. "
        f"Top signal drivers: {', '.join(top_drivers.keys())}. "
        f"Model validation RMSE: {rmse*100:.2f}%. "
        f"Market sentiment (Fear & Greed): {fg_index:.0f}/100."
    )

    key_drivers = [
        {"driver": k, "weight": round(v * 100, 1)}
        for k, v in top_drivers.items()
    ]

    record = {
        "id": str(uuid.uuid4()),
        "asset": asset_cfg["label"],
        "asset_category": asset_cfg["category"],
        "metric": asset_cfg["metric"],
        "horizon": horizon["label"],
        "baseline_date": now.date().isoformat(),
        "baseline_value": round(current_price, 4),
        "predicted_value": round(pred_value, 4),
        "predicted_high": round(pred_high, 4),
        "predicted_low": round(pred_low, 4),
        "predicted_pct_change": round(pred_pct * 100, 2),
        "predicted_direction": direction,
        "confidence": round(confidence, 3),
        "reasoning": reasoning,
        "key_drivers": key_drivers,
        "fear_greed_at_prediction": round(fg_index, 0),
        "generated_by": "perpetual-ml-v1",
        "market_regime": "RISK_ON" if fg_index > 55 else ("RISK_OFF" if fg_index < 35 else "NEUTRAL"),
        "status": "active",
        "signal_used": {"features": FEATURE_COLS, "budget": BUDGET, "val_rmse": round(rmse * 100, 3)},
        "target_date": target_date,
        "created_at": now.isoformat(),
    }

    # Upsert: expire old active predictions for same asset+horizon
    supabase_client.table("ayn_predictions").update({"status": "expired"}).match({
        "asset": asset_cfg["label"],
        "horizon": horizon["label"],
        "status": "active",
        "generated_by": "perpetual-ml-v1",
    }).execute()

    result = supabase_client.table("ayn_predictions").insert(record).execute()
    log.info(f"  ✅ Wrote {asset_cfg['label']} {horizon['label']} → {direction} {pct_str} (conf={confidence:.0%})")
    return result


# ─── MAIN ────────────────────────────────────────────────────────────────────
def main():
    log.info("═══ AYN Perpetual ML Engine starting ═══")
    sb = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    fg = get_fear_greed()
    log.info(f"Fear & Greed index: {fg:.0f}")

    results_summary = []

    for asset in ASSETS:
        log.info(f"▶ Processing {asset['label']} ({asset['ticker']})")
        try:
            raw_df = fetch_ohlcv(asset["ticker"])
            feat_df = engineer_features(raw_df)
            current_price = float(raw_df["Close"].iloc[-1])
            log.info(f"  Current price: ${current_price:,.4f}  |  Rows: {len(feat_df)}")

            for horizon in HORIZONS:
                try:
                    pred_pct, confidence, top_drivers, rmse, _ = train_and_predict(feat_df, horizon["days"])
                    write_prediction(sb, asset, horizon, current_price, pred_pct, confidence, top_drivers, rmse, fg)
                    results_summary.append({
                        "asset": asset["label"],
                        "horizon": horizon["label"],
                        "direction": "↑" if pred_pct > 0.005 else ("↓" if pred_pct < -0.005 else "→"),
                        "pct": f"{pred_pct*100:+.1f}%",
                        "conf": f"{confidence:.0%}",
                    })
                except Exception as e:
                    log.error(f"  ✗ {asset['label']} {horizon['label']}: {e}")

        except Exception as e:
            log.error(f"✗ Skipped {asset['label']}: {e}")

    # Print summary table
    log.info("\n═══ PREDICTION SUMMARY ═══")
    log.info(f"{'Asset':<8} {'Horizon':<6} {'Dir':<4} {'%Chg':<10} {'Conf'}")
    log.info("─" * 42)
    for r in results_summary:
        log.info(f"{r['asset']:<8} {r['horizon']:<6} {r['direction']:<4} {r['pct']:<10} {r['conf']}")
    log.info(f"\n✅ {len(results_summary)} predictions written to Supabase.")


if __name__ == "__main__":
    main()
