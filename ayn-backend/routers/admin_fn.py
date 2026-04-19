"""
routers/admin_fn.py — Ported admin edge functions

POST /admin/fn/admin-pin-alert       → sends security alert email (failed PIN attempts)
POST /admin/fn/ayn-dev-agent         → AI dev agent with GitHub tools (streaming SSE)
POST /admin/fn/generate-contract-pdf → generates contract HTML for PDF rendering
POST /admin/fn/send-contract-email   → sends contract email with PDF
POST /admin/fn/send-contract-pdf     → alias for send-contract-email
POST /admin/fn/admin-command-center  → admin AI with system context
"""
import os
import logging
import asyncio
import json
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Optional, Any
from core.auth_new import get_current_user, get_user_id
from core.db import get_db

router = APIRouter(prefix="/admin/fn", tags=["admin-fn"])
log = logging.getLogger("ayn.admin_fn")


def _require_admin(user: dict):
    if not user.get("is_admin") and not user.get("email", "").endswith("@aynn.io"):
        raise HTTPException(403, "Admin access required")


# ── admin-pin-alert ────────────────────────────────────────────────────────────

@router.post("/admin-pin-alert")
async def admin_pin_alert(request: Request, user: dict = Depends(get_current_user)):
    """Send security alert email when PIN is entered incorrectly 3 times."""
    try:
        import httpx
        resend_key = os.getenv("RESEND_API_KEY", "")
        if not resend_key:
            log.warning("[admin-fn] RESEND_API_KEY not set — skipping pin alert email")
            return {"success": True, "skipped": "email not configured"}

        ip = request.headers.get("x-forwarded-for", "Unknown")
        time_str = datetime.now(timezone.utc).strftime("%a, %d %b %Y %H:%M:%S UTC")

        html = f"""
        <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px">
          <div style="background:#dc2626;color:#fff;padding:12px 16px;border-radius:8px;margin-bottom:24px;font-weight:bold">
            ⚠️ Security Alert
          </div>
          <p style="color:#111;font-size:15px;margin:0 0 12px">
            Someone entered the wrong PIN <strong>3 times</strong> on your admin panel.
          </p>
          <p style="color:#111;font-size:15px;margin:0 0 20px">
            The panel has been <strong>locked for 5 minutes</strong>.
          </p>
          <table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:24px">
            <tr style="background:#f9fafb">
              <td style="padding:8px 12px;color:#6b7280;border:1px solid #e5e7eb">Time</td>
              <td style="padding:8px 12px;color:#111;border:1px solid #e5e7eb">{time_str}</td>
            </tr>
            <tr>
              <td style="padding:8px 12px;color:#6b7280;border:1px solid #e5e7eb">IP Address</td>
              <td style="padding:8px 12px;color:#111;border:1px solid #e5e7eb">{ip}</td>
            </tr>
          </table>
          <p style="color:#6b7280;font-size:13px">If this was you testing, ignore this. If not — change your PIN immediately.</p>
          <div style="margin-top:24px;padding-top:16px;border-top:1px solid #e5e7eb;color:#9ca3af;font-size:12px">
            AYN AI • aynn.io
          </div>
        </div>"""

        async with httpx.AsyncClient() as client:
            r = await client.post(
                "https://api.resend.com/emails",
                headers={"Authorization": f"Bearer {resend_key}", "Content-Type": "application/json"},
                json={
                    "from": "AYN Security <info@aynn.io>",
                    "to": ["ghazi@aynn.io"],
                    "subject": "⚠️ Admin Panel — Failed PIN Attempts",
                    "html": html,
                }
            )
        log.info(f"[admin-fn] Pin alert email sent: {r.status_code}")
        return {"success": True}
    except Exception as e:
        log.error(f"[admin-fn] pin alert error: {e}")
        return {"success": False, "error": str(e)}


# ── generate-contract-pdf ──────────────────────────────────────────────────────

class ContractPdfRequest(BaseModel):
    orderId: str

