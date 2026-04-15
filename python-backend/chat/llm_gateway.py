"""
llm_gateway.py — exact port of supabase/functions/ayn-unified/llmGateway.ts

Same models, same fallback chains, same order.
Provider "lovable" → calls ai.gateway.lovable.dev via ayn-ai-proxy edge fn
  (LOVABLE_API_KEY stays in Supabase secrets, never in Railway)
Provider "openrouter" → calls openrouter.ai directly (OPENROUTER_API_KEY in Railway)
Python-only addition: Gemini direct appended as final fallback (no timeout).
"""

import os
import asyncio
import time
import httpx
from typing import Optional
from dataclasses import dataclass, field

# ── Env ───────────────────────────────────────────────────────────────────────
SUPABASE_URL         = os.getenv("SUPABASE_URL", "")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY", "")
PROXY_SECRET         = os.getenv("AYN_PROXY_SECRET", "ayn-proxy-2024")
OPENROUTER_API_KEY   = os.getenv("OPENROUTER_API_KEY", "")
GEMINI_API_KEY       = os.getenv("GEMINI_API_KEY", "")   # already in Railway

# Mirrors TS: const LLM_REQUEST_TIMEOUT_MS = 45000
LLM_REQUEST_TIMEOUT_S = 45.0

PROXY_URL  = f"{SUPABASE_URL}/functions/v1/ayn-ai-proxy" if SUPABASE_URL else ""
GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"


@dataclass
class LLMModel:
    id: str
    provider: str       # "lovable" | "openrouter" | "gemini"
    model_id: str
    display_name: str


# ── Exact FALLBACK_CHAINS from llmGateway.ts ──────────────────────────────────
# Gemini direct added as final fallback in each chain (Python only — no timeout)
_G3F  = LLMModel("lovable-gemini-3-flash",    "lovable",    "google/gemini-3-flash-preview",  "Gemini 3 Flash")
_G25F = LLMModel("lovable-gemini-flash",       "lovable",    "google/gemini-2.5-flash",        "Gemini 2.5 Flash")
_G25L = LLMModel("lovable-gemini-flash-lite",  "lovable",    "google/gemini-2.5-flash-lite",   "Gemini 2.5 Flash Lite")
_G3P  = LLMModel("lovable-gemini-3-pro",       "lovable",    "google/gemini-3-pro-preview",    "Gemini 3 Pro")
_GIMG = LLMModel("lovable-gemini-image",       "lovable",    "google/gemini-2.5-flash-image",  "Gemini Image")
_GD   = LLMModel("gemini-direct",              "gemini",     "gemini-2.0-flash",               "Gemini 2.0 Flash Direct")

FALLBACK_CHAINS: dict[str, list[LLMModel]] = {
    "chat": [_G3F, _G25F, _G25L, _GD],
    "deep": [_G3P, _G3F, _GD],
    "engineering": [_G3F, _G3P, _G25F, _GD],
    "files": [_G3F, _G25F, _GD],
    "search": [_G3F, _GD],
    "image": [_GIMG],
    "trading-coach": [_G3F, _G25F, _G25L, _GD],
    # business-intelligence treated same as chat in TS (falls through to chat chain)
    "business-intelligence": [_G3F, _G25F, _G25L, _GD],
    # document generation — non-streaming, needs json
    "document": [_G3F, _G25F, _GD],
    # Python simulation (long calls) — Gemini direct first
    "simulation": [_GD, _G3F],
    "synthesis":  [_GD, _G3F],
    "agent_reaction": [_G3F, _G25F, _G25L, _GD],
    "classify":       [_G25L, _G3F, _GD],
}


def needs_deep_reasoning(message: str) -> bool:
    """Port of needsDeepReasoning from llmGateway.ts"""
    import re
    if len(message) > 300:
        return True
    en = bool(re.search(
        r'\b(analyze|analysis|strategy|compare|evaluate|assess|should i|'
        r'what do you think about|how should i|help me decide|pros and cons|'
        r'explain why|what are the implications|business plan|investment|'
        r'long.term|forecast|predict|risk|opportunity|advise me|'
        r'what would you recommend)\b',
        message, re.IGNORECASE
    ))
    ar = bool(re.search(
        r'\b(تحليل|استراتيجية|قارن|قيم|هل يجب|ماذا تعتقد|كيف يجب|'
        r'ساعدني|إيجابيات وسلبيات|اشرح لماذا|خطة عمل|توصية|نصيحة)\b',
        message
    ))
    return en or ar


