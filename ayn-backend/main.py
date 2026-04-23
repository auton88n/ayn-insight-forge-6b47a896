"""
AYN Python Backend — Unified Server

Phase 4 runtime hardening:
- explicit process roles (APP_ROLE)
- strict env validation
- controlled migrations
- clear liveness/readiness separation
"""

import asyncio
import logging
import os
import subprocess
from datetime import datetime, timezone
from contextlib import asynccontextmanager
from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi import Request as FastAPIRequest
from fastapi.responses import JSONResponse as FJSONResponse
from fastapi.exceptions import RequestValidationError

from core.config import ALLOWED_ORIGINS, PHASE_LABEL
from core.database import get_pool, close_pool
from core.llm import check_health
from core.migrate import run_migrations
from core.rate_limit import rate_limit_middleware
from core.redis_client import get_redis, close_redis, redis_health
from core.security import require_admin_user
from core.runtime import (
    get_runtime_config,
    should_enable_realtime,
    should_enable_scheduler,
    should_enable_workers,
    should_run_migrations,
    should_serve_http,
    validate_environment,
)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(name)s  %(levelname)s  %(message)s",
)
log = logging.getLogger("ayn")

RUNTIME = get_runtime_config()
STARTUP_TIMESTAMP = datetime.now(timezone.utc).isoformat()


def _get_commit_short() -> str:
    try:
        return subprocess.check_output(
            ["git", "rev-parse", "--short", "HEAD"],
            text=True,
            stderr=subprocess.DEVNULL,
        ).strip()
    except Exception:
        return os.getenv("COMMIT_SHA", "").strip() or "unknown"


COMMIT_SHORT = _get_commit_short()


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.boot = {
        "role": RUNTIME.app_role,
        "env": RUNTIME.app_env,
        "http_enabled": should_serve_http(RUNTIME.app_role),
        "realtime_enabled": should_enable_realtime(RUNTIME.app_role),
        "scheduler_enabled": False,
        "workers_enabled": False,
        "migrations_ran": False,
        "db_ready": False,
        "redis_ready": False,
        "ready": False,
        "startup_error": None,
    }

    log.info(f"🚀 AYN Backend starting... role={RUNTIME.app_role} env={RUNTIME.app_env}")
    log.info(f"Running commit: {COMMIT_SHORT} | phase: {PHASE_LABEL}")

    try:
        if (
            RUNTIME.strict_env_validation
            and RUNTIME.app_env == "production"
            and not os.getenv("REDIS_URL", "").strip()
        ):
            log.error(
                "Redis is required in production; deployment will fail until REDIS_URL is configured."
            )
        validate_environment(RUNTIME)

        pool = await get_pool()
        await pool.execute("SELECT 1")
        app.state.boot["db_ready"] = True
        log.info(f"✅ DB pool warm ({pool.get_size()} connections)")

        redis = await get_redis()
        app.state.boot["redis_ready"] = bool(redis)
        if redis:
            log.info("✅ Redis ready")
        else:
            log.warning("⚠️  Redis not configured; distributed features degraded")

        if should_run_migrations(RUNTIME.app_role, RUNTIME.run_migrations_on_boot):
            await run_migrations(
                pool,
                use_advisory_lock=True,
                fail_if_locked=(RUNTIME.app_role == "migrate"),
            )
            app.state.boot["migrations_ran"] = True
        else:
            log.info("⏭️  Migrations not run on this role (set APP_ROLE=migrate or RUN_MIGRATIONS_ON_BOOT=true)")

        if should_enable_scheduler(RUNTIME.app_role, RUNTIME.enable_scheduler):
            from core.scheduler import start_scheduler

            start_scheduler()
            app.state.boot["scheduler_enabled"] = True
        else:
            log.info("⏭️  Scheduler disabled on this role")

        if should_enable_workers(RUNTIME.app_role, True):
            from services.email_queue import start_email_worker
            await start_email_worker()
            app.state.boot["workers_enabled"] = True

        if should_serve_http(RUNTIME.app_role):
            try:
                from core.llm import get_gemini

                get_gemini()
                log.info("✅ Gemini client ready")
            except Exception as e:
                log.warning(f"⚠️  Gemini client issue: {e}")

        app.state.boot["ready"] = True
        log.info("✅ AYN Backend ready")
        yield
    except Exception as e:
        app.state.boot["startup_error"] = str(e)
        log.error(f"❌ Startup failed: {e}")
        raise
    finally:
        log.info("🛑 AYN Backend shutting down")
        try:
            from core.scheduler import stop_scheduler

            stop_scheduler(wait=False)
        except Exception:
            pass
        try:
            from services.email_queue import stop_email_worker
            await stop_email_worker()
        except Exception:
            pass
        try:
            from routers.realtime import stop_realtime_bus
            await stop_realtime_bus()
        except Exception:
            pass
        await close_pool()
        await close_redis()


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
app.add_middleware(GZipMiddleware, minimum_size=1000)
app.middleware("http")(rate_limit_middleware)


