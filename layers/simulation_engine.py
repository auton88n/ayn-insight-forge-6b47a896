"""
AYN Simulation Engine v3.0
7-layer world simulation with smart agent sampling.

Layers:
  1 — Economic Reality (markets, central banks)
  2 — Institutional Response (governments, regulators)
  3 — Corporate & Elite (companies, finance)
  4 — Narrative War (media, religious leaders)
  5 — Community Reaction (groups, classes)
  6 — Human Behavior (individual personas)
  7 — Synthesis & Forecast
"""

import asyncio
import os
from datetime import datetime, timezone
from typing import Optional

from supabase import create_client

from agents.agent_configs import AGENT_CONFIGS
from agents.world_agent import WorldAgent
from layers.smart_sampler import sample_agents
from tools.data_tools import (
    get_financial_data, classify_event, get_live_context, search_news
)
from llm_gateway import call_llm_json

SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_KEY", "")

LAYER_NAMES = {
    1: "ECONOMIC REALITY (0-24h)",
    2: "INSTITUTIONAL RESPONSE (1-7 days)",
    3: "CORPORATE & ELITE (1-7 days)",
    4: "NARRATIVE WAR (2-10 days)",
    5: "COMMUNITY REACTION (1-4 weeks)",
    6: "HUMAN BEHAVIOR (2-8 weeks)",
    7: "SYNTHESIS & FORECAST",
}


