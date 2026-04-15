"""
AYN LLM Gateway — identical to supabase/functions/ayn-unified/llmGateway.ts

Same model IDs, same fallback chains, same order, same provider.
Only difference: Lovable calls go through ayn-ai-proxy edge fn
(because LOVABLE_API_KEY lives in Supabase secrets, not Railway).
Gemini direct is available as a fallback for long calls with no timeout risk.
"""

import os
import json
import asyncio
import httpx
from typing import Optional, Literal
from dataclasses import dataclass

# ── Env (Railway) ─────────────────────────────────────────────────────────────
SUPABASE_URL        = os.getenv("SUPABASE_URL", "")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY", "")
PROXY_SECRET        = os.getenv("AYN_PROXY_SECRET", "ayn-proxy-2024")
GEMINI_API_KEY      = os.getenv("GEMINI_API_KEY", "")  # already in Railway

# Lovable calls route through ayn-ai-proxy (holds LOVABLE_API_KEY in Supabase)
PROXY_URL  = f"{SUPABASE_URL}/functions/v1/ayn-ai-proxy" if SUPABASE_URL else ""
GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"

# ── Model definition (mirrors TypeScript LLMModel interface) ──────────────────
@dataclass
class LLMModel:
    id: str
    provider: str   # "lovable" | "gemini"
    model_id: str
    display_name: str


# ── Exact model list from supabase/functions/ayn-unified/llmGateway.ts ───────
# Lovable models — via ayn-ai-proxy
GEMINI_3_FLASH      = LLMModel("lovable-gemini-3-flash",    "lovable", "google/gemini-3-flash-preview",  "Gemini 3 Flash")
GEMINI_25_FLASH     = LLMModel("lovable-gemini-flash",      "lovable", "google/gemini-2.5-flash",        "Gemini 2.5 Flash")
GEMINI_25_FLASH_LITE = LLMModel("lovable-gemini-flash-lite","lovable", "google/gemini-2.5-flash-lite",   "Gemini 2.5 Flash Lite")
GEMINI_3_PRO        = LLMModel("lovable-gemini-3-pro",      "lovable", "google/gemini-3-pro-preview",    "Gemini 3 Pro")
GEMINI_IMAGE        = LLMModel("lovable-gemini-image",      "lovable", "google/gemini-2.5-flash-image",  "Gemini Image")

# Gemini direct — for long calls (no Supabase timeout), Python backend only
GEMINI_DIRECT_FLASH = LLMModel("gemini-direct-flash",       "gemini",  "gemini-2.0-flash",               "Gemini 2.0 Flash Direct")


# ── Fallback chains — identical to llmGateway.ts FALLBACK_CHAINS ─────────────
# Gemini direct appended at end of each chain as final fallback (no timeout)
FALLBACK_CHAINS: dict[str, list[LLMModel]] = {
    "chat": [
        GEMINI_3_FLASH,
        GEMINI_25_FLASH,
        GEMINI_25_FLASH_LITE,
        GEMINI_DIRECT_FLASH,      # Python-only fallback
    ],
    "deep": [
        GEMINI_3_PRO,
        GEMINI_3_FLASH,
        GEMINI_DIRECT_FLASH,
    ],
    "engineering": [
        GEMINI_3_FLASH,
        GEMINI_3_PRO,
        GEMINI_25_FLASH,
        GEMINI_DIRECT_FLASH,
    ],
    "files": [
        GEMINI_3_FLASH,
        GEMINI_25_FLASH,
        GEMINI_DIRECT_FLASH,
    ],
    "search": [
        GEMINI_3_FLASH,
        GEMINI_DIRECT_FLASH,
    ],
    "image": [
        GEMINI_IMAGE,
    ],
    "trading-coach": [
        GEMINI_3_FLASH,
        GEMINI_25_FLASH,
        GEMINI_25_FLASH_LITE,
        GEMINI_DIRECT_FLASH,
    ],
    # Python simulation calls — Gemini direct first (long, no timeout)
    "simulation": [
        GEMINI_DIRECT_FLASH,
        GEMINI_3_FLASH,
    ],
    "synthesis": [
        GEMINI_DIRECT_FLASH,
        GEMINI_3_FLASH,
    ],
    "agent_reaction": [
        GEMINI_3_FLASH,
        GEMINI_25_FLASH,
        GEMINI_25_FLASH_LITE,
        GEMINI_DIRECT_FLASH,
    ],
    "classify": [
        GEMINI_25_FLASH_LITE,
        GEMINI_3_FLASH,
        GEMINI_DIRECT_FLASH,
    ],
}


