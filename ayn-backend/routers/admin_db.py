"""
routers/admin_db.py — Generic admin DB proxy (Railway Postgres)

GET    /admin/db/{table}?col=eq.val&order=col.asc&limit=N&offset=M
POST   /admin/db/{table}                     body: row | row[]
PATCH  /admin/db/{table}?col=eq.val          body: patch object
DELETE /admin/db/{table}?col=eq.val
POST   /admin/db/rpc/{function}              body: args dict

Mirrors PostgREST semantics so adminApi.from() builder works unchanged.
All queries now run against Railway Postgres via asyncpg.
"""
import logging
import json
from datetime import datetime, date
from typing import Any, Optional
from fastapi import APIRouter, Depends, Request, HTTPException, Header
from fastapi.responses import JSONResponse
from core.security import require_admin_user
from core.database import get_pool

router = APIRouter(prefix="/admin/db", tags=["admin-db"])
log = logging.getLogger("ayn.admin_db")

ALLOWED_TABLES = {
    "user_roles", "users", "user_subscriptions", "user_ai_limits",
    "user_settings", "user_preferences", "user_memory",
    "support_tickets", "support_ticket_replies", "ticket_messages",
    "contact_messages", "faq_items",
    "service_applications", "application_replies",
    "custom_orders", "nda_agreements",
    "admin_notification_config", "admin_notification_log",
    "app_settings", "system_config",
    "api_rate_limits", "ip_blocks", "security_incidents", "security_audit_logs",
    "ayn_dev_conversations", "ayn_dev_messages", "ayn_dev_skills", "ayn_dev_agent_memory",
    "error_logs", "visitor_analytics", "llm_usage_logs", "llm_cost_daily",
    "ayn_activity_log", "ayn_error_log", "llm_failures", "llm_models",
    "ayn_world_signals", "ayn_world_predictions", "ayn_market_prices",
    "ayn_agent_conversations", "ayn_agent_messages", "ayn_mind",
    "ayn_opportunity_alerts", "ayn_sales_pipeline",
    "test_results", "test_runs", "stress_test_metrics",
    "twitter_posts", "marketing_competitors", "competitor_tweets",
    "profiles", "chat_sessions", "messages", "pinned_chats",
    "employee_tasks", "employee_states", "company_objectives",
    "performance_metrics", "system_health_checks", "beta_feedback",
    "credit_gifts", "pinned_sessions", "admin_ai_conversations",
}

ALLOWED_RPCS = {
    "add_bonus_credits", "admin_unblock_user",
    "admin_upsert_system_config", "increment_faq_view", "increment_faq_helpful",
}



def _serialize(val):
    """Convert Python types to JSON-safe."""
    if isinstance(val, (datetime, date)):
        return val.isoformat()
    if isinstance(val, dict):
        return {k: _serialize(v) for k, v in val.items()}
    if isinstance(val, (list, tuple)):
        return [_serialize(v) for v in val]
    return val


def _rows_to_dicts(rows) -> list:
    return [_serialize(dict(r)) for r in rows]


def _parse_filters(params: dict) -> list[tuple]:
    """Parse PostgREST-style query params into (col, op, val) triples."""
    SKIP = {"order", "limit", "offset", "select", "on_conflict"}
    OPS = {"eq", "neq", "gt", "gte", "lt", "lte", "is", "in", "ilike", "like", "not"}
    filters = []
    for key, val in params.items():
        if key in SKIP or not val:
            continue
        if "." in val:
            op, rest = val.split(".", 1)
            if op in OPS:
                filters.append((key, op, rest))
                continue
        filters.append((key, "eq", val))
    return filters


