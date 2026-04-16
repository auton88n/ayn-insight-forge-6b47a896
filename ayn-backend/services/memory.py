"""
services/memory.py — port of supabase/functions/ayn-unified/memoryHandler.ts
"""
import re
import asyncio
from core.db import get_db


async def extract_and_save_memories(user_id: str, response_text: str) -> None:
    """Extract [MEMORY:...] tags from AI response, save to user_memory table.
    
    Table schema: user_id, memory_type (text), memory_key (text), memory_data (jsonb)
    Unique constraint: user_id + memory_type + memory_key
    """
    pattern = re.compile(r'\[MEMORY:([^\]]+)\]')
    memories = [m.group(1).strip() for m in pattern.finditer(response_text)
                if 3 < len(m.group(1).strip()) < 500]
    if not memories:
        return

    db = get_db()
    for memory in memories:
        try:
            # Parse [MEMORY:type/key=value] format
            # e.g. [MEMORY:profile/name=Alex] or [MEMORY:context/industry=tech]
            parts = memory.split('/', 1)
            if len(parts) == 2:
                memory_type = parts[0].strip().lower()
                rest = parts[1]
                eq_idx = rest.find('=')
                if eq_idx > 0:
                    memory_key = rest[:eq_idx].strip().lower()
                    value = rest[eq_idx+1:].strip()
                else:
                    memory_key = rest.strip().lower()
                    value = memory
            else:
                # Fallback: use first word as type, full string as key
                memory_type = "context"
                memory_key = '_'.join(memory.split()[:3]).lower().replace('=', '_')
                value = memory

            await asyncio.to_thread(
                lambda mt=memory_type, mk=memory_key, v=value: db.table("user_memory").upsert(
                    {
                        "user_id": user_id,
                        "memory_type": mt,
                        "memory_key": mk,
                        "memory_data": {"value": v},
                        "updated_at": "now()",
                    },
                    on_conflict="user_id,memory_type,memory_key"
                ).execute()
            )
        except Exception as e:
            print(f"[memory] save failed: {e}")


def strip_memory_tags(text: str) -> str:
    return re.sub(r'\[MEMORY:[^\]]+\]', '', text).strip()
