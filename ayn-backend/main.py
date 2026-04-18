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
from core.database import get_pool, close_pool
from core.migrate import run_migrations
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

    # Run database migrations in background (don't block startup)
    import asyncio
    async def run_migrations_bg():
        try:
            pool = await get_pool()
            await run_migrations(pool)
        except Exception as e:
            log.warning(f"Migration warning: {e}")
    asyncio.create_task(run_migrations_bg())

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

# ── Global exception handler — log everything ────────────────────────────────
from fastapi import Request as FastAPIRequest
from fastapi.responses import JSONResponse as FJSONResponse
from fastapi.exceptions import RequestValidationError

@app.exception_handler(RequestValidationError)
async def validation_error_handler(request: FastAPIRequest, exc: RequestValidationError):
    log.error(f"[VALIDATION] {request.url.path} — {exc.errors()}")
    from core.error_logger import log_error
    asyncio.create_task(log_error(
        "spine-validation", f"{request.url.path}: {exc.errors()}",
        severity="warning", endpoint=str(request.url.path)
    ))
    return FJSONResponse({"error": "Validation error", "detail": str(exc.errors())}, status_code=422)

@app.exception_handler(Exception)
async def global_error_handler(request: FastAPIRequest, exc: Exception):
    log.error(f"[ERROR] {request.url.path} — {type(exc).__name__}: {exc}")
    from core.error_logger import log_error
    import asyncio as _asyncio
    _asyncio.create_task(log_error(
        "spine-backend", f"{type(exc).__name__}: {exc}",
        error=exc, severity="error", endpoint=str(request.url.path)
    ))
    return FJSONResponse({"error": str(exc)}, status_code=500)

# ── Register routers ──────────────────────────────────────────────────────────
from routers.auth import router as auth_router
from routers.generate import router as generate_router
from routers.engineering import router as engineering_router
from routers.marketing import router as marketing_router
from routers.storage import router as storage_router
from routers.trading import router as trading_router
from routers.realtime import router as realtime_router
from routers.email_router import router as email_router
from routers.admin_routes import router as admin_routes_router
from routers.analyze import router as analyze_router
from routers.support import router as support_router
from routers.files import router as files_router
from routers.payments import router as payments_router
from routers.analytics import router as analytics_router
from routers.chats import router as chats_router
from routers.user import router as user_router
from routers.admin_api import router as admin_api_router
from routers.chat import router as chat_router
from routers.intelligence import router as intel_router
from routers.simulation import router as sim_router
from routers.subscriptions import router as sub_router
from routers.admin import router as admin_router

app.include_router(auth_router)
app.include_router(generate_router)
app.include_router(engineering_router)
app.include_router(marketing_router)
app.include_router(storage_router)
app.include_router(trading_router)
app.include_router(realtime_router)
app.include_router(email_router)
app.include_router(admin_routes_router)
app.include_router(analyze_router)
app.include_router(support_router)
app.include_router(files_router)
app.include_router(payments_router)
app.include_router(analytics_router)
app.include_router(chats_router)
app.include_router(user_router)
app.include_router(admin_api_router)
app.include_router(chat_router)
app.include_router(intel_router)
app.include_router(sim_router)
app.include_router(sub_router)
app.include_router(admin_router)


# ── Core endpoints ────────────────────────────────────────────────────────────
@app.on_event("startup")
async def startup_db():
    try:
        await get_pool()
        log.info("[main] Railway PostgreSQL pool ready")
    except Exception as e:
        log.warning(f"[main] Railway PostgreSQL not available: {e}")

@app.on_event("shutdown")  
async def shutdown_db():
    await close_pool()

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
    # Fast health check — no external calls, just confirms app is running
    from core.scheduler import get_scheduler
    scheduler = get_scheduler()
    return {
        "status": "healthy",
        "scheduler": {
            "running": scheduler.running if scheduler else False,
            "jobs": len(scheduler.get_jobs()) if scheduler else 0,
        },
    }

@app.get("/health/llm")
async def health_llm():
    # Separate slow endpoint that actually tests LLM providers
    providers = await check_health()
    return {"status": "healthy", "llm": providers}


# ── Entry point ───────────────────────────────────────────────────────────────
if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=PORT, reload=False)


@app.get("/chat-test")
async def chat_test():
    """No-auth test endpoint — confirm LLM is working."""
    from core.llm import call_with_fallback
    result = await call_with_fallback(
        "chat",
        [{"role": "user", "content": "Say hello in 5 words"}],
        max_tokens=50,
    )
    return {"content": result.get("content"), "provider": result.get("provider")}
