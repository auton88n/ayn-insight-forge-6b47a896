"""
AYN Dual LLM Gateway

Two routes, each used for what they're good at:

  LOVABLE (via ayn-ai-proxy Supabase edge function)
  ├─ Python → Supabase ayn-ai-proxy → ai.gateway.lovable.dev → Gemini Flash
  ├─ Key lives in Supabase secrets only — never exposed to Railway
  ├─ Timeout: ~52s hard limit (Supabase edge function ceiling)
  └─ Best for: fast calls — agent reactions, chat, classification

  GEMINI DIRECT (via generativelanguage.googleapis.com)
  ├─ Python → Google API directly — no Supabase in the loop
  ├─ Key: GEMINI_API_KEY already in Railway
  ├─ Timeout: none — runs as long as needed
  └─ Best for: 7-layer simulations, synthesis, any long-running call

Routing is automatic per call_type. Fallback fires on any failure.
"""

import os
import json
import asyncio
import httpx
from typing import Optional, Literal
from dataclasses import dataclass

# ── Env vars needed in Railway ────────────────────────────────────────────────
# GEMINI_API_KEY      — already set ✅
# SUPABASE_URL        — already set ✅
# SUPABASE_SERVICE_KEY — already set ✅ (used as anon key to call edge fn)
# AYN_PROXY_SECRET    — must match Supabase secret AYN_PROXY_SECRET

GEMINI_API_KEY   = os.getenv("GEMINI_API_KEY", "")
SUPABASE_URL     = os.getenv("SUPABASE_URL", "")
SUPABASE_ANON_KEY = os.getenv("SUPABASE_ANON_KEY", "")   # public anon key to call edge fns
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY", "")
PROXY_SECRET     = os.getenv("AYN_PROXY_SECRET", "ayn-proxy-2024")

# Build the proxy URL from SUPABASE_URL
PROXY_URL = f"{SUPABASE_URL}/functions/v1/ayn-ai-proxy" if SUPABASE_URL else ""
GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"


# ── Model definitions ─────────────────────────────────────────────────────────
@dataclass
class LLMModel:
    id: str
    provider: Literal["lovable", "gemini"]
    model_id: str
    display_name: str
    max_tokens: int = 2048


# Lovable models — called via ayn-ai-proxy edge function
LOVABLE_FLASH      = LLMModel("lovable-gemini-3-flash",   "lovable", "google/gemini-3-flash-preview",  "Gemini 3 Flash",       2048)
LOVABLE_FLASH_25   = LLMModel("lovable-gemini-25-flash",  "lovable", "google/gemini-2.5-flash",        "Gemini 2.5 Flash",     2048)
LOVABLE_FLASH_LITE = LLMModel("lovable-gemini-25-lite",   "lovable", "google/gemini-2.5-flash-lite",   "Gemini 2.5 Flash Lite",1024)

# Gemini direct models — no Supabase, no timeout
GEMINI_FLASH       = LLMModel("gemini-20-flash",          "gemini",  "gemini-2.0-flash",               "Gemini 2.0 Flash",     4096)
GEMINI_FLASH_LITE  = LLMModel("gemini-20-flash-lite",     "gemini",  "gemini-2.0-flash-lite",          "Gemini 2.0 Flash Lite",2048)
GEMINI_15_PRO      = LLMModel("gemini-15-pro",            "gemini",  "gemini-1.5-pro",                 "Gemini 1.5 Pro",       8192)


# ── Routing table ─────────────────────────────────────────────────────────────
CHAINS: dict[str, list[LLMModel]] = {

    # Fast calls → Lovable proxy first, Gemini direct as fallback
    "agent_reaction": [LOVABLE_FLASH, LOVABLE_FLASH_25, LOVABLE_FLASH_LITE, GEMINI_FLASH],
    "classify":       [LOVABLE_FLASH_LITE, LOVABLE_FLASH, GEMINI_FLASH_LITE],
    "chat":           [LOVABLE_FLASH, LOVABLE_FLASH_25, LOVABLE_FLASH_LITE, GEMINI_FLASH],

    # Long calls → Gemini direct first (no timeout), Lovable as last resort
    "synthesis":      [GEMINI_FLASH, GEMINI_15_PRO, LOVABLE_FLASH],
    "simulation":     [GEMINI_FLASH, GEMINI_FLASH_LITE, LOVABLE_FLASH],
    "deep_analysis":  [GEMINI_15_PRO, GEMINI_FLASH, LOVABLE_FLASH],
}


# ── Lovable via ayn-ai-proxy ──────────────────────────────────────────────────

async def _call_lovable_proxy(
    model: LLMModel,
    messages: list[dict],
    temperature: float = 0.7,
    max_tokens: int = 1000,
    json_mode: bool = False,
) -> dict:
    """
    Call Lovable via the ayn-ai-proxy Supabase edge function.
    
    Flow: Railway Python → Supabase edge fn → ai.gateway.lovable.dev → Gemini
    The LOVABLE_API_KEY never leaves Supabase — this is the only way to reach it.
    Timeout: 52s (safe below Supabase 60s hard limit).
    """
    if not PROXY_URL:
        raise RuntimeError("SUPABASE_URL not set — cannot reach ayn-ai-proxy")

    # Use service key or anon key — edge fn only checks x-proxy-secret, not JWT
    auth_key = SUPABASE_SERVICE_KEY or SUPABASE_ANON_KEY

    payload = {
        "messages": messages,
        "model": model.model_id,
        "max_tokens": max_tokens,
        "temperature": temperature,
        "stream": False,
    }

    async with httpx.AsyncClient(timeout=52.0) as client:
        r = await client.post(
            PROXY_URL,
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {auth_key}",
                "x-proxy-secret": PROXY_SECRET,
                "x-source": "ayn-python-backend",
            },
            json=payload,
        )

    if not r.is_success:
        raise RuntimeError(f"ayn-ai-proxy {model.display_name} → {r.status_code}: {r.text[:300]}")

    data = r.json()

    if "error" in data:
        raise RuntimeError(f"ayn-ai-proxy error: {data['error']}")

    content = data["choices"][0]["message"]["content"]
    return {"content": content, "model_used": model.display_name, "provider": "lovable"}


