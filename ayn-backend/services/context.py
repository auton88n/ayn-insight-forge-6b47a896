"""
services/context.py — market + user context for chat
Port of supabase/functions/ayn-unified/contextBuilder.ts
"""
import re
import asyncio
from core.db import get_db

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
    "BH": ["bahrain", "bahraini", "البحرين"],
    "OM": ["oman", "omani", "muscat", "عمان"],
    "JO": ["jordan", "jordanian", "amman", "الأردن"],
    "TR": ["turkey", "turkish", "istanbul", "ankara", "تركيا"],
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
        db = get_db()
        r = db.from_("ayn_market_snapshot").select("*").limit(1).maybe_single().execute()
        return r.data or {}
    except Exception:
        return {}


async def get_user_context(user_id: str) -> dict:
    try:
        db = get_db()
        memories_res = await asyncio.to_thread(
            lambda: db.from_("user_memory").select("memory_key,memory_data,memory_type")
                      .eq("user_id", user_id).limit(20).execute()
        )
        try:
            prefs_res = await asyncio.to_thread(
                lambda: db.from_("user_preferences").select("key,value")
                          .eq("user_id", user_id).limit(10).execute()
            )
            prefs_data = prefs_res.data or []
        except Exception:
            prefs_data = []
        # Normalize memory_key/memory_data → key/value for system prompt
        raw = memories_res.data or []
        normalized = [
            {"key": m.get("memory_key", ""), "value": m.get("memory_data", {}).get("value", "") if isinstance(m.get("memory_data"), dict) else str(m.get("memory_data", ""))}
            for m in raw
        ]
        return {
            "memories": normalized,
            "preferences": prefs_data,
        }
    except Exception:
        return {}


async def get_market_prices() -> dict:
    try:
        db = get_db()
        r = db.from_("ayn_market_prices").select("*").limit(1).maybe_single().execute()
        return r.data or {}
    except Exception:
        return {}


async def get_country_intelligence(country_codes: list[str]) -> list[dict]:
    if not country_codes:
        return []
    try:
        db = get_db()
        r = db.from_("ayn_country_intelligence").select("*").in_("country_code", country_codes).execute()
        return r.data or []
    except Exception:
        return []


async def get_trade_flows(country_codes: list[str]) -> list[dict]:
    if not country_codes:
        return []
    try:
        db = get_db()
        r = (db.from_("ayn_trade_flows").select("*")
             .in_("country_code", country_codes).limit(10).execute())
        return r.data or []
    except Exception:
        return []


async def get_world_signals(limit: int = 5) -> list[dict]:
    try:
        db = get_db()
        r = (db.from_("ayn_world_signals").select("headline,severity,region,impact_on_oil,impact_on_gold,impact_on_btc")
             .eq("status", "active").order("created_at", desc=True).limit(limit).execute())
        return r.data or []
    except Exception:
        return []


async def get_master_predictions(limit: int = 3) -> list[dict]:
    try:
        db = get_db()
        r = (db.from_("ayn_master_predictions").select("title,probability_pct,actionable_move,domain")
             .order("created_at", desc=True).limit(limit).execute())
        return r.data or []
    except Exception:
        return []


def build_intelligence_context(
    snapshot: dict,
    country_profiles: list[dict],
    prices: dict,
    trade_flows: list[dict],
    signals: list[dict] = [],
    predictions: list[dict] = [],
) -> str:
    """Build intelligence context string injected into system prompt."""
    ctx = ""

    brief = snapshot.get("intelligence_brief", [])
    if brief:
        ctx += f"\n\nBACKGROUND INTELLIGENCE (use only when user asks about markets/world):\n"
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
            hot = cp.get("hot_sectors", [])
            if hot:
                ctx += f"\nHot sectors: {hot[0].get('snippet', hot[0].get('title', '')) if isinstance(hot[0], dict) else hot[0]}"

    price_narrative = prices.get("narrative", [])
    if price_narrative:
        ctx += f"\n\nLIVE PRICES:\n" + "\n".join(str(p) for p in price_narrative[:15])

    return ctx


async def build_full_context(message: str, user_id: str) -> tuple[dict, str]:
    """
    Fetch all context in parallel, return (user_context, intelligence_context_string).
    Called once per chat request.
    """
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