@app.exception_handler(RequestValidationError)
async def validation_error_handler(request: FastAPIRequest, exc: RequestValidationError):
    log.error(f"[VALIDATION] {request.url.path} — {exc.errors()}")
    from core.error_logger import log_error

    asyncio.create_task(
        log_error(
            "spine-validation",
            f"{request.url.path}: {exc.errors()}",
            severity="warning",
            endpoint=str(request.url.path),
        )
    )
    return FJSONResponse({"error": "Validation error", "detail": str(exc.errors())}, status_code=422)


@app.exception_handler(Exception)
async def global_error_handler(request: FastAPIRequest, exc: Exception):
    log.error(f"[ERROR] {request.url.path} — {type(exc).__name__}: {exc}")
    from core.error_logger import log_error

    asyncio.create_task(
        log_error(
            "spine-backend",
            f"{type(exc).__name__}: {exc}",
            error=exc,
            severity="error",
            endpoint=str(request.url.path),
        )
    )
    return FJSONResponse({"error": "Internal server error"}, status_code=500)


# ── Register routers ──────────────────────────────────────────────────────────
if RUNTIME.app_role in {"web", "all"}:
    from routers.auth import router as auth_router
    from routers.generate import router as generate_router
    from routers.engineering import router as engineering_router
    from routers.marketing import router as marketing_router
    from routers.storage import router as storage_router
    from routers.trading import router as trading_router
    from routers.email_router import router as email_router
    from routers.admin_api import router as admin_api_router
    from routers.admin_auth import router as admin_auth_router
    from routers.admin_ops import router as admin_ops_router
    from routers.admin_dev import router as admin_dev_router
    from routers.analyze import router as analyze_router
    from routers.support import router as support_router
    from routers.files import router as files_router
    from routers.payments import router as payments_router
    from routers.analytics import router as analytics_router
    from routers.chats import router as chats_router
    from routers.user import router as user_router
    from routers.chat import router as chat_router
    from routers.intelligence import router as intel_router
    from routers.simulation import router as sim_router
    from routers.subscriptions import router as sub_router
    from routers.applications import router as applications_router
    from routers.system import router as system_router

    app.include_router(auth_router)
    app.include_router(generate_router)
    app.include_router(engineering_router)
    app.include_router(marketing_router)
    app.include_router(storage_router)
    app.include_router(trading_router)
    app.include_router(email_router)
    app.include_router(admin_auth_router)
    app.include_router(admin_api_router)
    app.include_router(admin_ops_router)
    app.include_router(admin_dev_router)
    app.include_router(analyze_router)
    app.include_router(support_router)
    app.include_router(files_router)
    app.include_router(payments_router)
    app.include_router(analytics_router)
    app.include_router(chats_router)
    app.include_router(user_router)
    app.include_router(chat_router)
    app.include_router(intel_router)
    app.include_router(sim_router)
    app.include_router(sub_router)
    app.include_router(applications_router)
    app.include_router(system_router)

if should_serve_http(RUNTIME.app_role):
    from routers.sse import router as sse_router
    app.include_router(sse_router)

if should_enable_realtime(RUNTIME.app_role):
    from routers.realtime import router as realtime_router
    from routers.realtime import start_realtime_bus

    app.include_router(realtime_router)
    # listener is a no-op when Redis is missing
    @app.on_event("startup")
    async def _start_realtime_listener():
        await start_realtime_bus()


@app.get("/")
async def root():
    return {
        "service": "AYN Backend",
        "version": "1.0.0",
        "status": "running",
        "role": RUNTIME.app_role,
    }


@app.get("/health/live")
async def health_live():
    return {"status": "alive", "role": RUNTIME.app_role}


@app.get("/health/ready")
async def health_ready():
    boot = getattr(app.state, "boot", {})
    ok = bool(boot.get("ready") and boot.get("db_ready") and not boot.get("startup_error"))
    return {
        "status": "ready" if ok else "not_ready",
        "role": boot.get("role", RUNTIME.app_role),
        "db_ready": bool(boot.get("db_ready")),
        "redis_ready": bool(boot.get("redis_ready")),
        "migrations_ran": bool(boot.get("migrations_ran")),
        "scheduler_enabled": bool(boot.get("scheduler_enabled")),
        "workers_enabled": bool(boot.get("workers_enabled")),
        "realtime_enabled": bool(boot.get("realtime_enabled")),
        "startup_error": boot.get("startup_error"),
    }


@app.get("/health")
async def health():
    from core.scheduler import get_scheduler

    scheduler = get_scheduler()
    ready = await health_ready()
    ready["redis"] = await redis_health()
    ready["scheduler"] = {
        "running": scheduler.running if scheduler else False,
        "jobs": len(scheduler.get_jobs()) if scheduler else 0,
    }
    return ready


@app.get("/health/llm")
async def health_llm():
    providers = await check_health()
    return {"status": "healthy", "llm": providers}


@app.get("/version")
async def version(_admin: dict = Depends(require_admin_user)):
    return {
        "commit": COMMIT_SHORT,
        "phase": PHASE_LABEL,
        "environment": RUNTIME.app_env,
        "app_role": RUNTIME.app_role,
        "startup_timestamp": STARTUP_TIMESTAMP,
    }