# ── Call via Lovable (ayn-ai-proxy edge fn) ───────────────────────────────────
async def _call_lovable_proxy(
    model: LLMModel,
    messages: list[dict],
    stream: bool = False,
    temperature: float = 0.7,
    max_tokens: int = 1000,
    tools: Optional[list] = None,
) -> dict:
    """
    Routes through ayn-ai-proxy Supabase edge fn.
    LOVABLE_API_KEY stays in Supabase — never comes to Railway.
    Timeout: 52s (safe below Supabase 60s hard ceiling).
    """
    if not PROXY_URL:
        raise RuntimeError("SUPABASE_URL not set")

    payload: dict = {
        "messages": messages,
        "model": model.model_id,
        "max_tokens": max_tokens,
        "temperature": temperature,
        "stream": False,  # proxy does not support streaming passthrough
    }
    if tools:
        payload["tools"] = tools

    async with httpx.AsyncClient(timeout=52.0) as client:
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
        raise RuntimeError(f"ayn-ai-proxy {model.display_name} → HTTP {r.status_code}: {r.text[:300]}")

    data = r.json()
    if "error" in data:
        raise RuntimeError(f"ayn-ai-proxy error: {data['error']}")

    content = data["choices"][0]["message"]["content"]
    tool_calls = data["choices"][0]["message"].get("tool_calls")
    return {
        "content": content,
        "tool_calls": tool_calls,
        "model_used": model.display_name,
        "provider": "lovable",
    }


# ── Call Gemini direct ─────────────────────────────────────────────────────────
async def _call_gemini_direct(
    model: LLMModel,
    messages: list[dict],
    stream: bool = False,
    temperature: float = 0.7,
    max_tokens: int = 2000,
    json_mode: bool = False,
) -> dict:
    """
    Calls Google Gemini REST API directly — no Supabase, no timeout.
    Used as final fallback and for long simulation calls.
    Converts OpenAI message format → Gemini format.
    """
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
        "generationConfig": {
            "temperature": temperature,
            "maxOutputTokens": max_tokens,
        },
    }
    if system_text:
        payload["systemInstruction"] = {"parts": [{"text": system_text}]}
    if json_mode:
        payload["generationConfig"]["responseMimeType"] = "application/json"

    url = GEMINI_URL.format(model=model.model_id)
    async with httpx.AsyncClient(timeout=300.0) as client:
        r = await client.post(url, params={"key": GEMINI_API_KEY}, json=payload)

    if not r.is_success:
        raise RuntimeError(f"Gemini direct {model.display_name} → HTTP {r.status_code}: {r.text[:300]}")

    data = r.json()
    try:
        content = data["candidates"][0]["content"]["parts"][0]["text"]
    except (KeyError, IndexError) as e:
        raise RuntimeError(f"Unexpected Gemini response shape: {data}") from e

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
    temperature: float,
    max_tokens: int,
    tools: Optional[list] = None,
    json_mode: bool = False,
) -> dict:
    if model.provider == "lovable":
        return await _call_lovable_proxy(model, messages, stream, temperature, max_tokens, tools)
    else:
        return await _call_gemini_direct(model, messages, stream, temperature, max_tokens, json_mode)


