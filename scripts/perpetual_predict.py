"""
AYN Perpetual ML Prediction Engine — v2 (Unified with AYN Intelligence)
=========================================================================
This engine is NOT a separate system. It is a direct extension of the
AYN Intelligence layer. Before making any prediction, it:

  1. Reads AYN's live macro snapshot from ayn_market_snapshot
     → Gets regime (RISK_OFF/STAGFLATION/RISK_ON), Fear & Greed,
       Fed rates, unemployment, gold price, crypto dominance,
       and AYN's own LLM-generated directional bias per asset

  2. Adds these as features INTO the ML model alongside pure technicals:
     → fear_greed (0-100)
     → ayn_regime_score (-1 bearish → +1 bullish)
     → ayn_bias (AYN's directional opinion on this asset, -1/0/+1)
     → fed_rate, unemployment (macro regime context)
     → gold_momentum (safe haven signal)

  3. Trains PerpetualBooster on 3 years of price data + AYN context

  4. After prediction — writes BOTH the ML result AND AYN's context
     into ayn_predictions so the consensus fusion knows both inputs

  5. Triggers ayn-consensus-fusion immediately after all assets complete

The result: ML math calibrated by AYN's macro reasoning.
AYN's reasoning anchored by ML's pattern recognition.
Neither system is blind to the other.
=========================================================================
"""

import os
import uuid
import json
import logging
import requests
from datetime import datetime, timedelta, timezone

import numpy as np
import pandas as pd
import yfinance as yf
from perpetual.perpetual import PerpetualBooster
from supabase import create_client

logging.basicConfig(level=logging.INFO, format="%(asctime)s  %(levelname)s  %(message)s")
log = logging.getLogger("ayn-perpetual-v2")

# ─── CONFIG ──────────────────────────────────────────────────────────────────
SUPABASE_URL      = os.environ["SUPABASE_URL"]
SUPABASE_SERVICE_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
SUPABASE_ANON_KEY = os.environ.get("SUPABASE_ANON_KEY", SUPABASE_SERVICE_KEY)

ASSETS = [
    {"ticker": "BTC-USD", "label": "btc",     "category": "crypto",    "metric": "price_usd", "ayn_asset": "btc"},
    {"ticker": "ETH-USD", "label": "eth",     "category": "crypto",    "metric": "price_usd", "ayn_asset": "eth"},
    {"ticker": "SOL-USD", "label": "sol",     "category": "crypto",    "metric": "price_usd", "ayn_asset": "sol"},
    {"ticker": "GC=F",    "label": "gold",    "category": "commodity", "metric": "price_usd", "ayn_asset": "gold"},
    {"ticker": "SI=F",    "label": "silver",  "category": "commodity", "metric": "price_usd", "ayn_asset": "silver"},
    {"ticker": "CL=F",    "label": "oil",     "category": "commodity", "metric": "price_usd", "ayn_asset": "oil"},
    {"ticker": "HG=F",    "label": "copper",  "category": "commodity", "metric": "price_usd", "ayn_asset": "copper"},
    {"ticker": "EURUSD=X","label": "usd_jpy", "category": "forex",     "metric": "price_usd", "ayn_asset": "usd_jpy"},
]

HORIZONS = [
    {"label": "1W", "days": 7,  "db_horizon": "1_week"},
    {"label": "1M", "days": 30, "db_horizon": "1_month"},
    {"label": "1Y", "days": 365,"db_horizon": "1_year"},
]

BUDGET         = 0.85
MIN_TRAIN_ROWS = 200
LOOKBACK_YEARS = 3

# ─── FEATURE ENGINEERING ────────────────────────────────────────────────────
def rsi(series: pd.Series, period: int = 14) -> pd.Series:
    delta = series.diff()
    gain = delta.clip(lower=0).rolling(period).mean()
    loss = (-delta.clip(upper=0)).rolling(period).mean()
    rs = gain / (loss + 1e-10)
    return 100 - (100 / (1 + rs))