def _build_where(filters: list[tuple], start_idx: int = 1) -> tuple[str, list]:
    """Build WHERE clause and values from filters."""
    if not filters:
        return "", []
    clauses = []
    vals = []
    idx = start_idx
    for col, op, val in filters:
        safe_col = f'"{col}"'
        if op == "eq":
            clauses.append(f"{safe_col} = ${idx}")
            vals.append(None if val == "null" else val)
            idx += 1
        elif op == "neq":
            clauses.append(f"{safe_col} != ${idx}")
            vals.append(val)
            idx += 1
        elif op == "gt":
            clauses.append(f"{safe_col} > ${idx}")
            vals.append(val)
            idx += 1
        elif op == "gte":
            clauses.append(f"{safe_col} >= ${idx}")
            vals.append(val)
            idx += 1
        elif op == "lt":
            clauses.append(f"{safe_col} < ${idx}")
            vals.append(val)
            idx += 1
        elif op == "lte":
            clauses.append(f"{safe_col} <= ${idx}")
            vals.append(val)
            idx += 1
        elif op == "is":
            if val == "null":
                clauses.append(f"{safe_col} IS NULL")
            else:
                clauses.append(f"{safe_col} IS ${idx}")
                vals.append(val)
                idx += 1
        elif op == "in":
            items = val.strip("()").split(",")
            ph = ", ".join(f"${i}" for i in range(idx, idx + len(items)))
            clauses.append(f"{safe_col} IN ({ph})")
            vals.extend(items)
            idx += len(items)
        elif op == "ilike":
            clauses.append(f"{safe_col} ILIKE ${idx}")
            vals.append(val)
            idx += 1
        elif op == "like":
            clauses.append(f"{safe_col} LIKE ${idx}")
            vals.append(val)
            idx += 1
        elif op == "not":
            if "." in val:
                inner_op, inner_val = val.split(".", 1)
                if inner_op == "eq":
                    clauses.append(f"{safe_col} != ${idx}")
                    vals.append(inner_val)
                    idx += 1
        # Unknown ops: skip
    where = ("WHERE " + " AND ".join(clauses)) if clauses else ""
    return where, vals


def _build_select_cols(select_str: str) -> str:
    """Convert PostgREST select string to safe SQL columns."""
    if not select_str or select_str == "*":
        return "*"
    cols = [c.strip() for c in select_str.split(",")]
    safe = []
    for c in cols:
        if c == "*":
            safe.append("*")
        elif c.isidentifier():
            safe.append(f'"{c}"')
        # Skip complex expressions for safety
    return ", ".join(safe) if safe else "*"


@router.get("/{table}")
async def db_select(
    table: str,
    request: Request,
    prefer: Optional[str] = Header(None),
    user: dict = Depends(require_admin_user),
):
    """GET rows — PostgREST-compatible."""
    if table not in ALLOWED_TABLES:
        raise HTTPException(403, f"Table '{table}' not in allowed list")

    params = dict(request.query_params)
    select_cols = _build_select_cols(params.get("select", "*"))
    order = params.get("order")
    limit = int(params.get("limit", 100))
    offset = int(params.get("offset", 0))
    filters = _parse_filters({k: v for k, v in params.items()
                               if k not in ("select", "order", "limit", "offset")})

    where, vals = _build_where(filters)

    order_clause = ""
    if order:
        parts = order.split(".")
        col = parts[0]
        direction = "DESC" if len(parts) > 1 and parts[1] == "desc" else "ASC"
        if col.isidentifier():
            order_clause = f'ORDER BY "{col}" {direction}'

    sql = f'SELECT {select_cols} FROM "{table}" {where} {order_clause} LIMIT {limit} OFFSET {offset}'

    try:
        pool = await get_pool()
        async with pool.acquire() as conn:
            rows = await conn.fetch(sql, *vals)
            data = _rows_to_dicts(rows)

            headers = {}
            if prefer and "count=exact" in prefer:
                count_sql = f'SELECT COUNT(*) FROM "{table}" {where}'
                total = await conn.fetchval(count_sql, *vals)
                headers["Content-Range"] = f"{offset}-{offset+len(data)-1}/{total}"

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
    user: dict = Depends(require_admin_user),
):
    """POST rows — insert or upsert."""
    if table not in ALLOWED_TABLES:
        raise HTTPException(403, f"Table '{table}' not in allowed list")

    body = await request.json()
    on_conflict = request.query_params.get("on_conflict", "id")
    is_upsert = prefer and "merge-duplicates" in prefer
    return_rep = prefer and "return=representation" in prefer

    # Normalize to list
    rows = body if isinstance(body, list) else [body]
    if not rows:
        return JSONResponse(content=[], status_code=201)

    try:
        pool = await get_pool()
        # Get column types for this table
        async with pool.acquire() as conn:
            col_records = await conn.fetch(
                "SELECT column_name, udt_name FROM information_schema.columns "
                "WHERE table_schema='public' AND table_name=$1", table
            )
            type_map = {r["column_name"]: r["udt_name"] for r in col_records}

        inserted = []
        async with pool.acquire() as conn:
            for row in rows:
                filtered = {k: v for k, v in row.items() if k in type_map}
                if not filtered:
                    continue
                cols = list(filtered.keys())
                vals = [json.dumps(v) if isinstance(v, (dict, list)) else v
                        for v in filtered.values()]
                ph = ", ".join(f"${i+1}" for i in range(len(cols)))
                cn = ", ".join(f'"{c}"' for c in cols)

                if is_upsert:
                    conflict_col = on_conflict if on_conflict in type_map else "id"
                    updates = ", ".join(f'"{c}"=EXCLUDED."{c}"' for c in cols if c != conflict_col)
                    sql = f'INSERT INTO "{table}" ({cn}) VALUES ({ph}) ON CONFLICT ("{conflict_col}") DO UPDATE SET {updates} RETURNING *'
                else:
                    sql = f'INSERT INTO "{table}" ({cn}) VALUES ({ph}) ON CONFLICT DO NOTHING RETURNING *'

                try:
                    r = await conn.fetchrow(sql, *vals)
                    if r:
                        inserted.append(_serialize(dict(r)))
                except Exception as row_err:
                    log.debug(f"[admin-db] INSERT {table} row error: {row_err}")

        if return_rep:
            return JSONResponse(content=inserted, status_code=200)
        return JSONResponse(content=None, status_code=201)
    except HTTPException:
        raise
    except Exception as e:
        log.error(f"[admin-db] INSERT {table}: {e}")
        raise HTTPException(500, str(e))


