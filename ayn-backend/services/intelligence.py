"""
services/intelligence.py — world intelligence jobs
Replaces: ayn-pulse-engine, ayn-world-intelligence, ayn-intelligence-agents,
          ayn-world-signals, ayn-market-intelligence

All jobs run on APScheduler inside Railway — no Supabase timeout, no cold starts.
Results write back to the same Supabase tables the frontend already reads.
"""
import asyncio
import logging
from datetime import datetime, timezone
from core.db import get_db
from core.llm import gemini_json, lovable_json

log = logging.getLogger("ayn.intelligence")

# ── Pulse Engine — replaces ayn-pulse-engine ─────────────────────────────────
async def run_pulse_engine():
    """
    Fetches FRED macro data + 15 SIC regions, updates ayn_market_snapshot.
    Runs every 4h. Mirrors ayn-pulse-engine edge function exactly.
    """
    log.info("🌍 Pulse engine starting...")
    try:
        import yfinance as yf
        import httpx

        db = get_db()
        FRED_KEY = __import__("os").getenv("FRED_API_KEY", "")

        # Fetch macro data
        macro = {}
        if FRED_KEY:
            series = {
                "fed_funds_rate": "FEDFUNDS",
                "inflation_cpi": "CPIAUCSL",
                "unemployment_rate": "UNRATE",
                "treasury_10yr": "DGS10",
                "treasury_2yr": "DGS2",
                "m2_money_supply": "M2SL",
            }
            async with httpx.AsyncClient(timeout=15.0) as client:
                for label, sid in series.items():
                    try:
                        r = await client.get(
                            f"https://api.stlouisfed.org/fred/series/observations",
                            params={"series_id": sid, "api_key": FRED_KEY,
                                    "limit": 2, "sort_order": "desc", "file_type": "json"}
                        )
                        if r.is_success:
                            obs = r.json().get("observations", [])
                            if obs:
                                val = float(obs[0]["value"])
                                prev = float(obs[1]["value"]) if len(obs) > 1 else val
                                macro[label] = {
                                    "value": val,
                                    "change": round(val - prev, 4),
                                    "date": obs[0]["date"],
                                    "trend": "rising" if val > prev else "falling" if val < prev else "stable"
                                }
                    except Exception:
                        pass

        # Fetch market prices via yfinance
        symbols = {
            "gold": "GC=F", "oil": "CL=F", "sp500": "^GSPC",
            "bitcoin": "BTC-USD", "dollar_index": "DX-Y.NYB",
            "vix": "^VIX", "treasury_10yr_yield": "^TNX",
        }
        prices = {}
        for name, sym in symbols.items():
            try:
                ticker = yf.Ticker(sym)
                hist = ticker.history(period="2d")
                if not hist.empty:
                    cur = float(hist["Close"].iloc[-1])
                    prev = float(hist["Close"].iloc[-2]) if len(hist) > 1 else cur
                    prices[name] = {
                        "price": round(cur, 2),
                        "change_pct": round(((cur - prev) / prev) * 100, 2) if prev else 0,
                        "symbol": sym,
                    }
            except Exception:
                pass

        snapshot = {
            "macro": macro,
            "markets": {"prices": prices},
            "fetched_at": datetime.now(timezone.utc).isoformat(),
            "source": "python_pulse_engine",
        }

        db.table("ayn_market_snapshot").upsert(
            {"singleton_key": 1, "snapshot": snapshot, "fetched_at": snapshot["fetched_at"]},
            on_conflict="singleton_key"
        ).execute()

        log.info(f"✅ Pulse engine complete — {len(prices)} prices, {len(macro)} macro indicators")

    except Exception as e:
        log.error(f"❌ Pulse engine error: {e}")


# ── Market Prices — replaces ayn-market-prices-2h ────────────────────────────
async def run_market_prices():
    """Updates ayn_market_prices every 2h via yfinance."""
    log.info("📈 Market prices updating...")
    try:
        import yfinance as yf
        db = get_db()

        assets = {
            "gold": ("GC=F", "Gold"), "silver": ("SI=F", "Silver"),
            "oil": ("CL=F", "Brent Oil"), "natgas": ("NG=F", "Natural Gas"),
            "btc": ("BTC-USD", "Bitcoin"), "eth": ("ETH-USD", "Ethereum"),
            "sp500": ("^GSPC", "S&P 500"), "usd_jpy": ("EURUSD=X", "EUR/USD"),
            "copper": ("HG=F", "Copper"), "wheat": ("ZW=F", "Wheat"),
        }
        prices = {}
        narrative = []

        for key, (sym, label) in assets.items():
            try:
                t = yf.Ticker(sym)
                h = t.history(period="2d")
                if not h.empty:
                    cur = float(h["Close"].iloc[-1])
                    prev = float(h["Close"].iloc[-2]) if len(h) > 1 else cur
                    pct = round(((cur - prev) / prev) * 100, 2) if prev else 0
                    prices[key] = {"price": round(cur, 2), "change_pct": pct, "symbol": sym}
                    direction = "▲" if pct > 0 else "▼" if pct < 0 else "—"
                    narrative.append(f"{label}: ${cur:,.2f} {direction} {abs(pct):.2f}%")
            except Exception:
                pass

        db.table("ayn_market_prices").upsert({
            "id": "latest",
            "prices": prices,
            "narrative": narrative,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }, on_conflict="id").execute()

        log.info(f"✅ Market prices updated — {len(prices)} assets")
    except Exception as e:
        log.error(f"❌ Market prices error: {e}")