# ── Lovable via ayn-ai-proxy ──────────────────────────────────────────────────
async def _call_lovable(
    model: LLMModel,
    messages: list[dict],
    stream: bool,
    tools: Optional[list] = None,
) -> dict:
    """
    Routes through ayn-ai-proxy Supabase edge fn.
    LOVABLE_API_KEY stays in Supabase — never exposed to Railway.
    Mirrors: fetch('https://ai.gateway.lovable.dev/v1/chat/completions', ...)
    Timeout: 45s (mirrors LLM_REQUEST_TIMEOUT_MS = 45000)
    """
    if not PROXY_URL:
        raise RuntimeError("SUPABASE_URL not set — cannot reach ayn-ai-proxy")

    payload: dict = {
        "model": model.model_id,
        "messages": messages,
        "stream": False,   # proxy doesn't passthrough streaming
    }
    if tools:
        payload["tools"] = tools
        payload["tool_choice"] = "auto"

    async with httpx.AsyncClient(timeout=LLM_REQUEST_TIMEOUT_S) as client:
        r = await client.post(
            PROXY_URL,
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
                "x-proxy-secret": PROXY_SECRET,
                "x-source": "ayn-python-backend",
            },
            json=payload,
        )

    if not r.is_success:
        raise RuntimeError(
            f"{model.display_name} via proxy → HTTP {r.status_code}: {r.text[:200]}"
        )
    data = r.json()
    if "error" in data:
        raise RuntimeError(f"Proxy error: {data['error']}")

    choice = data["choices"][0]["message"]
    return {
        "content": choice.get("content", "") or "",
        "tool_calls": choice.get("tool_calls"),
        "model_used": model.display_name,
        "provider": "lovable",
    }


# ── OpenRouter ────────────────────────────────────────────────────────────────
async def _call_openrouter(
    model: LLMModel,
    messages: list[dict],
    stream: bool,
    tools: Optional[list] = None,
) -> dict:
    if not OPENROUTER_API_KEY:
        raise RuntimeError("OPENROUTER_API_KEY not set")

    payload: dict = {
        "model": model.model_id,
        "messages": messages,
        "stream": False,
    }
    if tools:
        payload["tools"] = tools
        payload["tool_choice"] = "auto"

    async with httpx.AsyncClient(timeout=LLM_REQUEST_TIMEOUT_S) as client:
        r = await client.post(
            "https://openrouter.ai/api/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {OPENROUTER_API_KEY}",
                "Content-Type": "application/json",
                "HTTP-Referer": "https://aynn.io",
                "X-Title": "AYN",
            },
            json=payload,
        )

    if not r.is_success:
        raise RuntimeError(
            f"{model.display_name} via OpenRouter → HTTP {r.status_code}: {r.text[:200]}"
        )
    data = r.json()
    choice = data["choices"][0]["message"]
    return {
        "content": choice.get("content", "") or "",
        "tool_calls": choice.get("tool_calls"),
        "model_used": model.display_name,
        "provider": "openrouter",
    }


# ── Gemini direct (Python-only fallback, no timeout) ─────────────────────────
async def _call_gemini_direct(
    model: LLMModel,
    messages: list[dict],
    json_mode: bool = False,
) -> dict:
    """No Supabase in the loop — safe for long simulation calls."""
    if not GEMINI_API_KEY:
        raise RuntimeError("GEMINI_API_KEY not set in Railway")

    gemini_contents = []
    system_text = ""
    for msg in messages:
        role = msg["role"]
        content = msg.get("content", "")
        if isinstance(content, list):
            content = " ".join(p.get("text", "") for p in content if isinstance(p, dict))
        if role == "system":
            system_text = content
        elif role == "user":
            gemini_contents.append({"role": "user",  "parts": [{"text": content}]})
        elif role == "assistant":
            gemini_contents.append({"role": "model", "parts": [{"text": content}]})

    payload: dict = {
        "contents": gemini_contents,
        "generationConfig": {"temperature": 0.7, "maxOutputTokens": 4096},
    }
    if system_text:
        payload["systemInstruction"] = {"parts": [{"text": system_text}]}
    if json_mode:
        payload["generationConfig"]["responseMimeType"] = "application/json"

    url = GEMINI_URL.format(model=model.model_id)
    async with httpx.AsyncClient(timeout=300.0) as client:
        r = await client.post(url, params={"key": GEMINI_API_KEY}, json=payload)

    if not r.is_success:
        raise RuntimeError(
            f"Gemini direct {model.display_name} → HTTP {r.status_code}: {r.text[:200]}"
        )
    data = r.json()
    try:
        content = data["candidates"][0]["content"]["parts"][0]["text"]
    except (KeyError, IndexError) as e:
        raise RuntimeError(f"Unexpected Gemini response: {data}") from e

    return {
        "content": content,
        "tool_calls": None,
        "model_used": model.display_name,
        "provider": "gemini",
    }