# ── Public: callWithFallback (mirrors TypeScript callWithFallback) ────────────
async def call_with_fallback(
    intent: str,
    messages: list[dict],
    stream: bool = False,
    user_id: Optional[str] = None,
    tools: Optional[list] = None,
    temperature: float = 0.7,
    max_tokens: int = 1000,
    supabase=None,             # optional — for usage logging
) -> dict:
    """
    Mirrors TypeScript callWithFallback exactly.
    Tries each model in chain, falls back on failure, logs to llm_failures.
    Returns: { content, tool_calls, model_used, provider, was_fallback }
    """
    chain = FALLBACK_CHAINS.get(intent, FALLBACK_CHAINS["chat"])
    last_error: Exception = RuntimeError("No models in chain")

    for i, model in enumerate(chain):
        try:
            print(f"   🤖 {model.display_name} [{model.provider}] (attempt {i+1}/{len(chain)})")
            result = await _call_model(model, messages, stream, temperature, max_tokens, tools)
            result["was_fallback"] = i > 0

            # Log usage (fire and forget — mirrors TS behaviour)
            if supabase and user_id:
                try:
                    supabase.table("llm_usage_logs").insert({
                        "user_id": None if user_id == "internal" else user_id,
                        "model_name": model.display_name,
                        "model_id": model.id,
                        "was_fallback": i > 0,
                    }).execute()
                except Exception:
                    pass

            return result

        except Exception as e:
            print(f"   ⚠️  {model.display_name} failed: {e}")
            last_error = e

            # Log failure (mirrors TS behaviour)
            if supabase:
                try:
                    supabase.table("llm_failures").insert({
                        "user_id": None if user_id == "internal" else user_id,
                        "model_id": model.id,
                        "error_type": "error",
                        "error_message": str(e)[:500],
                    }).execute()
                except Exception:
                    pass

            if i < len(chain) - 1:
                await asyncio.sleep(0.3)

    raise RuntimeError(f"All models failed for intent='{intent}': {last_error}")


async def call_with_fallback_json(
    intent: str,
    messages: list[dict],
    user_id: Optional[str] = None,
    temperature: float = 0.7,
    max_tokens: int = 1000,
    supabase=None,
) -> dict:
    """Same as call_with_fallback but forces json_mode and auto-parses response."""
    chain = FALLBACK_CHAINS.get(intent, FALLBACK_CHAINS["chat"])
    last_error: Exception = RuntimeError("No models in chain")

    for i, model in enumerate(chain):
        try:
            result = await _call_model(model, messages, False, temperature, max_tokens, json_mode=True)
            raw = result["content"].strip()
            # Strip markdown fences if model wraps json anyway
            if raw.startswith("```"):
                raw = raw.split("```", 2)[1]
                if raw.startswith("json"):
                    raw = raw[4:]
                raw = raw.rsplit("```", 1)[0].strip()
            result["parsed"] = json.loads(raw)
            result["was_fallback"] = i > 0
            return result
        except Exception as e:
            last_error = e
            if i < len(chain) - 1:
                await asyncio.sleep(0.3)

    raise RuntimeError(f"All models failed (json) for intent='{intent}': {last_error}")


# ── Health check ──────────────────────────────────────────────────────────────
async def check_providers() -> dict:
    """Ping both providers with a tiny message. Used by /health endpoint."""
    status = {"lovable_proxy": "unknown", "gemini_direct": "unknown"}

    try:
        await _call_lovable_proxy(
            GEMINI_25_FLASH_LITE,
            [{"role": "user", "content": "Reply with one word: ok"}],
            max_tokens=5,
        )
        status["lovable_proxy"] = "ok"
    except Exception as e:
        status["lovable_proxy"] = f"error: {str(e)[:100]}"

    try:
        await _call_gemini_direct(
            GEMINI_DIRECT_FLASH,
            [{"role": "user", "content": "Reply with one word: ok"}],
            max_tokens=5,
        )
        status["gemini_direct"] = "ok"
    except Exception as e:
        status["gemini_direct"] = f"error: {str(e)[:100]}"

    return status
