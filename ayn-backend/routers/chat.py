"""
routers/chat.py — AYN chat endpoint, replacing ayn-unified edge function

Streaming SSE to React. Same request shape, same response shape.
React changes one URL: /functions/v1/ayn-unified → /chat
Everything else stays identical.
"""
import re
import asyncio
from fastapi import APIRouter, Depends, Request
from fastapi.responses import StreamingResponse, JSONResponse
from pydantic import BaseModel
from typing import Optional

from core.auth import verify_token, check_user_limit
from core.db import get_db
from core.llm import call_with_fallback, lovable
from core.config import LOVABLE_MODELS
from services.context import build_full_context
from services.memory import extract_and_save_memories, strip_memory_tags
from services.search import needs_web_lookup, search_web, scrape_url

# ── Intent detector (port of intentDetector.ts) ───────────────────────────────
from routers._intent import detect_intent

router = APIRouter()


class ChatBody(BaseModel):
    messages: list[dict]
    intent: Optional[str] = None
    context: dict = {}
    stream: bool = True
    sessionId: Optional[str] = None
    _internal_warm: bool = False


# ── AYN tool definitions (same as toolHandler.ts) ─────────────────────────────
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
        "description": "Search the live internet for ANY information. ALWAYS search when not 100% certain of current facts.",
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


async def execute_tool(tool_call: dict, db) -> dict:
    """Execute an AYN tool call. Returns result dict."""
    name = tool_call.get("function", {}).get("name", "")
    args = tool_call.get("function", {}).get("arguments", {})
    if isinstance(args, str):
        import json
        try:
            args = json.loads(args)
        except Exception:
            args = {}

    try:
        if name == "get_market_prices":
            r = db.from_("ayn_market_prices").select("*").limit(1).maybe_single().execute()
            return {"prices": r.data or {}}

        elif name == "get_business_news":
            codes = args.get("country_codes", [])
            q = db.from_("ayn_business_news").select("*").order("created_at", desc=True).limit(10)
            if codes:
                q = q.in_("country_code", codes)
            r = q.execute()
            return {"news": r.data or []}

        elif name == "get_geopolitical_risks":
            r = (db.from_("ayn_world_signals").select("headline,severity,region,summary")
                 .eq("status", "active").order("created_at", desc=True).limit(15).execute())
            return {"risks": r.data or []}

        elif name == "search_web":
            query = args.get("query", "")
            result = await search_web(query)
            return {"results": result}

        elif name == "get_sector_intelligence":
            sector = args.get("sector", "")
            sector_map = {
                "startups": "ayn_startup_intel", "jobs": "ayn_job_market",
                "supply_chain": "ayn_supply_chain", "real_estate": "ayn_real_estate",
                "consumer": "ayn_consumer_sentiment", "health": "ayn_health_intel",
                "tech": "ayn_tech_disruption", "energy": "ayn_sector_intel",
            }
            table = sector_map.get(sector, "ayn_sector_intel")
            r = db.from_(table).select("*").order("created_at", desc=True).limit(5).execute()
            return {"intelligence": r.data or []}

        elif name == "get_country_profile":
            codes = args.get("country_codes", [])
            r = db.from_("ayn_country_intelligence").select("*").in_("country_code", codes).execute()
            return {"profiles": r.data or []}

    except Exception as e:
        return {"error": str(e)}

    return {"error": f"Unknown tool: {name}"}


def build_system_prompt(intent: str, language: str, user_context: dict, intel_context: str) -> str:
    """Build system prompt. Full prompt from systemPrompts.ts."""
    from routers._system_prompts import build_system_prompt as _build
    return _build(intent, language, {}, "", user_context) + intel_context


