"""
core/llm.py — single LLM client shared across the entire app

Two routes:
  Gemini direct  — long calls, no timeout (simulation, synthesis)
  Lovable proxy  — short calls via ayn-ai-proxy (chat, intent, classify)
                   LOVABLE_API_KEY stays in Supabase, never in Railway

Same model chains as ayn-unified llmGateway.ts — nothing changed.
"""
import json
import asyncio
import time
import httpx
from openai import AsyncOpenAI
from core.config import (
    GEMINI_API_KEY, GEMINI_BASE_URL, GEMINI_MODEL,
    SUPABASE_URL, PROXY_URL, PROXY_SECRET, SUPABASE_SERVICE_KEY,
    LOVABLE_MODELS,
)

# ── Gemini direct client (shared singleton) ───────────────────────────────────
_gemini_client: AsyncOpenAI | None = None

def get_gemini() -> AsyncOpenAI:
    global _gemini_client
    if _gemini_client is None:
        _gemini_client = AsyncOpenAI(
            api_key=GEMINI_API_KEY,
            base_url=GEMINI_BASE_URL,
        )
    return _gemini_client


# ── Lovable proxy call ────────────────────────────────────────────────────────
async def lovable(
    messages: list[dict],
    model: str = "chat",
    max_tokens: int = 2000,
    temperature: float = 0.7,
    tools: list | None = None,
    timeout: float = 55.0,
) -> dict:
    """
    Call Lovable gateway via ayn-ai-proxy edge fn.
    LOVABLE_API_KEY stays in Supabase secrets.
    Timeout: 55s (safe below Supabase 60s ceiling).
    """
    if not PROXY_URL or not SUPABASE_URL or not PROXY_SECRET:
        raise RuntimeError("Proxy not configured — set SUPABASE_URL and AYN_PROXY_SECRET")

    model_id = LOVABLE_MODELS.get(model, LOVABLE_MODELS["chat"])
    payload: dict = {
        "model": model_id,
        "messages": messages,
        "max_tokens": max_tokens,
        "temperature": temperature,
        "stream": False,
    }
    if tools:
        payload["tools"] = tools
        payload["tool_choice"] = "auto"

    async with httpx.AsyncClient(timeout=timeout) as client:
        r = await client.post(
            PROXY_URL,
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
                "x-proxy-secret": PROXY_SECRET,
                "x-source": "ayn-backend",
            },
            json=payload,
        )

    if not r.is_success:
        raise RuntimeError(f"Lovable proxy {model_id} → HTTP {r.status_code}: {r.text[:200]}")

    data = r.json()
    if "error" in data:
        raise RuntimeError(f"Lovable proxy error: {data['error']}")

    choice = data["choices"][0]["message"]
    return {
        "content": choice.get("content") or "",
        "tool_calls": choice.get("tool_calls"),
        "model": model_id,
    }


async def lovable_json(
    messages: list[dict],
    model: str = "chat",
    max_tokens: int = 2000,
) -> dict:
    """Lovable call that auto-parses JSON response."""
    result = await lovable(messages, model, max_tokens, temperature=0.3)
    raw = (result["content"] or "").strip()
    if "```" in raw:
        for part in raw.split("```"):
            part = part.strip()
            if part.startswith("json"):
                part = part[4:].strip()
            if part.startswith("{") or part.startswith("["):
                raw = part
                break
    return json.loads(raw)


# ── Gemini direct call ────────────────────────────────────────────────────────
async def gemini(
    messages: list[dict],
    model: str | None = None,
    max_tokens: int = 4000,
    temperature: float = 0.7,
    tools: list | None = None,
) -> dict:
    """
    Call Gemini directly. No timeout limit — safe for long simulation calls.
    """
    llm = get_gemini()
    kwargs: dict = dict(
        model=model or GEMINI_MODEL,
        messages=messages,
        max_tokens=max_tokens,
        temperature=temperature,
    )
    if tools:
        kwargs["tools"] = tools
        kwargs["tool_choice"] = "auto"

    response = await llm.chat.completions.create(**kwargs)
    choice = response.choices[0]
    return {
        "content": choice.message.content or "",
        "tool_calls": getattr(choice.message, "tool_calls", None),
        "model": response.model,
        "finish_reason": choice.finish_reason,
    }


async def gemini_json(
    messages: list[dict],
    model: str | None = None,
    max_tokens: int = 2000,
) -> dict:
    """Gemini call that auto-parses JSON response."""
    result = await gemini(messages, model, max_tokens, temperature=0.3)
    raw = (result["content"] or "").strip()
    if "```" in raw:
        for part in raw.split("```"):
            part = part.strip()
            if part.startswith("json"):
                part = part[4:].strip()
            if part.startswith("{") or part.startswith("["):
                raw = part
                break
    return json.loads(raw)


