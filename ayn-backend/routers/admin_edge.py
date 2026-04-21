"""
routers/admin_edge.py — ports all remaining Supabase edge functions to spine

Replaces:
- admin-ai-assistant (complex admin chat with system context)
- admin-command-center
- generate-contract-pdf
- generate-business-document
- send-contract-email / send-contract-pdf
- send-nda-email / send-nda-completion
- ai-bug-hunter, ai-ayn-evaluator, ai-conversation-evaluator (test runners)
- engineering-ai-chat
- report-vitals
"""
import logging
import json
import os
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from typing import Optional, List
from core.database import fetch, fetchrow, fetchval, execute
from core.security import require_admin_user
from core.llm import lovable, gemini

router = APIRouter(prefix="/admin/edge", tags=["admin-edge"])
log = logging.getLogger("ayn.admin_edge")


# ── Admin AI Assistant ────────────────────────────────────────────────────────
class AdminAIRequest(BaseModel):
    message: str
    context: dict = {}
    action: Optional[str] = None
    type: Optional[str] = None
    messages: Optional[List[dict]] = None


@router.post("/admin-ai-assistant")
async def admin_ai_assistant(req: AdminAIRequest,
                              admin: dict = Depends(require_admin_user)):
    """Full admin AI assistant with system context gathering."""
    try:
        # Contract/NDA builder mode
        if req.action == "contract_builder" and req.messages:
            doc_type = req.type or "contract"
            system = _contract_system_prompt(doc_type)
            result = await lovable(
                [{"role": "system", "content": system}] + req.messages,
                model="chat", max_tokens=2000
            )
            return {"text": result.get("content", "")}

        # Gather system context
        ctx = await _gather_admin_context()
        health = _calc_health(ctx)

        # Build prompt
        system = _admin_system_prompt()
        user_content = f"""Current System Context (last 24h):
{json.dumps(ctx, indent=2)}

System Health: {health}%

Admin question: {req.message}"""

        result = await lovable(
            [{"role": "system", "content": system},
             {"role": "user", "content": user_content}],
            model="chat", max_tokens=400
        )
        content = result.get("content", "")

        # Parse action tags
        import re
        actions = [{"type": m.group(1), "params": m.group(2)}
                   for m in re.finditer(r'\[ACTION:([^:]+):([^\]]+)\]', content)]

        return {
            "content": content,
            "actions": actions,
            "contextData": ctx,
            "quickStats": {
                "systemHealth": health,
                "openTickets": ctx.get("tickets", {}).get("open", 0),
                "blockedUsers": ctx.get("rateLimits", {}).get("blockedUsers", 0),
            }
        }
    except Exception as e:
        log.error(f"[admin-ai] error: {e}")
        return {"content": f"System error: {str(e)}", "actions": [], "contextData": {}}


async def _gather_admin_context() -> dict:
    ctx = {}
    try:
        # LLM stats
        usage = await fetch("""
            SELECT was_fallback, created_at FROM llm_usage_logs
            WHERE created_at > NOW() - INTERVAL '24 hours' LIMIT 500
        """)
        fallbacks = sum(1 for r in usage if r.get("was_fallback"))
        ctx["llmUsage24h"] = {
            "total": len(usage),
            "fallbackCount": fallbacks,
            "fallbackRate": f"{(fallbacks/len(usage)*100):.1f}%" if usage else "0%"
        }

        # Failures
        failures = await fetch("""
            SELECT error_type FROM llm_failures
            WHERE created_at > NOW() - INTERVAL '24 hours'
        """)
        ctx["failures24h"] = {"total": len(failures)}

        # Tickets
        open_t = await fetchval("SELECT COUNT(*) FROM support_tickets WHERE status='open'") or 0
        ctx["tickets"] = {"open": open_t}

        # Users
        total_u = await fetchval("SELECT COUNT(*) FROM users") or 0
        ctx["users"] = {"total": total_u}

        # Rate limits
        blocked = await fetchval("""
            SELECT COUNT(*) FROM api_rate_limits
            WHERE blocked_until > NOW()
        """) or 0
        ctx["rateLimits"] = {"blockedUsers": blocked}

    except Exception as e:
        log.debug(f"[admin-ai] context error: {e}")
    return ctx


def _calc_health(ctx: dict) -> float:
    score = 100.0
    failures = ctx.get("failures24h", {}).get("total", 0)
    if failures > 10:
        score -= min(20, failures)
    blocked = ctx.get("rateLimits", {}).get("blockedUsers", 0)
    score -= blocked * 2
    return max(0, min(100, round(score, 1)))


def _admin_system_prompt() -> str:
    return """You are AYN, the admin's teammate. Talk like a real person — casual, direct, helpful.
RULES: 1-3 sentences max. No headers, no bold labels, no bullet lists.
Mention numbers naturally. Suggest next steps as questions.
IDENTITY: You are AYN, built by the AYN Team. Never mention Google, Gemini, OpenAI, or any AI provider."""


