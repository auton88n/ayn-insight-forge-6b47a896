"""
services/intelligence.py — background intelligence jobs
All jobs write to Railway Postgres via core.database.
Uses LOVABLE_API_KEY (Lovable AI gateway → Gemini) for LLM calls.
"""
import asyncio
import json
import logging
import os
import re
from datetime import datetime, timezone, date

log = logging.getLogger("ayn.intelligence")

async def _ai(prompt: str, max_tokens: int = 3000) -> str:
    """Call AI via ayn-ai-proxy (Lovable gateway) with Gemini fallback."""
    from core.llm import lovable, gemini
    messages = [{"role": "user", "content": prompt}]
    # Try Lovable proxy first (LOVABLE_API_KEY stays in Supabase)
    try:
        result = await lovable(messages, model="intelligence", max_tokens=max_tokens, temperature=0.25, timeout=55.0)
        return result.get("content", "")
    except Exception as e:
        log.debug(f"[ai] Lovable proxy failed ({e}), falling back to Gemini direct")
    # Fallback: Gemini direct
    result = await gemini(messages, max_tokens=max_tokens, temperature=0.25)
    return result.get("content", "")


def _parse_json(text: str):
    """Extract first JSON array or object from LLM output."""
    text = re.sub(r'```json\n?', '', text)
    text = re.sub(r'```\n?', '', text).strip()
    # Try array first
    s = text.find('[')
    e = text.rfind(']')
    if s >= 0 and e >= 0:
        try:
            return json.loads(text[s:e+1])
        except Exception:
            pass
    # Try object
    s = text.find('{')
    e = text.rfind('}')
    if s >= 0 and e >= 0:
        try:
            return json.loads(text[s:e+1])
        except Exception:
            pass
    return None


async def _db_write(table: str, rows: list, conflict_col: str = "id"):
    """Insert rows into Railway Postgres."""
    from core.database import get_pool
    import json as _json
    if not rows:
        return 0
    pool = await get_pool()
    written = 0
    async with pool.acquire() as conn:
        # Get column types
        col_records = await conn.fetch(
            "SELECT column_name, udt_name FROM information_schema.columns "
            "WHERE table_schema='public' AND table_name=$1", table
        )
        type_map = {r["column_name"]: r["udt_name"] for r in col_records}

        for row in rows:
            filtered = {k: v for k, v in row.items() if k in type_map}
            if not filtered:
                continue
            cols = list(filtered.keys())
            vals = [_json.dumps(v) if isinstance(v, (dict, list)) else v for v in filtered.values()]
            ph = ", ".join(f"${i+1}" for i in range(len(cols)))
            cn = ", ".join(f'"{c}"' for c in cols)
            try:
                res = await conn.execute(
                    f'INSERT INTO {table} ({cn}) VALUES ({ph}) ON CONFLICT ({conflict_col}) DO NOTHING',
                    *vals
                )
                if res != "INSERT 0 0":
                    written += 1
            except Exception as e:
                log.debug(f"[db_write] {table} row error: {e}")
    return written


async def _supabase_upsert(table: str, data: dict, conflict: str = "singleton_key"):
    """Write singleton row to Railway Postgres."""
    from core.database import get_pool
    import json as _json
    pool = await get_pool()
    cols = list(data.keys())
    vals = [_json.dumps(v) if isinstance(v, (dict, list)) else v for v in data.values()]
    placeholders = ", ".join(f"${i+1}" for i in range(len(cols)))
    col_names = ", ".join(f'"{c}"' for c in cols)
    updates = ", ".join(f'"{c}" = EXCLUDED."{c}"' for c in cols if c != conflict)
    sql = f"""
        INSERT INTO {table} ({col_names}) VALUES ({placeholders})
        ON CONFLICT ("{conflict}") DO UPDATE SET {updates}
    """
    async with pool.acquire() as conn:
        await conn.execute(sql, *vals)


