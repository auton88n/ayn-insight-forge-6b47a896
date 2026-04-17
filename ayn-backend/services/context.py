"""
services/context.py — market + user context for chat
Uses Railway PostgreSQL via asyncpg (replaces Supabase client)
"""
import re
import asyncio
from core.database import fetch, fetchrow

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
    "KW": ["kuwait", "kuwaiti", "الكويت"],
    "SA": ["saudi", "ksa", "riyadh", "السعودية"],
    "TR": ["turkey", "turkish", "istanbul", "تركيا"],
}


def detect_countries(message: str) -> list[str]:
    lower = message.lower()
    return [code for code, patterns in COUNTRY_PATTERNS.items()
            if any(p in lower for p in patterns)]


def needs_market_data(message: str) -> bool:
    return bool(re.search(
        r'\b(price|gold|oil|silver|commodity|currency|exchange rate|dollar|rial|'
        r'bitcoin|crypto|market|سعر|ذهب|نفط|عملة|دولار|ريال)\b', message, re.I
    ))


async def get_market_snapshot() -> dict:
    try:
        r = await fetchrow("SELECT * FROM ayn_market_snapshot ORDER BY fetched_at DESC LIMIT 1")
        return dict(r) if r else {}
    except Exception:
        return {}


async def get_user_context(user_id: str) -> dict:
    try:
        memories = await fetch(
            "SELECT memory_key, memory_data, memory_type FROM user_memory WHERE user_id = $1::uuid LIMIT 20",
            user_id
        )
        try:
            prefs = await fetch(
                "SELECT settings FROM user_settings WHERE user_id = $1::uuid LIMIT 1",
                user_id
            )
            prefs_data = [dict(p) for p in prefs] if prefs else []
        except Exception:
            prefs_data = []

        normalized = []
        for m in (memories or []):
            md = m.get("memory_data", {})
            val = md.get("value", "") if isinstance(md, dict) else str(md or "")
            normalized.append({"key": m.get("memory_key", ""), "value": val})

        return {"memories": normalized, "preferences": prefs_data}
    except Exception:
        return {}


async def get_market_prices() -> dict:
    try:
        r = await fetchrow("SELECT * FROM ayn_market_prices ORDER BY fetched_at DESC LIMIT 1")
        return dict(r) if r else {}
    except Exception:
        return {}


async def get_country_intelligence(country_codes: list[str]) -> list[dict]:
    if not country_codes:
        return []
    try:
        rows = await fetch(
            "SELECT * FROM ayn_country_intelligence WHERE country_code = ANY($1) LIMIT 10",
            country_codes
        )
        return [dict(r) for r in rows] if rows else []
    except Exception:
        return []


async def get_trade_flows(country_codes: list[str]) -> list[dict]:
    if not country_codes:
        return []
    try:
        rows = await fetch(
            "SELECT * FROM ayn_trade_flows WHERE country_code = ANY($1) LIMIT 10",
            country_codes
        )
        return [dict(r) for r in rows] if rows else []
    except Exception:
        return []


async def get_world_signals(limit: int = 5) -> list[dict]:
    try:
        rows = await fetch(
            "SELECT headline, severity, region, impact_on_oil, impact_on_gold, impact_on_btc "
            "FROM ayn_world_signals WHERE status = 'active' ORDER BY created_at DESC LIMIT $1",
            limit
        )
        return [dict(r) for r in rows] if rows else []
    except Exception:
        return []


async def get_master_predictions(limit: int = 3) -> list[dict]:
    try:
        rows = await fetch(
            "SELECT title, probability_pct, actionable_move, domain "
            "FROM ayn_master_predictions ORDER BY created_at DESC LIMIT $1",
            limit
        )
        return [dict(r) for r in rows] if rows else []
    except Exception:
        return []


def build_intelligence_context(
    snapshot: dict, country_profiles: list[dict],
    prices: dict, trade_flows: list[dict],
    signals: list[dict] = [], predictions: list[dict] = [],
) -> str:
    ctx = ""
    brief = snapshot.get("intelligence_brief", [])
    if brief:
        ctx += "\n\nBACKGROUND INTELLIGENCE (use only when user asks about markets/world):\n"
        ctx += "\n".join(str(b) for b in brief[:8])
        ctx += "\n\nRULE: Only cite when user asks about markets, business, world events. Never unprompted."

    if signals:
        ctx += "\n\nACTIVE WORLD SIGNALS:\n"
        for s in signals:
            ctx += f"- [{s.get('severity','').upper()}] {s.get('headline','')} ({s.get('region','')})\n"

    if predictions:
        ctx += "\n\nAYN CURRENT PREDICTIONS:\n"
        for p in predictions:
            ctx += f"- {p.get('title','')} — {p.get('probability_pct','')}% probability. Move: {p.get('actionable_move','')}\n"

    if country_profiles:
        ctx += "\n\nCOUNTRY INTELLIGENCE:"
        for cp in country_profiles:
            b = cp.get("intelligence_brief", [])
            ctx += f"\n\n{cp.get('country_name', '')}:"
            if b:
                ctx += "\n" + "\n".join(str(x) for x in b[:6])

    price_narrative = prices.get("narrative", [])
    if price_narrative:
        ctx += f"\n\nLIVE PRICES:\n" + "\n".join(str(p) for p in price_narrative[:15])

    return ctx


async def build_full_context(message: str, user_id: str) -> tuple[dict, str]:
    country_codes = detect_countries(message)
    fetch_market = needs_market_data(message)

    tasks = [get_user_context(user_id)]
    if fetch_market:
        tasks += [get_market_snapshot(), get_market_prices(),
                  get_country_intelligence(country_codes), get_trade_flows(country_codes),
                  get_world_signals(), get_master_predictions()]

    results = await asyncio.gather(*tasks, return_exceptions=True)
    user_ctx = results[0] if not isinstance(results[0], Exception) else {}

    intel_ctx = ""
    if fetch_market and len(results) >= 7:
        snapshot  = results[1] if not isinstance(results[1], Exception) else {}
        prices    = results[2] if not isinstance(results[2], Exception) else {}
        countries = results[3] if not isinstance(results[3], Exception) else []
        flows     = results[4] if not isinstance(results[4], Exception) else []
        signals   = results[5] if not isinstance(results[5], Exception) else []
        preds     = results[6] if not isinstance(results[6], Exception) else []
        intel_ctx = build_intelligence_context(snapshot, countries, prices, flows, signals, preds)

    return user_ctx, intel_ctx
