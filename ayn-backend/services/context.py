"""
services/context.py — market + user context for chat

PERFORMANCE FIXES:
1. All reads from Railway Postgres (not Supabase) — no asyncio.to_thread blocking
2. In-memory cache for market data (30s TTL) — avoids DB hit on every message
3. All context fetches run in parallel via asyncio.gather
4. Short-circuit: only fetch what the message actually needs
"""
import re
import asyncio
import logging
import time
from typing import Optional
from core.database import fetch, fetchrow

log = logging.getLogger("ayn.context")

# ── In-memory cache (avoids hitting DB on every chat message) ─────────────────
_cache: dict = {}
_cache_ttl = 30.0  # seconds

def _get_cache(key: str):
    entry = _cache.get(key)
    if entry and (time.monotonic() - entry["ts"]) < _cache_ttl:
        return entry["val"]
    return None

def _set_cache(key: str, val):
    _cache[key] = {"val": val, "ts": time.monotonic()}
    return val


# ── Country detection ─────────────────────────────────────────────────────────
COUNTRY_PATTERNS: dict[str, list[str]] = {
    "SA": ["saudi", "ksa", "riyadh", "jeddah", "dammam", "السعودية", "الرياض", "جدة"],
    "AE": ["uae", "emirates", "dubai", "abu dhabi", "الامارات", "دبي"],
    "US": ["usa", "united states", "america", "american", "امريكا"],
    "GB": ["uk", "united kingdom", "britain", "british", "london", "بريطانيا"],
    "CN": ["china", "chinese", "beijing", "shanghai", "الصين"],
    "IN": ["india", "indian", "mumbai", "delhi", "الهند"],
    "JP": ["japan", "japanese", "tokyo", "اليابان"],
    "DE": ["germany", "german", "berlin", "المانيا"],
    "FR": ["france", "french", "paris", "فرنسا"],
    "CA": ["canada", "canadian", "toronto", "كندا"],
    "EG": ["egypt", "egyptian", "cairo", "مصر", "القاهرة"],
    "QA": ["qatar", "qatari", "doha", "قطر"],
    "TR": ["turkey", "turkish", "istanbul", "تركيا"],
}

def detect_countries(message: str) -> list[str]:
    lower = message.lower()
    return [code for code, patterns in COUNTRY_PATTERNS.items()
            if any(p in lower for p in patterns)]

def needs_market_data(message: str) -> bool:
    return bool(re.search(
        r'\b(price|gold|oil|silver|commodity|currency|exchange rate|dollar|rial|'
        r'bitcoin|crypto|market|stock|prediction|signal|intelligence|geopolit|'
        r'سعر|ذهب|نفط|عملة|دولار|ريال|تحليل|سوق)\b', message, re.I
    ))


# ── Data fetchers (all Railway Postgres, all cached) ──────────────────────────
async def get_market_snapshot() -> dict:
    cached = _get_cache("market_snapshot")
    if cached is not None:
        return cached
    try:
        row = await fetchrow(
            "SELECT snapshot, intelligence_brief, fetched_at "
            "FROM ayn_market_snapshot WHERE singleton_key=1")
        result = dict(row) if row else {}
        return _set_cache("market_snapshot", result)
    except Exception as e:
        log.debug(f"[context] market_snapshot: {e}")
        return {}


async def get_market_prices() -> dict:
    cached = _get_cache("market_prices")
    if cached is not None:
        return cached
    try:
        row = await fetchrow(
            "SELECT metals, energy, crypto, currencies, narrative "
            "FROM ayn_market_prices WHERE singleton_key=1")
        result = dict(row) if row else {}
        return _set_cache("market_prices", result)
    except Exception as e:
        log.debug(f"[context] market_prices: {e}")
        return {}


async def get_world_signals(limit: int = 5) -> list[dict]:
    cached = _get_cache("world_signals")
    if cached is not None:
        return cached
    try:
        rows = await fetch(
            "SELECT headline, severity, region, impact_on_oil, impact_on_gold, summary "
            "FROM ayn_world_signals WHERE status='active' "
            "ORDER BY created_at DESC LIMIT $1", limit)
        return _set_cache("world_signals", rows)
    except Exception:
        return []