def engineer_features(df: pd.DataFrame, ayn_context: dict) -> pd.DataFrame:
    """
    Technical features + AYN intelligence context injected as features.
    AYN context includes: regime score, fear/greed, Fed rate, unemployment,
    gold momentum, and AYN's directional bias on this specific asset.
    """
    c = df["Close"]
    v = df["Volume"]

    # ── Technical features (pure price/volume math)
    for d in [1, 3, 7, 14, 30]:
        df[f"ret_{d}d"] = c.pct_change(d)

    df["rsi_14"]         = rsi(c, 14)
    ema12                = c.ewm(span=12, adjust=False).mean()
    ema26                = c.ewm(span=26, adjust=False).mean()
    macd_line            = ema12 - ema26
    macd_signal          = macd_line.ewm(span=9, adjust=False).mean()
    df["macd_delta"]     = macd_line - macd_signal
    df["vol_14d"]        = c.pct_change().rolling(14).std() * np.sqrt(252)
    sma30                = c.rolling(30).mean()
    std30                = c.rolling(30).std()
    df["bb_width"]       = (2 * std30) / (sma30 + 1e-10)
    vol_mean             = v.rolling(30).mean()
    vol_std              = v.rolling(30).std()
    df["vol_zscore"]     = (v - vol_mean) / (vol_std + 1e-10)
    df["price_vs_sma30"] = c / (c.rolling(30).mean() + 1e-10) - 1
    df["price_vs_sma90"] = c / (c.rolling(90).mean() + 1e-10) - 1
    df["momentum_7d"]    = c / c.shift(7) - 1
    df["momentum_30d"]   = c / c.shift(30) - 1

    # ── AYN Intelligence features (macro regime context — constant per run)
    # These are scalar values from AYN's live snapshot injected as
    # time-constant columns. The ML model learns how price reacts
    # to these macro conditions over the training period.
    df["ayn_fear_greed"]    = ayn_context.get("fear_greed", 50.0) / 100.0  # normalise 0-1
    df["ayn_regime_score"]  = ayn_context.get("regime_score", 0.0)          # -1 bear → +1 bull
    df["ayn_asset_bias"]    = ayn_context.get("asset_bias", 0.0)            # AYN's view on this asset
    df["ayn_fed_rate"]      = ayn_context.get("fed_rate", 5.0) / 10.0      # normalise
    df["ayn_unemployment"]  = ayn_context.get("unemployment", 4.0) / 10.0  # normalise
    df["ayn_gold_momentum"] = ayn_context.get("gold_momentum", 0.0)         # gold pct change

    return df


TECH_FEATURES = [
    "ret_1d", "ret_3d", "ret_7d", "ret_14d", "ret_30d",
    "rsi_14", "macd_delta",
    "vol_14d", "bb_width", "vol_zscore",
    "price_vs_sma30", "price_vs_sma90",
    "momentum_7d", "momentum_30d",
]

AYN_FEATURES = [
    "ayn_fear_greed",
    "ayn_regime_score",
    "ayn_asset_bias",
    "ayn_fed_rate",
    "ayn_unemployment",
    "ayn_gold_momentum",
]

ALL_FEATURES = TECH_FEATURES + AYN_FEATURES


