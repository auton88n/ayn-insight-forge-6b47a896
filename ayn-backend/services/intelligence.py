"""
services/intelligence.py — world intelligence background jobs
All writes go to Railway PostgreSQL via asyncpg.
All jobs are fully wrapped in try/except — can never crash the server.
"""
import asyncio
import json
import logging
from datetime import datetime, timezone
from core.database import execute, fetchrow

log = logging.getLogger("ayn.intelligence")


async def run_pulse_engine():
    """Fetches macro + market data, updates ayn_market_snapshot. Runs every 4h."""
    log.info("🌍 Pulse engine starting...")
    try:
        import yfinance as yf
        import httpx
        import os

        FRED_KEY = os.getenv("FRED_API_KEY", "")
        macro = {}

        if FRED_KEY:
            series = {
                "fed_funds_rate": "FEDFUNDS", "inflation_cpi": "CPIAUCSL",
                "unemployment_rate": "UNRATE", "treasury_10yr": "DGS10",
                "treasury_2yr": "DGS2", "m2_money_supply": "M2SL",
            }
            async with httpx.AsyncClient(timeout=15.0) as client:
                for label, sid in series.items():
                    try:
                        r = await client.get(
                            "https://api.stlouisfed.org/fred/series/observations",
                            params={"series_id": sid, "api_key": FRED_KEY,
                                    "limit": 2, "sort_order": "desc", "file_type": "json"}
                        )
                        if r.is_success:
                            obs = r.json().get("observations", [])
                            if obs:
                                val = float(obs[0]["value"])
                                prev = float(obs[1]["value"]) if len(obs) > 1 else val
                                macro[label] = {
                                    "value": val, "change": round(val - prev, 4),
                                    "date": obs[0]["date"],
                                    "trend": "rising" if val > prev else "falling" if val < prev else "stable"
                                }
                    except Exception:
                        pass

        # Fetch key prices via yfinance
        prices = {}
        for key, sym in [("sp500", "^GSPC"), ("gold", "GC=F"), ("oil", "CL=F"), ("btc", "BTC-USD")]:
            try:
                t = yf.Ticker(sym)
                h = t.history(period="2d")
                if not h.empty:
                    cur = float(h["Close"].iloc[-1])
                    prev = float(h["Close"].iloc[-2]) if len(h) > 1 else cur
                    pct = round(((cur - prev) / prev) * 100, 2) if prev else 0
                    prices[key] = {"price": round(cur, 2), "change_pct": pct}
            except Exception:
                pass

        snapshot = {
            "macro": macro, "markets": {"prices": prices},
            "fetched_at": datetime.now(timezone.utc).isoformat(),
            "source": "python_pulse_engine",
        }

        await execute("""
            INSERT INTO ayn_market_snapshot (singleton_key, snapshot, fetched_at)
            VALUES (1, $1, NOW())
            ON CONFLICT (singleton_key) DO UPDATE
            SET snapshot = $1, fetched_at = NOW()
        """, json.dumps(snapshot))

        log.info(f"✅ Pulse engine complete — {len(prices)} prices, {len(macro)} macro")
    except Exception as e:
        log.error(f"❌ Pulse engine error: {e}")


async def run_market_prices():
    """Updates ayn_market_prices every 2h via yfinance."""
    log.info("📈 Market prices updating...")
    try:
        import yfinance as yf

        assets = {
            "gold": ("GC=F", "Gold"), "silver": ("SI=F", "Silver"),
            "oil": ("CL=F", "Brent Oil"), "btc": ("BTC-USD", "Bitcoin"),
            "eth": ("ETH-USD", "Ethereum"), "sp500": ("^GSPC", "S&P 500"),
            "eurusd": ("EURUSD=X", "EUR/USD"), "copper": ("HG=F", "Copper"),
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

        await execute("""
            INSERT INTO ayn_market_prices (singleton_key, energy, metals, crypto, indices, currencies, narrative, fetched_at)
            VALUES (1, $1, $2, $3, $4, $5, $6, NOW())
            ON CONFLICT (singleton_key) DO UPDATE
            SET energy=$1, metals=$2, crypto=$3, indices=$4, currencies=$5, narrative=$6, fetched_at=NOW()
        """,
            json.dumps({k: v for k, v in prices.items() if k in ("oil", "natgas")}),
            json.dumps({k: v for k, v in prices.items() if k in ("gold", "silver", "copper")}),
            json.dumps({k: v for k, v in prices.items() if k in ("btc", "eth")}),
            json.dumps({k: v for k, v in prices.items() if k in ("sp500",)}),
            json.dumps({k: v for k, v in prices.items() if k in ("eurusd",)}),
            json.dumps(narrative),
        )

        log.info(f"✅ Market prices updated — {len(prices)} assets")
    except Exception as e:
        log.error(f"❌ Market prices error: {e}")


async def run_world_intelligence():
    """Generates world intelligence brief via LLM. Runs every 6h."""
    log.info("🧠 World intelligence running...")
    try:
        from core.llm import gemini
        snapshot = await fetchrow("SELECT snapshot FROM ayn_market_snapshot WHERE singleton_key = 1")
        snap_text = json.dumps(snapshot["snapshot"])[:3000] if snapshot else "No market data available"

        messages = [{
            "role": "user",
            "content": f"""Based on this market data, generate 8 intelligence brief points for business leaders.
Market snapshot: {snap_text}

Return a JSON array of strings, each 1-2 sentences. Focus on: geopolitical risks, market moves, 
business opportunities, sector trends. Be specific and actionable.
Respond with ONLY a JSON array, no other text."""
        }]

        result = await gemini(messages, max_tokens=800)
        content = result.get("content", "[]")

        # Parse JSON
        try:
            import re
            match = re.search(r'\[.*\]', content, re.DOTALL)
            brief = json.loads(match.group()) if match else []
        except Exception:
            brief = []

        if brief:
            await execute("""
                INSERT INTO ayn_market_snapshot (singleton_key, intelligence_brief, fetched_at)
                VALUES (1, $1, NOW())
                ON CONFLICT (singleton_key) DO UPDATE
                SET intelligence_brief = $1, fetched_at = NOW()
            """, json.dumps(brief))
            log.info(f"✅ World intelligence complete — {len(brief)} brief points")
        else:
            log.warning("⚠️ World intelligence: no brief generated")
    except Exception as e:
        log.error(f"❌ World intelligence error: {e}")


async def run_world_signals():
    """Placeholder — world signals job. Runs every 3h."""
    log.info("📡 World signals: skipping (no external source configured)")


async def run_prediction_engine():
    """Placeholder — prediction engine. Runs every 12h."""
    log.info("🔮 Prediction engine: skipping (not yet configured)")


async def run_prediction_resolver():
    """Placeholder — resolves old predictions. Runs daily."""
    log.info("✅ Prediction resolver: skipping (not yet configured)")


async def run_agent_society_trigger():
    """Placeholder — agent society. Runs every 6h."""
    log.info("🤖 Agent society: skipping (not yet configured)")


async def run_log_cleanup():
    """Clean up old logs. Runs daily."""
    try:
        await execute("""
            DELETE FROM llm_usage_logs WHERE created_at < NOW() - INTERVAL '90 days'
        """)
        await execute("""
            DELETE FROM security_logs WHERE created_at < NOW() - INTERVAL '30 days'
        """)
        log.info("✅ Log cleanup complete")
    except Exception as e:
        log.error(f"❌ Log cleanup error: {e}")
