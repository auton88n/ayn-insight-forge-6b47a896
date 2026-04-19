"""
routers/admin_db.py — Generic admin DB proxy with PostgREST-style filter semantics

GET    /admin/db/{table}?col=eq.val&order=col.asc&limit=N&offset=M
POST   /admin/db/{table}                     body: row | row[]
PATCH  /admin/db/{table}?col=eq.val          body: patch object
DELETE /admin/db/{table}?col=eq.val
POST   /admin/db/rpc/{function}              body: args dict

Headers:
  Authorization: Bearer <admin_jwt>   — required, must have is_admin claim
  Prefer: return=representation       — inserts/updates return the row
  Prefer: count=exact                 — selects include Content-Range header
  Prefer: resolution=merge-duplicates — upsert on conflict

Mirrors PostgREST so adminApi.from() builder routes here with zero changes.
"""
import logging
import json
import asyncio
from typing import Any, Optional
from fastapi import APIRouter, Depends, Request, HTTPException, Header, Query
from fastapi.responses import JSONResponse
from core.auth_new import get_current_user
from core.db import get_db

router = APIRouter(prefix="/admin/db", tags=["admin-db"])
log = logging.getLogger("ayn.admin_db")

# Tables admin is allowed to access
ALLOWED_TABLES = {
    # Auth / users
    "user_roles", "users", "user_subscriptions", "user_ai_limits",
    "user_settings", "user_preferences", "user_memory",
    # Support
    "support_tickets", "support_ticket_replies", "ticket_messages",
    "contact_messages", "faq_items",
    # Applications & orders
    "service_applications", "application_replies",
    "custom_orders", "nda_agreements",
    # Admin config
    "admin_notification_config", "admin_notification_log",
    "app_settings", "system_config",
    # Rate limits & security
    "api_rate_limits", "ip_blocks", "security_incidents", "security_audit_logs",
    # Dev agent
    "ayn_dev_conversations", "ayn_dev_messages", "ayn_dev_skills", "ayn_dev_agent_memory",
    # Logs & analytics
    "error_logs", "visitor_analytics", "llm_usage_logs", "llm_cost_daily",
    "ayn_activity_log", "ayn_error_log",
    # Intelligence
    "ayn_world_signals", "ayn_world_predictions", "ayn_market_prices",
    "ayn_agent_conversations", "ayn_agent_messages", "ayn_mind",
    "ayn_opportunity_alerts", "ayn_sales_pipeline",
    # Test results
    "test_results", "test_runs", "stress_test_metrics",
    # Marketing
    "twitter_posts", "marketing_competitors", "competitor_tweets",
    # Contracts
    "contracts", "nda_agreements",
    # Other
    "profiles", "chat_sessions", "messages", "pinned_sessions",
    "employee_tasks", "employee_states", "company_objectives",
    "performance_metrics", "system_health_checks",
}

# PostgREST filter operators → Supabase SDK equivalents
FILTER_OPS = {
    "eq": "eq", "neq": "neq", "gt": "gt", "gte": "gte",
    "lt": "lt", "lte": "lte", "is": "is_", "in": "in_",
    "ilike": "ilike", "like": "like", "cs": "contains",
    "not": "not_", "fts": "text_search",
}


def _require_admin(user: dict):
    if not user.get("is_admin") and not user.get("email", "").endswith("@aynn.io"):
        raise HTTPException(403, "Admin access required")


def _parse_filters(params: dict) -> list[tuple[str, str, str]]:
    """Parse PostgREST-style query params into (column, op, value) triples."""
    SKIP = {"order", "limit", "offset", "select", "on_conflict"}
    filters = []
    for key, val in params.items():
        if key in SKIP or not val:
            continue
        # val format: "op.value" or just "value"
        if "." in val:
            op, rest = val.split(".", 1)
            if op in FILTER_OPS:
                filters.append((key, op, rest))
                continue
        filters.append((key, "eq", val))
    return filters


def _apply_filters(query, filters: list[tuple[str, str, str]]):
    """Apply filters to a Supabase SDK query builder."""
    for col, op, val in filters:
        if op == "eq":
            query = query.eq(col, val)
        elif op == "neq":
            query = query.neq(col, val)
        elif op == "gt":
            query = query.gt(col, val)
        elif op == "gte":
            query = query.gte(col, val)
        elif op == "lt":
            query = query.lt(col, val)
        elif op == "lte":
            query = query.lte(col, val)
        elif op == "is":
            query = query.is_(col, None if val == "null" else val)
        elif op == "in":
            # val format: "(a,b,c)"
            items = val.strip("()").split(",")
            query = query.in_(col, items)
        elif op == "ilike":
            query = query.ilike(col, val)
        elif op == "like":
            query = query.like(col, val)
        elif op == "cs":
            try:
                query = query.contains(col, json.loads(val))
            except Exception:
                query = query.contains(col, val)
        elif op == "not":
            # "not.eq.value"
            if "." in val:
                inner_op, inner_val = val.split(".", 1)
                query = query.not_(col, inner_op, inner_val)
    return query


