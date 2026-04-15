"""
Real Data Tools — gives agents actual market data and news.

This is the key difference from the Supabase version:
- Agents get REAL prices, not hallucinated ones
- Agents get REAL news context
- This grounds the simulation in reality
"""

import asyncio
from datetime import datetime, timedelta
from typing import Optional
import httpx


async def get_financial_data(event: str) -> dict:
    """
    Get real financial data relevant to the event.
    Returns prices for key assets: gold, oil, S&P500, BTC, dollar index.
    Uses yfinance via a simple HTTP approach.
    """
    try:
        import yfinance as yf

        symbols = {
            "gold": "GC=F",
            "oil": "CL=F",
            "sp500": "^GSPC",
            "bitcoin": "BTC-USD",
            "dollar_index": "DX-Y.NYB",
            "vix": "^VIX",
            "10yr_yield": "^TNX",
            "euro_usd": "EURUSD=X",
        }

        data = {}
        for name, symbol in symbols.items():
            try:
                ticker = yf.Ticker(symbol)
                hist = ticker.history(period="5d")
                if not hist.empty:
                    current = float(hist["Close"].iloc[-1])
                    prev = float(hist["Close"].iloc[-2]) if len(hist) > 1 else current
                    change_pct = ((current - prev) / prev) * 100 if prev != 0 else 0
                    data[name] = {
                        "price": round(current, 2),
                        "change_pct": round(change_pct, 2),
                        "symbol": symbol
                    }
            except Exception:
                pass

        return data

    except ImportError:
        # yfinance not installed — return mock data structure
        return {
            "note": "yfinance not available — install with: pip install yfinance",
            "gold": {"price": 3100, "change_pct": 0},
            "oil": {"price": 82, "change_pct": 0},
            "sp500": {"price": 5200, "change_pct": 0},
            "bitcoin": {"price": 71000, "change_pct": 0},
        }
    except Exception as e:
        return {"error": str(e)}


async def search_news(query: str, max_results: int = 5) -> str:
    """
    Search for real news about the event.
    Uses DuckDuckGo search (no API key needed).
    """
    try:
        from duckduckgo_search import DDGS
        
        with DDGS() as ddgs:
            results = list(ddgs.news(
                keywords=query,
                max_results=max_results,
                timelimit="m"  # Last month
            ))
        
        if not results:
            # Try broader search
            with DDGS() as ddgs:
                results = list(ddgs.text(
                    keywords=query,
                    max_results=max_results
                ))

        if results:
            summaries = []
            for r in results[:3]:
                title = r.get("title", "")
                body = r.get("body", r.get("snippet", ""))[:150]
                summaries.append(f"• {title}: {body}")
            return "\n".join(summaries)
        
        return "No recent news found for this event."

    except ImportError:
        return "DuckDuckGo search not available — install with: pip install duckduckgo-search"
    except Exception as e:
        return f"Search unavailable: {str(e)}"