# ── Unified call_with_fallback (mirrors llmGateway.ts) ───────────────────────
# Chains: Lovable first (fast, cheap), Gemini direct as fallback (no timeout)
FALLBACK_CHAINS: dict[str, list[tuple[str, str]]] = {
    # (provider, model_key)
    "chat":                 [("lovable", "chat"),     ("gemini", "gemini-2.0-flash")],
    "deep":                 [("lovable", "deep"),     ("gemini", "gemini-2.0-flash")],
    "engineering":          [("lovable", "chat"),     ("lovable", "deep"),     ("gemini", "gemini-2.0-flash")],
    "files":                [("lovable", "chat"),     ("gemini", "gemini-2.0-flash")],
    "search":               [("lovable", "chat"),     ("gemini", "gemini-2.0-flash")],
    "trading-coach":        [("lovable", "chat"),     ("lovable", "standard"), ("gemini", "gemini-2.0-flash")],
    "business-intelligence":[("lovable", "chat"),     ("lovable", "deep"),     ("gemini", "gemini-2.0-flash")],
    "document":             [("lovable", "deep"),     ("lovable", "chat"),     ("gemini", "gemini-2.0-flash")],
    # Simulation — Gemini direct first (long calls, no timeout risk)
    "simulation":           [("gemini", "gemini-2.0-flash"), ("lovable", "chat")],
    "synthesis":            [("gemini", "gemini-2.0-flash"), ("lovable", "deep")],
    "agent_reaction":       [("lovable", "fast"),     ("lovable", "chat"),     ("gemini", "gemini-2.0-flash")],
    "classify":             [("lovable", "fast"),     ("gemini", "gemini-2.0-flash")],
    "intelligence":         [("gemini", "gemini-2.0-flash"), ("lovable", "chat")],
}


async def call_with_fallback(
    intent: str,
    messages: list[dict],
    max_tokens: int = 2000,
    temperature: float = 0.7,
    tools: list | None = None,
    db=None,
    user_id: str | None = None,
) -> dict:
    """
    Try each provider in the chain, fall back on failure.
    Logs usage + failures to Supabase (fire and forget).
    """
    chain = FALLBACK_CHAINS.get(intent, FALLBACK_CHAINS["chat"])
    last_err: Exception = RuntimeError("empty chain")

    for i, (provider, model_key) in enumerate(chain):
        try:
            start = time.time()
            if provider == "lovable":
                result = await lovable(messages, model_key, max_tokens, temperature, tools)
            else:
                result = await gemini(messages, model_key, max_tokens, temperature, tools)

            elapsed = int((time.time() - start) * 1000)
            result["was_fallback"] = i > 0
            result["provider"] = provider

            # Log usage — fire and forget
            if db:
                try:
                    db.table("llm_usage_logs").insert({
                        "user_id": None if user_id in (None, "internal") else user_id,
                        "model_name": model_key,
                        "response_time_ms": elapsed,
                        "was_fallback": i > 0,
                        "intent_type": intent or "chat",
                    }).execute()
                except Exception:
                    pass

            return result

        except Exception as e:
            print(f"   ⚠️  [{provider}/{model_key}] failed: {e}")
            last_err = e

            if db:
                try:
                    db.table("llm_failures").insert({
                        "user_id": None if user_id in (None, "internal") else user_id,
                        "error_type": "error",
                        "error_message": f"[{provider}/{model_key}] {str(e)[:480]}",
                    }).execute()
                except Exception:
                    pass

            if i < len(chain) - 1:
                await asyncio.sleep(0.3)

    raise RuntimeError(f"All providers failed for '{intent}': {last_err}")


async def check_health() -> dict:
    """Ping both providers — used by /health endpoint."""
    status = {"lovable_proxy": "unknown", "gemini_direct": "unknown"}
    try:
        await lovable([{"role": "user", "content": "ok"}], "fast", max_tokens=5, timeout=10.0)
        status["lovable_proxy"] = "ok"
    except Exception as e:
        status["lovable_proxy"] = f"error: {str(e)[:80]}"
    try:
        await gemini([{"role": "user", "content": "ok"}], max_tokens=5)
        status["gemini_direct"] = "ok"
    except Exception as e:
        status["gemini_direct"] = f"error: {str(e)[:80]}"
    return status
