"""
AYN Data Tools — Financial data + news search

Financial data:  Direct Yahoo Finance query2 API via httpx (reliable, no yfinance)
News search:     DuckDuckGo via duckduckgo_search
"""

import asyncio
import httpx
import os
from typing import Optional


# ── Financial Data ────────────────────────────────────────────────────────────

SYMBOLS = {
    "gold":         "GC=F",
    "oil":          "CL=F",
    "sp500":        "^GSPC",
    "bitcoin":      "BTC-USD",
    "dollar_index": "DX-Y.NYB",
    "vix":          "^VIX",
    "10yr_yield":   "^TNX",
    "euro_usd":     "EURUSD=X",
}

YAHOO_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "en-US,en;q=0.9",
    "Referer": "https://finance.yahoo.com/",
    "Origin": "https://finance.yahoo.com",
}


async def _fetch_ticker(session: httpx.AsyncClient, name: str, symbol: str) -> tuple[str, dict]:
    """Fetch a single ticker from Yahoo Finance query2 API."""
    try:
        url = f"https://query2.finance.yahoo.com/v8/finance/chart/{symbol}"
        r = await session.get(
            url,
            params={"interval": "1d", "range": "5d"},
            headers=YAHOO_HEADERS,
            timeout=8.0,
        )
        if not r.is_success:
            return name, {}

        body = r.json()
        result = body.get("chart", {}).get("result", [])
        if not result:
            return name, {}

        closes = result[0].get("indicators", {}).get("quote", [{}])[0].get("close", [])
        closes = [c for c in closes if c is not None]
        if not closes:
            return name, {}

        current = closes[-1]
        prev = closes[-2] if len(closes) > 1 else current
        change_pct = ((current - prev) / prev) * 100 if prev else 0

        return name, {
            "price": round(current, 4),
            "change_pct": round(change_pct, 2),
            "symbol": symbol,
        }

    except Exception as e:
        print(f"  ⚠️  Ticker {symbol} failed: {e}")
        return name, {}


async def get_financial_data(event: str) -> dict:
    """
    Fetch real-time financial data for key global assets.
    Uses Yahoo Finance query2 API directly — no yfinance dependency.
    All tickers fetched in parallel for speed.
    """
    try:
        async with httpx.AsyncClient() as session:
            tasks = [_fetch_ticker(session, name, sym) for name, sym in SYMBOLS.items()]
            results = await asyncio.gather(*tasks)

        data = {name: val for name, val in results if val}

        if data:
            print(f"  💰 Price anchor: " + " | ".join(
                f"{k.capitalize()}: ${v['price']}" for k, v in list(data.items())[:4]
            ) + "...")
        else:
            print("  ⚠️  No financial data retrieved — Yahoo Finance may be rate limiting")

        return data

    except Exception as e:
        print(f"  ❌ Financial data fetch error: {e}")
        return {"error": str(e)}


# ── News Search ───────────────────────────────────────────────────────────────

async def search_news(query: str, max_results: int = 5) -> list[dict]:
    """
    Search for recent news about a topic using DuckDuckGo.
    Returns list of {title, snippet, url} dicts.
    """
    try:
        from duckduckgo_search import DDGS
        with DDGS() as ddgs:
            results = list(ddgs.news(query, max_results=max_results))
        print(f"  🔍 Searching news context...")
        return [
            {
                "title": r.get("title", ""),
                "snippet": r.get("body", "")[:200],
                "url": r.get("url", ""),
                "date": r.get("date", ""),
            }
            for r in results
        ]
    except ImportError:
        print("  ⚠️  duckduckgo_search not installed")
        return []
    except Exception as e:
        print(f"  ⚠️  News search failed: {e}")
        return []


async def get_live_context(event: str) -> str:
    """
    Build a live context string combining news search results.
    Used to ground agents in current real-world information.
    """
    try:
        news = await search_news(event[:100], max_results=4)
        if not news:
            return ""

        context_parts = []
        for item in news:
            if item.get("title"):
                context_parts.append(f"• {item['title']}: {item['snippet']}")

        context = "\n".join(context_parts)
        print(f"  ✅ Live context: {len(context)} chars")
        return context

    except Exception as e:
        print(f"  ⚠️  Live context failed: {e}")
        return ""