@router.post("/generate-contract-pdf")
async def generate_contract_pdf(req: ContractPdfRequest, user: dict = Depends(get_current_user)):
    """Generate contract HTML for PDF rendering. Replaces generate-contract-pdf edge function."""
    _require_admin(user)
    try:
        db = get_db()
        r = await asyncio.to_thread(
            lambda: db.from_("custom_orders").select("*").eq("id", req.orderId).maybe_single().execute()
        )
        order = r.data
        if not order:
            raise HTTPException(404, "Order not found")

        services = order.get("services") or []
        html = _generate_contract_html(order, services)
        return {"success": True, "html": html, "order": order}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, str(e))


def _esc(s: str) -> str:
    if not s: return ""
    return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace('"', "&quot;")

def _fmt(text: str) -> str:
    if not text: return ""
    import re
    lines = [
        re.sub(r'#{1,6}\s', '', re.sub(r'\*\*', '', line.replace("|", " · "))).strip()
        for line in text.split("\n")
        if not re.match(r'^\s*[|\-]+\s*$', line)
    ]
    return "<br>".join(l for l in lines if l)

def _generate_contract_html(order: dict, services: list) -> str:
    currency = order.get("currency", "SAR")
    def fmt_cur(amount):
        try:
            return f"{currency} {float(amount):,.2f}"
        except Exception:
            return str(amount)

    today = datetime.now().strftime("%B %d, %Y")
    contract_num = str(order.get("id", ""))[:8].upper()
    is_paid = order.get("status") == "paid"

    rows = ""
    for i, s in enumerate(services):
        bg = "background:#fafafa;" if i % 2 == 1 else ""
        qty = s.get("quantity", 1)
        price = float(s.get("price", 0))
        desc_html = f'<div style="font-size:11px;font-weight:400;color:#888;margin-top:4px">{_fmt(s.get("description",""))}</div>' if s.get("description") else ""
        rows += f"""<tr style="{bg}">
          <td style="padding:12px 16px;font-size:12px;color:#666;border-bottom:1px solid #eee;text-align:center">{i+1}</td>
          <td style="padding:12px 16px;font-size:12px;font-weight:600;color:#1a1a1a;border-bottom:1px solid #eee">{_esc(s.get("name",""))}{desc_html}</td>
          <td style="padding:12px 16px;font-size:12px;color:#555;text-align:center;border-bottom:1px solid #eee">{qty}</td>
          <td style="padding:12px 16px;font-size:12px;color:#555;text-align:right;border-bottom:1px solid #eee">{fmt_cur(price)}</td>
          <td style="padding:12px 16px;font-size:12px;font-weight:600;color:#1a1a1a;text-align:right;border-bottom:1px solid #eee">{fmt_cur(price * qty)}</td>
        </tr>"""

    admin_sig = f'<img src="{order["admin_signature_url"]}" alt="Admin Signature" style="max-height:50px;max-width:200px" />' if order.get("admin_signature_url") else ""
    client_sig = f'<img src="{order["client_signature_url"]}" alt="Client Signature" style="max-height:50px;max-width:200px" />' if order.get("client_signature_url") else ""
    payment_section = ""
    if is_paid:
        payment_section = f'<div style="background:#f0fdf4;border:2px solid #86efac;border-radius:12px;padding:24px;text-align:center;margin:28px 0"><div style="font-size:10px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#16a34a;margin-bottom:4px">Payment Confirmed</div><div style="font-size:28px;font-weight:900;color:#16a34a">{fmt_cur(order.get("total_amount",0))}</div></div>'
    elif order.get("stripe_payment_link"):
        payment_section = f'<div style="background:#000;border-radius:12px;padding:28px;text-align:center;margin:28px 0"><h3 style="color:#fff;font-size:13px;margin-bottom:8px">Complete Your Payment</h3><div style="font-size:28px;font-weight:900;color:#fff;margin-bottom:14px">{fmt_cur(order.get("total_amount",0))}</div><a href="{order["stripe_payment_link"]}" style="display:inline-block;background:#fff;color:#000;padding:12px 36px;border-radius:6px;font-weight:700;text-decoration:none">Pay Now →</a></div>'

    return f"""<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><title>AYN Service Agreement — {_esc(order.get("order_title",""))}</title>
<style>body{{font-family:Georgia,serif;color:#1a1a1a;line-height:1.6;background:#fff}}.page{{max-width:210mm;margin:0 auto;padding:40px 50px}}</style>
</head><body><div class="page">
<div style="display:flex;justify-content:space-between;padding-bottom:24px;border-bottom:3px solid #000;margin-bottom:32px">
  <div><div style="font-size:48px;font-weight:900;letter-spacing:-3px">AYN</div><div style="font-size:10px;letter-spacing:3px;text-transform:uppercase;color:#999;margin-top:6px">Service Agreement</div></div>
  <div style="text-align:right"><div style="font-size:13px;font-weight:700">Contract #{contract_num}</div><div style="font-size:11px;color:#888">Date: {today}</div><div style="font-size:11px;color:#888">Status: {str(order.get("status","")).upper()}</div></div>
</div>
<div style="margin-bottom:28px"><div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:2px;margin-bottom:14px;padding-bottom:8px;border-bottom:1px solid #e0e0e0">Article 1 — Parties</div>
  <div style="display:flex;gap:32px">
    <div style="flex:1;background:#f8f9fa;border-radius:8px;padding:20px"><div style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:#999;margin-bottom:10px">Service Provider</div><div style="font-size:17px;font-weight:700">AYN AI</div><div style="font-size:11px;color:#666">info@aynn.io</div></div>
    <div style="flex:1;background:#f8f9fa;border-radius:8px;padding:20px"><div style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:#999;margin-bottom:10px">Client</div><div style="font-size:17px;font-weight:700">{_esc(order.get("company_name",""))}</div><div style="font-size:11px;color:#666">{_esc(order.get("contact_person",""))}</div><div style="font-size:11px;color:#666">{_esc(order.get("company_email",""))}</div></div>
  </div>
</div>
<div style="margin-bottom:28px"><div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:2px;margin-bottom:14px;padding-bottom:8px;border-bottom:1px solid #e0e0e0">Article 2 — Scope: {_esc(order.get("order_title",""))}</div>
  <div style="font-size:12px;color:#444;line-height:1.8">{_fmt(order.get("order_description",""))}</div>
</div>
<div style="margin-bottom:28px"><div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:2px;margin-bottom:14px;padding-bottom:8px;border-bottom:1px solid #e0e0e0">Article 3 — Services &amp; Pricing</div>
  <table style="width:100%;border-collapse:collapse"><thead><tr><th style="background:#000;color:#fff;padding:10px 16px;font-size:10px;text-transform:uppercase">#</th><th style="background:#000;color:#fff;padding:10px 16px;font-size:10px;text-align:left">Service</th><th style="background:#000;color:#fff;padding:10px 16px;font-size:10px">Qty</th><th style="background:#000;color:#fff;padding:10px 16px;font-size:10px;text-align:right">Unit</th><th style="background:#000;color:#fff;padding:10px 16px;font-size:10px;text-align:right">Total</th></tr></thead>
  <tbody>{rows}</tbody></table>
  <div style="display:flex;justify-content:flex-end;margin-top:16px"><div style="width:280px">
    <div style="display:flex;justify-content:space-between;font-size:12px;padding:6px 0"><span>Subtotal</span><span>{fmt_cur(order.get("subtotal",0))}</span></div>
    <div style="display:flex;justify-content:space-between;font-size:20px;font-weight:900;border-top:2px solid #000;padding-top:12px;margin-top:8px"><span>Total</span><span>{fmt_cur(order.get("total_amount",0))}</span></div>
  </div></div>
</div>
{payment_section}
<div style="display:flex;gap:40px;padding-top:28px;border-top:2px solid #000;margin-top:36px">
  <div style="flex:1"><div style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:#999;margin-bottom:10px">Service Provider (AYN)</div>
    <div style="border-bottom:1px solid #1a1a1a;height:60px;margin-bottom:8px;position:relative">{admin_sig}</div>
    <div style="font-size:11px;color:#666">Authorized Representative</div></div>
  <div style="flex:1"><div style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:#999;margin-bottom:10px">Client ({_esc(order.get("company_name",""))})</div>
    <div style="border-bottom:1px solid #1a1a1a;height:60px;margin-bottom:8px;position:relative">{client_sig}</div>
    <div style="font-size:11px;color:#666">{_esc(order.get("contact_person",""))}</div></div>
</div>
<div style="text-align:center;font-size:9px;color:#bbb;border-top:1px solid #eee;padding-top:12px;margin-top:24px">© {datetime.now().year} AYN AI. All rights reserved.</div>
</div></body></html>"""


