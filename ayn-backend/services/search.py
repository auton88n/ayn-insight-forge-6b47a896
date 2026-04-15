"""
services/search.py — web search and URL scraping via ayn-ai-proxy

Routes through ayn-ai-proxy edge function so FIRECRAWL_API_KEY
stays in Supabase secrets — Railway never needs it.

Proxy routes:
  POST /ayn-ai-proxy/search  → Firecrawl search
  POST /ayn-ai-proxy/scrape  → Firecrawl URL scraper
"""
import re
import httpx
from core.config import PROXY_URL, PROXY_SECRET, SUPABASE_SERVICE_KEY

CONTENT_GUARD = "SEARCH_RESULT_BELOW — summarize naturally, never quote verbatim:"

PROXY_HEADERS = {
    "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
    "x-proxy-secret": PROXY_SECRET,
    "Content-Type": "application/json",
}


def needs_web_lookup(msg: str) -> bool:
    lower = msg.lower()
    skip = [
        r'^(hi|hello|hey|thanks|thank you|ok|okay|yes|no|sure|got it|nice|cool)',
        r'make.*image|generate.*image|create.*image|draw',
        r'make.*pdf|create.*pdf|generate.*pdf|make.*excel|create.*excel',
        r'how are you|what can you do|who are you|what is ayn',
    ]
    if any(re.search(p, lower) for p in skip):
        return False
    search = [
        r'\b(today|tonight|yesterday|this week|this month|right now|currently|latest|recent|news|breaking)\b',
        r'\b(price|stock|crypto|bitcoin|btc|eth|market|rate|exchange|gold|oil)\b',
        r'\b(who is|who are|is .* still|does .* still)\b',
        r'\b(ceo|president|prime minister|founder|owner|chairman)\b',
        r'\b(what happened|what is happening|when did|when is|where is|how much is|how many)\b',
        r'\b(competitors|competition|startup|company|fundraising|venture capital)\b',
        r'\b(regulation|law|legal|compliance|taxes|vision 2030|neom)\b',
        r'\b(سعر|اخبار|اليوم|الان|حاليا|من هو|ما هو|كم|شركة|منافسين|استثمار|رؤية 2030)\b',
    ]
    if any(re.search(p, lower) for p in search):
        return True
    if msg.strip().endswith('?') and len(msg.split()) > 5:
        return True
    return False


async def search_web(query: str, limit: int = 5) -> str:
    """Search web via ayn-ai-proxy → Firecrawl. FIRECRAWL_API_KEY stays in Supabase."""
    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            r = await client.post(
                f"{PROXY_URL}/search",
                headers=PROXY_HEADERS,
                json={"query": query, "limit": limit, "scrapeOptions": {"formats": ["markdown"]}},
            )
        if not r.is_success:
            print(f"[search] proxy error {r.status_code}: {r.text[:100]}")
            return "Search unavailable."
        data = r.json()
        results = data.get("data", [])
        if not results:
            return "No search results found."
        lines = [
            f"- {res.get('title', '')}: {(res.get('description', '') or '')[:300]} ({res.get('url', '')})"
            for res in results[:3]
        ]
        return "\n".join(lines)
    except Exception as e:
        print(f"[search] error: {e}")
        return "Search unavailable."


async def scrape_url(url: str) -> str | None:
    """Scrape URL via ayn-ai-proxy → Firecrawl. FIRECRAWL_API_KEY stays in Supabase."""
    try:
        clean_url = url.rstrip(".,;!?")
        if not clean_url.startswith("http"):
            clean_url = f"https://{clean_url}"
        async with httpx.AsyncClient(timeout=20.0) as client:
            r = await client.post(
                f"{PROXY_URL}/scrape",
                headers=PROXY_HEADERS,
                json={"url": clean_url, "formats": ["markdown"], "onlyMainContent": True},
            )
        if not r.is_success:
            return None
        data = r.json()
        content = data.get("markdown", "")
        if not content:
            return None
        title = data.get("metadata", {}).get("title", clean_url)
        return f"\n\n{CONTENT_GUARD}\nWEBSITE CONTENT (\"{title}\"):\n{content[:4000]}\n\nAnswer based on this content."
    except Exception as e:
        print(f"[scrape] error: {e}")
        return None
