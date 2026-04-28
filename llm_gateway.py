"""
AYN Dual LLM Gateway

Two providers, each used for what they're good at:

  LOVABLE PROXY  (via Supabase ayn-ai-proxy edge function)
  ├─ Routes through: https://ai.gateway.lovable.dev/v1
  ├─ Timeout: ~55s (Supabase edge function limit)
  ├─ Best for: quick agent reactions, chat replies, classifications
  └─ Models: gemini-3-flash-preview, gemini-2.5-flash, gemini-2.5-flash-lite

  GEMINI DIRECT  (via generativelanguage.googleapis.com)
  ├─ Routes through: Google API directly, no Supabase in the loop
  ├─ Timeout: none — runs as long as needed
  ├─ Best for: 7-layer simulations, synthesis, long multi-agent runs
  └─ Models: gemini-2.0-flash, gemini-1.5-pro

The engine picks the right provider automatically per call type.
You can force either with provider="lovable" or provider="gemini".
"""

import os
import json
import asyncio
import time
import httpx
from typing import Optional, Literal
from dataclasses import dataclass

# ── Config from env ───────────────────────────────────────────────────────────
# LOVABLE_API_KEY lives in Supabase secrets only — engine routes through ayn-ai-proxy
SUPABASE_URL    = os.getenv("SUPABASE_URL", "")        # Already in Railway
SUPABASE_ANON   = os.getenv("SUPABASE_ANON_KEY", "")  # Already in Railway
AYN_PROXY_SECRET = os.getenv("AYN_PROXY_SECRET", "ayn-proxy-2024")
GEMINI_API_KEY  = os.getenv("GEMINI_API_KEY", "")    # Already in Railway

# ── Provider URLs ─────────────────────────────────────────────────────────────
# Routes through Supabase ayn-ai-proxy → Lovable gateway (LOVABLE_API_KEY stays in Supabase)
LOVABLE_URL  = f"{os.getenv(chr(39).join(["SUPABASE","URL"]), chr(39))}/functions/v1/ayn-ai-proxy"
GEMINI_URL   = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"

# ── Model definitions ─────────────────────────────────────────────────────────
@dataclass
class LLMModel:
    id: str
    provider: Literal["lovable", "gemini"]
    model_id: str          # model string sent to the API
    display_name: str
    max_tokens: int = 2048


# Short calls — Lovable proxy (fast, goes through Supabase edge fn)
LOVABLE_FLASH       = LLMModel("lovable-gemini-3-flash",    "lovable", "google/gemini-3-flash-preview",  "Gemini 3 Flash",      2048)
LOVABLE_FLASH_25    = LLMModel("lovable-gemini-25-flash",   "lovable", "google/gemini-2.5-flash",        "Gemini 2.5 Flash",    2048)
LOVABLE_FLASH_LITE  = LLMModel("lovable-gemini-25-lite",    "lovable", "google/gemini-2.5-flash-lite",   "Gemini 2.5 Flash Lite", 1024)
LOVABLE_PRO         = LLMModel("lovable-gemini-3-pro",      "lovable", "google/gemini-3-pro-preview",    "Gemini 3 Pro",        4096)

# Long calls — Gemini direct (no timeout, big context)
GEMINI_FLASH        = LLMModel("gemini-20-flash",           "gemini",  "gemini-2.0-flash",              "Gemini 2.0 Flash",    4096)
GEMINI_FLASH_LITE   = LLMModel("gemini-20-flash-lite",      "gemini",  "gemini-2.0-flash-lite",         "Gemini 2.0 Flash Lite", 2048)
GEMINI_PRO          = LLMModel("gemini-15-pro",             "gemini",  "gemini-1.5-pro",                "Gemini 1.5 Pro",      8192)