# ── send-contract-email / send-contract-pdf ────────────────────────────────────

class ContractEmailRequest(BaseModel):
    orderId: str

@router.post("/send-contract-email")
@router.post("/send-contract-pdf")
async def send_contract_email(req: ContractEmailRequest, user: dict = Depends(get_current_user)):
    """Send contract email to client. Replaces send-contract-email + send-contract-pdf."""
    _require_admin(user)
    try:
        db = get_db()
        r = await asyncio.to_thread(
            lambda: db.from_("custom_orders").select("*").eq("id", req.orderId).maybe_single().execute()
        )
        order = r.data
        if not order:
            raise HTTPException(404, "Order not found")

        services = order.get("services") or []
        html_content = _generate_contract_html(order, services)

        import httpx
        resend_key = os.getenv("RESEND_API_KEY", "")
        if not resend_key:
            return {"success": False, "error": "RESEND_API_KEY not configured"}

        async with httpx.AsyncClient() as client:
            r = await client.post(
                "https://api.resend.com/emails",
                headers={"Authorization": f"Bearer {resend_key}", "Content-Type": "application/json"},
                json={
                    "from": "AYN AI <info@aynn.io>",
                    "to": [order.get("company_email", "")],
                    "subject": f"Your AYN Service Agreement — {order.get('order_title', '')}",
                    "html": html_content,
                }
            )
        return {"success": r.is_success, "status": r.status_code}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, str(e))