# ──────────────────────────────────────────────
# 1. PULSE ENGINE (market snapshot every 4h)
# ──────────────────────────────────────────────
async def run_pulse_engine():
    log.info("🌍 Pulse engine starting...")
    try:
        import yfinance as yf
        import httpx
        FRED_KEY = os.getenv("FRED_API_KEY", "")
        macro = {}
        if FRED_KEY:
            series = {
                "fed_funds_rate": "FEDFUNDS", "inflation_cpi": "CPIAUCSL",
                "unemployment_rate": "UNRATE", "treasury_10yr": "DGS10",
                "treasury_2yr": "DGS2",
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
        for key, sym in [("sp500", "^GSPC"), ("gold", "GC=F"), ("oil", "CL=F"), ("btc", "BTC-USD"),
                          ("silver", "SI=F"), ("copper", "HG=F")]:
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

        # Fear & Greed
        fg = {}
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                r = await client.get("https://api.alternative.me/fng/?limit=1")
                if r.is_success:
                    d = r.json()["data"][0]
                    fg = {"value": int(d["value"]), "classification": d["value_classification"]}
        except Exception:
            pass

        await _supabase_upsert("ayn_market_snapshot", {
            "singleton_key": 1,
            "snapshot": {"macro": macro, "markets": {"prices": prices, "sentiment": fg},
                         "fetched_at": datetime.now(timezone.utc).isoformat()},
            "fetched_at": datetime.now(timezone.utc).isoformat(),
        })
        log.info(f"✅ Pulse engine complete — {len(prices)} prices, {len(macro)} macro")
    except Exception as e:
        log.error(f"❌ Pulse engine error: {e}")


# ──────────────────────────────────────────────
# 2. MARKET PRICES (every 2h)
# ──────────────────────────────────────────────
async def run_market_prices():
    log.info("📈 Market prices updating...")
    try:
        import yfinance as yf
        assets = {
            "gold": ("GC=F", "Gold"), "silver": ("SI=F", "Silver"),
            "oil": ("CL=F", "Oil WTI"), "btc": ("BTC-USD", "Bitcoin"),
            "eth": ("ETH-USD", "Ethereum"), "sp500": ("^GSPC", "S&P 500"),
            "copper": ("HG=F", "Copper"), "eurusd": ("EURUSD=X", "EUR/USD"),
            "usdjpy": ("JPY=X", "USD/JPY"),
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
            "metals": {k: v for k, v in prices.items() if k in ("gold", "silver", "copper")},
            "crypto": {k: v for k, v in prices.items() if k in ("btc", "eth")},
            "indices": {k: v for k, v in prices.items() if k in ("sp500",)},
            "currencies": {k: v for k, v in prices.items() if k in ("eurusd", "usdjpy")},
            "fetched_at": datetime.now(timezone.utc).isoformat(),
        })
        log.info(f"✅ Market prices — {len(prices)} assets")
    except Exception as e:
        log.error(f"❌ Market prices error: {e}")


# ──────────────────────────────────────────────
# 3. WORLD INTELLIGENCE (every 6h)
# ──────────────────────────────────────────────
async def run_world_intelligence():
    log.info("🧠 World intelligence running...")
    try:
        from core.database import fetchrow, fetch
        snap = await fetchrow("SELECT snapshot, fetched_at FROM ayn_market_snapshot WHERE singleton_key = 1")
        prices = await fetchrow("SELECT metals, energy, crypto, currencies, narrative FROM ayn_market_prices WHERE singleton_key = 1")
        
        snap_data = dict(snap) if snap else {}
        price_data = dict(prices) if prices else {}
        
        gold = price_data.get("metals", {}).get("gold", {}).get("price", "N/A") if price_data.get("metals") else "N/A"
        oil = price_data.get("energy", {}).get("oil", {}).get("price", "N/A") if price_data.get("energy") else "N/A"
        btc = price_data.get("crypto", {}).get("btc", {}).get("price", "N/A") if price_data.get("crypto") else "N/A"
        narrative = "\n".join(price_data.get("narrative", [])[:6]) if price_data.get("narrative") else "No market data"

        today = date.today().isoformat()
        prompt = f"""You are AYN — the world's most honest geopolitical and financial intelligence analyst.
Today: {today}

LIVE MARKET DATA:
Gold: ${gold}/oz | Oil: ${oil}/bbl | BTC: ${btc}
{narrative}

Generate 5 sharp intelligence brief points for business leaders right now.
Each point should be one actionable insight grounded in current market signals.

Return ONLY a JSON array of 5 strings:
["⚡ insight 1", "📊 insight 2", "⚠️ insight 3", "🌍 insight 4", "💡 insight 5"]"""

        result = await _ai(prompt, 600)
        brief = _parse_json(result)
        if not isinstance(brief, list):
            brief = []

        if brief:
            await _supabase_upsert("ayn_market_snapshot", {
                "singleton_key": 1,
                "intelligence_brief": brief,
                "fetched_at": datetime.now(timezone.utc).isoformat(),
            })
            log.info(f"✅ World intelligence — {len(brief)} brief points")
    except Exception as e:
        log.error(f"❌ World intelligence error: {e}")