# ── Single model dispatch ─────────────────────────────────────────────────────
async def _call_model(
    model: LLMModel,
    messages: list[dict],
    stream: bool,
    tools: Optional[list] = None,
    json_mode: bool = False,
) -> dict:
    if model.provider == "lovable":
        return await _call_lovable(model, messages, stream, tools)
    if model.provider == "openrouter":
        return await _call_openrouter(model, messages, stream, tools)
    return await _call_gemini_direct(model, messages, json_mode)


# ── Public: call_with_fallback (mirrors callWithFallback in TS) ───────────────
async def call_with_fallback(
    intent: str,
    messages: list[dict],
    stream: bool = False,
    supabase=None,
    user_id: Optional[str] = None,
    tools: Optional[list] = None,
) -> dict:
    """
    Exact mirror of TypeScript callWithFallback.
    Tries each model in chain, logs failures to llm_failures, falls back.
    Returns: { content, tool_calls, model_used, provider, was_fallback }
    """
    chain = FALLBACK_CHAINS.get(intent) or FALLBACK_CHAINS["chat"]
    last_error: Exception = RuntimeError("No models in chain")

    for i, model in enumerate(chain):
        try:
            print(f"   🤖 {model.display_name} [{model.provider}] ({i+1}/{len(chain)})")
            start = time.time()
            result = await _call_model(model, messages, stream, tools)
            elapsed_ms = int((time.time() - start) * 1000)

            # Log usage — fire and forget (mirrors TS)
            if supabase:
                try:
                    supabase.table("llm_usage_logs").insert({
                        "user_id": None if user_id in (None, "internal-evaluator") else user_id,
                        "model_name": model.display_name,
                        "model_id": model.id,
                        "response_time_ms": elapsed_ms,
                        "was_fallback": i > 0,
                    }).execute()
                except Exception:
                    pass

            result["was_fallback"] = i > 0
            return result

        except Exception as e:
            print(f"   ⚠️  {model.display_name} failed: {e}")
            last_error = e

            # Log failure — fire and forget (mirrors TS)
            if supabase:
                try:
                    supabase.table("llm_failures").insert({
                        "user_id": None if user_id in (None, "internal-evaluator") else user_id,
                        "model_id": model.id,
                        "error_type": "error",
                        "error_message": str(e)[:500],
                    }).execute()
                except Exception:
                    pass

            if i < len(chain) - 1:
                await asyncio.sleep(0.3)

    raise RuntimeError(f"All models in '{intent}' chain failed: {last_error}")


async def call_with_fallback_json(
    intent: str,
    messages: list[dict],
    supabase=None,
    user_id: Optional[str] = None,
) -> dict:
    """Non-streaming JSON variant. Auto-strips markdown fences."""
    import json as _json
    chain = FALLBACK_CHAINS.get(intent) or FALLBACK_CHAINS["chat"]
    last_error: Exception = RuntimeError("No models in chain")

    for i, model in enumerate(chain):
        try:
            result = await _call_model(model, messages, stream=False, json_mode=True)
            raw = (result["content"] or "").strip()
            if raw.startswith("```"):
                raw = raw.split("```", 2)[1]
                if raw.startswith("json"):
                    raw = raw[4:]
                raw = raw.rsplit("```", 1)[0].strip()
            result["parsed"] = _json.loads(raw)
            result["was_fallback"] = i > 0
            return result
        except Exception as e:
            last_error = e
            if i < len(chain) - 1:
                await asyncio.sleep(0.3)

    raise RuntimeError(f"All models failed (json) for '{intent}': {last_error}")


async def check_providers() -> dict:
    """Health check — used by /health endpoint."""
    status: dict = {"lovable_proxy": "unknown", "gemini_direct": "unknown"}
    try:
        await _call_lovable(_G25L, [{"role": "user", "content": "ok"}], stream=False)
        status["lovable_proxy"] = "ok"
    except Exception as e:
        status["lovable_proxy"] = f"error: {str(e)[:100]}"
    try:
        await _call_gemini_direct(_GD, [{"role": "user", "content": "ok"}])
        status["gemini_direct"] = "ok"
    except Exception as e:
        status["gemini_direct"] = f"error: {str(e)[:100]}"
    return status