# ── ayn-dev-agent ──────────────────────────────────────────────────────────────

class DevAgentRequest(BaseModel):
    message: str
    repos: list = []
    projects: list = []
    github_token: str = ""
    model: str = "claude-sonnet-4-20250514"
    skills: str = ""

@router.post("/ayn-dev-agent")
async def ayn_dev_agent(req: DevAgentRequest, user: dict = Depends(get_current_user)):
    """
    AI dev agent with GitHub tools. Replaces ayn-dev-agent edge function.
    Returns streaming SSE response.
    """
    _require_admin(user)

    if not req.github_token:
        raise HTTPException(400, "github_token required")

    from core.llm import gemini

    async def stream():
        import httpx

        github_headers = {
            "Accept": "application/vnd.github.v3+json",
            "Authorization": f"Bearer {req.github_token}",
            "User-Agent": "AYN-Dev-Agent",
        }

        async def github_call(name: str, args: dict) -> str:
            async with httpx.AsyncClient(timeout=15.0) as client:
                if name == "list_github_files":
                    r = await client.get(
                        f"https://api.github.com/repos/{args['owner']}/{args['repo']}/contents/{args.get('path','')}",
                        headers=github_headers
                    )
                    data = r.json()
                    if not r.is_success: return f"Error: {data}"
                    return json.dumps([{"name": f["name"], "type": f["type"], "path": f["path"]} for f in (data if isinstance(data, list) else [data])])

                elif name == "read_github_file":
                    import base64
                    url = f"https://api.github.com/repos/{args['owner']}/{args['repo']}/contents/{args['path']}"
                    if args.get("branch"): url += f"?ref={args['branch']}"
                    r = await client.get(url, headers=github_headers)
                    data = r.json()
                    if not r.is_success: return f"Error: {data}"
                    return base64.b64decode(data["content"].replace("\n","")).decode("utf-8", errors="replace")

                elif name == "commit_to_github_branch":
                    import base64
                    sha = None
                    get_r = await client.get(
                        f"https://api.github.com/repos/{args['owner']}/{args['repo']}/contents/{args['path']}?ref={args['branch']}",
                        headers=github_headers
                    )
                    if get_r.is_success:
                        sha = get_r.json().get("sha")
                    body = {"message": args["message"], "content": base64.b64encode(args["content"].encode()).decode(), "branch": args["branch"]}
                    if sha: body["sha"] = sha
                    put_r = await client.put(
                        f"https://api.github.com/repos/{args['owner']}/{args['repo']}/contents/{args['path']}",
                        headers={**github_headers, "Content-Type": "application/json"},
                        content=json.dumps(body)
                    )
                    data = put_r.json()
                    if not put_r.is_success: return f"Error: {data}"
                    return f"Success: committed to {args['branch']} → {data.get('content',{}).get('path', args['path'])}"
            return "Unknown tool"

        start_msg = json.dumps({"text": "> 🧠 Analyzing with AYN Dev Agent...\n\n"})
        yield "data: " + start_msg + "\n\ndata: [DONE]\n\n"

        system = f"""You are AYN Dev Agent. You are an autonomous coding assistant who reads code, diagnoses issues, writes fixes, and deploys them by committing directly to GitHub.
Repos: {json.dumps(req.repos)}
Projects: {json.dumps(req.projects)}
Skills: {req.skills}
Use tools to list, read, and commit files. When asked to fix or push, use commit_to_github_branch immediately."""

        messages = [{"role": "user", "content": req.message}]
        tools = [
            {"type":"function","function":{"name":"list_github_files","description":"List files in a GitHub directory","parameters":{"type":"object","properties":{"owner":{"type":"string"},"repo":{"type":"string"},"path":{"type":"string"}},"required":["owner","repo","path"]}}},
            {"type":"function","function":{"name":"read_github_file","description":"Read a file from GitHub","parameters":{"type":"object","properties":{"owner":{"type":"string"},"repo":{"type":"string"},"path":{"type":"string"},"branch":{"type":"string"}},"required":["owner","repo","path"]}}},
            {"type":"function","function":{"name":"commit_to_github_branch","description":"Create or update a file on a GitHub branch","parameters":{"type":"object","properties":{"owner":{"type":"string"},"repo":{"type":"string"},"branch":{"type":"string"},"path":{"type":"string"},"content":{"type":"string"},"message":{"type":"string"}},"required":["owner","repo","branch","path","content","message"]}}},
        ]

        for _ in range(6):
            result = await gemini(messages, system_prompt=system, max_tokens=2000, tools=tools)
            content = result.get("content", "")
            tool_calls = result.get("tool_calls", [])

            if tool_calls:
                for tc in tool_calls:
                    fn_name = tc.get("function", {}).get("name", "")
                    try:
                        args = json.loads(tc.get("function", {}).get("arguments", "{}"))
                    except Exception:
                        args = {}
                    tool_chunk = json.dumps({"text": "*Using tool:* `" + fn_name + "`...\n\n"})
                    yield "data: " + tool_chunk + "\n\ndata: [DONE]\n\n"
                    tool_result = await github_call(fn_name, args)
                    messages.append({"role": "assistant", "content": content, "tool_calls": tool_calls})
                    messages.append({"role": "tool", "tool_call_id": tc.get("id", ""), "name": fn_name, "content": tool_result})
            else:
                final_msg = json.dumps({"text": "---\n\n" + (content or "Done.")})
                yield "data: " + final_msg + "\n\ndata: [DONE]\n\n"
                break

    return StreamingResponse(stream(), media_type="text/event-stream")