async def get_master_predictions(limit: int = 3) -> list[dict]:
    cached = _get_cache("predictions")
    if cached is not None:
        return cached
    try:
        rows = await fetch(
            "SELECT title, confidence, probability, domain, actionable_move "
            "FROM ayn_world_predictions WHERE status='active' "
            "ORDER BY confidence DESC LIMIT $1", limit)
        return _set_cache("predictions", rows)
    except Exception:
        return []


async def get_country_intelligence(country_codes: list[str]) -> list[dict]:
    if not country_codes:
        return []
    try:
        placeholders = ", ".join(f"${i+1}" for i in range(len(country_codes)))
        rows = await fetch(
            f"SELECT * FROM ayn_country_intelligence "
            f"WHERE country_code IN ({placeholders})", *country_codes)
        return rows
    except Exception:
        return []


async def get_user_context(user_id: str) -> dict:
    try:
        memories = await fetch(
            "SELECT memory_key, memory_data FROM user_memory "
            "WHERE user_id=$1::uuid ORDER BY updated_at DESC LIMIT 15",
            user_id)
        normalized = []
        for m in memories:
            md = m.get("memory_data", {})
            val = md.get("value", "") if isinstance(md, dict) else str(md or "")
            normalized.append({"key": m.get("memory_key", ""), "value": val})
        return {"memories": normalized}
    except Exception:
        return {}


# ── Context builder ───────────────────────────────────────────────────────────
def build_intelligence_context(snapshot, country_profiles, prices,
                                signals=None, predictions=None) -> str:
    ctx = ""

    # Intelligence brief
    brief = snapshot.get("intelligence_brief", []) if snapshot else []
    if brief:
        ctx += "\n\nBACKGROUND INTELLIGENCE:\n" + "\n".join(str(b) for b in brief[:6])
        ctx += "\nOnly use when directly relevant."

    # World signals
    if signals:
        ctx += "\n\nACTIVE WORLD SIGNALS:\n"
        for s in signals[:4]:
            ctx += f"- [{s.get('severity','').upper()}] {s.get('headline','')} ({s.get('region','')})\n"

    # Predictions
    if predictions:
        ctx += "\n\nAYN PREDICTIONS:\n"
        for p in predictions[:3]:
            ctx += f"- {p.get('title','')} — {p.get('confidence','')}% confidence\n"

    # Live prices
    narrative = prices.get("narrative", []) if prices else []
    if narrative:
        ctx += "\n\nLIVE PRICES:\n" + "\n".join(str(p) for p in narrative[:10])

    # Country intel
    if country_profiles:
        ctx += "\n\nCOUNTRY INTELLIGENCE:"
        for cp in country_profiles:
            b = cp.get("intelligence_brief", [])
            ctx += f"\n\n{cp.get('country_name', '')}:"
            if b:
                ctx += "\n" + "\n".join(str(x) for x in b[:4])

    return ctx


async def build_full_context(message: str, user_id: str) -> tuple[dict, str]:
    """
    Build user + intel context in parallel.
    Only fetches market data if message needs it.
    Uses 30s in-memory cache for all market data.
    """
    country_codes = detect_countries(message)
    fetch_market = needs_market_data(message)

    if fetch_market:
        # All fetches in parallel — Railway Postgres, cached
        user_ctx, snapshot, prices, signals, predictions, countries = await asyncio.gather(
            get_user_context(user_id),
            get_market_snapshot(),
            get_market_prices(),
            get_world_signals(),
            get_master_predictions(),
            get_country_intelligence(country_codes),
            return_exceptions=True
        )
        # Handle exceptions from gather
        user_ctx = user_ctx if isinstance(user_ctx, dict) else {}
        snapshot = snapshot if isinstance(snapshot, dict) else {}
        prices = prices if isinstance(prices, dict) else {}
        signals = signals if isinstance(signals, list) else []
        predictions = predictions if isinstance(predictions, list) else []
        countries = countries if isinstance(countries, list) else []

        intel_ctx = build_intelligence_context(snapshot, countries, prices, signals, predictions)
    else:
        # Simple message — only fetch user memory
        user_ctx = await get_user_context(user_id)
        intel_ctx = ""

    return user_ctx, intel_ctx
