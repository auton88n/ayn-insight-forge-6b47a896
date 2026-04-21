"""Runtime role + boot validation for safe multi-process deployment."""
import os
from dataclasses import dataclass


VALID_APP_ROLES = {"web", "realtime", "scheduler", "migrate", "all"}


@dataclass(frozen=True)
class RuntimeConfig:
    app_env: str
    app_role: str
    enable_scheduler: bool
    run_migrations_on_boot: bool
    strict_env_validation: bool


def _as_bool(name: str, default: str = "false") -> bool:
    return os.getenv(name, default).strip().lower() in {"1", "true", "yes", "on"}


def get_runtime_config() -> RuntimeConfig:
    app_env = os.getenv("APP_ENV", "development").strip().lower()
    app_role = os.getenv("APP_ROLE", "web").strip().lower()
    if app_role not in VALID_APP_ROLES:
        raise RuntimeError(
            f"Invalid APP_ROLE='{app_role}'. Valid roles: {', '.join(sorted(VALID_APP_ROLES))}"
        )
    strict = _as_bool("STRICT_ENV_VALIDATION", "true" if app_env == "production" else "false")
    return RuntimeConfig(
        app_env=app_env,
        app_role=app_role,
        enable_scheduler=_as_bool("ENABLE_SCHEDULER", "false"),
        run_migrations_on_boot=_as_bool("RUN_MIGRATIONS_ON_BOOT", "false"),
        strict_env_validation=strict,
    )


def should_serve_http(role: str) -> bool:
    return role in {"web", "realtime", "all"}


def should_enable_realtime(role: str) -> bool:
    return role in {"realtime", "all"}


def should_enable_scheduler(role: str, flag_enabled: bool) -> bool:
    return role in {"scheduler", "all"} and flag_enabled


def should_run_migrations(role: str, flag_enabled: bool) -> bool:
    return role in {"migrate", "all"} or flag_enabled


def validate_environment(cfg: RuntimeConfig) -> None:
    required = ["DATABASE_URL"]

    # Any role serving authenticated APIs must have JWT secret.
    if cfg.app_role in {"web", "realtime", "all"}:
        required.append("AYN_JWT_SECRET")

    missing = [name for name in required if not os.getenv(name, "").strip()]
    if missing and cfg.strict_env_validation:
        raise RuntimeError(f"Missing required environment variables: {', '.join(missing)}")