# ── Routing table ─────────────────────────────────────────────────────────────
# call_type → ordered list of models (first = preferred, rest = fallbacks)
CHAINS: dict[str, list[LLMModel]] = {

    # ── Fast calls go through Lovable proxy ───────────────────────────────────
    # Quick agent reactions — single round, needs to finish fast
    "agent_reaction": [
        LOVABLE_FLASH,
        LOVABLE_FLASH_25,
        LOVABLE_FLASH_LITE,
        GEMINI_FLASH,           # final fallback: Gemini direct
    ],

    # Event classification — tiny call, latency matters
    "classify": [
        LOVABLE_FLASH_LITE,
        LOVABLE_FLASH,
        GEMINI_FLASH_LITE,
    ],

    # Regular chat (AgentSociety /chat endpoint)
    "chat": [
        LOVABLE_FLASH,
        LOVABLE_FLASH_25,
        LOVABLE_FLASH_LITE,
        GEMINI_FLASH,
    ],

    # ── Long calls go through Gemini direct ───────────────────────────────────
    # Full 7-layer simulation synthesis — can take minutes
    "synthesis": [
        GEMINI_FLASH,           # primary: direct Gemini, no Supabase in loop
        GEMINI_PRO,             # upgrade if flash struggles
        LOVABLE_FLASH,          # last resort: proxy (will probably timeout on very long runs)
    ],

    # Multi-layer simulation — each layer fires many agents in parallel
    "simulation": [
        GEMINI_FLASH,
        GEMINI_FLASH_LITE,
        LOVABLE_FLASH,
    ],

    # Long-running analysis — market deep-dives, report generation
    "deep_analysis": [
        GEMINI_PRO,
        GEMINI_FLASH,
        LOVABLE_PRO,
        LOVABLE_FLASH,
    ],
}


# ── Core call functions ───────────────────────────────────────────────────────

async def _call_lovable(
    model: LLMModel,
    messages: list[dict],
    temperature: float = 0.7,
    max_tokens: int = 1000,
    timeout: float = 52.0,           # Stay under Supabase 60s edge fn limit
    json_mode: bool = False,
) -> dict:
    """
    Call via Lovable gateway.
    Goes through: Python backend → Supabase ayn-ai-proxy edge fn → ai.gateway.lovable.dev
    Timeout ~52s — safe margin below Supabase's 60s hard limit.
    """
    if not SUPABASE_URL:
        raise RuntimeError("SUPABASE_URL not set")

    body = {
        "model": model.model_id,
        "messages": messages,
        "max_tokens": max_tokens,
        "temperature": temperature,
    }
    if json_mode:
        body["response_format"] = {"type": "json_object"}

    async with httpx.AsyncClient(timeout=timeout) as client:
        r = await client.post(
            LOVABLE_URL,
            headers={
                "x-proxy-secret": AYN_PROXY_SECRET,
                "Content-Type": "application/json",
            },
            json=body,
        )

    if not r.is_success:
        raise RuntimeError(f"Lovable {model.display_name} → {r.status_code}: {r.text[:200]}")

    data = r.json()
    content = data["choices"][0]["message"]["content"]
    return {"content": content, "model_used": model.display_name, "provider": "lovable"}


async def _call_gemini_direct(
    model: LLMModel,
    messages: list[dict],
    temperature: float = 0.7,
    max_tokens: int = 2000,
    timeout: float = 300.0,          # 5 minutes — no Supabase, so no hard limit
    json_mode: bool = False,
) -> dict:
    """
    Call Gemini directly via Google's REST API.
    No Supabase in the loop → no 60s timeout → safe for long simulations.
    Converts OpenAI-style messages to Gemini's format.
    """
    if not GEMINI_API_KEY:
        raise RuntimeError("GEMINI_API_KEY not set")

    # Convert OpenAI message format → Gemini format
    gemini_contents = []
    system_text = ""

    for msg in messages:
        role = msg["role"]
        content = msg["content"]
        if isinstance(content, list):
            # Flatten multi-part content to text
            content = " ".join(
                p.get("text", "") for p in content if isinstance(p, dict)
            )

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
            "maxOutputTokens": max_tokens,
        },
    }

    if system_text:
        payload["systemInstruction"] = {"parts": [{"text": system_text}]}

    if json_mode:
        payload["generationConfig"]["responseMimeType"] = "application/json"

    url = GEMINI_URL.format(model=model.model_id)
    params = {"key": GEMINI_API_KEY}

    async with httpx.AsyncClient(timeout=timeout) as client:
        r = await client.post(url, params=params, json=payload)

    if not r.is_success:
        raise RuntimeError(f"Gemini direct {model.display_name} → {r.status_code}: {r.text[:300]}")

    data = r.json()
    try:
        content = data["candidates"][0]["content"]["parts"][0]["text"]
    except (KeyError, IndexError) as e:
        raise RuntimeError(f"Unexpected Gemini response shape: {data}") from e

    return {"content": content, "model_used": model.display_name, "provider": "gemini"}


