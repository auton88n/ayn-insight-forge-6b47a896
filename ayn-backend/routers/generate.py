"""
routers/generate.py — generation endpoints replacing Supabase edge functions:
- generate-suggestions
- generate-eye-behaviors  
- save-generated-image
"""
import logging
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from core.auth_new import get_user_id
from core.llm import gemini

router = APIRouter(prefix="/generate", tags=["generate"])
log = logging.getLogger("ayn.generate")


class SuggestionsRequest(BaseModel):
    context: str = ""
    mode: str = "chat"
    language: str = "en"


@router.post("/suggestions")
async def generate_suggestions(req: SuggestionsRequest, user_id: str = Depends(get_user_id)):
    """Generate 3 contextual chat suggestions. Replaces generate-suggestions edge function."""
    try:
        prompt = f"""Generate exactly 3 short, engaging question suggestions for an AI business intelligence assistant.
Context: {req.context or 'General business intelligence'}
Mode: {req.mode}
Language: {req.language}

Rules:
- Each suggestion max 8 words
- Business/intelligence focused
- Return ONLY a JSON array of 3 strings, nothing else
- Example: ["What's the market outlook for oil?", "Analyze Saudi Vision 2030 impact", "Show me top investment opportunities"]"""

        result = await gemini([{"role": "user", "content": prompt}], max_tokens=200)
        content = result.get("content", "[]")
        
        import re, json
        match = re.search(r'\[.*\]', content, re.DOTALL)
        suggestions = json.loads(match.group()) if match else [
            "What are the key market trends today?",
            "Analyze current geopolitical risks",
            "Show top business opportunities"
        ]
        return {"suggestions": suggestions[:3]}
    except Exception as e:
        log.warning(f"[generate] suggestions error: {e}")
        return {"suggestions": [
            "What are the key market trends today?",
            "Analyze current geopolitical risks", 
            "Show top business opportunities"
        ]}


@router.post("/eye-behaviors")
async def generate_eye_behaviors(user_id: str = Depends(get_user_id)):
    """Returns AYN orb eye behavior config. Replaces generate-eye-behaviors."""
    import random
    behaviors = ["curious", "thinking", "alert", "calm", "focused", "excited"]
    return {
        "behavior": random.choice(behaviors),
        "intensity": random.uniform(0.5, 1.0),
        "duration": random.randint(2000, 5000)
    }


class SaveImageRequest(BaseModel):
    image_url: str
    prompt: str = ""


@router.post("/save-image")
async def save_image(req: SaveImageRequest, user_id: str = Depends(get_user_id)):
    """Save a generated image reference. Replaces save-generated-image."""
    from core.database import execute
    try:
        await execute("""
            INSERT INTO chart_analyses (user_id, image_url, created_at)
            VALUES ($1::uuid, $2, NOW())
        """, user_id, req.image_url)
    except Exception:
        pass
    return {"ok": True, "url": req.image_url}