# ── Event Classification ───────────────────────────────────────────────────────
# Agent ID lists by category (from agent_configs.py)
_GOVERNMENTS   = ['usa','china','russia','eu','saudi','iran','india','ukraine','turkey','japan',
                  'argentina','nigeria','egypt','north_korea','vietnam','pakistan','israel',
                  'south_africa','colombia','ethiopia','imf_worldbank','nato','un_security',
                  'opec_org','brics','wto']
_CENTRAL_BANKS = ['fed','ecb','pboc','boj','boe','rbi','snb','saudi_cb']
_MARKETS       = ['gold_market','oil_market','sp500','crypto_mkt','copper_market',
                  'wheat_market','natgas_market','rare_earth_market']
_BANKS         = ['jpmorgan','blackrock','goldman','icbc','deutsche_bank','adia',
                  'hedge_funds','moodys','temasek','bnp_paribas']
_COMPANIES     = ['nvidia','apple','aramco','defense_sector','big_pharma','big_ag',
                  'maersk','microsoft','tesla_byd','big_tech_ai','houthi_proxy','rating_agencies']
_SOCIAL        = ['us_middle','us_working','us_upper','global_south_poor','eu_middle',
                  'china_middle','india_middle','pakistani_poor','african_urban_youth',
                  'latin_american_middle','se_asian_factory','arab_street','russian_working_class']

# Pre-built routing templates per signal type
# Each key maps to a list of agent IDs for that simulation layer
_ROUTING_TEMPLATES = {
    "gold_surge": {
        "layer1_economic":      _MARKETS + _CENTRAL_BANKS[:4],
        "layer2_institutional": _CENTRAL_BANKS + _BANKS[:4],
        "layer3_emotional":     _MARKETS[:4] + _BANKS[:3],
        "layer4_social":        _SOCIAL[:6],
        "layer5_behavioral":    _GOVERNMENTS[:4] + _SOCIAL[:4],
        "layer6_synthesis":     _MARKETS[:3] + _CENTRAL_BANKS[:3],
    },
    "oil_shock": {
        "layer1_economic":      _MARKETS[:4] + ['aramco','opec_org'],
        "layer2_institutional": _GOVERNMENTS[:6] + _CENTRAL_BANKS[:3],
        "layer3_emotional":     _COMPANIES[:4] + _SOCIAL[:4],
        "layer4_social":        _SOCIAL[:6],
        "layer5_behavioral":    _GOVERNMENTS[:5] + _BANKS[:3],
        "layer6_synthesis":     _MARKETS[:3] + _GOVERNMENTS[:3],
    },
    "rate_hike": {
        "layer1_economic":      _CENTRAL_BANKS + _MARKETS[:4],
        "layer2_institutional": _BANKS + _COMPANIES[:4],
        "layer3_emotional":     _MARKETS[:4] + _SOCIAL[:4],
        "layer4_social":        _SOCIAL[:6],
        "layer5_behavioral":    _GOVERNMENTS[:4] + _CENTRAL_BANKS[:3],
        "layer6_synthesis":     _CENTRAL_BANKS[:4] + _MARKETS[:3],
    },
    "geopolitical": {
        "layer1_economic":      _GOVERNMENTS[:8] + _MARKETS[:3],
        "layer2_institutional": _GOVERNMENTS[:6] + ['nato','un_security'],
        "layer3_emotional":     _SOCIAL[:6] + _GOVERNMENTS[:4],
        "layer4_social":        _SOCIAL[:8],
        "layer5_behavioral":    _GOVERNMENTS[:6] + _BANKS[:3],
        "layer6_synthesis":     _GOVERNMENTS[:4] + _MARKETS[:3],
    },
    "crypto": {
        "layer1_economic":      ['crypto_mkt','sp500'] + _CENTRAL_BANKS[:3] + _BANKS[:3],
        "layer2_institutional": _GOVERNMENTS[:4] + _BANKS[:4],
        "layer3_emotional":     _MARKETS[:4] + _SOCIAL[:4],
        "layer4_social":        _SOCIAL[:6],
        "layer5_behavioral":    _CENTRAL_BANKS + _GOVERNMENTS[:3],
        "layer6_synthesis":     ['crypto_mkt'] + _CENTRAL_BANKS[:3] + _BANKS[:3],
    },
    "trade_war": {
        "layer1_economic":      _GOVERNMENTS[:6] + _MARKETS[:4],
        "layer2_institutional": _COMPANIES[:6] + _BANKS[:4],
        "layer3_emotional":     _SOCIAL[:6] + _GOVERNMENTS[:4],
        "layer4_social":        _SOCIAL[:8],
        "layer5_behavioral":    _GOVERNMENTS[:6] + _COMPANIES[:4],
        "layer6_synthesis":     _GOVERNMENTS[:4] + _MARKETS[:3],
    },
    "ai_disruption": {
        "layer1_economic":      ['nvidia','microsoft','big_tech_ai','apple'] + _MARKETS[:3],
        "layer2_institutional": _GOVERNMENTS[:5] + _COMPANIES[:5],
        "layer3_emotional":     _SOCIAL[:6] + _COMPANIES[:4],
        "layer4_social":        _SOCIAL[:8],
        "layer5_behavioral":    _GOVERNMENTS[:4] + _CENTRAL_BANKS[:3],
        "layer6_synthesis":     ['nvidia','big_tech_ai'] + _GOVERNMENTS[:3] + _MARKETS[:3],
    },
    "general": {
        "layer1_economic":      _MARKETS + _CENTRAL_BANKS[:4],
        "layer2_institutional": _GOVERNMENTS[:6] + _BANKS[:4],
        "layer3_emotional":     _COMPANIES[:4] + _SOCIAL[:4],
        "layer4_social":        _SOCIAL[:6],
        "layer5_behavioral":    _GOVERNMENTS[:4] + _BANKS[:3],
        "layer6_synthesis":     _MARKETS[:3] + _GOVERNMENTS[:3],
    },
}

