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

import asyncio
import os
import logging
from core.database import get_pool, close_pool
from core.migrate import run_migrations
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from core.config import PORT, ALLOWED_ORIGINS
from core.llm import check_health
from core.rate_limit import rate_limit_middleware

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(name)s  %(levelname)s  %(message)s",
)
log = logging.getLogger("ayn")


@asynccontextmanager
async def lifespan(app: FastAPI):
    log.info("🚀 AYN Backend starting...")

    # Start scheduler (cron jobs) only on designated worker
    if os.getenv("ENABLE_SCHEDULER", "false").lower() in ("1", "true", "yes"):
        from core.scheduler import start_scheduler
        start_scheduler()
    else:
        log.info("⏭️  Scheduler disabled on this instance (ENABLE_SCHEDULER=false)")

    # Pre-warm DB pool — creates min_size=3 connections immediately
    # This eliminates the "cold first request" latency spike
    try:
        pool = await get_pool()
        await pool.execute("SELECT 1")  # force actual connections
        log.info(f"✅ DB pool warm ({pool.get_size()} connections)")
    except Exception as e:
        log.warning(f"⚠️  DB warmup issue: {e}")

    # Warm up LLM client
    try:
        from core.llm import get_gemini
        get_gemini()
        log.info("✅ Gemini client ready")
    except Exception as e:
        log.warning(f"⚠️  Gemini client issue: {e}")

    # Run database migrations before serving traffic
    try:
        pool = await get_pool()
        await run_migrations(pool)
    except Exception as e:
        log.error(f"Migration failed: {e}")
        raise

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
    allow_origin_regex=r"https://([a-z0-9-]+\.)*(lovableproject\.com|lovable\.app|lovable\.dev|aynn\.io)",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Compress responses > 1KB — speeds up intelligence data transfers significantly
app.add_middleware(GZipMiddleware, minimum_size=1000)
app.middleware("http")(rate_limit_middleware)

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
    return FJSONResponse({"error": "Internal server error"}, status_code=500)

# ── Register routers ──────────────────────────────────────────────────────────
from routers.auth import router as auth_router
from routers.generate import router as generate_router
from routers.engineering import router as engineering_router
from routers.marketing import router as marketing_router
from routers.storage import router as storage_router
from routers.trading import router as trading_router
from routers.realtime import router as realtime_router
from routers.sse import router as sse_router
from routers.email_router import router as email_router
from routers.admin_auth import router as admin_auth_router
from routers.admin_db import router as admin_db_router
from routers.admin_fn import router as admin_fn_router
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
from routers.applications import router as applications_router
from routers.admin_edge import router as admin_edge_router
from routers.system import router as system_router

app.include_router(auth_router)
app.include_router(generate_router)
app.include_router(engineering_router)
app.include_router(marketing_router)
app.include_router(storage_router)
app.include_router(trading_router)
app.include_router(realtime_router)
app.include_router(sse_router)
app.include_router(email_router)
app.include_router(admin_auth_router)
app.include_router(admin_db_router)
app.include_router(admin_fn_router)
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
app.include_router(applications_router)
app.include_router(admin_edge_router)
app.include_router(system_router)


# ── Core endpoints ────────────────────────────────────────────────────────────
@app.on_event("startup")
async def startup_db():
    # Non-blocking — don't delay /health responding
    async def _connect():
        try:
            await get_pool()
            log.info("[main] Railway PostgreSQL pool ready")
        except Exception as e:
            log.warning(f"[main] Railway PostgreSQL not available: {e}")
    asyncio.create_task(_connect())

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
    from core.scheduler import get_scheduler
    import os
    scheduler = get_scheduler()
    
    # Check DB connection
    db_status = "not_configured"
    db_tables = 0
    migrations_run = 0
    
    if os.getenv("DATABASE_URL"):
        try:
            from core.database import get_pool
            pool = await get_pool()
            async with pool.acquire() as conn:
                db_tables = await conn.fetchval(
                    "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public'"
                )
                try:
                    migrations_run = await conn.fetchval("SELECT COUNT(*) FROM _migrations")
                except Exception:
                    migrations_run = 0
            db_status = "connected"
        except Exception as e:
            db_status = f"error: {str(e)[:50]}"
    
    return {
        "status": "healthy",
        "db": db_status,
        "db_tables": db_tables,
        "migrations_run": migrations_run,
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


if os.getenv("APP_ENV", "development").lower() != "production":
    @app.get("/chat-test")
    async def chat_test():
        """No-auth test endpoint — only exposed outside production."""
        from core.llm import call_with_fallback
        result = await call_with_fallback(
            "chat",
            [{"role": "user", "content": "Say hello in 5 words"}],
            max_tokens=50,
        )
        return {"content": result.get("content"), "provider": result.get("provider")}
