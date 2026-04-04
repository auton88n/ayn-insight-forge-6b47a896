/**
 * Memory Handler — extracts and saves user memories from AI responses.
 * Extracted from ayn-unified/index.ts (was lines 184-215).
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.56.0";

type SupabaseClient = ReturnType<typeof createClient>;

/**
 * Extract [MEMORY:...] tags from AI response and save to user_memory table.
 * Zero extra API cost — tags are embedded in the AI's natural response.
 */
export async function extractAndSaveMemories(
  supabase: SupabaseClient,
  userId: string,
  responseText: string
): Promise<void> {
  const memoryPattern = /\[MEMORY:([^\]]+)\]/g;
  const memories: string[] = [];
  let match;
  
  while ((match = memoryPattern.exec(responseText)) !== null) {
    const memory = match[1].trim();
    if (memory.length > 3 && memory.length < 500) {
      memories.push(memory);
    }
  }

  if (memories.length === 0) return;

  console.log(`[memory-handler] Extracting ${memories.length} memories for user ${userId.substring(0, 8)}...`);

  for (const memory of memories) {
    try {
      // Extract key from memory (first part before ':' or first 3 words)
      const colonIdx = memory.indexOf(':');
      const key = colonIdx > 0 && colonIdx < 40
        ? memory.substring(0, colonIdx).trim().toLowerCase().replace(/\s+/g, '_')
        : memory.split(' ').slice(0, 3).join('_').toLowerCase();

      await supabase.from('user_memory').upsert(
        {
          user_id: userId,
          key,
          value: memory,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,key' }
      );
    } catch (err) {
      console.error('[memory-handler] Failed to save memory:', err);
    }
  }
}

/**
 * Strip [MEMORY:...] tags from response text before sending to user.
 */
export function stripMemoryTags(text: string): string {
  return text.replace(/\[MEMORY:[^\]]+\]/g, '').trim();
}
