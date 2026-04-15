"""
AYN 7-Layer Simulation Engine

This is the proper implementation that replaces the Supabase edge function.
Each layer builds on the previous one — real cascade, real emergence.

Layer 1: Economic Reality      — what changed mathematically
Layer 2: Institutional Reaction — governments/banks/companies react
Layer 3: Emotional Absorption   — how people FEEL
Layer 4: Social Amplification   — how emotion spreads
Layer 5: Behavioral Change      — what people actually DO
Layer 6: Market Feedback Loop   — behavior changes the economy
Layer 7: Synthesis & Prediction — final score with confidence
"""

import asyncio
import json
from datetime import datetime
from typing import Optional
from supabase import create_client

from agents.world_agent import WorldAgent
from agents.agent_configs import AGENT_CONFIGS
from tools.data_tools import get_financial_data, search_news, classify_event
from llm_gateway import call_llm_json


class SimulationEngine:

    def __init__(self, llm_client, model: str, supabase_url: str, supabase_key: str):
        # llm_client kept in signature for backwards compat but not used —
        # all calls now go through llm_gateway (dual Lovable/Gemini routing)
        self.model = model
        self.supabase = create_client(supabase_url, supabase_key)

        # Initialize ALL agents — they persist in memory across simulations
        # This is the key difference from Supabase: agents are real objects
        print("Initializing world agents...")
        self.agents: dict[str, WorldAgent] = {}
        for agent_id, config in AGENT_CONFIGS.items():
            self.agents[agent_id] = WorldAgent(
                agent_id=agent_id,
                config=config,
                llm_client=llm_client,
                model=model
            )
        print(f"✅ {len(self.agents)} agents initialized with memory")

    async def run_simulation(self, event: str, signal_id: Optional[str] = None) -> dict:
        """
        Run the full 7-layer simulation for any event.
        Returns complete results including all predictions and confidence scores.
        """
        print(f"\n🌍 Starting simulation: {event[:60]}...")
        start_time = datetime.utcnow()

        # ── Classify the event and get dynamic routing ────────────────────────
        classification = await classify_event(event)
        signal_type = classification["signal_type"]
        routing = classification["routing"]
        print(f"📊 Signal type: {signal_type}")

        # ── Get real world data ───────────────────────────────────────────────
        print("📈 Fetching real financial data...")
        financial_data = await get_financial_data(event)

        print("🔍 Searching for real news context...")
        news_context = await search_news(event, max_results=3)

        # ── Create conversation in Supabase ───────────────────────────────────
        conv_result = self.supabase.table("ayn_agent_conversations").insert({
            "topic": event[:80],
            "status": "running",
            "signal_id": signal_id,
            "metadata": {
                "signal_type": signal_type,
                "event": event,
                "cascade": True,
                "engine": "python_v1",
                "financial_snapshot": financial_data
            }
        }).execute()
        conv_id = conv_result.data[0]["id"]
        print(f"📝 Conversation created: {conv_id}")

        # ── Store all messages across all layers ──────────────────────────────
        all_messages = []
        layer_summaries = {}

        # ════════════════════════════════════════════════════════════════════
        # LAYER 1 — Economic Reality
        # What changed mathematically? Real numbers, real prices.
        # ════════════════════════════════════════════════════════════════════
        print("\n⚡ Layer 1: Economic Reality...")
        layer1_agents = routing.get("layer1_economic", [])
        layer1_messages = await self._run_layer(
            layer_num=1,
            layer_name="ECONOMIC REALITY (0-24 hours)",
            agent_ids=layer1_agents,
            event=event,
            financial_data=financial_data,
            news_context=news_context,
            prior_messages=[],
            conv_id=conv_id
        )
        all_messages.extend(layer1_messages)
        layer_summaries["layer1"] = self._summarize_layer(layer1_messages)

        # ════════════════════════════════════════════════════════════════════
        # LAYER 2 — Institutional Reaction
        # Governments, central banks, corporations respond
        # They READ Layer 1 and react to actual numbers
        # ════════════════════════════════════════════════════════════════════
        print("\n🏛️ Layer 2: Institutional Reaction...")
        layer2_agents = routing.get("layer2_institutional", [])
        layer2_messages = await self._run_layer(
            layer_num=2,
            layer_name="INSTITUTIONAL REACTION (1-7 days)",
            agent_ids=layer2_agents,
            event=event,
            financial_data=financial_data,
            news_context=news_context,
            prior_messages=layer1_messages,
            conv_id=conv_id
        )
        all_messages.extend(layer2_messages)
        layer_summaries["layer2"] = self._summarize_layer(layer2_messages)

        # ════════════════════════════════════════════════════════════════════
        # LAYER 3 — Emotional Absorption
        # How do real people FEEL about this?
        # Belief scores shift based on economic reality + institutional response
        # ════════════════════════════════════════════════════════════════════
        print("\n💔 Layer 3: Emotional Absorption...")
        layer3_agents = routing.get("layer3_emotional", [])
        layer3_messages = await self._run_layer(
            layer_num=3,
            layer_name="EMOTIONAL ABSORPTION (days to weeks)",
            agent_ids=layer3_agents,
            event=event,
            financial_data=financial_data,
            news_context=news_context,
            prior_messages=layer1_messages + layer2_messages,
            conv_id=conv_id
        )
        all_messages.extend(layer3_messages)
        layer_summaries["layer3"] = self._summarize_layer(layer3_messages)

        # ════════════════════════════════════════════════════════════════════
        # LAYER 4 — Social Amplification
        # How does emotion spread through communities?
        # ════════════════════════════════════════════════════════════════════
        print("\n📢 Layer 4: Social Amplification...")
        layer4_agents = routing.get("layer4_social", [])
        layer4_messages = await self._run_layer(
            layer_num=4,
            layer_name="SOCIAL AMPLIFICATION (weeks)",
            agent_ids=layer4_agents,
            event=event,
            financial_data=financial_data,
            news_context=news_context,
            prior_messages=layer2_messages + layer3_messages,
            conv_id=conv_id
        )
        all_messages.extend(layer4_messages)
        layer_summaries["layer4"] = self._summarize_layer(layer4_messages)

        # ════════════════════════════════════════════════════════════════════
        # LAYER 5 — Behavioral Change
        # What do people actually DO differently?
        # ════════════════════════════════════════════════════════════════════
        print("\n🚶 Layer 5: Behavioral Change...")
        layer5_agents = routing.get("layer5_behavioral", [])
        layer5_messages = await self._run_layer(
            layer_num=5,
            layer_name="BEHAVIORAL CHANGE (weeks to months)",
            agent_ids=layer5_agents,
            event=event,
            financial_data=financial_data,
            news_context=news_context,
            prior_messages=layer3_messages + layer4_messages,
            conv_id=conv_id
        )
        all_messages.extend(layer5_messages)
        layer_summaries["layer5"] = self._summarize_layer(layer5_messages)

        # ════════════════════════════════════════════════════════════════════
        # LAYER 6 — Market Feedback Loop
        # How does changed behavior change the economy?
        # ════════════════════════════════════════════════════════════════════
        print("\n🔄 Layer 6: Market Feedback Loop...")
        # Re-run key economic agents with behavioral context
        layer6_agents = routing.get("layer1_economic", [])[:3]  # Top 3 economic agents
        layer6_messages = await self._run_layer(
            layer_num=6,
            layer_name="MARKET FEEDBACK LOOP (months)",
            agent_ids=layer6_agents,
            event=event,
            financial_data=financial_data,
            news_context=news_context,
            prior_messages=layer4_messages + layer5_messages,
            conv_id=conv_id
        )
        all_messages.extend(layer6_messages)
        layer_summaries["layer6"] = self._summarize_layer(layer6_messages)

        # ════════════════════════════════════════════════════════════════════
        # LAYER 7 — Synthesis & Prediction
        # Final prediction with confidence score
        # ════════════════════════════════════════════════════════════════════
        print("\n🎯 Layer 7: Synthesis & Prediction...")
        synthesis = await self._synthesize(
            event=event,
            signal_type=signal_type,
            financial_data=financial_data,
            all_messages=all_messages,
            layer_summaries=layer_summaries
        )

        # ── Calculate overall belief shift ────────────────────────────────────
        avg_belief = sum(m.get("belief_score", 0) for m in all_messages) / max(len(all_messages), 1)
        all_predictions = [m.get("numerical_prediction", "") for m in all_messages
                          if m.get("numerical_prediction") and "Unable" not in m.get("numerical_prediction", "")]

        # ── Save final synthesis to Supabase ─────────────────────────────────
        duration_seconds = (datetime.utcnow() - start_time).seconds
        self.supabase.table("ayn_agent_conversations").update({
            "status": "complete",
            "metadata": {
                "signal_type": signal_type,
                "event": event,
                "cascade": True,
                "engine": "python_v1",
                "financial_snapshot": financial_data,
                "summary": synthesis,
                "avg_belief_score": round(avg_belief, 2),
                "total_predictions": len(all_predictions),
                "duration_seconds": duration_seconds,
                "layer_summaries": layer_summaries
            }
        }).eq("id", conv_id).execute()

        print(f"\n✅ Simulation complete in {duration_seconds}s")
        print(f"   Messages: {len(all_messages)}")
        print(f"   Predictions: {len(all_predictions)}")
        print(f"   Avg belief shift: {avg_belief:.1f}")

        return {
            "conversation_id": conv_id,
            "event": event,
            "signal_type": signal_type,
            "messages": all_messages,
            "synthesis": synthesis,
            "predictions": all_predictions,
            "avg_belief_score": avg_belief,
            "financial_snapshot": financial_data,
            "duration_seconds": duration_seconds
        }

    async def _run_layer(
        self,
        layer_num: int,
        layer_name: str,
        agent_ids: list[str],
        event: str,
        financial_data: dict,
        news_context: str,
        prior_messages: list[dict],
        conv_id: str
    ) -> list[dict]:
        """Run a single layer — all agents react in parallel."""

        valid_agents = [aid for aid in agent_ids if aid in self.agents]
        if not valid_agents:
            return []

        # Run agents in parallel (real concurrency, not fake)
        tasks = [
            self.agents[agent_id].react(
                event=event,
                economic_data=financial_data,
                prior_round_messages=prior_messages,
                round_number=layer_num,
                real_world_data=news_context
            )
            for agent_id in valid_agents
        ]

        results = await asyncio.gather(*tasks, return_exceptions=True)

        # Filter out errors and save to Supabase
        messages = []
        seq = len(prior_messages)

        for result in results:
            if isinstance(result, Exception):
                print(f"   ⚠️ Agent error: {result}")
                continue

            result["conversation_id"] = conv_id
            result["sequence_order"] = seq
            result["layer"] = layer_num
            result["layer_name"] = layer_name
            seq += 1
            messages.append(result)

        # Save batch to Supabase
        if messages:
            db_messages = []
            for m in messages:
                db_messages.append({
                    "conversation_id": conv_id,
                    "agent_id": m["agent_id"],
                    "agent_name": m["agent_name"],
                    "agent_role": m["agent_category"],
                    "agent_flag": m["agent_flag"],
                    "message": m["public_statement"],
                    "internal_thought": m["inner_thought"],
                    "emotion": m["emotion"],
                    "emotion_intensity": m["emotion_intensity"],
                    "market_action": {
                        "action": m["concrete_action"],
                        "prediction": m["numerical_prediction"],
                        "belief_score": m["belief_score"]
                    },
                    "responding_to_agent": m.get("responding_to"),
                    "sequence_order": m["sequence_order"],
                    "cascade_round": layer_num,
                    "message_type": layer_name
                })

            try:
                self.supabase.table("ayn_agent_messages").insert(db_messages).execute()
            except Exception as e:
                print(f"   ⚠️ DB save error: {e}")

        print(f"   ✓ Layer {layer_num}: {len(messages)} agent responses")
        return messages

    def _summarize_layer(self, messages: list[dict]) -> dict:
        """Create a compact summary of a layer's outputs."""
        if not messages:
            return {}

        avg_belief = sum(m.get("belief_score", 0) for m in messages) / len(messages)
        emotions = [m.get("emotion", "neutral") for m in messages]
        predictions = [m.get("numerical_prediction", "") for m in messages
                      if m.get("numerical_prediction") and "Unable" not in m.get("numerical_prediction", "")]

        return {
            "agent_count": len(messages),
            "avg_belief_score": round(avg_belief, 2),
            "dominant_emotion": max(set(emotions), key=emotions.count),
            "predictions": predictions[:5]  # Top 5 predictions from this layer
        }

    async def _synthesize(
        self,
        event: str,
        signal_type: str,
        financial_data: dict,
        all_messages: list[dict],
        layer_summaries: dict
    ) -> dict:
        """
        Layer 7: Synthesize all layers into a final prediction.
        This is the ReportAgent equivalent from MiroFish.
        """

        # Build context from all layers
        predictions_by_layer = {}
        for layer_key, summary in layer_summaries.items():
            if summary.get("predictions"):
                predictions_by_layer[layer_key] = summary["predictions"]

        all_predictions_text = "\n".join([
            f"Layer {k}: {', '.join(v)}"
            for k, v in predictions_by_layer.items()
            if v
        ])

        # Key statements from each layer
        key_statements = []
        for msg in all_messages:
            if msg.get("belief_score_change", 0) != 0:
                key_statements.append(
                    f"{msg['agent_name']} (belief: {msg.get('belief_score', 0):+.0f}): {msg.get('public_statement', '')[:100]}"
                )

        synthesis_prompt = f"""You are synthesizing a 7-layer world simulation.

EVENT: "{event}"
SIGNAL TYPE: {signal_type}

CURRENT FINANCIAL DATA: {json.dumps(financial_data, indent=2)[:600]}

PREDICTIONS FROM ALL LAYERS:
{all_predictions_text[:800]}

KEY BELIEF SHIFTS:
{chr(10).join(key_statements[:8])}

LAYER SUMMARIES:
{json.dumps(layer_summaries, indent=2)[:600]}

Based on ALL of this, provide a final synthesis in JSON:
{{
  "headline_outcome": "One sentence: what is most likely to happen",
  "probability": "Low/Medium/High/Very High",
  "confidence_score": <0-100, based on how aligned the predictions are>,
  "top_predictions": [
    "Specific prediction 1 with number and timeframe",
    "Specific prediction 2 with number and timeframe",
    "Specific prediction 3 with number and timeframe"
  ],
  "winners": ["who benefits most"],
  "losers": ["who suffers most"],
  "key_risks": ["what could make this prediction wrong"],
  "watch_indicators": ["what specific metrics to monitor"],
  "human_impact": "How this affects real people's daily lives",
  "time_horizon": "when the main effects will be visible",
  "comparison_to_history": "similar historical event and what happened"
}}"""

        try:
            # Layer 7: long synthesis — Gemini direct (no Supabase timeout)
            result = await call_llm_json(
                call_type="synthesis",
                messages=[{"role": "user", "content": synthesis_prompt}],
                temperature=0.7,
                max_tokens=1200,
            )
            return result["parsed"]
        except Exception as e:
            return {
                "headline_outcome": "Simulation complete — see individual predictions",
                "probability": "Medium",
                "confidence_score": 50,
                "top_predictions": [],
                "winners": [],
                "losers": [],
                "key_risks": [],
                "watch_indicators": [],
                "human_impact": "See agent messages for details",
                "error": str(e)
            }
