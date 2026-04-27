"""
routers/chat.py — AYN main chat endpoint (Railway Postgres only)
Tool data reads from Railway. No Supabase dependency.
"""
import re
import asyncio
import logging
import json
from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from typing import Optional

from core.auth import verify_token, check_user_limit
from core.llm import call_with_fallback
from core.database import fetch, fetchrow
from services.context import build_full_context
from services.memory import extract_and_save_memories, strip_memory_tags
from services.search import needs_web_lookup, search_web, scrape_url
from routers._intent import detect_intent

router = APIRouter()
log = logging.getLogger("ayn.chat")


class ChatBody(BaseModel):
    model_config = {"extra": "allow"}
    messages: list[dict] = []
    intent: Optional[str] = None
    context: dict = {}
    stream: bool = True
    sessionId: Optional[str] = None


AYN_TOOLS = [
    {"type": "function", "function": {
        "name": "get_market_prices",
        "description": "Gets the latest live prices for commodities, crypto, and currencies.",
        "parameters": {"type": "object", "properties": {}, "required": []}}},
    {"type": "function", "function": {
        "name": "get_business_news",
        "description": "Gets the latest top business and market news headlines.",
        "parameters": {"type": "object", "properties": {
            "country_codes": {"type": "array", "items": {"type": "string"}}
        }}}},
    {"type": "function", "function": {
        "name": "get_geopolitical_risks",
        "description": "Retrieves active conflicts, trade tensions, and sanctions globally.",
        "parameters": {"type": "object", "properties": {}, "required": []}}},
    {"type": "function", "function": {
        "name": "search_web",
        "description": "Search the live internet for current information.",
        "parameters": {"type": "object", "properties": {
            "query": {"type": "string"}
        }, "required": ["query"]}}},
    {"type": "function", "function": {
        "name": "get_sector_intelligence",
        "description": "Gets intelligence for sectors: startups, jobs, supply_chain, real_estate, consumer, health, tech, energy.",
        "parameters": {"type": "object", "properties": {
            "sector": {"type": "string"}
        }, "required": ["sector"]}}},
    {"type": "function", "function": {
        "name": "get_country_profile",
        "description": "Gets deep intelligence on a specific country.",
        "parameters": {"type": "object", "properties": {
            "country_codes": {"type": "array", "items": {"type": "string"}}
        }, "required": ["country_codes"]}}},
]

SECTOR_TABLE_MAP = {
    "startups": "ayn_startup_intel", "jobs": "ayn_job_market",
    "supply_chain": "ayn_supply_chain", "real_estate": "ayn_real_estate",
    "consumer": "ayn_consumer_sentiment", "health": "ayn_health_intel",
    "tech": "ayn_tech_disruption", "energy": "ayn_sector_intel",
}


async def execute_tool(tool_call: dict) -> dict:
    """Execute AYN tool call — reads from Railway Postgres."""
    name = tool_call.get("function", {}).get("name", "")
    args = tool_call.get("function", {}).get("arguments", {})
    if isinstance(args, str):
        try: args = json.loads(args)
        except: args = {}

    try:
        if name == "get_market_prices":
            row = await fetchrow("SELECT * FROM ayn_market_prices WHERE singleton_key=1")
            return {"prices": dict(row) if row else {}}

        elif name == "get_business_news":
            rows = await fetch(
                "SELECT * FROM ayn_business_news ORDER BY created_at DESC LIMIT 10")
            return {"news": [dict(r) for r in rows]}

        elif name == "get_geopolitical_risks":
            rows = await fetch(
                "SELECT headline,severity,region,summary,impact_on_oil,impact_on_gold "
                "FROM ayn_world_signals WHERE status='active' "
                "ORDER BY created_at DESC LIMIT 15")
            return {"risks": [dict(r) for r in rows]}

        elif name == "search_web":
            result = await search_web(args.get("query", ""))
            return {"results": result}

        elif name == "get_sector_intelligence":
            table = SECTOR_TABLE_MAP.get(args.get("sector", ""), "ayn_sector_intel")
            rows = await fetch(f"SELECT * FROM {table} ORDER BY created_at DESC LIMIT 5")
            return {"intelligence": [dict(r) for r in rows]}

        elif name == "get_country_profile":
            codes = args.get("country_codes", [])
            if not codes:
                return {"countries": []}
            placeholders = ", ".join(f"${i+1}" for i in range(len(codes)))
            rows = await fetch(
                f"SELECT * FROM ayn_country_intelligence WHERE country_code IN ({placeholders})",
                *codes)
            return {"countries": [dict(r) for r in rows]}

    except Exception as e:
        log.warning(f"[TOOL] {name} failed: {e}")
        return {"error": str(e)}

    return {"error": f"Unknown tool: {name}"}