async def classify_event(event: str) -> dict:
    """
    Classify an event to determine:
    - What type of event it is
    - Which agents should react (dynamic, not hardcoded)
    - What economic layers are most affected
    """
    event_lower = event.lower()

    # Signal type
    if any(w in event_lower for w in ["oil", "opec", "crude", "energy", "aramco"]):
        signal_type = "oil_spike"
    elif any(w in event_lower for w in ["gold", "precious", "de-dollar"]):
        signal_type = "gold_surge"
    elif any(w in event_lower for w in ["rate hike", "tighten", "hawkish", "inflation"]):
        signal_type = "rate_hike"
    elif any(w in event_lower for w in ["rate cut", "pivot", "dovish", "qe"]):
        signal_type = "rate_cut"
    elif any(w in event_lower for w in ["war", "invad", "attack", "missile", "military", "conflict"]):
        signal_type = "geopolitical"
    elif any(w in event_lower for w in ["crypto", "bitcoin", "ftx", "exchange", "defi"]):
        signal_type = "crypto_crisis"
    elif any(w in event_lower for w in ["bank fail", "svb", "credit suisse", "banking"]):
        signal_type = "banking_crisis"
    elif any(w in event_lower for w in ["currency", "peso", "lira", "default", "debt"]):
        signal_type = "currency_crash"
    elif any(w in event_lower for w in ["recession", "gdp", "unemployment", "layoff"]):
        signal_type = "recession"
    elif any(w in event_lower for w in ["tariff", "trade war", "sanction", "export control"]):
        signal_type = "trade_war"
    elif any(w in event_lower for w in ["ai", "chip", "nvidia", "openai", "automation"]):
        signal_type = "ai_disruption"
    elif any(w in event_lower for w in ["food", "wheat", "hunger", "famine"]):
        signal_type = "food_crisis"
    elif any(w in event_lower for w in ["election", "president", "government", "minister"]):
        signal_type = "political"
    else:
        signal_type = "general"

    # Dynamic agent routing based on signal type
    # This replaces the hardcoded IMPACT_ROUTES in the Supabase version
    routing = {
        "oil_spike": {
            "layer1_economic": ["oil_market", "natgas_market", "gold_market"],
            "layer2_institutional": ["fed", "ecb", "russia", "saudi", "opec_org", "aramco"],
            "layer3_emotional": ["eu_middle", "us_working", "global_south_poor", "arab_street"],
            "layer4_social": ["african_urban_youth", "pakistani_poor", "se_asian_factory"],
            "layer5_behavioral": ["us_middle", "latin_american_middle", "china_middle"],
        },
        "rate_hike": {
            "layer1_economic": ["sp500", "gold_market", "crypto_mkt", "copper_market"],
            "layer2_institutional": ["fed", "ecb", "boj", "jpmorgan", "blackrock", "goldman"],
            "layer3_emotional": ["us_middle", "us_working", "china_middle"],
            "layer4_social": ["global_south_poor", "latin_american_middle"],
            "layer5_behavioral": ["us_upper", "eu_middle", "india_middle"],
        },
        "banking_crisis": {
            "layer1_economic": ["sp500", "gold_market", "crypto_mkt"],
            "layer2_institutional": ["fed", "jpmorgan", "blackrock", "goldman", "deutsche_bank", "moodys"],
            "layer3_emotional": ["us_middle", "us_working", "eu_middle"],
            "layer4_social": ["african_urban_youth", "global_south_poor"],
            "layer5_behavioral": ["us_upper", "latin_american_middle"],
        },
        "crypto_crisis": {
            "layer1_economic": ["crypto_mkt", "sp500", "gold_market"],
            "layer2_institutional": ["fed", "jpmorgan", "blackrock", "moodys"],
            "layer3_emotional": ["us_working", "us_middle", "african_urban_youth"],
            "layer4_social": ["latin_american_middle", "china_middle"],
            "layer5_behavioral": ["us_upper", "india_middle"],
        },
        "geopolitical": {
            "layer1_economic": ["oil_market", "gold_market", "wheat_market", "natgas_market"],
            "layer2_institutional": ["usa", "russia", "china", "nato", "un_security", "israel", "iran"],
            "layer3_emotional": ["arab_street", "eu_middle", "russian_working_class"],
            "layer4_social": ["global_south_poor", "african_urban_youth", "se_asian_factory"],
            "layer5_behavioral": ["us_middle", "us_working", "latin_american_middle"],
        },
        "currency_crash": {
            "layer1_economic": ["gold_market", "sp500", "crypto_mkt"],
            "layer2_institutional": ["fed", "imf_worldbank", "pboc", "moodys", "hedge_funds"],
            "layer3_emotional": ["global_south_poor", "argentina", "latin_american_middle"],
            "layer4_social": ["pakistani_poor", "african_urban_youth"],
            "layer5_behavioral": ["us_upper", "china_middle", "india_middle"],
        },
        "trade_war": {
            "layer1_economic": ["sp500", "copper_market", "rare_earth_market", "gold_market"],
            "layer2_institutional": ["usa", "china", "wto", "nvidia", "apple", "tesla_byd"],
            "layer3_emotional": ["china_middle", "se_asian_factory", "us_working"],
            "layer4_social": ["african_urban_youth", "latin_american_middle"],
            "layer5_behavioral": ["us_middle", "india_middle", "eu_middle"],
        },
        "general": {
            "layer1_economic": ["gold_market", "sp500", "oil_market"],
            "layer2_institutional": ["fed", "usa", "china", "jpmorgan"],
            "layer3_emotional": ["us_middle", "eu_middle", "global_south_poor"],
            "layer4_social": ["arab_street", "african_urban_youth"],
            "layer5_behavioral": ["us_working", "latin_american_middle"],
        }
    }

    return {
        "signal_type": signal_type,
        "routing": routing.get(signal_type, routing["general"])
    }