EVENT_KEYWORDS = {
    "gold_surge":    ["gold", "precious metal", "safe haven", "xau"],
    "oil_shock":     ["oil", "crude", "opec", "petroleum", "brent", "wti", "energy"],
    "rate_hike":     ["fed", "rate", "interest", "central bank", "boe", "ecb", "rba", "monetary"],
    "geopolitical":  ["war", "conflict", "sanction", "military", "attack", "coup", "crisis",
                      "iran", "russia", "ukraine", "hamas", "israel", "taiwan", "suez"],
    "crypto":        ["bitcoin", "btc", "crypto", "ethereum", "blockchain", "defi"],
    "equity_crash":  ["crash", "stock", "equity", "s&p", "nasdaq", "bear market", "recession"],
    "trade_war":     ["tariff", "trade war", "import duty", "export ban", "protectionism"],
    "ai_disruption": ["ai", "artificial intelligence", "llm", "openai", "automation", "robot"],
}


async def classify_event(event: str) -> dict:
    """
    Classify an event and return a routing dict with layer-keyed agent ID lists.
    Returns:
        {
            "signal_type": "gold_surge",
            "routing": {
                "layer1_economic": [...agent_ids],
                "layer2_institutional": [...agent_ids],
                ...
            }
        }
    """
    event_lower = event.lower()
    signal_type = "general"
    for st, keywords in EVENT_KEYWORDS.items():
        if any(kw in event_lower for kw in keywords):
            signal_type = st
            break

    routing = _ROUTING_TEMPLATES.get(signal_type, _ROUTING_TEMPLATES["general"])
    print(f"  🗺️  Routing: {signal_type} → {sum(len(v) for v in routing.values())} agent slots")
    return {"signal_type": signal_type, "routing": routing}