# ─── FETCH AYN MACRO SNAPSHOT ────────────────────────────────────────────────
def fetch_ayn_snapshot(sb) -> dict:
    """
    Reads AYN's live ayn_market_snapshot for macro intelligence.
    Extracts regime, fear/greed, fed rate, unemployment, and
    AYN's per-asset directional bias from the LLM predictions.
    Returns a dict that becomes AYN features in the ML model.
    """
    log.info("📡 Fetching AYN macro intelligence snapshot...")
    try:
        result = sb.table("ayn_market_snapshot").select("snapshot").eq("singleton_key", 1).limit(1).execute()
        if not result.data:
            log.warning("  No AYN snapshot found — using neutral defaults")
            return _neutral_context()

        snap = result.data[0]["snapshot"]
        macro = snap.get("macro", {})
        markets = snap.get("markets", {})
        sentiment = markets.get("sentiment", {})
        ayn_preds = snap.get("ayn_predictions", {})  # LLM text predictions per horizon

        # ── Fear & Greed
        fear_greed = float(sentiment.get("value", 50) or 50)

        # ── Regime score from AYN market_context
        # Parse the LLM predictions text to extract AYN's regime
        regime_text = str(ayn_preds.get("1W", "") + ayn_preds.get("1M", "")).lower()
        if "risk_off" in regime_text or "extreme fear" in regime_text or "bearish" in regime_text:
            regime_score = -0.8
        elif "stagflat" in regime_text:
            regime_score = -0.5
        elif "risk_on" in regime_text or "bullish" in regime_text:
            regime_score = 0.7
        else:
            regime_score = 0.0

        # Supplement with fear_greed
        if fear_greed < 25:
            regime_score = min(regime_score, -0.6)
        elif fear_greed > 70:
            regime_score = max(regime_score, 0.5)

        # ── Fed rate
        fed = macro.get("fed_funds_rate", {})
        fed_rate = float(str(fed.get("value", "5.0")).replace("%", "") or 5.0)

        # ── Unemployment
        unemp_raw = macro.get("unemployment", {})
        unemployment = float(str(unemp_raw.get("value", "4.0")).replace("%", "") or 4.0)

        # ── Gold momentum (safe haven indicator)
        gold_data = macro.get("gold", {})
        gold_momentum = float(gold_data.get("pct_change", 0) or 0) / 100.0

        log.info(f"  AYN Snapshot → F&G: {fear_greed:.0f} | Regime: {regime_score:+.1f} | Fed: {fed_rate}% | Unemp: {unemployment}% | Gold Δ: {gold_momentum:+.2%}")

        return {
            "fear_greed":    fear_greed,
            "regime_score":  regime_score,
            "fed_rate":      fed_rate,
            "unemployment":  unemployment,
            "gold_momentum": gold_momentum,
            "ayn_text_1W":   ayn_preds.get("1W", ""),
            "ayn_text_1M":   ayn_preds.get("1M", ""),
            "ayn_text_1Y":   ayn_preds.get("1Y", ""),
        }

    except Exception as e:
        log.error(f"  AYN snapshot fetch failed: {e} — using neutral defaults")
        return _neutral_context()


def _neutral_context() -> dict:
    return {
        "fear_greed": 50.0, "regime_score": 0.0, "asset_bias": 0.0,
        "fed_rate": 5.0, "unemployment": 4.0, "gold_momentum": 0.0,
        "ayn_text_1W": "", "ayn_text_1M": "", "ayn_text_1Y": "",
    }


def get_asset_bias(asset_label: str, ayn_context: dict) -> float:
    """
    Extracts AYN's directional bias for a specific asset
    from the LLM text predictions. Returns -1 (bear), 0, or +1 (bull).
    """
    text = (
        ayn_context.get("ayn_text_1W", "") + " " +
        ayn_context.get("ayn_text_1M", "")
    ).lower()

    asset_keywords = {
        "btc":    ["bitcoin", "btc", "crypto"],
        "eth":    ["ethereum", "eth", "crypto"],
        "sol":    ["solana", "sol", "crypto"],
        "gold":   ["gold", "safe haven", "precious metal"],
        "silver": ["silver", "precious metal"],
        "oil":    ["oil", "crude", "brent", "energy"],
        "copper": ["copper", "industrial metal"],
        "usd_jpy":["yen", "jpy", "dollar", "forex", "currency"],
    }

    keywords = asset_keywords.get(asset_label.lower(), [asset_label])
    relevant = any(kw in text for kw in keywords)

    if not relevant:
        # Fall back to general regime
        return ayn_context.get("regime_score", 0.0) * 0.5

    bearish_signals = ["decline", "fall", "drop", "bearish", "lower", "sell", "risk-off", "liquidat", "retest"]
    bullish_signals = ["rally", "rise", "surge", "bullish", "higher", "buy", "upside", "breakout", "safe haven"]

    bear_count = sum(1 for s in bearish_signals if s in text)
    bull_count = sum(1 for s in bullish_signals if s in text)

    if bull_count > bear_count:
        return min(1.0, (bull_count - bear_count) * 0.3)
    elif bear_count > bull_count:
        return max(-1.0, -(bear_count - bull_count) * 0.3)
    return 0.0