# ──────────────────────────────────────────────
# 4. WORLD SIGNALS (every 6h)
# ──────────────────────────────────────────────
async def run_world_signals():
    log.info("📡 World signals generating...")
    try:
        from core.database import fetchrow, fetch
        today = date.today().isoformat()

        # Check if already ran today
        from core.database import fetchval
        existing = await fetchval(
            "SELECT COUNT(*) FROM ayn_world_signals WHERE signal_date = $1", today
        )
        if existing and existing >= 6:
            log.info(f"[signals] Already have {existing} signals for today, skipping")
            return

        prices = await fetchrow("SELECT metals, energy, crypto, currencies, narrative FROM ayn_market_prices WHERE singleton_key = 1")
        price_data = dict(prices) if prices else {}
        gold = price_data.get("metals", {}).get("gold", {}).get("price", "N/A") if price_data.get("metals") else "N/A"
        oil = price_data.get("energy", {}).get("oil", {}).get("price", "N/A") if price_data.get("energy") else "N/A"
        btc = price_data.get("crypto", {}).get("btc", {}).get("price", "N/A") if price_data.get("crypto") else "N/A"

        prompt = f"""You are AYN — the world's most honest geopolitical and financial intelligence analyst.
Today: {today}

LIVE MARKET PRICES:
Gold: ${gold}/oz | Oil: ${oil}/bbl | BTC: ${btc}

Generate 6-8 world signals that are happening RIGHT NOW based on current global conditions.
A world signal is a specific geopolitical or financial event that moves markets.

Return ONLY valid JSON array:
[
  {{
    "headline": "specific event headline",
    "summary": "what happened and why it matters for markets",
    "signal_type": "war_escalation|sanctions|economic_shock|central_bank|trade_war|political|natural_disaster",
    "severity": "critical|high|medium|low",
    "region": "middle_east|europe|east_asia|south_asia|africa|latin_america|north_america|global",
    "countries_involved": ["country1", "country2"],
    "impact_on_oil": "spike|drop|stable|volatile",
    "impact_on_gold": "spike|drop|stable|volatile",
    "impact_on_btc": "spike|drop|stable|volatile",
    "impact_on_usd": "spike|drop|stable|volatile",
    "impact_on_equities": "spike|drop|stable|volatile",
    "historical_parallel": "specific historical event with year",
    "overrides_regime": false,
    "confidence_impact": 0
  }}
]"""

        text = await _ai(prompt, 3000)
        signals = _parse_json(text)
        if not isinstance(signals, list) or not signals:
            log.warning("[signals] No signals generated")
            return

        rows = [{
            "signal_date": today,
            "signal_type": s.get("signal_type", "economic_shock"),
            "severity": s.get("severity", "medium"),
            "headline": s.get("headline", ""),
            "summary": s.get("summary", ""),
            "region": s.get("region", "global"),
            "countries_involved": s.get("countries_involved", []),
            "impact_on_oil": s.get("impact_on_oil"),
            "impact_on_gold": s.get("impact_on_gold"),
            "impact_on_btc": s.get("impact_on_btc"),
            "impact_on_usd": s.get("impact_on_usd"),
            "impact_on_equities": s.get("impact_on_equities"),
            "historical_parallel": s.get("historical_parallel"),
            "overrides_regime": s.get("overrides_regime", False),
            "confidence_impact": s.get("confidence_impact", 0),
            "status": "active",
        } for s in signals if s.get("headline")]

        written = await _db_write("ayn_world_signals", rows)
        log.info(f"✅ World signals — {written}/{len(rows)} written")
    except Exception as e:
        log.error(f"❌ World signals error: {e}")


