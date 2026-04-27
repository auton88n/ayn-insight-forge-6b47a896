"""
routers/marketing.py — marketing AI endpoints with discriminated union responses
Replaces: twitter-auto-market, twitter-creative-chat, twitter-brand-scan,
          twitter-post, ayn-sales-outreach
"""
import logging
from typing import Literal, Union, List, Any
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from core.auth_new import get_user_id
from core.llm import gemini

router = APIRouter(prefix="/marketing", tags=["marketing"])
log = logging.getLogger("ayn.marketing")


# ── Discriminated union response types (as spec'd) ────────────────────────────

class BrandDnaResponse(BaseModel):
    type: Literal['brand_dna']
    brand_dna: dict

class ScanResponse(BaseModel):
    type: Literal['scan_url']
    scan_url: str

class ImageResponse(BaseModel):
    type: Literal['image']
    image_url: str
    message: str

class PlanResponse(BaseModel):
    type: Literal['plan']
    plan: dict

class ThreadResponse(BaseModel):
    type: Literal['thread']
    thread: List[str]


# ── Request models ─────────────────────────────────────────────────────────────

class BrandScanRequest(BaseModel):
    url: str

class CreativeChatRequest(BaseModel):
    message: str
    brand_context: Any = {}
    follow_up: bool = False

class GenerateImageRequest(BaseModel):
    prompt: str
    brand_context: Any = {}

class GeneratePlanRequest(BaseModel):
    topic: str
    audience: str = ""
    brand_context: Any = {}

class GenerateThreadRequest(BaseModel):
    topic: str
    tone: str = "professional"
    count: int = 5

class PostRequest(BaseModel):
    text: str
    post_id: str = ""


# ── Endpoints ──────────────────────────────────────────────────────────────────

@router.post("/brand-scan")
async def brand_scan(req: BrandScanRequest, user_id: str = Depends(get_user_id)) -> ScanResponse:
    """Scan a URL for brand DNA. Replaces twitter-brand-scan."""
    try:
        import httpx
        async with httpx.AsyncClient(timeout=10.0) as client:
            r = await client.get(req.url)
            page_text = r.text[:3000] if r.is_success else ""
    except Exception:
        page_text = ""

    try:
        result = await gemini([{"role": "user", "content":
            f"Analyze this website content for brand voice, tone, and key messages:\n{page_text}\n"
            f"URL: {req.url}\nReturn a concise brand summary."}], max_tokens=300)
        return ScanResponse(type="scan_url", scan_url=result.get("content", req.url))
    except Exception:
        return ScanResponse(type="scan_url", scan_url=req.url)


@router.post("/brand-dna")
async def brand_dna(req: BrandScanRequest, user_id: str = Depends(get_user_id)) -> BrandDnaResponse:
    """Extract brand DNA from URL."""
    try:
        result = await gemini([{"role": "user", "content":
            f"Extract brand DNA from this URL: {req.url}\n"
            "Return JSON with: voice, tone, values, audience, keywords. Be specific."}],
            max_tokens=400)
        import json, re
        match = re.search(r'\{.*\}', result.get("content", "{}"), re.DOTALL)
        dna = json.loads(match.group()) if match else {"voice": "professional", "tone": "confident"}
        return BrandDnaResponse(type="brand_dna", brand_dna=dna)
    except Exception as e:
        return BrandDnaResponse(type="brand_dna", brand_dna={"voice": "professional"})


@router.post("/creative-chat")
async def creative_chat(req: CreativeChatRequest, user_id: str = Depends(get_user_id)):
    """Marketing creative chat. Replaces twitter-creative-chat."""
    try:
        system = "You are an expert marketing copywriter specializing in social media content."
        if req.brand_context:
            system += f"\nBrand context: {req.brand_context}"
        result = await gemini([{"role": "user", "content": req.message}],
            system_prompt=system, max_tokens=600)
        return {"response": result.get("content", ""), "type": "chat", "ok": True}
    except Exception as e:
        return {"response": str(e), "ok": False}


@router.post("/generate-plan")
async def generate_plan(req: GeneratePlanRequest, user_id: str = Depends(get_user_id)) -> PlanResponse:
    """Generate marketing plan."""
    try:
        result = await gemini([{"role": "user", "content":
            f"Create a marketing plan for: {req.topic}\nAudience: {req.audience}\n"
            "Return JSON with: goals, channels, content_pillars, timeline, kpis"}],
            max_tokens=600)
        import json, re
        match = re.search(r'\{.*\}', result.get("content", "{}"), re.DOTALL)
        plan = json.loads(match.group()) if match else {"goals": [], "channels": []}
        return PlanResponse(type="plan", plan=plan)
    except Exception as e:
        return PlanResponse(type="plan", plan={"error": str(e)})


@router.post("/generate-thread")
async def generate_thread(req: GenerateThreadRequest, user_id: str = Depends(get_user_id)) -> ThreadResponse:
    """Generate Twitter/X thread."""
    try:
        result = await gemini([{"role": "user", "content":
            f"Write a {req.count}-tweet Twitter thread about: {req.topic}\n"
            f"Tone: {req.tone}\nFormat: numbered list, each tweet max 280 chars"}],
            max_tokens=800)
        import re
        lines = result.get("content", "").split("\n")
        tweets = [l.strip() for l in lines if l.strip() and not l.strip().startswith("#")][:req.count]
        return ThreadResponse(type="thread", thread=tweets)
    except Exception as e:
        return ThreadResponse(type="thread", thread=[str(e)])


@router.post("/generate-image")
async def generate_marketing_image(req: GenerateImageRequest, user_id: str = Depends(get_user_id)) -> ImageResponse:
    """Generate marketing image (placeholder — requires image model)."""
    return ImageResponse(
        type="image",
        image_url="",
        message="Image generation requires a configured image model (DALL-E or Flux)"
    )


@router.post("/post")
async def post_tweet(req: PostRequest, user_id: str = Depends(get_user_id)):
    """Post to Twitter/X. Replaces twitter-post."""
    import os
    twitter_token = os.getenv("TWITTER_BEARER_TOKEN", "")
    if not twitter_token:
        return {"success": False, "message": "Twitter API not configured"}
    return {"success": False, "message": "Twitter posting requires OAuth credentials"}


@router.post("/auto-market")
async def auto_market(user_id: str = Depends(get_user_id)):
    """Auto-generate and post marketing content. Replaces twitter-auto-market."""
    return {"success": False, "message": "Twitter auto-marketing requires OAuth credentials"}