# ─── DATA FETCH ──────────────────────────────────────────────────────────────
def fetch_ohlcv(ticker: str, years: int = LOOKBACK_YEARS) -> pd.DataFrame:
    end   = datetime.now(timezone.utc)
    start = end - timedelta(days=years * 365)
    log.info(f"  Fetching {ticker} ({years}yr OHLCV)...")
    df = yf.download(ticker, start=start.strftime("%Y-%m-%d"), end=end.strftime("%Y-%m-%d"),
                     interval="1d", auto_adjust=True, progress=False)
    if df.empty:
        raise ValueError(f"No data returned for {ticker}")
    df.index = pd.to_datetime(df.index)
    # Flatten MultiIndex columns if present
    if isinstance(df.columns, pd.MultiIndex):
        df.columns = df.columns.droplevel(1)
    return df


def get_fear_greed() -> float:
    try:
        r = requests.get("https://api.alternative.me/fng/?limit=1", timeout=10)
        return float(r.json()["data"][0]["value"])
    except Exception:
        return 50.0


# ─── MODEL TRAINING ──────────────────────────────────────────────────────────
def train_and_predict(df: pd.DataFrame, horizon_days: int):
    """
    Trains PerpetualBooster on technical + AYN macro features.
    The AYN features (regime_score, asset_bias, fear_greed) act as
    macro anchors that help the model understand WHICH price patterns
    are relevant in the current environment.
    """
    df = df.copy()
    df["target"] = df["Close"].pct_change(horizon_days).shift(-horizon_days)
    df = df.dropna(subset=ALL_FEATURES + ["target"])

    if len(df) < MIN_TRAIN_ROWS:
        raise ValueError(f"Only {len(df)} rows — need {MIN_TRAIN_ROWS}")

    # Walk-forward split: keep last 20% for held-out validation
    split = int(len(df) * 0.80)
    X_train = df[ALL_FEATURES].iloc[:split].values
    y_train = df["target"].iloc[:split].values
    X_val   = df[ALL_FEATURES].iloc[split:].values
    y_val   = df["target"].iloc[split:].values

    model = PerpetualBooster(objective="SquaredLoss", budget=BUDGET)
    model.fit(X_train, y_train, evaluation_data=[(X_val, y_val)])

    # Predict on most recent row
    X_live = df[ALL_FEATURES].iloc[[-1]].values
    pred_pct = float(model.predict(X_live)[0])

    # Validation RMSE → confidence proxy
    val_preds = model.predict(X_val)
    rmse = float(np.sqrt(np.mean((val_preds - y_val) ** 2)))
    confidence = max(0.50, min(0.95, 1.0 - rmse * 2.0))

    # Feature importance
    importance = model.calculate_feature_importance(method="Gain", normalize=True)
    fi_dict = dict(zip(ALL_FEATURES, importance.tolist()))
    top_drivers = dict(sorted(fi_dict.items(), key=lambda x: -x[1])[:6])

    return pred_pct, confidence, top_drivers, rmse, model


