"""
memory_handler.py — exact port of supabase/functions/ayn-unified/memoryHandler.ts
"""
import re
import asyncio


async def extract_and_save_memories(supabase, user_id: str, response_text: str) -> None:
    """Extract [MEMORY:...] tags from AI response and save to user_memory table."""
    pattern = re.compile(r'\[MEMORY:([^\]]+)\]')
    memories = [m.group(1).strip() for m in pattern.finditer(response_text)
                if 3 < len(m.group(1).strip()) < 500]

    if not memories:
        return

    print(f"[memory] Extracting {len(memories)} memories for {user_id[:8]}...")

    for memory in memories:
        try:
            colon_idx = memory.find(':')
            if 0 < colon_idx < 40:
                key = memory[:colon_idx].strip().lower().replace(' ', '_')
            else:
                key = '_'.join(memory.split()[:3]).lower()

            supabase.table('user_memory').upsert(
                {
                    'user_id': user_id,
                    'key': key,
                    'value': memory,
                    'updated_at': 'now()',
                },
                on_conflict='user_id,key'
            ).execute()
        except Exception as e:
            print(f"[memory] Failed to save memory: {e}")


def strip_memory_tags(text: str) -> str:
    return re.sub(r'\[MEMORY:[^\]]+\]', '', text).strip()