# ──────────────────────────────────────────────
# 5. PREDICTION ENGINE (daily 6am)
# ──────────────────────────────────────────────
async def run_prediction_engine():
    log.info("🔮 Prediction engine running...")
    try:
        from core.database import fetchrow, fetchval
        today = date.today().isoformat()

        # Check if already ran today
        existing = await fetchval(
            "SELECT COUNT(*) FROM ayn_world_predictions WHERE prediction_date = $1", today
        )
        if existing and existing >= 40:
            log.info(f"[predictions] Already have {existing} predictions for today")
            return

        prices = await fetchrow("SELECT metals, energy, crypto, currencies, narrative FROM ayn_market_prices WHERE singleton_key = 1")
        price_data = dict(prices) if prices else {}
        gold = price_data.get("metals", {}).get("gold", {}).get("price", "N/A") if price_data.get("metals") else "N/A"
        oil = price_data.get("energy", {}).get("oil", {}).get("price", "N/A") if price_data.get("energy") else "N/A"

        domains = ["conflicts", "economy", "technology", "regions", "warnings", "business", "jobs"]
        total_written = 0

        for domain in domains:
            # Skip if domain already has predictions today
            domain_count = await fetchval(
                "SELECT COUNT(*) FROM ayn_world_predictions WHERE prediction_date = $1 AND domain = $2",
                today, domain
            )
            if domain_count and domain_count >= 5:
                continue

            prompt = f"""You are AYN — world-class intelligence analyst. Today: {today}
Gold: ${gold}/oz | Oil: ${oil}/bbl

Generate 7 predictions for domain: {domain}
Cover diverse scenarios grounded in current market signals.

Return ONLY valid JSON array:
[{{
  "title": "sharp specific title",
  "domain": "{domain}",
  "region": "global|middle_east|europe|east_asia|africa|north_america|latin_america|south_asia",
  "horizon": "Short-term|Medium-term|Long-term",
  "confidence": 70,
  "probability": "possible|likely|highly_likely|certain",
  "what_is_happening": "what is happening now with specific data",
  "what_it_means": "what this leads to — specific outcome",
  "historical_parallel": "closest historical precedent with year",
  "who_wins": "who benefits specifically",
  "who_gets_hurt": "who loses specifically",
  "what_to_do_now": "concrete action to take",
  "actionable_move": "one specific trade or position",
  "key_drivers": ["driver 1", "driver 2", "driver 3"],
  "main_risks": ["risk 1", "risk 2"],
  "tags": ["tag1", "tag2"]
}}]"""

            try:
                text = await _ai(prompt, 3000)
                preds = _parse_json(text)
                if not isinstance(preds, list):
                    continue

                rows = [{
                    "prediction_date": today,
                    "domain": p.get("domain", domain),
                    "region": p.get("region", "global"),
                    "horizon": p.get("horizon", "Medium-term"),
                    "title": p.get("title", ""),
                    "confidence": min(100, max(1, int(p.get("confidence", 60)))),
                    "probability": p.get("probability", "possible"),
                    "what_is_happening": p.get("what_is_happening", ""),
                    "what_it_means": p.get("what_it_means", ""),
                    "historical_parallel": p.get("historical_parallel", ""),
                    "who_wins": p.get("who_wins", ""),
                    "who_gets_hurt": p.get("who_gets_hurt", ""),
                    "what_to_do_now": p.get("what_to_do_now", ""),
                    "actionable_move": p.get("actionable_move", ""),
                    "key_drivers": p.get("key_drivers", []),
                    "main_risks": p.get("main_risks", []),
                    "tags": p.get("tags", []),
                    "status": "active",
                } for p in preds if p.get("title")]

                written = await _db_write("ayn_world_predictions", rows)
                total_written += written
                log.info(f"[predictions] {domain}: {written}/{len(rows)}")
                await asyncio.sleep(1)  # Rate limit
            except Exception as e:
                log.warning(f"[predictions] {domain} failed: {e}")

        log.info(f"✅ Prediction engine — {total_written} total predictions written")
    except Exception as e:
        log.error(f"❌ Prediction engine error: {e}")