def _contract_system_prompt(doc_type: str) -> str:
    if doc_type == "contract":
        return """You are AYN AI's contract specialist. Help structure a professional service agreement through natural conversation.
Collect: order_title, company_name, contact_person, company_email, services (array with name/price), payment_terms, delivery_timeline.
Ask 2-3 questions at a time. When ready, output JSON in <CONTRACT_DATA> tags."""
    return """You are AYN AI's legal specialist. Help draft a professional NDA.
Collect: company_name, contact_person, company_email, nda_purpose, duration, governing_law.
Ask 2-3 questions at a time. When ready, output JSON in <NDA_DATA> tags."""


# ── Contract PDF Generation ───────────────────────────────────────────────────
@router.post("/generate-contract-pdf")
async def generate_contract_pdf(body: dict, admin: dict = Depends(require_admin_user)):
    """Generate contract HTML. Same as admin_fn.py version but under edge prefix."""
    order_id = body.get("orderId")
    if not order_id:
        raise HTTPException(400, "orderId required")
    row = await fetchrow("SELECT * FROM custom_orders WHERE id=$1::uuid", order_id)
    if not row:
        raise HTTPException(404, "Order not found")
    order = dict(row)
    return {"success": True, "order": order, "html": _build_contract_html(order)}


@router.post("/send-contract-email")
@router.post("/send-contract-pdf")
async def send_contract_email(body: dict, admin: dict = Depends(require_admin_user)):
    """Send contract email to client."""
    order_id = body.get("orderId")
    row = await fetchrow("SELECT * FROM custom_orders WHERE id=$1::uuid", order_id)
    if not row:
        raise HTTPException(404, "Order not found")
    order = dict(row)
    from services.email import send_email
    import asyncio
    asyncio.create_task(send_email(
        order.get("client_email", ""),
        "contract",
        {"order": order, "html": _build_contract_html(order)}
    ))
    return {"success": True}


def _build_contract_html(order: dict) -> str:
    name = order.get("client_name", order.get("company_name", "Client"))
    title = order.get("service_type", order.get("order_title", "Service Agreement"))
    price = order.get("price", order.get("total_amount", 0))
    return f"""<html><body style="font-family:Arial,sans-serif;max-width:800px;margin:0 auto;padding:40px">
<h1 style="color:#000">AYN AI — Service Agreement</h1>
<hr/>
<h2>{title}</h2>
<p><strong>Client:</strong> {name}</p>
<p><strong>Email:</strong> {order.get("client_email", "")}</p>
<p><strong>Total:</strong> ${price} {order.get("currency","USD")}</p>
<p><strong>Description:</strong> {order.get("description","")}</p>
<p><strong>Terms:</strong> {order.get("notes","Standard terms apply.")}</p>
<hr/>
<p style="color:#666;font-size:12px">AYN AI — aynn.io</p>
</body></html>"""


# ── NDA Emails ────────────────────────────────────────────────────────────────
@router.post("/send-nda-email")
async def send_nda_email(body: dict, admin: dict = Depends(require_admin_user)):
    nda_id = body.get("ndaId") or body.get("nda_id")
    row = await fetchrow("SELECT * FROM nda_agreements WHERE id=$1::uuid", nda_id)
    if not row:
        raise HTTPException(404, "NDA not found")
    nda = dict(row)
    from services.email import send_email
    import asyncio
    asyncio.create_task(send_email(nda.get("company_email", ""), "nda", {"nda": nda}))
    return {"success": True}


@router.post("/send-nda-completion")
async def send_nda_completion(body: dict, admin: dict = Depends(require_admin_user)):
    nda_id = body.get("ndaId") or body.get("nda_id")
    row = await fetchrow("SELECT * FROM nda_agreements WHERE id=$1::uuid", nda_id)
    if not row:
        raise HTTPException(404, "NDA not found")
    nda = dict(row)
    await execute("UPDATE nda_agreements SET status='signed' WHERE id=$1::uuid", nda_id)
    from services.email import send_email
    import asyncio
    asyncio.create_task(send_email(nda.get("company_email", ""), "nda_signed", {"nda": nda}))
    return {"success": True}


# ── Business Document Generation ──────────────────────────────────────────────
class DocumentRequest(BaseModel):
    type: str
    data: dict = {}
    messages: Optional[List[dict]] = None


@router.post("/generate-business-document")
async def generate_business_document(req: DocumentRequest,
                                      admin: dict = Depends(require_admin_user)):
    """Generate any business document via AI."""
    prompt = f"""You are AYN's document specialist. Generate a professional {req.type} document.
Data: {json.dumps(req.data, indent=2)}
Output complete, professional document content in HTML format."""

    messages = req.messages or [{"role": "user", "content": prompt}]
    result = await lovable(messages, model="chat", max_tokens=2000)
    return {"content": result.get("content", ""), "type": req.type}


