"""
AYN Python Backend — Unified Server

Single FastAPI app replacing all Supabase edge functions.
All routers share one DB client, one LLM client, one scheduler.

Endpoints:
  POST /chat                    — AYN chat (replaces ayn-unified)
  GET  /intelligence/*          — World intelligence data
  POST /intelligence/trigger/*  — Manual job triggers
  POST /simulation/run          — Agent Society simulation
  GET  /simulation/conversations — Simulation history
  POST /subscriptions/checkout  — Stripe checkout
  POST /subscriptions/portal    — Stripe portal
  GET  /admin/*                 — Admin API (auth required)
  GET  /health                  — Health check
"""

import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from core.config import PORT, ALLOWED_ORIGINS
from core.llm import check_health

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(name)s  %(levelname)s  %(message)s",
)
log = logging.getLogger("ayn")


@asynccontextmanager
async def lifespan(app: FastAPI):
    log.info("🚀 AYN Backend starting...")

    # Start scheduler (cron jobs)
    from core.scheduler import start_scheduler
    start_scheduler()

    # Warm up DB connection
    try:
        from core.db import get_db
        get_db()
        log.info("✅ Supabase connected")
    except Exception as e:
        log.warning(f"⚠️  Supabase connection issue: {e}")

    # Warm up LLM client
    try:
        from core.llm import get_gemini
        get_gemini()
        log.info("✅ Gemini client ready")
    except Exception as e:
        log.warning(f"⚠️  Gemini client issue: {e}")

    log.info("✅ AYN Backend ready")
    yield
    log.info("🛑 AYN Backend shutting down")


app = FastAPI(
    title="AYN Backend",
    description="Unified Python backend — chat, intelligence, simulation, admin",
    version="1.0.0",
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url=None,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Register routers ──────────────────────────────────────────────────────────
from routers.chat import router as chat_router
from routers.intelligence import router as intel_router
from routers.simulation import router as sim_router
from routers.subscriptions import router as sub_router
from routers.admin import router as admin_router

app.include_router(chat_router)
app.include_router(intel_router)
app.include_router(sim_router)
app.include_router(sub_router)
app.include_router(admin_router)


# ── Core endpoints ────────────────────────────────────────────────────────────
@app.get("/")
async def root():
    return {
        "service": "AYN Backend",
        "version": "1.0.0",
        "status": "running",
        "endpoints": ["/chat", "/intelligence", "/simulation", "/subscriptions", "/admin", "/health"],
    }


@app.get("/health")
async def health():
    providers = await check_health()
    from core.scheduler import get_scheduler
    scheduler = get_scheduler()
    return {
        "status": "healthy",
        "llm": providers,
        "scheduler": {
            "running": scheduler.running if scheduler else False,
            "jobs": len(scheduler.get_jobs()) if scheduler else 0,
        },
    }


# ── Entry point ───────────────────────────────────────────────────────────────
if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=PORT, reload=False)


@app.post("/chat-test")
async def chat_test(request: dict = None):
    """No-auth test endpoint — confirm LLM is working."""
    from core.llm import call_with_fallback
    result = await call_with_fallback(
        "chat",
        [{"role": "user", "content": "Say hello in 5 words"}],
        max_tokens=50,
    )
    return {"content": result.get("content"), "provider": result.get("provider")}
