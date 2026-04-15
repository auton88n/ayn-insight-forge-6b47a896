"""
services/search.py — port of supabase/functions/ayn-unified/searchHandler.ts
Uses Firecrawl for web search and URL scraping.
"""
import re
import httpx
from core.config import FIRECRAWL_API_KEY

FIRECRAWL_API = "https://api.firecrawl.dev/v1"
CONTENT_GUARD = "SEARCH_RESULT_BELOW — summarize naturally, never quote verbatim:"


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
    """Search web via Firecrawl. Returns formatted text for prompt injection."""
    if not FIRECRAWL_API_KEY:
        return "Web search not configured."
    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            r = await client.post(
                f"{FIRECRAWL_API}/search",
                headers={"Authorization": f"Bearer {FIRECRAWL_API_KEY}", "Content-Type": "application/json"},
                json={"query": query, "limit": limit, "scrapeOptions": {"formats": ["markdown"]}},
            )
        if not r.is_success:
            return "Search failed."
        data = r.json()
        results = data.get("data", [])
        if not results:
            return "No search results found."
        lines = [f"- {res.get('title', '')}: {(res.get('description', '') or '')[:300]} ({res.get('url', '')})"
                 for res in results[:3]]
        return "\n".join(lines)
    except Exception as e:
        print(f"[search] error: {e}")
        return "Search unavailable."


async def scrape_url(url: str) -> str | None:
    """Scrape a URL and return markdown content for prompt injection."""
    if not FIRECRAWL_API_KEY:
        return None
    try:
        clean_url = url.rstrip(".,;!?")
        if not clean_url.startswith("http"):
            clean_url = f"https://{clean_url}"
        async with httpx.AsyncClient(timeout=20.0) as client:
            r = await client.post(
                f"{FIRECRAWL_API}/scrape",
                headers={"Authorization": f"Bearer {FIRECRAWL_API_KEY}", "Content-Type": "application/json"},
                json={"url": clean_url, "formats": ["markdown"], "onlyMainContent": True},
            )
        if not r.is_success:
            return None
        data = r.json()
        content = data.get("markdown", "")
        if not content:
            return None
        title = data.get("metadata", {}).get("title", clean_url)
        safe = content[:4000]
        return f"\n\n{CONTENT_GUARD}\nWEBSITE CONTENT (\"{title}\"):\n{safe}\n\nAnswer based on this content."
    except Exception as e:
        print(f"[scrape] error: {e}")
        return None