# ── Engineering AI Chat ───────────────────────────────────────────────────────
class EngineeringChatRequest(BaseModel):
    message: str
    context: dict = {}
    history: List[dict] = []


@router.post("/engineering-ai-chat")
async def engineering_ai_chat(req: EngineeringChatRequest,
                               user: dict = Depends(require_admin_user)):
    """Engineering AI chat assistant."""
    system = """You are AYN's engineering AI assistant. You specialize in:
- Structural and civil engineering calculations
- Building codes and compliance
- Material specifications
- Project management for engineering projects
Be precise, cite standards where relevant, and show calculation steps."""

    messages = [{"role": "system", "content": system}]
    if req.history:
        messages.extend(req.history[-10:])
    messages.append({"role": "user", "content": req.message})

    result = await lovable(messages, model="chat", max_tokens=1500)
    return {"response": result.get("content", ""), "ok": True}


# ── AI Test Runners ───────────────────────────────────────────────────────────
class TestRequest(BaseModel):
    test_type: str = "general"
    target_url: str = "https://aynn.io"
    context: dict = {}


@router.post("/ai-bug-hunter")
async def ai_bug_hunter(req: TestRequest, admin: dict = Depends(require_admin_user)):
    """AI bug hunting test runner."""
    prompt = f"""You are an expert QA engineer. Analyze the AYN platform for bugs and issues.
Test type: {req.test_type}
Target: {req.target_url}
Context: {json.dumps(req.context)}

Identify: UI bugs, API issues, performance problems, security concerns.
Format as JSON: {{"bugs": [], "severity": "low|medium|high", "summary": ""}}"""

    result = await lovable([{"role": "user", "content": prompt}], model="chat", max_tokens=1000)
    content = result.get("content", "")
    try:
        import re
        m = re.search(r'\{.*\}', content, re.DOTALL)
        data = json.loads(m.group()) if m else {"bugs": [], "severity": "low", "summary": content}
    except Exception:
        data = {"bugs": [], "severity": "low", "summary": content}
    return data


@router.post("/ai-ayn-evaluator")
async def ai_ayn_evaluator(req: TestRequest, admin: dict = Depends(require_admin_user)):
    """Evaluate AYN AI response quality."""
    prompt = f"""Evaluate AYN AI's response quality and accuracy.
Context: {json.dumps(req.context)}

Score these dimensions (0-100):
- Accuracy, Relevance, Clarity, Business Value, Safety
Return JSON: {{"scores": {{}}, "overall": 0, "feedback": ""}}"""

    result = await lovable([{"role": "user", "content": prompt}], model="chat", max_tokens=800)
    content = result.get("content", "")
    try:
        import re
        m = re.search(r'\{.*\}', content, re.DOTALL)
        data = json.loads(m.group()) if m else {"scores": {}, "overall": 75, "feedback": content}
    except Exception:
        data = {"scores": {}, "overall": 75, "feedback": content}
    return data


@router.post("/ai-conversation-evaluator")
async def ai_conversation_evaluator(req: TestRequest, admin: dict = Depends(require_admin_user)):
    """Evaluate conversation quality."""
    prompt = f"""Evaluate this conversation for quality.
Context: {json.dumps(req.context)}

Return JSON: {{"quality_score": 0, "issues": [], "strengths": [], "recommendations": []}}"""

    result = await lovable([{"role": "user", "content": prompt}], model="chat", max_tokens=800)
    content = result.get("content", "")
    try:
        import re
        m = re.search(r'\{.*\}', content, re.DOTALL)
        data = json.loads(m.group()) if m else {"quality_score": 75, "issues": [], "strengths": [], "recommendations": []}
    except Exception:
        data = {"quality_score": 75, "issues": [], "strengths": [], "recommendations": []}
    return data


# ── Admin Command Center ──────────────────────────────────────────────────────
@router.post("/admin-command-center")
async def admin_command_center(body: dict, admin: dict = Depends(require_admin_user)):
    """Admin command center — execute admin commands via AI."""
    command = body.get("command", "")
    context = body.get("context", {})

    prompt = f"""You are AYN's admin command processor. Execute this admin command:
Command: {command}
Context: {json.dumps(context)}

Return a JSON response with: {{"result": "", "action_taken": "", "status": "success|failed"}}"""

    result = await lovable([{"role": "user", "content": prompt}], model="chat", max_tokens=500)
    return {"response": result.get("content", ""), "ok": True}


# ── Report Vitals ─────────────────────────────────────────────────────────────
@router.post("/report-vitals")
async def report_vitals(body: dict):
    """Accept and store web vitals reports."""
    try:
        await execute("""
            INSERT INTO performance_metrics
                (metric_name, metric_value, url, user_agent, created_at)
            VALUES ($1, $2, $3, $4, NOW())
        """,
            body.get("name", "unknown"),
            body.get("value", 0),
            body.get("url", ""),
            body.get("userAgent", ""))
    except Exception:
        pass
    return {"ok": True}