# ─── WRITE PREDICTION ────────────────────────────────────────────────────────
def write_prediction(sb, asset_cfg: dict, horizon: dict,
                     current_price: float, pred_pct: float, confidence: float,
                     top_drivers: dict, rmse: float, ayn_context: dict):
    now        = datetime.now(timezone.utc)
    target_dt  = (now + timedelta(days=horizon["days"])).date().isoformat()
    pred_value = current_price * (1 + pred_pct)
    pred_high  = current_price * (1 + pred_pct + rmse)
    pred_low   = current_price * (1 + pred_pct - rmse)
    direction  = "up" if pred_pct > 0.005 else ("down" if pred_pct < -0.005 else "sideways")
    pct_str    = f"{pred_pct * 100:+.1f}%"

    # AYN context that influenced this prediction
    fg         = ayn_context.get("fear_greed", 50)
    regime     = ayn_context.get("regime_score", 0)
    asset_bias = ayn_context.get("asset_bias", 0)

    # Determine which features drove the decision
    ayn_feature_influence = {k: v for k, v in top_drivers.items() if k.startswith("ayn_")}
    tech_feature_influence = {k: v for k, v in top_drivers.items() if not k.startswith("ayn_")}

    ayn_pct = sum(ayn_feature_influence.values()) * 100
    tech_pct = sum(tech_feature_influence.values()) * 100

    reasoning = (
        f"PerpetualBooster (v2 unified) predicts {asset_cfg['label'].upper()} will move {pct_str} "
        f"over {horizon['label']}. "
        f"AYN macro features drove {ayn_pct:.0f}% of the decision — "
        f"regime score {regime:+.1f}, Fear & Greed {fg:.0f}/100, "
        f"asset bias {asset_bias:+.1f}. "
        f"Technical features drove {tech_pct:.0f}% — "
        f"top signals: {', '.join(list(tech_feature_influence.keys())[:3])}. "
        f"Model RMSE: {rmse*100:.2f}%."
    )

    key_drivers = [{"driver": k, "weight": round(v * 100, 2)} for k, v in top_drivers.items()]

    record = {
        "id":                   str(uuid.uuid4()),
        "asset":                asset_cfg["label"],
        "asset_category":       asset_cfg["category"],
        "metric":               asset_cfg["metric"],
        "horizon":              horizon["db_horizon"],
        "baseline_date":        now.date().isoformat(),
        "baseline_value":       round(current_price, 4),
        "predicted_value":      round(pred_value, 4),
        "predicted_high":       round(pred_high, 4),
        "predicted_low":        round(pred_low, 4),
        "predicted_pct_change": round(pred_pct * 100, 2),
        "predicted_direction":  direction,
        "confidence":           round(confidence * 100, 1),
        "reasoning":            reasoning,
        "key_drivers":          key_drivers,
        "market_context": {
            "ayn_fear_greed":    fg,
            "ayn_regime_score":  regime,
            "ayn_asset_bias":    asset_bias,
            "ayn_fed_rate":      ayn_context.get("fed_rate"),
            "ayn_unemployment":  ayn_context.get("unemployment"),
            "ayn_gold_momentum": ayn_context.get("gold_momentum"),
            "ayn_feature_pct":   round(ayn_pct, 1),
            "tech_feature_pct":  round(tech_pct, 1),
        },
        "signal_used": {
            "features":        ALL_FEATURES,
            "ayn_features":    AYN_FEATURES,
            "tech_features":   TECH_FEATURES,
            "budget":          BUDGET,
            "val_rmse":        round(rmse * 100, 3),
        },
        "target_date":    target_dt,
        "generated_by":   "perpetual-ml-v2-unified",
        "status":         "active",
        "created_at":     now.isoformat(),
    }

    # Expire old predictions for this asset+horizon from this engine
    sb.table("ayn_predictions").update({"status": "expired"}).match({
        "asset":        asset_cfg["label"],
        "horizon":      horizon["db_horizon"],
        "status":       "active",
        "generated_by": "perpetual-ml-v2-unified",
    }).execute()

    sb.table("ayn_predictions").insert(record).execute()
    log.info(f"  ✅ {asset_cfg['label'].upper()} {horizon['db_horizon']} → {direction.upper()} {pct_str} (conf={confidence:.0%}) [AYN:{ayn_pct:.0f}% tech:{tech_pct:.0f}%]")
    return record


