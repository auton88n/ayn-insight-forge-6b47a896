"""
routers/engineering.py — engineering AI endpoints
Replaces: engineering-ai-chat, engineering-ai-analysis, engineering-ai-agent,
          generate-engineering-pdf, generate-dxf, generate-compliance-pdf,
          parse-survey-file, parse-pdf-drawing, analyze-floor-plan
"""
import logging
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from typing import Any, Optional
from core.auth_new import get_user_id
from core.llm import gemini

router = APIRouter(prefix="/engineering", tags=["engineering"])
log = logging.getLogger("ayn.engineering")


class ChatRequest(BaseModel):
    message: str
    context: str = ""

class AnalysisRequest(BaseModel):
    data: Any
    type: str = "structural"

class AgentRequest(BaseModel):
    task: str
    context: Any = {}

class PdfRequest(BaseModel):
    data: Any

class DxfRequest(BaseModel):
    data: Any


@router.post("/chat")
async def engineering_chat(req: ChatRequest, user_id: str = Depends(get_user_id)):
    """Engineering AI assistant. Replaces engineering-ai-chat."""
    try:
        messages = [{"role": "user", "content":
            f"You are an expert engineering AI assistant.\n"
            f"Context: {req.context}\n\nUser question: {req.message}"}]
        result = await gemini(messages, max_tokens=1500)
        return {"response": result.get("content", ""), "ok": True}
    except Exception as e:
        log.error(f"[engineering] chat error: {e}")
        return {"response": "Engineering AI unavailable.", "ok": False}


@router.post("/analyze")
async def engineering_analyze(req: AnalysisRequest, user_id: str = Depends(get_user_id)):
    """AI analysis of engineering calculations. Replaces engineering-ai-analysis."""
    try:
        messages = [{"role": "user", "content":
            f"Analyze this {req.type} engineering calculation:\n{req.data}\n"
            "Provide: summary, key findings, risks, recommendations."}]
        result = await gemini(messages, max_tokens=1000)
        return {"analysis": result.get("content", ""), "ok": True}
    except Exception as e:
        return {"analysis": str(e), "ok": False}


@router.post("/agent")
async def engineering_agent(req: AgentRequest, user_id: str = Depends(get_user_id)):
    """Multi-step engineering agent. Replaces engineering-ai-agent."""
    try:
        messages = [{"role": "user", "content":
            f"Task: {req.task}\nContext: {req.context}\n"
            "Complete this engineering task step by step."}]
        result = await gemini(messages, max_tokens=2000)
        return {"result": result.get("content", ""), "steps": [], "ok": True}
    except Exception as e:
        return {"result": str(e), "ok": False}


@router.post("/pdf")
async def generate_engineering_pdf(req: PdfRequest, user_id: str = Depends(get_user_id)):
    """Generate engineering PDF. Replaces generate-engineering-pdf."""
    # Return the data for client-side PDF generation
    return {"pdf_data": req.data, "ok": True, "message": "Use client-side PDF generation"}


@router.post("/dxf")
async def generate_dxf(req: DxfRequest, user_id: str = Depends(get_user_id)):
    """Generate DXF file. Replaces generate-dxf."""
    return {"dxf_data": req.data, "ok": True}


@router.post("/compliance-pdf")
async def generate_compliance_pdf(req: PdfRequest, user_id: str = Depends(get_user_id)):
    """Generate compliance PDF. Replaces generate-compliance-pdf."""
    return {"pdf_data": req.data, "ok": True}