# ──────────────────────────────────────────────
# 6. PREDICTION RESOLVER (every 6h)
# ──────────────────────────────────────────────
async def run_prediction_resolver():
    log.info("✅ Prediction resolver running...")
    try:
        from core.database import fetch, execute, fetchrow
        today = date.today()

        # Find expired predictions that are still active
        expired = await fetch(
            """SELECT p.id, p.title, p.domain, p.horizon, p.probability, p.what_is_happening,
                      p.who_wins, p.who_gets_hurt, p.prediction_date
               FROM ayn_world_predictions p
               WHERE p.status = 'active'
               AND p.prediction_date < $1
               AND p.horizon IN ('Short-term', '3_months')
               LIMIT 20""",
            today
        )

        if not expired:
            log.info("[resolver] No expired predictions to resolve")
            return

        prices = await fetchrow("SELECT metals, energy, crypto FROM ayn_market_prices WHERE singleton_key = 1")
        price_data = dict(prices) if prices else {}
        gold = price_data.get("metals", {}).get("gold", {}).get("price", "N/A") if price_data.get("metals") else "N/A"

        for pred in expired[:10]:  # Process up to 10 at a time
            try:
                prompt = f"""Today: {today}. Gold: ${gold}

Prediction made on {pred['prediction_date']}:
Title: {pred['title']}
Domain: {pred['domain']}
What was predicted: {pred['what_is_happening']}
Probability was: {pred['probability']}
Who was supposed to win: {pred['who_wins']}

Based on what has happened in the world since then, resolve this prediction.
Was it correct, partially correct, or incorrect?

Return ONLY valid JSON:
{{
  "resolution_correct": true or false,
  "resolution_notes": "what actually happened vs what was predicted",
  "outcome_notes": "brief summary of the actual outcome"
}}"""

                text = await _ai(prompt, 400)
                resolution = _parse_json(text)
                if not resolution:
                    continue

                await execute(
                    """UPDATE ayn_world_predictions
                       SET status = 'resolved',
                           resolved_at = NOW(),
                           resolution_correct = $1,
                           resolution_notes = $2,
                           outcome_notes = $3
                       WHERE id = $4""",
                    resolution.get("resolution_correct"),
                    resolution.get("resolution_notes", ""),
                    resolution.get("outcome_notes", ""),
                    pred["id"]
                )
                await asyncio.sleep(0.5)
            except Exception as e:
                log.debug(f"[resolver] pred {pred['id']} failed: {e}")

        log.info(f"✅ Prediction resolver — processed {min(len(expired), 10)} predictions")
    except Exception as e:
        log.error(f"❌ Prediction resolver error: {e}")


# ──────────────────────────────────────────────
# 7. AGENT SOCIETY (every 4h)
# ──────────────────────────────────────────────
async def run_agent_society_trigger():
    log.info("🤖 Agent society triggering...")
    try:
        from core.database import fetch, fetchrow, execute
        
        # Get latest world signal to react to
        signal = await fetchrow(
            """SELECT id, headline, severity, region, summary
               FROM ayn_world_signals
               WHERE status = 'active'
               AND severity IN ('critical', 'high')
               ORDER BY created_at DESC LIMIT 1"""
        )

        if not signal:
            # Use latest prediction as topic
            pred = await fetchrow(
                "SELECT title, domain FROM ayn_world_predictions WHERE status='active' ORDER BY created_at DESC LIMIT 1"
            )
            event = pred["title"] if pred else "Current global macro environment: trade tensions escalating, gold at record highs"
            signal_id = None
        else:
            event = f"{signal['headline']}. Region: {signal['region']}. {signal['summary'] or ''}"
            signal_id = str(signal["id"])

        # Core agents to react (subset for efficiency)
        CORE_AGENTS = [
            ("usa", "🇺🇸", "United States", "government"),
            ("china", "🇨🇳", "China", "government"),
            ("russia", "🇷🇺", "Russia", "government"),
            ("eu", "🇪🇺", "European Union", "government"),
            ("fed", "🏦", "Federal Reserve", "central_bank"),
            ("saudi", "🇸🇦", "Saudi Arabia", "government"),
            ("gold_market", "🥇", "Gold Market", "stock_market"),
            ("oil_market", "🛢️", "Oil Market", "stock_market"),
            ("jpmorgan", "🏢", "JPMorgan", "bank"),
            ("us_middle", "👷", "US Middle Class", "social_class"),
        ]

        # Create conversation
        today = date.today().isoformat()
        from core.database import get_pool
        pool = await get_pool()
        
        async with pool.acquire() as conn:
            conv_row = await conn.fetchrow(
                """INSERT INTO ayn_agent_conversations 
                   (topic, status, triggered_by, simulation_type, signal_id, visibility)
                   VALUES ($1, 'active', 'scheduler', 'world_event', $2, 'public')
                   RETURNING id""",
                event[:80], signal_id
            )
            if not conv_row:
                return
            conv_id = conv_row["id"]

        prompt = f"""You simulate realistic reactions from world actors to this event.
Write each agent's response in their specific voice with concrete actions.

EVENT: "{event}"
Today: {today}

AGENTS reacting:
{chr(10).join(f'{a[1]} {a[2]} ({a[3]})' for a in CORE_AGENTS)}

Return JSON:
{{"messages": [
  {{
    "agent_id": "usa",
    "message": "2-3 sentence public statement IN THEIR VOICE",
    "internal_thought": "secret real concern they won't say publicly",
    "emotion": "neutral|confident|panicked|angry|worried|suspicious|excited",
    "emotion_intensity": 60,
    "concrete_action": "one specific action they take right now"
  }}
]}}
Include ALL {len(CORE_AGENTS)} agents."""

        text = await _ai(prompt, 3000)
        parsed = _parse_json(text)
        messages = parsed.get("messages", []) if parsed else []

        agent_map = {a[0]: a for a in CORE_AGENTS}
        rows = []
        for i, m in enumerate(messages):
            agent_id = m.get("agent_id", "")
            agent = agent_map.get(agent_id)
            if not agent:
                continue
            rows.append({
                "conversation_id": str(conv_id),
                "agent_id": agent_id,
                "agent_name": agent[2],
                "agent_role": agent[3],
                "agent_flag": agent[1],
                "message": m.get("message", ""),
                "emotion": m.get("emotion", "neutral"),
                "emotion_intensity": m.get("emotion_intensity", 50),
                "internal_thought": m.get("internal_thought"),
                "sequence_order": i + 1,
                "cascade_round": 1,
                "message_type": "primary",
            })

        written = await _db_write("ayn_agent_messages", rows)
        log.info(f"✅ Agent society — {written} messages written for conv {conv_id}")
    except Exception as e:
        log.error(f"❌ Agent society error: {e}")


