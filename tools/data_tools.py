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