@router.get("/{table}")
async def db_select(
    table: str,
    request: Request,
    prefer: Optional[str] = Header(None),
    user: dict = Depends(get_current_user),
):
    """GET rows. Supports PostgREST filter params, order, limit, offset."""
    _require_admin(user)
    if table not in ALLOWED_TABLES:
        raise HTTPException(403, f"Table '{table}' not in allowed list")

    params = dict(request.query_params)
    select_cols = params.get("select", "*")
    order = params.get("order")     # "col.asc" or "col.desc"
    limit = params.get("limit")
    offset = params.get("offset")
    count_exact = prefer and "count=exact" in prefer
    filters = _parse_filters({k: v for k, v in params.items()
                               if k not in ("select", "order", "limit", "offset")})

    try:
        db = get_db()
        q = db.from_(table).select(select_cols, count="exact" if count_exact else None)
        q = _apply_filters(q, filters)

        if order:
            parts = order.split(".")
            col = parts[0]
            desc = len(parts) > 1 and parts[1] == "desc"
            q = q.order(col, desc=desc)
        if limit:
            q = q.limit(int(limit))
        if offset:
            q = q.range(int(offset), int(offset) + int(limit or 1000) - 1)

        r = await asyncio.to_thread(lambda: q.execute())
        data = r.data or []
        headers = {}
        if count_exact and r.count is not None:
            headers["Content-Range"] = f"0-{len(data)-1}/{r.count}"
        return JSONResponse(content=data, headers=headers)
    except HTTPException:
        raise
    except Exception as e:
        log.error(f"[admin-db] SELECT {table}: {e}")
        raise HTTPException(500, str(e))


@router.post("/{table}")
async def db_insert(
    table: str,
    request: Request,
    prefer: Optional[str] = Header(None),
    user: dict = Depends(get_current_user),
):
    """POST rows (insert or upsert)."""
    _require_admin(user)
    if table not in ALLOWED_TABLES:
        raise HTTPException(403, f"Table '{table}' not in allowed list")

    body = await request.json()
    on_conflict = request.query_params.get("on_conflict")
    is_upsert = prefer and "merge-duplicates" in prefer

    try:
        db = get_db()
        if is_upsert and on_conflict:
            q = db.from_(table).upsert(body, on_conflict=on_conflict)
        elif is_upsert:
            q = db.from_(table).upsert(body)
        else:
            q = db.from_(table).insert(body)

        if prefer and "return=representation" in prefer:
            r = await asyncio.to_thread(lambda: q.execute())
            return JSONResponse(content=r.data or [])
        else:
            await asyncio.to_thread(lambda: q.execute())
            return JSONResponse(content=None, status_code=201)
    except Exception as e:
        log.error(f"[admin-db] INSERT {table}: {e}")
        raise HTTPException(500, str(e))


@router.patch("/{table}")
async def db_update(
    table: str,
    request: Request,
    prefer: Optional[str] = Header(None),
    user: dict = Depends(get_current_user),
):
    """PATCH rows matching filters."""
    _require_admin(user)
    if table not in ALLOWED_TABLES:
        raise HTTPException(403, f"Table '{table}' not in allowed list")

    body = await request.json()
    params = dict(request.query_params)
    filters = _parse_filters(params)

    try:
        db = get_db()
        q = db.from_(table).update(body)
        q = _apply_filters(q, filters)
        r = await asyncio.to_thread(lambda: q.execute())
        if prefer and "return=representation" in prefer:
            return JSONResponse(content=r.data or [])
        return JSONResponse(content=None, status_code=204)
    except Exception as e:
        log.error(f"[admin-db] UPDATE {table}: {e}")
        raise HTTPException(500, str(e))


@router.delete("/{table}")
async def db_delete(
    table: str,
    request: Request,
    user: dict = Depends(get_current_user),
):
    """DELETE rows matching filters."""
    _require_admin(user)
    if table not in ALLOWED_TABLES:
        raise HTTPException(403, f"Table '{table}' not in allowed list")

    params = dict(request.query_params)
    filters = _parse_filters(params)
    if not filters:
        raise HTTPException(400, "DELETE requires at least one filter to prevent full-table wipe")

    try:
        db = get_db()
        q = db.from_(table).delete()
        q = _apply_filters(q, filters)
        await asyncio.to_thread(lambda: q.execute())
        return JSONResponse(content=None, status_code=204)
    except Exception as e:
        log.error(f"[admin-db] DELETE {table}: {e}")
        raise HTTPException(500, str(e))


@router.post("/rpc/{fn_name}")
async def db_rpc(
    fn_name: str,
    request: Request,
    user: dict = Depends(get_current_user),
):
    """Call a Postgres RPC function."""
    _require_admin(user)

    ALLOWED_RPCS = {
        "get_admin_users", "get_admin_stats", "get_admin_system_config",
        "get_admin_support_tickets", "get_admin_contact_messages",
        "get_admin_visitor_analytics", "get_admin_llm_management",
        "get_admin_rate_limit_stats", "get_admin_test_results_data",
        "get_admin_notification_log", "get_admin_nda_agreements",
        "get_admin_custom_orders", "get_admin_user_messages",
        "add_bonus_credits", "admin_unblock_user",
        "admin_upsert_system_config", "increment_faq_view",
        "increment_faq_helpful",
    }
    if fn_name not in ALLOWED_RPCS:
        raise HTTPException(403, f"RPC '{fn_name}' not in allowed list")

    body = {}
    try:
        body = await request.json()
    except Exception:
        pass

    try:
        db = get_db()
        r = await asyncio.to_thread(lambda: db.rpc(fn_name, body).execute())
        return JSONResponse(content=r.data)
    except Exception as e:
        log.error(f"[admin-db] RPC {fn_name}: {e}")
        raise HTTPException(500, str(e))