@router.post("/chat")
async def chat(body: ChatBody, request: Request, user_id: str = Depends(verify_token)):
    import logging
    log = logging.getLogger("ayn.chat")

    # Warm ping
    if body._internal_warm:
        return {"status": "warm"}

    db = get_db()
    messages = body.messages or []
    log.info(f"[CHAT] user={user_id[:8] if user_id else '?'} msgs={len(messages)} stream={body.stream}")

    if not messages:
        log.warning("[CHAT] No messages in request")
        return JSONResponse({"error": "No messages"}, status_code=400)

    last_message = ""
    for m in reversed(messages):
        if m.get("role") == "user":
            content = m.get("content", "")
            last_message = content if isinstance(content, str) else ""
            break

    # Detect intent
    has_image = any(
        isinstance(m.get("content"), list) and
        any(p.get("type") == "image_url" for p in m.get("content", []))
        for m in messages
    )
    intent = body.intent if body.intent and body.intent != "chat" else detect_intent(last_message, has_image)

    # Check limit
    if user_id != "internal":
        limit = await check_user_limit(user_id, intent)
        if not limit["allowed"]:
            return JSONResponse({
                "content": "You've reached your message limit. Upgrade to continue.",
                "limitExceeded": True,
                "reason": limit.get("reason", "daily_limit_reached"),
            }, status_code=429)

    # Detect language
    language = "ar" if re.search(r'[\u0600-\u06FF]', last_message) else "en"

    # Build context in parallel
    user_ctx, intel_ctx = await build_full_context(last_message, user_id)

    # Check for URL to scrape
    url_match = re.search(r'https?://[^\s]+', last_message)
    if url_match:
        scraped = await scrape_url(url_match.group(0))
        if scraped:
            intel_ctx += scraped

    # Build system prompt
    system_prompt = build_system_prompt(intent, language, user_ctx, intel_ctx)

    # Prepare messages for LLM
    # Truncate long messages
    full_messages = []
    for m in messages:
        content = m.get("content", "")
        if isinstance(content, str) and len(content) > 15000:
            content = content[:15000] + "\n[truncated]"
        full_messages.append({**m, "content": content})

    llm_messages = [{"role": "system", "content": system_prompt}] + full_messages

    # Tool-supporting intents
    supports_tools = intent in ("chat", "search", "deep")
    tools = AYN_TOOLS if supports_tools else None

    # First LLM call (non-streaming if tools enabled)
    log.info(f"[CHAT] calling LLM intent={intent} tools={tools is not None} msgs={len(llm_messages)}")
    try:
        first_result = await call_with_fallback(
            intent,
            llm_messages,
            max_tokens=2000,
            tools=tools,
            db=db,
            user_id=user_id,
        )
    except Exception as e:
        log.error(f"[CHAT] LLM call failed: {e}")
        return JSONResponse({"error": f"LLM error: {str(e)}"}, status_code=500)
    log.info(f"[CHAT] LLM done provider={first_result.get('provider')} content_len={len(first_result.get('content',''))}")

    # Tool execution loop
    if supports_tools and first_result.get("tool_calls"):
        tool_calls = first_result["tool_calls"]
        llm_messages.append({
            "role": "assistant",
            "content": first_result.get("content") or "",
            "tool_calls": tool_calls,
        })
        tool_results = await asyncio.gather(*[
            execute_tool(tc, db) for tc in tool_calls
        ])
        import json
        for tc, tr in zip(tool_calls, tool_results):
            llm_messages.append({
                "role": "tool",
                "tool_call_id": tc.get("id", ""),
                "name": tc.get("function", {}).get("name", ""),
                "content": json.dumps(tr),
            })
        # Second hop
        second_result = await call_with_fallback(intent, llm_messages, max_tokens=2000, db=db, user_id=user_id)
        response_content = second_result.get("content", "")
    else:
        response_content = first_result.get("content", "")

    # Extract and save memories (fire and forget)
    if user_id != "internal" and "[MEMORY:" in response_content:
        asyncio.create_task(extract_and_save_memories(user_id, response_content))

    clean_content = strip_memory_tags(response_content)
    log.info(f"[CHAT] response ready len={len(clean_content)} stream={body.stream}")

    # Save message to DB
    if user_id != "internal" and body.sessionId:
        try:
            db.table("messages").insert({
                "user_id": user_id,
                "session_id": body.sessionId,
                "content": last_message,
                "sender": "user",
            }).execute()
            db.table("messages").insert({
                "user_id": user_id,
                "session_id": body.sessionId,
                "content": clean_content,
                "sender": "ayn",
            }).execute()
        except Exception:
            pass

    # Streaming response — word-by-word SSE from content already fetched
    # (ayn-ai-proxy does not support true streaming)
    if body.stream:
        async def stream_words():
            words = clean_content.split(" ")
            chunk_size = 4
            for i in range(0, len(words), chunk_size):
                chunk = " ".join(words[i:i + chunk_size])
                if i + chunk_size < len(words):
                    chunk += " "
                payload = json.dumps({"choices": [{"delta": {"content": chunk}}]})
                yield f"data: {payload}\n\n".encode()
                await asyncio.sleep(0.01)
            yield b"data: [DONE]\n\n"

        return StreamingResponse(
            stream_words(),
            media_type="text/event-stream",
            headers={"Cache-Control": "no-cache", "Connection": "keep-alive",
                     "X-Accel-Buffering": "no", "X-Intent": intent}
        )
    # Non-streaming
    return {
        "content": clean_content,
        "model": "AYN",
        "intent": intent,
        "was_fallback": first_result.get("was_fallback", False),
    }
