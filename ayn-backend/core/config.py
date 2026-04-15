"""
core/config.py — single source of truth for all env vars
"""
import os
from dotenv import load_dotenv

load_dotenv()

# ── Supabase ──────────────────────────────────────────────────────────────────
SUPABASE_URL         = os.getenv("SUPABASE_URL", "")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY", "")
SUPABASE_ANON_KEY    = os.getenv("SUPABASE_ANON_KEY", "")
SUPABASE_JWT_SECRET  = os.getenv("SUPABASE_JWT_SECRET", "")

# ── LLM ───────────────────────────────────────────────────────────────────────
GEMINI_API_KEY  = os.getenv("GEMINI_API_KEY", "")
GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/openai/"
GEMINI_MODEL    = os.getenv("LLM_MODEL", "gemini-2.0-flash")

# Lovable proxy — calls ayn-ai-proxy edge fn (LOVABLE_API_KEY stays in Supabase)
PROXY_SECRET = os.getenv("AYN_PROXY_SECRET", "ayn-proxy-2024")
PROXY_URL    = f"{SUPABASE_URL}/functions/v1/ayn-ai-proxy" if SUPABASE_URL else ""

# Lovable model IDs (same as llmGateway.ts)
LOVABLE_MODELS = {
    "chat":     "google/gemini-3-flash-preview",
    "deep":     "google/gemini-3-pro-preview",
    "fast":     "google/gemini-2.5-flash-lite",
    "standard": "google/gemini-2.5-flash",
    "image":    "google/gemini-2.5-flash-image",
}

# ── External APIs ─────────────────────────────────────────────────────────────
FIRECRAWL_API_KEY   = os.getenv("FIRECRAWL_API_KEY", "")
STRIPE_SECRET_KEY   = os.getenv("STRIPE_SECRET_KEY", "")
STRIPE_WEBHOOK_SECRET = os.getenv("STRIPE_WEBHOOK_SECRET", "")
ZEP_API_KEY         = os.getenv("ZEP_API_KEY", "")
OPENROUTER_API_KEY  = os.getenv("OPENROUTER_API_KEY", "")

# ── Server ────────────────────────────────────────────────────────────────────
PORT            = int(os.getenv("PORT", 8080))
ALLOWED_ORIGINS = [o.strip() for o in os.getenv("ALLOWED_ORIGINS","https://aynn.io,https://www.aynn.io,https://ayn-insight-forge.lovable.app,http://localhost:5173,http://localhost:8080").split(",") if o.strip()]
