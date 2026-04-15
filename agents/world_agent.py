"""
AYN World Agent — Each agent is a real Python object with:
- Persistent memory (ChromaDB)
- Real tools (web search, financial data)  
- Belief state that changes based on what others say
- Specific numerical predictions
"""

import json
import uuid
from datetime import datetime
from typing import Optional
import chromadb
from chromadb.utils import embedding_functions


# ─── Global ChromaDB client (shared across all agents) ───────────────────────
_chroma_client = None
_embedding_fn = None

def get_chroma():
    global _chroma_client, _embedding_fn
    if _chroma_client is None:
        _chroma_client = chromadb.Client()  # In-memory for now, use PersistentClient for disk
        _embedding_fn = embedding_functions.DefaultEmbeddingFunction()
    return _chroma_client, _embedding_fn


# ─── Agent Definition ─────────────────────────────────────────────────────────
class WorldAgent:
    """
    A single world actor with real memory, real tools, and belief states.
    
    Unlike the hardcoded Supabase version:
    - This agent REMEMBERS past events via ChromaDB semantic search
    - This agent has a BELIEF SCORE (-100 to +100) that changes each round
    - This agent makes SPECIFIC NUMERICAL PREDICTIONS
    - This agent READS what other agents said and responds to them
    """

    def __init__(self, agent_id: str, config: dict, llm_client=None, model: str = "gemini"):
        self.agent_id = agent_id
        self.name = config["name"]
        self.flag = config.get("flag", "🌐")
        self.category = config["category"]
        self.voice = config.get("voice", [])
        self.inner = config.get("inner", [])
        self.fears = config.get("fears", "")
        self.bias = config.get("bias", "")
        self.exposed_to = config.get("exposed_to", [])
        self.typical_actions = config.get("actions", [])

        # Belief state: -100 = very negative, 0 = neutral, +100 = very positive
        self.belief_score: float = 0.0
        self.belief_history: list = []

        # model string kept for compat but routing handled by llm_gateway
        self.model = model

        # Memory — each agent has their own ChromaDB collection
        chroma, embed_fn = get_chroma()
        collection_name = f"agent_{agent_id.replace('-', '_')}"
        try:
            self.memory = chroma.get_or_create_collection(
                name=collection_name,
                embedding_function=embed_fn
            )
        except Exception:
            self.memory = chroma.create_collection(
                name=f"{collection_name}_{uuid.uuid4().hex[:6]}",
                embedding_function=embed_fn
            )

    def _build_system_prompt(self, context_memories: list[str]) -> str:
        """Build the system prompt with deep persona + memories."""
        memory_block = ""
        if context_memories:
            memory_block = f"""
YOUR MEMORIES FROM PAST EVENTS (use these to inform your reaction):
{chr(10).join(f'- {m}' for m in context_memories)}
"""

        return f"""You ARE {self.flag} {self.name}.

YOUR VOICE (speak exactly like this):
{chr(10).join(f'- "{v}"' for v in self.voice[:3])}

YOUR REAL INNER THOUGHTS (what you actually think but don't say publicly):
{chr(10).join(f'- "{i}"' for i in self.inner[:2])}

YOUR DEEP FEARS: {self.fears}
YOUR BEHAVIORAL BIAS: {self.bias}
YOUR EXPOSURES: {', '.join(self.exposed_to[:4])}
{memory_block}

RULES — NEVER BREAK THESE:
1. Speak in YOUR specific voice — not generic
2. Make AT LEAST ONE specific numerical prediction (price, %, timeline, quantity)
3. Reference your memories when relevant
4. Show your real self-interest, not public relations speak
5. 3-5 sentences maximum
6. Your belief score changes based on the situation — be honest about it"""

    async def get_relevant_memories(self, event: str, n: int = 3) -> list[str]:
        """Semantic search of agent's past experiences."""
        try:
            if self.memory.count() == 0:
                return []
            results = self.memory.query(
                query_texts=[event],
                n_results=min(n, self.memory.count())
            )
            return results["documents"][0] if results["documents"] else []
        except Exception:
            return []

    async def save_memory(self, event: str, reaction: str, prediction: str):
        """Save this event to agent's persistent memory."""
        try:
            memory_text = f"Event: {event} | My reaction: {reaction[:100]} | Predicted: {prediction[:100]}"
            self.memory.add(
                documents=[memory_text],
                ids=[f"{self.agent_id}_{datetime.utcnow().timestamp()}"],
                metadatas=[{
                    "agent_id": self.agent_id,
                    "event_summary": event[:100],
                    "timestamp": datetime.utcnow().isoformat()
                }]
            )
        except Exception as e:
            pass  # Memory save failure is non-fatal

    async def react(
        self,
        event: str,
        economic_data: dict,
        prior_round_messages: list[dict],
        round_number: int,
        real_world_data: str = ""
    ) -> dict:
        """
        Core method — agent reacts to an event with full context.
        
        Returns a structured response with:
        - public_statement: what they say publicly
        - inner_thought: their real thinking
        - concrete_action: what they do RIGHT NOW
        - numerical_prediction: specific number + timeframe
        - belief_score_change: how this changed their belief (-20 to +20)
        - emotion: their emotional state
        """

        # Get relevant memories
        memories = await self.get_relevant_memories(event)

        # Build context from prior round messages
        prior_context = ""
        if prior_round_messages:
            prior_context = "\n\nWHAT OTHER AGENTS SAID IN THE PRIOR ROUND:\n"
            for msg in prior_round_messages[-6:]:  # Last 6 messages
                prior_context += f"- {msg.get('agent_name', '?')}: \"{msg.get('public_statement', '')[:100]}\"\n"

        # Build economic context
        econ_context = ""
        if economic_data:
            econ_context = f"\n\nREAL ECONOMIC DATA:\n{json.dumps(economic_data, indent=2)[:500]}"

        # Real world search data
        data_context = f"\n\nREAL WORLD CONTEXT:\n{real_world_data[:300]}" if real_world_data else ""

        system_prompt = self._build_system_prompt(memories)

        user_prompt = f"""EVENT: "{event}"
SIMULATION ROUND: {round_number}/7{prior_context}{econ_context}{data_context}

Respond as {self.name} with this EXACT JSON format:
{{
  "public_statement": "What you say publicly — 2-3 sentences in your specific voice",
  "inner_thought": "Your REAL cynical private thought — what you actually think",
  "concrete_action": "ONE specific action you take RIGHT NOW",
  "numerical_prediction": "A SPECIFIC number + timeframe — e.g. 'Oil hits $115/barrel within 14 days' or 'Bitcoin drops to $14,000 within 30 days'",
  "belief_score_change": <number from -20 to +20, negative=more pessimistic, positive=more optimistic>,
  "emotion": "one of: confident/worried/panicked/angry/excited/bitter/suspicious/hopeful/neutral",
  "emotion_intensity": <50-100>,
  "responding_to": "agent_name you are directly responding to, or null"
}}

IMPORTANT: numerical_prediction MUST have a specific number and timeframe. NOT 'prices will rise' but 'gold hits $3,400 within 21 days'."""

        try:
            from llm_gateway import call_llm_json
            # Agent reactions = fast call → Lovable proxy (stays under Supabase timeout)
            llm_result = await call_llm_json(
                call_type="agent_reaction",
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt}
                ],
                temperature=0.8,
                max_tokens=500,
            )
            result = llm_result["parsed"]

            # Update belief score
            score_change = float(result.get("belief_score_change", 0))
            self.belief_score = max(-100, min(100, self.belief_score + score_change))
            self.belief_history.append({
                "round": round_number,
                "score": self.belief_score,
                "event": event[:50]
            })

            # Save to memory
            await self.save_memory(
                event,
                result.get("public_statement", ""),
                result.get("numerical_prediction", "")
            )

            return {
                "agent_id": self.agent_id,
                "agent_name": self.name,
                "agent_flag": self.flag,
                "agent_category": self.category,
                "round": round_number,
                "public_statement": result.get("public_statement", ""),
                "inner_thought": result.get("inner_thought", ""),
                "concrete_action": result.get("concrete_action", ""),
                "numerical_prediction": result.get("numerical_prediction", ""),
                "belief_score": self.belief_score,
                "belief_score_change": score_change,
                "emotion": result.get("emotion", "neutral"),
                "emotion_intensity": result.get("emotion_intensity", 50),
                "responding_to": result.get("responding_to"),
                "memories_used": memories,
                "timestamp": datetime.utcnow().isoformat()
            }

        except Exception as e:
            # Fallback if JSON parsing fails
            return {
                "agent_id": self.agent_id,
                "agent_name": self.name,
                "agent_flag": self.flag,
                "agent_category": self.category,
                "round": round_number,
                "public_statement": f"{self.name} is monitoring this situation closely.",
                "inner_thought": "Something went wrong with my analysis.",
                "concrete_action": "Waiting for more information",
                "numerical_prediction": "Unable to generate prediction",
                "belief_score": self.belief_score,
                "belief_score_change": 0,
                "emotion": "neutral",
                "emotion_intensity": 30,
                "responding_to": None,
                "memories_used": [],
                "error": str(e),
                "timestamp": datetime.utcnow().isoformat()
            }
