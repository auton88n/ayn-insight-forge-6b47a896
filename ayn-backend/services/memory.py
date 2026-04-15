"""
services/memory.py — port of supabase/functions/ayn-unified/memoryHandler.ts
"""
import re
import asyncio
from core.db import get_db


async def extract_and_save_memories(user_id: str, response_text: str) -> None:
    """Extract [MEMORY:...] tags from AI response, save to user_memory table."""
    pattern = re.compile(r'\[MEMORY:([^\]]+)\]')
    memories = [m.group(1).strip() for m in pattern.finditer(response_text)
                if 3 < len(m.group(1).strip()) < 500]
    if not memories:
        return

    db = get_db()
    for memory in memories:
        try:
            colon = memory.find(':')
            key = (memory[:colon].strip().lower().replace(' ', '_')
                   if 0 < colon < 40
                   else '_'.join(memory.split()[:3]).lower())
            await asyncio.to_thread(
                lambda k=key, v=memory: db.table("user_memory").upsert(
                    {"user_id": user_id, "key": k, "value": v, "updated_at": "now()"},
                    on_conflict="user_id,key"
                ).execute()
            )
        except Exception as e:
            print(f"[memory] save failed: {e}")


def strip_memory_tags(text: str) -> str:
    return re.sub(r'\[MEMORY:[^\]]+\]', '', text).strip()