class SimulationEngine:
    def __init__(self):
        self.agents: dict[str, WorldAgent] = {}
        self.supabase = None
        self._initialize()

    def _initialize(self):
        print("Initializing world agents...")
        for agent_id, config in AGENT_CONFIGS.items():
            self.agents[agent_id] = WorldAgent(agent_id=agent_id, config=config)
        print(f"✅ {len(self.agents)} agents initialized with memory")

        if SUPABASE_URL and SUPABASE_KEY:
            try:
                self.supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
                print("✅ Supabase connected")
            except Exception as e:
                print(f"⚠️  Supabase connection failed: {e}")

        print(f"✅ Engine ready — {len(self.agents)} agents loaded")

    async def get_world_signals_context(self, event: str, signal_type: str) -> str:
        """
        Fetch recent AYN world signals from Supabase to ground the simulation
        in real current events happening in the world.
        """
        if not self.supabase:
            return ""
        try:
            result = self.supabase.table("ayn_world_signals") \
                .select("headline,summary,signal_type,severity,region,created_at") \
                .order("created_at", desc=True) \
                .limit(8) \
                .execute()

            signals = result.data or []
            if not signals:
                return ""

            context_parts = ["CURRENT WORLD SIGNALS (live from AYN intelligence):"]
            for s in signals:
                severity_emoji = {"critical":"🔴","high":"🟠","medium":"🟡","low":"🟢"}.get(s.get("severity","medium"),"⚪")
                context_parts.append(
                    f"{severity_emoji} [{s.get('signal_type','').upper()}] {s.get('headline','')} — {s.get('summary','')[:100]}"
                )

            context = "\n".join(context_parts)
            print(f"  📡 {len(signals)} world signals injected from Supabase")
            return context

        except Exception as e:
            print(f"  ⚠️  World signals fetch failed: {e}")
            return ""

    async def run_simulation(
        self,
        event: str,
        signal_id: Optional[str] = None,
        report_type: str = "full",
        depth: str = "standard",
        user_target: Optional[dict] = None,
    ) -> dict:
        """
        Run a full 7-layer world simulation.

        Args:
            event: The event/scenario to simulate
            signal_id: Optional Supabase signal UUID to link
            report_type: government|marketing|investment|social|full
            depth: quick|standard|deep
            user_target: Demographic filters for persona selection
        """
        start_time = datetime.now(timezone.utc)
        print(f"\n🌍 Starting simulation: {event[:80]}...")
        print(f"   Report type: {report_type} | Depth: {depth}")

        # ── Step 1: Classify event + get routing ────────────────────────────
        classification = await classify_event(event)
        signal_type = classification["signal_type"]

        # ── Step 2: Smart agent sampling ────────────────────────────────────
        agent_layers = sample_agents(
            event=event,
            signal_type=signal_type,
            report_type=report_type,
            depth=depth,
            user_target=user_target,
        )

        # ── Step 3: Fetch world context in parallel ─────────────────────────
        print("⚡ Fetching world context...")
        financial_data, news_context, signals_context = await asyncio.gather(
            get_financial_data(event),
            get_live_context(event),
            self.get_world_signals_context(event, signal_type),
        )

        # Combine context
        world_context = "\n\n".join(filter(None, [signals_context, news_context]))
        if financial_data and "error" not in financial_data:
            prices = " | ".join(
                f"{k.capitalize()}: ${v['price']}" for k,v in list(financial_data.items())[:5]
            )
            print(f"  💰 Prices: {prices}...")
        print(f"  ✅ World context: {len(world_context)} chars")

        # ── Step 4: Create conversation in Supabase ─────────────────────────
        conv_id = None
        if self.supabase:
            try:
                result = self.supabase.table("ayn_agent_conversations").insert({
                    "event": event,
                    "signal_type": signal_type,
                    "signal_id": signal_id,
                    "report_type": report_type,
                    "depth": depth,
                    "agent_count": agent_layers["total_agents"],
                    "financial_snapshot": financial_data,
                    "status": "running",
                }).execute()
                conv_id = result.data[0]["id"] if result.data else None
                print(f"📝 Conversation: {conv_id}")
            except Exception as e:
                print(f"  ⚠️  Conversation save failed: {e}")

        # ── Step 5: Run all 7 layers ─────────────────────────────────────────
        all_messages = []
        layer_summaries = {}

        for layer_num in range(1, 7):
            layer_key = {
                1:"layer1_economic", 2:"layer2_institutional",
                3:"layer3_elite", 4:"layer4_narrative",
                5:"layer5_community", 6:"layer6_human"
            }[layer_num]

            agent_ids = agent_layers.get(layer_key, [])
            if not agent_ids:
                continue

            print(f"\n⚡ Layer {layer_num}: {LAYER_NAMES[layer_num]}...")
            prior = all_messages[-20:] if all_messages else []  # Rolling context

            layer_messages = await self._run_layer(
                layer_num=layer_num,
                agent_ids=agent_ids,
                event=event,
                financial_data=financial_data,
                world_context=world_context,
                prior_messages=prior,
                conv_id=conv_id,
            )
            all_messages.extend(layer_messages)
            layer_summaries[f"layer{layer_num}"] = self._summarize_layer(layer_messages)
            print(f"   ✓ Layer {layer_num}: {len(layer_messages)} agent responses")

        # ── Step 6: Synthesis (Layer 7) ──────────────────────────────────────
        print(f"\n⚡ Layer 7: {LAYER_NAMES[7]}...")
        synthesis = await self._run_synthesis(
            event=event,
            all_messages=all_messages,
            layer_summaries=layer_summaries,
            financial_data=financial_data,
            report_type=report_type,
            agent_layers=agent_layers,
        )

        # ── Step 7: Build result ─────────────────────────────────────────────
        duration = (datetime.now(timezone.utc) - start_time).total_seconds()

        result = {
            "conversation_id": conv_id,
            "event": event,
            "signal_type": signal_type,
            "report_type": report_type,
            "depth": depth,
            "messages": all_messages,
            "synthesis": synthesis,
            "predictions": synthesis.get("predictions", []),
            "layer_summaries": layer_summaries,
            "avg_belief_score": sum(m.get("belief_score", 0) for m in all_messages) / max(len(all_messages), 1),
            "financial_snapshot": financial_data,
            "world_context_used": bool(world_context),
            "agent_count": len(all_messages),
            "duration_seconds": round(duration, 1),
        }

        # Update Supabase conversation status
        if self.supabase and conv_id:
            try:
                self.supabase.table("ayn_agent_conversations").update({
                    "status": "completed",
                    "synthesis": synthesis,
                    "duration_seconds": result["duration_seconds"],
                }).eq("id", conv_id).execute()
            except Exception:
                pass

        print(f"\n✅ Simulation complete: {len(all_messages)} responses in {duration:.0f}s")
        return result

    async def _run_layer(
        self,
        layer_num: int,
        agent_ids: list[str],
        event: str,
        financial_data: dict,
        world_context: str,
        prior_messages: list[dict],
        conv_id: Optional[str],
    ) -> list[dict]:
        """Run a layer: agents react in parallel batches of 5."""
        valid_agents = [aid for aid in agent_ids if aid in self.agents]
        if not valid_agents:
            return []

        # Build prior context string
        prior_text = ""
        if prior_messages:
            prior_text = "\n".join([
                f"[{m.get('agent_name','')} - {m.get('agent_category','')}]: {m.get('public_statement','')[:150]}"
                for m in prior_messages[-10:]
            ])

        # Run in batches of 5
        batch_size = 5
        all_responses = []

        for i in range(0, len(valid_agents), batch_size):
            batch = valid_agents[i:i+batch_size]
            tasks = [
                self.agents[aid].react(
                    event=event,
                    layer=layer_num,
                    financial_data=financial_data,
                    world_context=world_context,
                    prior_messages_text=prior_text,
                    conv_id=conv_id,
                )
                for aid in batch
            ]
            results = await asyncio.gather(*tasks, return_exceptions=True)

            for aid, result in zip(batch, results):
                if isinstance(result, Exception):
                    print(f"  [AGENT ERROR] {aid}: {result}")
                    continue
                if result:
                    all_responses.append(result)

        # Save to Supabase
        if self.supabase and conv_id and all_responses:
            try:
                self.supabase.table("ayn_agent_messages").insert([
                    {**m, "conversation_id": conv_id, "layer": layer_num}
                    for m in all_responses
                ]).execute()
            except Exception as e:
                print(f"  ⚠️  Message save failed: {e}")

        return all_responses

    async def _run_synthesis(
        self,
        event: str,
        all_messages: list[dict],
        layer_summaries: dict,
        financial_data: dict,
        report_type: str,
        agent_layers: dict,
    ) -> dict:
        """Layer 7: Synthesize all agent reactions into a final forecast."""

        # Build summary of all layers
        layer_text = "\n\n".join([
            f"LAYER {k.upper()}: {v}" for k, v in layer_summaries.items()
        ])

        # Get key predictions from agents
        predictions = [
            f"{m.get('agent_name','')}: {m.get('numerical_prediction','')}"
            for m in all_messages
            if m.get("numerical_prediction") and "Unable" not in m.get("numerical_prediction", "")
        ][:15]

        # Emotion distribution
        emotions = [m.get("emotion", "neutral") for m in all_messages]
        emotion_dist = {e: emotions.count(e) for e in set(emotions)}

        # Report-type specific synthesis prompt
        report_instructions = {
            "government": "Focus on: geopolitical stability risks, policy responses, protest/conflict probability, government collapse risk, regional spillover.",
            "marketing": "Focus on: consumer sentiment by demographic, purchase intent changes, brand perception shifts, market opportunity by segment, messaging recommendations.",
            "investment": "Focus on: asset price predictions with specific % moves, capital flow direction, sector winners/losers, risk-adjusted opportunities.",
            "social": "Focus on: community impact by ethnicity/religion/class, behavioral change probability, social cohesion index, vulnerable population effects.",
            "full": "Cover all dimensions: economic, political, social, corporate, and human behavioral impacts.",
        }.get(report_type, "Cover all dimensions.")

        synthesis_prompt = f"""You are the AYN World Simulation synthesis engine.

EVENT: {event}

LAYER SUMMARIES:
{layer_text}

KEY AGENT PREDICTIONS:
{chr(10).join(predictions[:10]) if predictions else 'None captured'}

EMOTION DISTRIBUTION: {emotion_dist}

REPORT TYPE: {agent_layers.get('report_type_description', 'Full simulation')}
SYNTHESIS FOCUS: {report_instructions}

Generate a comprehensive synthesis report in JSON format:
{{
  "headline_outcome": "One sentence: what most likely happens",
  "probability": "Very High|High|Medium|Low|Very Low",
  "confidence_score": 0-100,
  "time_horizon": "When this plays out",
  
  "predictions": ["Specific prediction 1 with number", "Prediction 2", "Prediction 3", "Prediction 4", "Prediction 5"],
  
  "winners": ["Who benefits and why"],
  "losers": ["Who suffers and why"],
  
  "demographic_impact": {{
    "most_affected_groups": ["Group 1: reason", "Group 2: reason"],
    "least_affected": ["Group description"],
    "behavioral_changes": ["Change 1", "Change 2"]
  }},
  
  "market_signals": {{
    "gold": "up/down/neutral + %",
    "oil": "up/down/neutral + %",
    "equities": "up/down/neutral + %",
    "crypto": "up/down/neutral + %",
    "usd": "up/down/neutral + %"
  }},
  
  "risk_flags": ["Risk 1", "Risk 2", "Risk 3"],
  "opportunity_flags": ["Opportunity 1", "Opportunity 2"],
  
  "human_impact": "How this affects ordinary people in 2-3 sentences",
  "action_recommendations": ["Recommendation for target audience 1", "Recommendation 2", "Recommendation 3"],
  
  "dissenting_views": ["Agent X sees it differently because...", "Agent Y warns..."],
  "historical_parallel": "Most similar historical event and what happened"
}}

Return ONLY valid JSON. No markdown, no preamble."""

        try:
            result = await call_llm_json(
                call_type="synthesis",
                messages=[{"role":"user","content":synthesis_prompt}],
                temperature=0.7,
                max_tokens=1500,
            )
            parsed = result.get("parsed", {})
            if not parsed:
                parsed = {"headline_outcome": result.get("content","")[:200], "probability":"Medium","confidence_score":50}
            return parsed
        except Exception as e:
            print(f"  ⚠️  Synthesis error: {e}")
            return {
                "headline_outcome": "Simulation completed — synthesis generation failed",
                "probability": "Medium",
                "confidence_score": 50,
                "predictions": [m.get("numerical_prediction","") for m in all_messages if m.get("numerical_prediction")][:5],
                "error": str(e)
            }

    def _summarize_layer(self, messages: list[dict]) -> str:
        """Create a concise summary of a layer's responses."""
        if not messages:
            return "No responses"

        key_points = []
        for m in messages[:8]:
            stmt = m.get("public_statement", "")
            if stmt:
                agent_name = m.get("agent_name", "")
                key_points.append(f"{agent_name}: {stmt[:120]}")

        return " | ".join(key_points[:5]) if key_points else "Agents responded"
