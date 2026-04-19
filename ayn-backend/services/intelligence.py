"""
services/intelligence.py — background intelligence jobs
Reads/writes world data to Supabase (where it lives).
Writes spine-specific data to Railway.
All jobs are crash-safe — never bring down the server.
"""
import asyncio
import json
import logging
from datetime import datetime, timezone

log = logging.getLogger("ayn.intelligence")


async def _supabase_upsert(table: str, data: dict, conflict: str = "singleton_key"):
    """Write to Railway Postgres (spine owns all intelligence data)."""
    try:
        from core.database import get_pool
        import json as _json
        pool = await get_pool()
        
        cols = list(data.keys())
        vals = list(data.values())
        
        # Serialize any dict/list values to JSON
        pg_vals = []
        for v in vals:
            if isinstance(v, (dict, list)):
                pg_vals.append(_json.dumps(v))
            else:
                pg_vals.append(v)
        
        placeholders = ", ".join(f"${i+1}" for i in range(len(cols)))
        col_names = ", ".join(f'"{c}"' for c in cols)
        
        # Build upsert: INSERT ... ON CONFLICT (conflict_col) DO UPDATE SET ...
        updates = ", ".join(
            f'"{c}" = EXCLUDED."{c}"'
            for c in cols if c != conflict
        )
        
        sql = f"""
            INSERT INTO {table} ({col_names})
            VALUES ({placeholders})
            ON CONFLICT ("{conflict}") DO UPDATE SET {updates},
                updated_at = NOW()
        """
        
        async with pool.acquire() as conn:
            await conn.execute(sql, *pg_vals)
        log.debug(f"[intelligence] wrote to Railway {table}")
    except Exception as e:
        log.warning(f"[intelligence] Railway write to {table} failed: {e}")


async def run_pulse_engine():
    """Updates ayn_market_snapshot in Railway Postgres every 4h."""
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
                                macro[label] = {"value": val, "date": obs[0]["date"],
                                                "trend": "rising" if val > prev else "falling"}
                    except Exception:
                        pass

        prices = {}
        for key, sym in [("sp500","^GSPC"),("gold","GC=F"),("oil","CL=F"),("btc","BTC-USD")]:
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

        await _supabase_upsert("ayn_market_snapshot", {
            "singleton_key": 1,
            "snapshot": {"macro": macro, "markets": {"prices": prices},
                        "fetched_at": datetime.now(timezone.utc).isoformat()},
            "fetched_at": datetime.now(timezone.utc).isoformat(),
        })
        log.info(f"✅ Pulse engine complete — {len(prices)} prices")
    except Exception as e:
        log.error(f"❌ Pulse engine error: {e}")


async def run_market_prices():
    """Updates ayn_market_prices in Railway Postgres every 2h."""
    log.info("📈 Market prices updating...")
    try:
        import yfinance as yf
        assets = {
            "gold": ("GC=F", "Gold"), "silver": ("SI=F", "Silver"),
            "oil": ("CL=F", "Oil"), "btc": ("BTC-USD", "Bitcoin"),
            "eth": ("ETH-USD", "Ethereum"), "sp500": ("^GSPC", "S&P 500"),
            "eurusd": ("EURUSD=X", "EUR/USD"),
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
                    d = "▲" if pct > 0 else "▼" if pct < 0 else "—"
                    narrative.append(f"{label}: ${cur:,.2f} {d} {abs(pct):.2f}%")
            except Exception:
                pass

        await _supabase_upsert("ayn_market_prices", {
            "singleton_key": 1,
            "narrative": narrative,
            "energy": {k: v for k, v in prices.items() if k in ("oil",)},
            "metals": {k: v for k, v in prices.items() if k in ("gold", "silver")},
            "crypto": {k: v for k, v in prices.items() if k in ("btc", "eth")},
            "indices": {k: v for k, v in prices.items() if k in ("sp500",)},
            "currencies": {k: v for k, v in prices.items() if k in ("eurusd",)},
            "fetched_at": datetime.now(timezone.utc).isoformat(),
        })
        log.info(f"✅ Market prices updated — {len(prices)} assets")
    except Exception as e:
        log.error(f"❌ Market prices error: {e}")


async def run_world_intelligence():
    """Generates world intelligence brief via LLM, writes to Supabase."""
    log.info("🧠 World intelligence running...")
    try:
        from core.db import get_db
        from core.llm import gemini
        db = get_db()

        snap = await asyncio.to_thread(
lambda: __import__('asyncio').get_event_loop()
        )
        snap_text = json.dumps(snap.data.get("snapshot", {}))[:2000] if snap.data else "No data"

        messages = [{"role": "user", "content":
            f"Market data: {snap_text}\n\nGenerate 8 intelligence brief points for business leaders. "
            "Return ONLY a JSON array of strings. Be specific and actionable."}]

        result = await gemini(messages, max_tokens=600)
        content = result.get("content", "[]")
        import re
        match = re.search(r'\[.*\]', content, re.DOTALL)
        brief = json.loads(match.group()) if match else []

        if brief:
            await _supabase_upsert("ayn_market_snapshot", {
                "singleton_key": 1,
                "intelligence_brief": brief,
                "fetched_at": datetime.now(timezone.utc).isoformat(),
            })
            log.info(f"✅ World intelligence — {len(brief)} points")
    except Exception as e:
        log.error(f"❌ World intelligence error: {e}")


async def run_world_signals():
    log.info("📡 World signals: placeholder")

async def run_prediction_engine():
    log.info("🔮 Prediction engine: placeholder")

async def run_prediction_resolver():
    log.info("✅ Prediction resolver: placeholder")

async def run_agent_society_trigger():
    log.info("🤖 Agent society: placeholder")

async def run_log_cleanup():
    """Clean old logs from Railway."""
    try:
        from core.database import execute
        await execute("DELETE FROM llm_usage_logs WHERE created_at < NOW() - INTERVAL '90 days'")
        log.info("✅ Log cleanup complete")
    except Exception as e:
        log.error(f"❌ Log cleanup error: {e}")