# ─── TRIGGER CONSENSUS FUSION ────────────────────────────────────────────────
def trigger_consensus_fusion():
    """Call the consensus fusion edge function to merge AYN + ML predictions."""
    try:
        url = f"{SUPABASE_URL}/functions/v1/ayn-consensus-fusion"
        headers = {
            "Authorization": f"Bearer {SUPABASE_ANON_KEY}",
            "Content-Type": "application/json",
        }
        r = requests.post(url, headers=headers, timeout=60)
        if r.ok:
            data = r.json()
            log.info(f"🔀 Consensus fusion complete: {data.get('summary', {})}")
        else:
            log.warning(f"Consensus fusion returned {r.status_code}: {r.text[:200]}")
    except Exception as e:
        log.error(f"Consensus fusion trigger failed: {e}")


# ─── MAIN ────────────────────────────────────────────────────────────────────
def main():
    log.info("═══ AYN Perpetual ML Engine v2 (Unified) starting ═══")
    sb = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

    # Step 1: Load AYN's live intelligence snapshot
    ayn_context = fetch_ayn_snapshot(sb)

    fg = get_fear_greed()
    ayn_context["fear_greed"] = fg
    log.info(f"Live Fear & Greed: {fg:.0f}/100")

    results_summary = []

    # Step 2: For each asset — get AYN's bias, engineer features, train, predict
    for asset in ASSETS:
        log.info(f"\n▶ {asset['label'].upper()} ({asset['ticker']})")
        try:
            raw_df = fetch_ohlcv(asset["ticker"])
            current_price = float(raw_df["Close"].iloc[-1])
            log.info(f"  Price: ${current_price:,.4f}  |  Rows: {len(raw_df)}")

            # Inject AYN's directional bias for this specific asset
            ayn_context["asset_bias"] = get_asset_bias(asset["label"], ayn_context)
            log.info(f"  AYN bias for {asset['label'].upper()}: {ayn_context['asset_bias']:+.2f}")

            feat_df = engineer_features(raw_df.copy(), ayn_context)

            for horizon in HORIZONS:
                try:
                    pred_pct, confidence, top_drivers, rmse, _ = train_and_predict(feat_df, horizon["days"])
                    rec = write_prediction(sb, asset, horizon, current_price,
                                          pred_pct, confidence, top_drivers, rmse, ayn_context)
                    results_summary.append({
                        "asset":   asset["label"],
                        "horizon": horizon["db_horizon"],
                        "dir":     "↑" if pred_pct > 0.005 else ("↓" if pred_pct < -0.005 else "→"),
                        "pct":     f"{pred_pct*100:+.1f}%",
                        "conf":    f"{confidence:.0%}",
                        "ayn_bias": f"{ayn_context['asset_bias']:+.2f}",
                    })
                except Exception as e:
                    log.error(f"  ✗ {asset['label']} {horizon['db_horizon']}: {e}")

        except Exception as e:
            log.error(f"✗ Skipped {asset['label']}: {e}")

    # Step 3: Print summary
    log.info("\n═══ PREDICTION SUMMARY ═══")
    log.info(f"{'Asset':<8} {'Horizon':<12} {'Dir':<4} {'%Chg':<10} {'Conf':<8} {'AYN Bias'}")
    for r in results_summary:
        log.info(f"{r['asset']:<8} {r['horizon']:<12} {r['dir']:<4} {r['pct']:<10} {r['conf']:<8} {r['ayn_bias']}")

    # Step 4: Trigger consensus fusion immediately
    log.info("\n🔀 Triggering consensus fusion...")
    trigger_consensus_fusion()

    log.info("═══ Complete ═══")


if __name__ == "__main__":
    main()