async def _call_model(
    model: LLMModel,
    messages: list[dict],
    temperature: float = 0.7,
    max_tokens: int = 1000,
    json_mode: bool = False,
) -> dict:
    """Route to the right provider based on model.provider."""
    if model.provider == "lovable":
        return await _call_lovable(model, messages, temperature, max_tokens, json_mode=json_mode)
    else:
        return await _call_gemini_direct(model, messages, temperature, min(max_tokens, model.max_tokens), json_mode=json_mode)


# ── Public API ────────────────────────────────────────────────────────────────

async def call_llm(
    call_type: str,
    messages: list[dict],
    temperature: float = 0.7,
    max_tokens: int = 1000,
    json_mode: bool = False,
    provider: Optional[Literal["lovable", "gemini"]] = None,   # force a specific provider
) -> dict:
    """
    Main entry point. Picks the right chain based on call_type,
    tries each model in order, falls back on failure.

    call_type options:
      "agent_reaction"  → fast, Lovable proxy
      "classify"        → tiny/fast, Lovable proxy
      "chat"            → fast, Lovable proxy
      "synthesis"       → long, Gemini direct
      "simulation"      → long, Gemini direct
      "deep_analysis"   → long, Gemini direct + Pro

    Args:
      provider: Force "lovable" or "gemini" — overrides call_type routing.
                Useful when you know exactly what you need.
    """
    chain = CHAINS.get(call_type, CHAINS["chat"])

    # Filter chain to the forced provider if specified
    if provider:
        filtered = [m for m in chain if m.provider == provider]
        if filtered:
            chain = filtered
        # If none match (e.g. provider="gemini" but no gemini models in chain),
        # fall through to the original chain as a safety net.

    last_error: Exception = RuntimeError("No models in chain")

    for i, model in enumerate(chain):
        attempt_label = f"{model.display_name} [{model.provider}] (attempt {i+1}/{len(chain)})"
        try:
            print(f"   🤖 {attempt_label}")
            result = await _call_model(model, messages, temperature, max_tokens, json_mode)
            if i > 0:
                print(f"   ✓ Succeeded after {i} failure(s) — using {model.display_name}")
            return result

        except Exception as e:
            print(f"   ⚠️  {attempt_label} failed: {e}")
            last_error = e
            if i < len(chain) - 1:
                await asyncio.sleep(0.5)   # brief pause before next attempt

    raise RuntimeError(f"All models failed for call_type='{call_type}': {last_error}")


async def call_llm_json(
    call_type: str,
    messages: list[dict],
    temperature: float = 0.7,
    max_tokens: int = 1000,
    provider: Optional[Literal["lovable", "gemini"]] = None,
) -> dict:
    """
    Convenience wrapper — calls call_llm with json_mode=True
    and auto-parses the response into a Python dict.

    Strips markdown fences if the model wraps the JSON anyway.
    """
    result = await call_llm(
        call_type=call_type,
        messages=messages,
        temperature=temperature,
        max_tokens=max_tokens,
        json_mode=True,
        provider=provider,
    )

    raw = result["content"].strip()

    # Strip ```json ... ``` fences if present
    if raw.startswith("```"):
        raw = raw.split("```", 2)[1]
        if raw.startswith("json"):
            raw = raw[4:]
        raw = raw.rsplit("```", 1)[0].strip()

    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError as e:
        raise RuntimeError(f"Model returned invalid JSON ({result['model_used']}): {e}\nRaw: {raw[:300]}")

    return {**result, "parsed": parsed}


# ── Health check ──────────────────────────────────────────────────────────────

async def check_providers() -> dict:
    """
    Ping both providers with a tiny test message.
    Used by /health endpoint to report real provider status.
    """
    status = {"lovable": "unknown", "gemini": "unknown"}

    # Test Lovable
    try:
        await _call_lovable(
            LOVABLE_FLASH,
            [{"role": "user", "content": "Say 'ok' in one word."}],
            max_tokens=5,
            timeout=10.0,
        )
        status["lovable"] = "ok"
    except Exception as e:
        status["lovable"] = f"error: {str(e)[:80]}"

    # Test Gemini direct
    try:
        await _call_gemini_direct(
            GEMINI_FLASH,
            [{"role": "user", "content": "Say 'ok' in one word."}],
            max_tokens=5,
            timeout=10.0,
        )
        status["gemini"] = "ok"
    except Exception as e:
        status["gemini"] = f"error: {str(e)[:80]}"

    return status