@router.patch("/{table}")
async def db_update(
    table: str,
    request: Request,
    prefer: Optional[str] = Header(None),
    user: dict = Depends(require_admin_user),
):
    """PATCH rows matching filters."""
    if table not in ALLOWED_TABLES:
        raise HTTPException(403, f"Table '{table}' not in allowed list")

    body = await request.json()
    params = dict(request.query_params)
    filters = _parse_filters(params)

    if not body:
        raise HTTPException(400, "Empty update body")

    # Build SET clause
    set_cols = [k for k in body.keys() if k.isidentifier()]
    if not set_cols:
        raise HTTPException(400, "No valid columns to update")

    set_vals = [json.dumps(v) if isinstance(v, (dict, list)) else v
                for k, v in body.items() if k in set_cols]
    set_clause = ", ".join(f'"{c}"=${i+1}' for i, c in enumerate(set_cols))

    where, filter_vals = _build_where(filters, start_idx=len(set_cols) + 1)

    sql = f'UPDATE "{table}" SET {set_clause} {where}'
    if prefer and "return=representation" in prefer:
        sql += " RETURNING *"

    try:
        pool = await get_pool()
        async with pool.acquire() as conn:
            if prefer and "return=representation" in prefer:
                rows = await conn.fetch(sql, *set_vals, *filter_vals)
                return JSONResponse(content=_rows_to_dicts(rows))
            else:
                await conn.execute(sql, *set_vals, *filter_vals)
                return JSONResponse(content=None, status_code=204)
    except HTTPException:
        raise
    except Exception as e:
        log.error(f"[admin-db] UPDATE {table}: {e}")
        raise HTTPException(500, str(e))


@router.delete("/{table}")
async def db_delete(
    table: str,
    request: Request,
    user: dict = Depends(require_admin_user),
):
    """DELETE rows matching filters."""
    if table not in ALLOWED_TABLES:
        raise HTTPException(403, f"Table '{table}' not in allowed list")

    params = dict(request.query_params)
    filters = _parse_filters(params)
    if not filters:
        raise HTTPException(400, "DELETE requires at least one filter")

    where, vals = _build_where(filters)
    sql = f'DELETE FROM "{table}" {where}'

    try:
        pool = await get_pool()
        async with pool.acquire() as conn:
            await conn.execute(sql, *vals)
        return JSONResponse(content=None, status_code=204)
    except HTTPException:
        raise
    except Exception as e:
        log.error(f"[admin-db] DELETE {table}: {e}")
        raise HTTPException(500, str(e))


@router.post("/rpc/{fn_name}")
async def db_rpc(
    fn_name: str,
    request: Request,
    user: dict = Depends(require_admin_user),
):
    """Call a Postgres function."""
    if fn_name not in ALLOWED_RPCS:
        raise HTTPException(403, f"RPC '{fn_name}' not in allowed list")

    body = {}
    try:
        body = await request.json()
    except Exception:
        pass

    try:
        pool = await get_pool()
        async with pool.acquire() as conn:
            # Build function call
            if body:
                args = ", ".join(f"${i+1}" for i in range(len(body)))
                vals = list(body.values())
                row = await conn.fetchrow(f"SELECT * FROM {fn_name}({args})", *vals)
            else:
                row = await conn.fetchrow(f"SELECT * FROM {fn_name}()")
            return JSONResponse(content=_serialize(dict(row)) if row else {})
    except Exception as e:
        log.error(f"[admin-db] RPC {fn_name}: {e}")
        raise HTTPException(500, str(e))