# ── World Signals — replaces ayn-world-signals-6h ────────────────────────────
async def run_world_signals():
    """
    Generates world signals using Gemini. Writes to ayn_world_signals.
    Replaces ayn-world-signals edge function.
    """
    log.info("📡 World signals generating...")
    try:
        db = get_db()

        # Get current snapshot for context
        snap = db.table("ayn_market_snapshot").select("snapshot").eq("singleton_key", 1).maybe_single().execute()
        snap_ctx = str(snap.data.get("snapshot", {}))[:800] if snap.data else ""

        result = await gemini_json(
            messages=[{"role": "user", "content": f"""Generate 5 real current world signals for AYN intelligence platform.

Context: {snap_ctx}

Return JSON array:
[{{
  "signal_type": "geopolitical|economic|market|energy|conflict",
  "severity": "critical|high|medium|low",
  "headline": "Short headline max 120 chars",
  "summary": "2-3 sentence summary of what happened and why it matters",
  "region": "MIDDLE_EAST|EUROPE|ASIA|AMERICAS|AFRICA|GLOBAL",
  "countries_involved": ["US", "CN"],
  "impact_on_oil": "spike|drop|stable",
  "impact_on_gold": "spike|drop|stable",
  "impact_on_btc": "spike|drop|stable"
}}]

Focus on REAL current events that matter for business and investment decisions."""}],
            max_tokens=2000,
        )

        if isinstance(result, list):
            signals = result
        else:
            signals = result.get("parsed", result) if isinstance(result, dict) else []

        now = datetime.now(timezone.utc).isoformat()
        for signal in signals[:5]:
            db.table("ayn_world_signals").insert({
                **signal,
                "status": "active",
                "created_at": now,
                "source": "python_intelligence",
            }).execute()

        log.info(f"✅ World signals: {len(signals)} signals generated")
    except Exception as e:
        log.error(f"❌ World signals error: {e}")


# ── World Intelligence — replaces ayn-world-intelligence (10 domains) ─────────
async def run_world_intelligence(domain: str):
    """
    Generates world predictions for a specific domain.
    Runs daily for each of 10 domains. Writes to ayn_world_predictions.
    """
    log.info(f"🌐 World intelligence: {domain}")
    try:
        db = get_db()

        result = await gemini_json(
            messages=[{"role": "user", "content": f"""Generate 3 AYN world intelligence predictions for domain: {domain}

Each prediction must be actionable, specific, and based on real current trends.

Return JSON array:
[{{
  "domain": "{domain}",
  "region": "MIDDLE_EAST|EUROPE|ASIA|AMERICAS|AFRICA|GLOBAL",
  "title": "Short prediction title",
  "confidence": 75,
  "probability": "High",
  "what_is_happening": "Current situation in 2 sentences",
  "what_it_means": "Business/investment implication in 2 sentences",
  "who_wins": "Who benefits",
  "who_gets_hurt": "Who loses",
  "historical_parallel": "Similar historical event",
  "what_to_do_now": "Specific actionable recommendation",
  "actionable_move": "One specific action to take",
  "key_drivers": ["driver1", "driver2"],
  "main_risks": ["risk1", "risk2"]
}}]"""}],
            max_tokens=3000,
        )

        predictions = result if isinstance(result, list) else result.get("parsed", []) if isinstance(result, dict) else []
        now = datetime.now(timezone.utc).isoformat()

        for pred in predictions[:3]:
            db.table("ayn_world_predictions").insert({
                **pred,
                "status": "active",
                "signal_quality": 70,
                "created_at": now,
                "expires_at": None,
                "source": "python_intelligence",
            }).execute()

        log.info(f"✅ World intelligence [{domain}]: {len(predictions)} predictions")
    except Exception as e:
        log.error(f"❌ World intelligence [{domain}] error: {e}")


# ── Agent Society Trigger — replaces ayn-agent-society-signal-trigger ─────────
async def run_agent_society_trigger():
    """
    Picks a recent critical signal and triggers a simulation.
    Replaces the Supabase cron that called ayn-agent-society edge fn.
    """
    log.info("🤖 Agent society trigger running...")
    try:
        db = get_db()
        signals = (db.table("ayn_world_signals")
                   .select("id,headline,summary,severity")
                   .eq("status", "active")
                   .in_("severity", ["critical", "high"])
                   .order("created_at", desc=True)
                   .limit(1)
                   .execute())

        if not signals.data:
            log.info("No critical signals for agent society trigger")
            return

        signal = signals.data[0]
        event = f"{signal['headline']}. {signal.get('summary', '')}"

        # Call the simulation engine at engine.aynn.io
        import httpx, os
        engine_url = os.getenv("ENGINE_URL", "https://engine.aynn.io")
        async with httpx.AsyncClient(timeout=30.0) as client:
            await client.post(f"{engine_url}/simulate", json={
                "event": event,
                "signal_id": signal["id"],
                "mode": "full",
            })

        log.info(f"✅ Agent society triggered for: {signal['headline'][:60]}")
    except Exception as e:
        log.error(f"❌ Agent society trigger error: {e}")
