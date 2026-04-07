

# Fix Agent Society — Create Missing Edge Function

## Problem
The Agent Society feature calls `ayn-agent-society` edge function, but **this function does not exist**. Every button (Activate, New Conversation, God's Eye, Chat) silently fails because the endpoint returns 404.

## Solution
Create the `ayn-agent-society` edge function that uses the Lovable AI Gateway to power the agent simulation. The function handles 5 modes:

1. **get_conversations** — Returns list of past simulation conversations from DB
2. **get_messages** — Returns messages for a specific conversation
3. **generate_conversation** — Creates a new multi-agent conversation using LLM
4. **inject_event** — God's Eye: injects a world event and generates agent reactions
5. **chat** — Direct chat with a specific agent

## Technical Plan

### Step 1: Create database tables
Create two tables via migration:
- `agent_conversations` — id, title, category, created_at, status
- `agent_messages` — id, conversation_id (FK), agent_id, agent_name, agent_category, message, emotion, emotion_intensity, responding_to_agent, created_at

### Step 2: Create the edge function `supabase/functions/ayn-agent-society/index.ts`
- Route by `mode` parameter
- Use the Lovable AI Gateway (`google/gemini-3-flash-preview`) for generation
- For `generate_conversation`: pick 4-6 agents from the 80+ hardcoded agent roster, generate a multi-turn discussion about a current world topic, parse structured output (agent_id, message, emotion, intensity), save to DB
- For `inject_event`: create a new conversation where agents react to the injected event
- For `chat`: send user message + agent persona to LLM, return response
- For `get_*` modes: simple DB reads
- Handle 429/402 rate limit errors properly

### Step 3: Define agent roster in the function
Use the same agent IDs from the frontend (usa, china, fed, sp500, jpmorgan, etc.) with personas matching their real-world roles. Group by category (government, central_bank, stock_market, bank, company, social_class).

### Step 4: Register in config.toml
Add the function entry with `verify_jwt = false` (public endpoint matching current frontend calls without auth headers).

### Files to Create/Edit
- `supabase/migrations/XXXX_create_agent_society_tables.sql` — new
- `supabase/functions/ayn-agent-society/index.ts` — new
- `supabase/config.toml` — add function entry

No frontend changes needed — the component already calls the correct endpoint and handles the response format.