def build_system_prompt(intent, language, user_ctx, intel_ctx):
    from routers._system_prompts import build_system_prompt as _build
    return _build(intent, language, {}, "", user_ctx) + intel_ctx


@router.post("/chat")
async def chat(body: ChatBody, request: Request, user_id: str = Depends(verify_token)):
    if getattr(body, "model_extra", {}).get("_internal_warm"):
        return {"status": "warm"}

    messages = body.messages or []
    log.info(f"[CHAT] user={user_id[:8] if user_id else '?'} msgs={len(messages)}")

    if not messages:
        return JSONResponse({"error": "No messages"}, status_code=400)

    last_message = next(
        (m.get("content", "") for m in reversed(messages)
         if m.get("role") == "user" and isinstance(m.get("content"), str)), "")

    has_image = any(
        isinstance(m.get("content"), list) and
        any(p.get("type") == "image_url" for p in m.get("content", []))
        for m in messages)

    intent = body.intent if body.intent and body.intent != "chat" \
        else detect_intent(last_message, has_image)

    if user_id != "internal":
        limit = await check_user_limit(user_id, intent)
        if not limit["allowed"]:
            return JSONResponse({
                "content": "You've reached your message limit. Upgrade to continue.",
                "limitExceeded": True,
                "reason": limit.get("reason", "daily_limit_reached"),
            }, status_code=429)

    language = "ar" if re.search(r'[\u0600-\u06FF]', last_message) else "en"
    user_ctx, intel_ctx = await build_full_context(last_message, user_id)

    url_match = re.search(r'https?://[^\s]+', last_message)
    if url_match:
        scraped = await scrape_url(url_match.group(0))
        if scraped:
            intel_ctx += scraped

    system_prompt = build_system_prompt(intent, language, user_ctx, intel_ctx)

    full_messages = []
    for m in messages:
        content = m.get("content", "")
        if isinstance(content, str) and len(content) > 15000:
            content = content[:15000] + "\n[truncated]"
        full_messages.append({**m, "content": content})

    llm_messages = [{"role": "system", "content": system_prompt}] + full_messages
    supports_tools = intent in ("search", "deep") or (
        intent == "chat" and needs_web_lookup(last_message))
    tools = AYN_TOOLS if supports_tools else None

    try:
        first_result = await call_with_fallback(
            intent, llm_messages, max_tokens=2000, tools=tools, user_id=user_id)
    except Exception as e:
        log.error(f"[CHAT] LLM call failed: {e}")
        from core.error_logger import log_error
        asyncio.create_task(log_error(
            "spine-chat", f"LLM call failed: {e}", error=e,
            severity="error", endpoint="/chat", user_id=user_id,
            context={"intent": intent}))
        return JSONResponse({"error": f"LLM error: {str(e)}"}, status_code=500)

    if supports_tools and first_result.get("tool_calls"):
        tool_calls = first_result["tool_calls"]
        llm_messages.append({
            "role": "assistant",
            "content": first_result.get("content") or "",
            "tool_calls": tool_calls,
        })
        tool_results = await asyncio.gather(*[execute_tool(tc) for tc in tool_calls])
        for tc, tr in zip(tool_calls, tool_results):
            llm_messages.append({
                "role": "tool",
                "tool_call_id": tc.get("id", ""),
                "name": tc.get("function", {}).get("name", ""),
                "content": json.dumps(tr),
            })
        second_result = await call_with_fallback(
            intent, llm_messages, max_tokens=2000, user_id=user_id)
        response_content = second_result.get("content", "")
    else:
        response_content = first_result.get("content", "")

    if user_id != "internal" and "[MEMORY:" in response_content:
        asyncio.create_task(extract_and_save_memories(user_id, response_content))

    clean_content = strip_memory_tags(response_content)
    return {
        "content": clean_content,
        "model": "AYN",
        "intent": intent,
        "provider": first_result.get("provider", "gemini"),
        "was_fallback": first_result.get("was_fallback", False),
    }