# ──────────────────────────────────────────────
# 8. LOG CLEANUP (daily 3am)
# ──────────────────────────────────────────────
async def run_log_cleanup():
    try:
        from core.database import execute
        await execute("DELETE FROM llm_usage_logs WHERE created_at < NOW() - INTERVAL '90 days'")
        log.info("✅ Log cleanup complete")
    except Exception as e:
        log.error(f"❌ Log cleanup error: {e}")


# ──────────────────────────────────────────────
# 9. SUPABASE SYNC (every 30 min)
# ──────────────────────────────────────────────
async def run_supabase_sync():
    """Syncs new intelligence rows from Supabase → Railway every 30 min."""
    log.info("🔄 Supabase → Railway sync starting...")
    try:
        import httpx
        from core.database import get_pool
        import json as _json
        from datetime import timezone

        SUPABASE_URL = os.getenv("SUPABASE_URL", "")
        SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_KEY", "")
        if not SUPABASE_URL or not SUPABASE_KEY:
            log.warning("[sync] SUPABASE_URL or SUPABASE_SERVICE_KEY not set")
            return

        TABLES = [
            "ayn_world_predictions", "ayn_world_signals", "ayn_mind",
            "ayn_opportunity_alerts", "ayn_historical_patterns",
            "ayn_agent_messages", "ayn_activity_log",
        ]

        headers = {"apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}"}
        pool = await get_pool()
        total_synced = 0

        # Only sync rows from last 2 hours
        since = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:00:00+00:00")

        async with httpx.AsyncClient(timeout=30.0) as client:
            for table in TABLES:
                try:
                    r = await client.get(
                        f"{SUPABASE_URL}/rest/v1/{table}",
                        headers=headers,
                        params={"select": "*", "created_at": f"gte.{since}", "limit": 200}
                    )
                    if not r.is_success:
                        continue
                    rows = r.json()
                    if not rows:
                        continue

                    async with pool.acquire() as conn:
                        col_records = await conn.fetch(
                            "SELECT column_name, udt_name FROM information_schema.columns "
                            "WHERE table_schema='public' AND table_name=$1", table
                        )
                        if not col_records:
                            continue
                        type_map = {r2["column_name"]: r2["udt_name"] for r2 in col_records}

                        synced = 0
                        for row in rows:
                            filtered = {k: v for k, v in row.items() if k in type_map}
                            if not filtered:
                                continue
                            cols = list(filtered.keys())
                            vals = [_json.dumps(v) if isinstance(v, (dict, list)) else v
                                    for v in filtered.values()]
                            ph = ", ".join(f"${i+1}" for i in range(len(cols)))
                            cn = ", ".join(f'"{c}"' for c in cols)
                            try:
                                res = await conn.execute(
                                    f'INSERT INTO {table} ({cn}) VALUES ({ph}) ON CONFLICT (id) DO NOTHING',
                                    *vals
                                )
                                if res != "INSERT 0 0":
                                    synced += 1
                            except Exception:
                                pass
                    if synced:
                        log.info(f"[sync] {table}: +{synced}")
                        total_synced += synced
                except Exception as e:
                    log.warning(f"[sync] {table} failed: {e}")

        if total_synced:
            log.info(f"✅ Supabase sync — {total_synced} new rows")
        else:
            log.debug("✅ Supabase sync — no new rows")
    except Exception as e:
        log.error(f"❌ Supabase sync error: {e}")