# ── admin-command-center ───────────────────────────────────────────────────────

class CommandCenterRequest(BaseModel):
    message: str
    context: Any = None

@router.post("/admin-command-center")
async def admin_command_center(req: CommandCenterRequest, user: dict = Depends(get_current_user)):
    """Admin command center AI. Replaces admin-command-center edge function."""
    _require_admin(user)
    from core.llm import gemini
    try:
        result = await gemini(
            [{"role": "user", "content": req.message}],
            system_prompt="You are the AYN admin command center AI. Help with platform management, analytics, and operations.",
            max_tokens=1000
        )
        return {"response": result.get("content", ""), "ok": True}
    except Exception as e:
        return {"response": str(e), "ok": False}


@router.post("/run-intelligence-migration")
async def run_intelligence_migration(request: Request):
    # Accept either admin JWT or internal service key
    auth = request.headers.get("Authorization", "")
    import os
    internal_key = os.getenv("INTERNAL_SERVICE_KEY", "")
    if internal_key and auth == f"Bearer {internal_key}":
        pass  # internal key auth OK
    else:
        # Fall back to admin JWT check
        from core.auth_new import verify_access_token
        try:
            token = auth.removeprefix("Bearer ").strip()
            payload = verify_access_token(token)
            if not payload.get("is_admin"):
                from fastapi.responses import JSONResponse
                return JSONResponse({"error": "admin required"}, status_code=403)
        except Exception:
            from fastapi.responses import JSONResponse
            return JSONResponse({"error": "unauthorized"}, status_code=401)

    """
    Internal endpoint: pulls intelligence data from Supabase and writes to Railway.
    Called once via: curl -X POST https://spine.aynn.io/admin/fn/run-intelligence-migration
                          -H "Authorization: Bearer <admin_token>"
    """
    import asyncio, ssl as _ssl
    import httpx, os, json as _json
    from core.database import get_pool
    import asyncpg

    SUPABASE_URL = os.getenv("SUPABASE_URL", "")
    SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_KEY", "")
    
    TABLES = [
        "ayn_world_predictions", "ayn_world_signals", "ayn_predictions", "ayn_mind",
        "ayn_agent_conversations", "ayn_agent_messages", "ayn_opportunity_alerts",
        "ayn_prediction_outcomes", "ayn_historical_patterns", "ayn_activity_log",
        "ayn_sales_pipeline", "ayn_kg_snapshots", "ayn_market_prices", "ayn_graph_runs",
    ]

    results = {}
    # Use existing pool (already configured with SSL)
    pool = await get_pool()
    headers = {"apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}"}

    async with httpx.AsyncClient(timeout=60.0) as client:
        for table in TABLES:
            rows = []
            offset = 0
            while True:
                r = await client.get(
                    f"{SUPABASE_URL}/rest/v1/{table}",
                    headers=headers,
                    params={"select": "*", "limit": 1000, "offset": offset}
                )
                if not r.is_success:
                    break
                batch = r.json()
                if not batch:
                    break
                rows.extend(batch)
                if len(batch) < 1000:
                    break
                offset += 1000

            if not rows:
                results[table] = {"read": 0, "written": 0}
                continue

            written = 0
            async with pool.acquire() as conn:
                for row in rows:
                    cols = list(row.keys())
                    vals = [_json.dumps(v) if isinstance(v, (dict, list)) else v for v in row.values()]
                    ph = ", ".join(f"${i+1}" for i in range(len(cols)))
                    cn = ", ".join(f'"{c}"' for c in cols)
                    try:
                        res = await conn.execute(
                            f"INSERT INTO {table} ({cn}) VALUES ({ph}) ON CONFLICT (id) DO NOTHING",
                            *vals
                        )
                        if res != "INSERT 0 0":
                            written += 1
                    except Exception:
                        pass

            results[table] = {"read": len(rows), "written": written}
            log.info(f"[migrate] {table}: {written}/{len(rows)}")

    total_read = sum(r["read"] for r in results.values())
    total_written = sum(r["written"] for r in results.values())
    return {"ok": True, "results": results, "total": {"read": total_read, "written": total_written}}


@router.post("/run-migrations")
async def force_run_migrations(user: dict = Depends(get_current_user)):
    """Force run pending database migrations. Safe to call multiple times."""
    try:
        import asyncio
        from core.database import get_pool
        from core.migrate import run_migrations
        
        pool = await get_pool()
        
        # Remove failed migrations so they retry with the new statement-by-statement runner
        async with pool.acquire() as conn:
            before = await conn.fetchval("SELECT COUNT(*) FROM _migrations")
        
        await run_migrations(pool)
        
        # Check result
        async with pool.acquire() as conn:
            tables = await conn.fetchval(
                "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public'"
            )
            migrations = await conn.fetchval("SELECT COUNT(*) FROM _migrations")
            applied = [r["name"] for r in await conn.fetch("SELECT name FROM _migrations ORDER BY id")]
        
        return {"ok": True, "tables": tables, "migrations_run": migrations, "applied": applied}
    except Exception as e:
        raise HTTPException(500, str(e))