# ── Gemini direct ─────────────────────────────────────────────────────────────

async def _call_gemini_direct(
    model: LLMModel,
    messages: list[dict],
    temperature: float = 0.7,
    max_tokens: int = 2000,
    json_mode: bool = False,
) -> dict:
    """
    Call Gemini directly — no Supabase in the loop, no timeout limit.
    Converts OpenAI-style messages to Gemini REST format.
    """
    if not GEMINI_API_KEY:
        raise RuntimeError("GEMINI_API_KEY not set in Railway")

    # Convert OpenAI format → Gemini format
    gemini_contents = []
    system_text = ""

    for msg in messages:
        role = msg["role"]
        content = msg["content"]
        if isinstance(content, list):
            content = " ".join(p.get("text", "") for p in content if isinstance(p, dict))

        if role == "system":
            system_text = content
        elif role == "user":
            gemini_contents.append({"role": "user", "parts": [{"text": content}]})
        elif role == "assistant":
            gemini_contents.append({"role": "model", "parts": [{"text": content}]})

    payload: dict = {
        "contents": gemini_contents,
        "generationConfig": {
            "temperature": temperature,
            "maxOutputTokens": min(max_tokens, model.max_tokens),
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
        raise RuntimeError(f"Gemini direct {model.display_name} → {r.status_code}: {r.text[:300]}")

    data = r.json()
    try:
        content = data["candidates"][0]["content"]["parts"][0]["text"]
    except (KeyError, IndexError) as e:
        raise RuntimeError(f"Unexpected Gemini response: {data}") from e

    return {"content": content, "model_used": model.display_name, "provider": "gemini"}


# ── Router ────────────────────────────────────────────────────────────────────

async def _call_model(model: LLMModel, messages, temperature, max_tokens, json_mode) -> dict:
    if model.provider == "lovable":
        return await _call_lovable_proxy(model, messages, temperature, max_tokens, json_mode)
    else:
        return await _call_gemini_direct(model, messages, temperature, max_tokens, json_mode)


# ── Public API ────────────────────────────────────────────────────────────────

async def call_llm(
    call_type: str,
    messages: list[dict],
    temperature: float = 0.7,
    max_tokens: int = 1000,
    json_mode: bool = False,
    provider: Optional[Literal["lovable", "gemini"]] = None,
) -> dict:
    """
    Main entry point. Auto-routes by call_type, falls back on failure.

    call_type:
      "agent_reaction" / "classify" / "chat"  → Lovable proxy (fast, short)
      "synthesis" / "simulation" / "deep_analysis" → Gemini direct (long, no timeout)

    provider: force "lovable" or "gemini" — overrides auto-routing.
    """
    chain = CHAINS.get(call_type, CHAINS["chat"])

    if provider:
        filtered = [m for m in chain if m.provider == provider]
        if filtered:
            chain = filtered

    last_error: Exception = RuntimeError("No models in chain")

    for i, model in enumerate(chain):
        label = f"{model.display_name} [{model.provider}] ({i+1}/{len(chain)})"
        try:
            print(f"   🤖 {label}")
            result = await _call_model(model, messages, temperature, max_tokens, json_mode)
            if i > 0:
                print(f"   ✓ Fallback succeeded — {model.display_name}")
            return result
        except Exception as e:
            print(f"   ⚠️  {label} failed: {e}")
            last_error = e
            if i < len(chain) - 1:
                await asyncio.sleep(0.5)

    raise RuntimeError(f"All models failed for '{call_type}': {last_error}")


async def call_llm_json(
    call_type: str,
    messages: list[dict],
    temperature: float = 0.7,
    max_tokens: int = 1000,
    provider: Optional[Literal["lovable", "gemini"]] = None,
) -> dict:
    """Same as call_llm but parses JSON response automatically."""
    result = await call_llm(call_type, messages, temperature, max_tokens, json_mode=True, provider=provider)
    raw = result["content"].strip()
    if raw.startswith("```"):
        raw = raw.split("```", 2)[1]
        if raw.startswith("json"):
            raw = raw[4:]
        raw = raw.rsplit("```", 1)[0].strip()
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError as e:
        raise RuntimeError(f"Invalid JSON from {result['model_used']}: {e}\nRaw: {raw[:300]}")
    return {**result, "parsed": parsed}


async def check_providers() -> dict:
    """Ping both providers — used by /health endpoint."""
    status = {"lovable_proxy": "unknown", "gemini_direct": "unknown"}

    try:
        await _call_lovable_proxy(LOVABLE_FLASH_LITE, [{"role": "user", "content": "Say ok"}], max_tokens=5)
        status["lovable_proxy"] = "ok"
    except Exception as e:
        status["lovable_proxy"] = f"error: {str(e)[:100]}"

    try:
        await _call_gemini_direct(GEMINI_FLASH, [{"role": "user", "content": "Say ok"}], max_tokens=5)
        status["gemini_direct"] = "ok"
    except Exception as e:
        status["gemini_direct"] = f"error: {str(e)[:100]}"

    return status
