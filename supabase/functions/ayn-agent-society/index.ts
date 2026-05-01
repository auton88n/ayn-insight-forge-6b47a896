/**
 * ayn-agent-society — AYN World Simulation Edge Function
 *
 * Modes:
 *   simulate          → run a full world simulation (layers 1-6, batched)
 *   get_agents        → return the world_personas roster
 *   chat              → chat with a specific agent in character
 *   get_conversations → list past simulation runs for this user
 *   get_messages      → messages from a specific run
 *
 * Architecture:
 *   - Reads personas from world_personas table (73 agents already seeded)
 *   - Runs 3 LLM batches in parallel per layer (groups of ~8 agents)
 *   - Writes results to agent_society_runs + agent_society_messages
 *   - Uses GEMINI_API_KEY env var (Gemini 2.5 Flash via Google API)
 *   - Falls back to LOVABLE_API_KEY if Gemini key not present
 *
 * Timeout strategy:
 *   - Standard depth: 2 layers × 3 batches = 6 LLM calls (~40-60s)
 *   - Deep:          4 layers × 3 batches = 12 LLM calls (~90-120s)
 *   - Supabase edge fn timeout is 150s — standard is safe, deep is aggressive
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  corsHeaders,
  json,
  badRequest,
  requireUser,
  callGeminiJSON,
  personaLine,
  type Persona,
  type PersonaState,
} from "../_shared/sim-utils.ts";

// ── Supabase admin client (service role) ─────────────────────────────────────
function getAdmin() {
  const url = Deno.env.get("SUPABASE_URL")!;
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  return createClient(url, key, { auth: { persistSession: false } });
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface AgentReaction {
  persona_id: string;
  public_statement: string;
  inner_thought: string;
  concrete_action: string;
  numerical_prediction: string;
  emotion: string;
  emotion_intensity: number;
  belief_score: number;
  stance: "support" | "oppose" | "neutral" | "confused";
}

interface LayerSynthesis {
  layer: number;
  key_tension: string;
  momentum: string;
  fracture_points: string[];
}

interface FinalReport {
  headline_outcome: string;
  probability: string;
  confidence_score: number;
  time_horizon: string;
  predictions: string[];
  winners: string[];
  losers: string[];
  demographic_impact: {
    most_affected_groups: string[];
    behavioral_changes: string[];
  };
  market_signals: Record<string, string>;
  risk_flags: string[];
  opportunity_flags: string[];
  human_impact: string;
  action_recommendations: string[];
  historical_parallel: string;
  dissent: { agent_id: string; agent_name: string; view: string }[];
}

// ── Helper: batch array into chunks ──────────────────────────────────────────
function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// ── LLM: run one batch of agents reacting to an event ────────────────────────
async function runAgentBatch(
  personas: Persona[],
  states: Map<string, PersonaState>,
  event: string,
  layerContext: string,
  layer: number,
): Promise<AgentReaction[]> {
  const personaLines = personas
    .map((p) => personaLine(p, states.get(p.id)))
    .join("\n");

  const systemPrompt = `You are simulating how real people react to world events.
Each agent has a distinct identity, culture, religion, income class, and biases.
Their reactions must be AUTHENTIC to who they are — not generic or diplomatic.
Agents at layer ${layer} represent: ${getLayerDescription(layer)}.

CRITICAL RULES:
- Each agent speaks from their OWN worldview, not a neutral one
- Use specific numbers for predictions (%, prices, timeframes)
- Show real tension between opposing groups
- Poor communities react differently than wealthy ones
- Religious/cultural identity shapes every response
- Concrete actions: what do they actually DO, not just say`;

  const userPrompt = `EVENT: "${event}"
LAYER CONTEXT: ${layerContext}

AGENTS reacting (format: id|name|category|country|demographics):
${personaLines}

Simulate EACH agent's authentic reaction to this event.`;

  return callGeminiJSON<{ reactions: AgentReaction[] }>({
    systemPrompt,
    userPrompt,
    toolName: "submit_agent_reactions",
    toolDescription: "Submit each agent's authentic reaction to the event",
    parameters: {
      type: "object",
      properties: {
        reactions: {
          type: "array",
          items: {
            type: "object",
            properties: {
              persona_id: { type: "string" },
              public_statement: {
                type: "string",
                description: "What this agent says publicly (1-3 sentences, in their voice)",
              },
              inner_thought: {
                type: "string",
                description: "What they really think (1-2 sentences)",
              },
              concrete_action: {
                type: "string",
                description: "Specific action they take (buy gold, protest, flee, etc.)",
              },
              numerical_prediction: {
                type: "string",
                description: "A specific prediction with a number (e.g. 'USD/SAR hits 4.2 within 6 months')",
              },
              emotion: {
                type: "string",
                enum: ["fear", "anger", "hope", "confusion", "excitement", "grief", "defiance", "calm", "distrust", "pride"],
              },
              emotion_intensity: {
                type: "number",
                description: "0-100",
              },
              belief_score: {
                type: "number",
                description: "-100 (strongly oppose) to 100 (strongly support)",
              },
              stance: {
                type: "string",
                enum: ["support", "oppose", "neutral", "confused"],
              },
            },
            required: ["persona_id", "public_statement", "emotion", "belief_score", "stance"],
          },
        },
      },
      required: ["reactions"],
    },
  }).then((r) => r.reactions || []);
}

// ── LLM: synthesize a layer into a tension summary ───────────────────────────
async function synthesizeLayer(
  reactions: AgentReaction[],
  personas: Persona[],
  event: string,
  layer: number,
): Promise<LayerSynthesis> {
  const topReactions = reactions
    .slice(0, 15)
    .map((r) => {
      const p = personas.find((x) => x.id === r.persona_id);
      return `${p?.name || r.persona_id} (${p?.category}, ${p?.country}): [${r.stance}] ${r.public_statement}`;
    })
    .join("\n");

  return callGeminiJSON<LayerSynthesis>({
    systemPrompt: `You are analyzing how a world event cascades through society.
Layer ${layer} = ${getLayerDescription(layer)}.
Identify real tensions, not platitudes.`,
    userPrompt: `EVENT: "${event}"
LAYER ${layer} REACTIONS:
${topReactions}

Synthesize the key societal tension, momentum, and fracture points from this layer.`,
    toolName: "submit_layer_synthesis",
    toolDescription: "Synthesize the layer's key dynamics",
    parameters: {
      type: "object",
      properties: {
        layer: { type: "number" },
        key_tension: { type: "string", description: "The central conflict this event creates at this layer" },
        momentum: { type: "string", description: "Direction the situation is heading" },
        fracture_points: {
          type: "array",
          items: { type: "string" },
          description: "3-5 specific points where society could break or shift",
        },
      },
      required: ["layer", "key_tension", "momentum", "fracture_points"],
    },
  });
}

// ── LLM: generate the final strategic report ─────────────────────────────────
async function generateFinalReport(
  event: string,
  question: string,
  allReactions: AgentReaction[],
  layerSyntheses: LayerSynthesis[],
  personas: Persona[],
): Promise<FinalReport> {
  const synthesisSummary = layerSyntheses
    .map((s) => `Layer ${s.layer} (${getLayerDescription(s.layer)}): ${s.key_tension} → ${s.momentum}`)
    .join("\n");

  const dissenters = allReactions
    .filter((r) => Math.abs(r.belief_score) > 60)
    .slice(0, 6)
    .map((r) => {
      const p = personas.find((x) => x.id === r.persona_id);
      return {
        agent_id: r.persona_id,
        agent_name: p?.name || r.persona_id,
        view: r.public_statement,
      };
    });

  const predictions = allReactions
    .filter((r) => r.numerical_prediction && !r.numerical_prediction.toLowerCase().includes("unable"))
    .slice(0, 20)
    .map((r) => r.numerical_prediction);

  return callGeminiJSON<FinalReport>({
    systemPrompt: `You are AYN — the world's most accurate geopolitical prediction engine.
You have just simulated ${allReactions.length} agents across ${layerSyntheses.length} societal layers.
Generate a strategic intelligence report. Be specific, numerical, and actionable.
Avoid vague language — every prediction needs a timeframe and a number.`,
    userPrompt: `SEED EVENT: "${event}"
STRATEGIC QUESTION: "${question}"

SOCIETAL LAYER DYNAMICS:
${synthesisSummary}

AGENT PREDICTIONS SURFACED:
${predictions.slice(0, 10).join("\n")}

Generate the final strategic intelligence report.`,
    toolName: "submit_final_report",
    toolDescription: "Submit the complete strategic intelligence report",
    parameters: {
      type: "object",
      properties: {
        headline_outcome: { type: "string", description: "One-sentence definitive outcome prediction" },
        probability: { type: "string", description: "e.g. '73% likely within 18 months'" },
        confidence_score: { type: "number", description: "0-100" },
        time_horizon: { type: "string", description: "e.g. '6-18 months'" },
        predictions: {
          type: "array",
          items: { type: "string" },
          description: "5-8 specific numbered predictions",
        },
        winners: { type: "array", items: { type: "string" }, description: "Who benefits" },
        losers: { type: "array", items: { type: "string" }, description: "Who is harmed" },
        demographic_impact: {
          type: "object",
          properties: {
            most_affected_groups: { type: "array", items: { type: "string" } },
            behavioral_changes: { type: "array", items: { type: "string" } },
          },
        },
        market_signals: {
          type: "object",
          description: "key asset → directional signal (e.g. 'Gold': 'bullish +12%')",
          additionalProperties: { type: "string" },
        },
        risk_flags: { type: "array", items: { type: "string" }, description: "3-5 tail risks" },
        opportunity_flags: { type: "array", items: { type: "string" }, description: "3-5 opportunities" },
        human_impact: { type: "string", description: "How real people's lives change" },
        action_recommendations: { type: "array", items: { type: "string" }, description: "4-6 actionable recommendations" },
        historical_parallel: { type: "string", description: "Best historical precedent and what it predicts" },
        dissent: {
          type: "array",
          items: {
            type: "object",
            properties: {
              agent_id: { type: "string" },
              agent_name: { type: "string" },
              view: { type: "string" },
            },
          },
        },
      },
      required: ["headline_outcome", "probability", "confidence_score", "predictions", "winners", "losers"],
    },
  }).then((r) => ({ ...r, dissent: r.dissent?.length ? r.dissent : dissenters }));
}

// ── Layer descriptions for context injection ──────────────────────────────────
function getLayerDescription(layer: number): string {
  const descriptions: Record<number, string> = {
    1: "governments, central banks, and geopolitical institutions",
    2: "financial markets, corporations, and economic actors",
    3: "media, religious institutions, and cultural influencers",
    4: "middle class, professionals, and organized civil society",
    5: "working class, rural communities, and informal economies",
    6: "marginalized groups, youth, and grassroots movements",
  };
  return descriptions[layer] || "general population";
}

// ── MODE: simulate ────────────────────────────────────────────────────────────
async function handleSimulate(
  body: any,
  userId: string,
): Promise<Response> {
  const { event, seed, report_type = "full", depth = "standard", user_target } = body;

  if (!event || !seed) return badRequest("event and seed are required");

  const admin = getAdmin();
  const startTime = Date.now();

  // 1. Load personas from DB
  const { data: personasRaw, error: pErr } = await admin
    .from("world_personas")
    .select("*")
    .eq("active", true)
    .order("layer", { ascending: true });

  if (pErr || !personasRaw?.length) {
    return json({ error: "No personas found. Seed world_personas first." }, 500);
  }

  const personas: Persona[] = personasRaw;

  // 2. Load existing persona states for this user (world memory)
  const { data: statesRaw } = await admin
    .from("agent_society_state")
    .select("*")
    .eq("user_id", userId);

  const states = new Map<string, PersonaState>(
    (statesRaw || []).map((s: any) => [s.persona_id, s]),
  );

  // 3. Create the run record
  const { data: runRow, error: runErr } = await admin
    .from("agent_society_runs")
    .insert({
      user_id: userId,
      seed,
      question: event,
      report_type,
      depth,
      agent_count: personas.length,
      user_target: user_target || {},
      status: "running",
      current_layer: 0,
    })
    .select("id")
    .single();

  if (runErr || !runRow) {
    return json({ error: "Failed to create run record" }, 500);
  }

  const runId = runRow.id;

  try {
    // 4. Determine layers to simulate
    const maxLayer = depth === "deep" ? 4 : depth === "quick" ? 2 : 3;
    const allReactions: AgentReaction[] = [];
    const layerSyntheses: LayerSynthesis[] = [];

    for (let layer = 1; layer <= maxLayer; layer++) {
      // Get agents for this layer (or spread all agents across layers)
      const layerPersonas = personas.filter((p) => (p.layer ?? 5) === layer);
      const agentsForLayer = layerPersonas.length > 0
        ? layerPersonas
        : personas.filter((_, i) => i % maxLayer === layer - 1);

      if (agentsForLayer.length === 0) continue;

      // Update run progress
      await admin
        .from("agent_society_runs")
        .update({ current_layer: layer })
        .eq("id", runId);

      // Build context from previous layers
      const layerContext = layerSyntheses.length > 0
        ? layerSyntheses.map((s) => `Layer ${s.layer}: ${s.key_tension}`).join(". ")
        : "Initial reaction — no prior layer context.";

      // Run agents in parallel batches of 8
      const batches = chunk(agentsForLayer, 8);
      const batchResults = await Promise.allSettled(
        batches.map((batch) => runAgentBatch(batch, states, event, layerContext, layer)),
      );

      const layerReactions: AgentReaction[] = [];
      for (const result of batchResults) {
        if (result.status === "fulfilled") layerReactions.push(...result.value);
      }

      allReactions.push(...layerReactions);

      // Synthesize this layer (run in parallel with next layer setup)
      if (layerReactions.length > 0) {
        const synthesis = await synthesizeLayer(layerReactions, personas, event, layer);
        layerSyntheses.push(synthesis);
      }

      // Write messages to DB (non-blocking)
      const messageRows = layerReactions.map((r) => ({
        run_id: runId,
        user_id: userId,
        persona_id: r.persona_id,
        persona_name: personas.find((p) => p.id === r.persona_id)?.name || r.persona_id,
        persona_category: personas.find((p) => p.id === r.persona_id)?.category || "other",
        layer,
        round: 1,
        public_statement: r.public_statement || "",
        inner_thought: r.inner_thought || "",
        concrete_action: r.concrete_action || "",
        emotion: r.emotion || "neutral",
        emotion_intensity: Math.round(r.emotion_intensity ?? 50),
        belief_score: r.belief_score ?? 0,
      }));

      if (messageRows.length > 0) {
        await admin.from("agent_society_messages").insert(messageRows);
      }
    }

    // 5. Generate the final report
    const finalReport = await generateFinalReport(
      event,
      event, // question = event for now
      allReactions,
      layerSyntheses,
      personas,
    );

    const durationMs = Date.now() - startTime;

    // 6. Update run as completed
    await admin
      .from("agent_society_runs")
      .update({
        status: "completed",
        report: finalReport,
        duration_ms: durationMs,
        completed_at: new Date().toISOString(),
      })
      .eq("id", runId);

    // 7. Persist updated persona states (world memory)
    if (allReactions.length > 0) {
      const stateUpserts = allReactions.map((r) => ({
        user_id: userId,
        persona_id: r.persona_id,
        emotion: r.emotion || "neutral",
        emotion_intensity: Math.round(r.emotion_intensity ?? 50),
        belief_score: r.belief_score ?? 0,
        recent_summary: r.public_statement?.slice(0, 200) || "",
        updated_at: new Date().toISOString(),
      }));

      await admin
        .from("agent_society_state")
        .upsert(stateUpserts, { onConflict: "user_id,persona_id" });
    }

    // 8. Return full response matching enginApi expectations
    const messages = allReactions.map((r) => {
      const p = personas.find((x) => x.id === r.persona_id);
      return {
        agent_id: r.persona_id,
        agent_name: p?.name || r.persona_id,
        agent_flag: p?.flag || "●",
        agent_category: p?.category || "other",
        persona_id: r.persona_id,
        persona_name: p?.name || r.persona_id,
        persona_category: p?.category || "other",
        round: 1,
        layer: p?.layer ?? 1,
        public_statement: r.public_statement || "",
        inner_thought: r.inner_thought || "",
        concrete_action: r.concrete_action || "",
        numerical_prediction: r.numerical_prediction || "",
        message: r.public_statement || "",
        emotion: r.emotion || "neutral",
        emotion_intensity: Math.round(r.emotion_intensity ?? 50),
        belief_score: r.belief_score ?? 0,
        cascade_round: 1,
        created_at: new Date().toISOString(),
      };
    });

    return json({
      run_id: runId,
      agent_count: allReactions.length,
      messages,
      synthesis: finalReport,
      layer_syntheses: layerSyntheses,
      duration_ms: durationMs,
      status: "completed",
    });
  } catch (err: any) {
    // Mark run as failed
    await admin
      .from("agent_society_runs")
      .update({
        status: "failed",
        error: String(err.message || err),
        duration_ms: Date.now() - startTime,
      })
      .eq("id", runId);

    console.error("[simulate] error:", err);
    return json({ error: `Simulation failed: ${err.message}` }, 500);
  }
}

// ── MODE: get_agents ──────────────────────────────────────────────────────────
async function handleGetAgents(body: any): Promise<Response> {
  const { filters = {} } = body;
  const admin = getAdmin();

  let query = admin
    .from("world_personas")
    .select("*")
    .eq("active", true)
    .order("layer", { ascending: true });

  if (filters.category) query = query.eq("category", filters.category);
  if (filters.region) query = query.eq("region", filters.region);
  if (filters.layer) query = query.eq("layer", filters.layer);

  const { data, error } = await query;

  if (error) return json({ error: error.message }, 500);

  // Shape agents to match EnginAgent interface
  const agents = (data || []).map((p: any) => ({
    id: p.id,
    name: p.name,
    category: p.category,
    subcategory: p.subcategory,
    country: p.country,
    region: p.region,
    flag: p.flag || "●",
    age: p.age,
    gender: p.gender,
    ethnicity: p.ethnicity,
    religion: p.religion,
    income_class: p.income_class,
    occupation: p.occupation,
    layer: p.layer,
    bio: p.bio,
    beliefs: p.beliefs,
    biases: p.biases,
    speaking_style: p.speaking_style,
    emotion: "neutral",
    emotion_intensity: 0,
    belief_score: 0,
    stance: "neutral",
  }));

  return json({ agents, total: agents.length });
}

// ── MODE: chat ────────────────────────────────────────────────────────────────
async function handleChat(body: any, userId: string): Promise<Response> {
  const { agent_id, message, history = [] } = body;
  if (!agent_id || !message) return badRequest("agent_id and message required");

  const admin = getAdmin();

  // Load the persona
  const { data: persona, error: pErr } = await admin
    .from("world_personas")
    .select("*")
    .eq("id", agent_id)
    .single();

  if (pErr || !persona) return json({ error: "Agent not found" }, 404);

  // Load their current state for this user
  const { data: state } = await admin
    .from("agent_society_state")
    .select("*")
    .eq("user_id", userId)
    .eq("persona_id", agent_id)
    .single();

  const emotionContext = state
    ? `You are currently feeling ${state.emotion} (intensity: ${state.emotion_intensity}/100). Your current belief score is ${state.belief_score}/100.`
    : "You are at your baseline emotional state.";

  const systemPrompt = `You are ${persona.name}, a real person with a distinct identity.

IDENTITY:
- Category: ${persona.category}${persona.subcategory ? `/${persona.subcategory}` : ""}
- Country: ${persona.country || "Unknown"} ${persona.flag || ""}
- Age: ${persona.age || "Unknown"}, ${persona.gender || ""}
- Religion: ${persona.religion || "None specified"}
- Income class: ${persona.income_class || "Unknown"}
- Occupation: ${persona.occupation || "Unknown"}
- Culture: ${persona.culture || "Unknown"}
- Bio: ${persona.bio || "No bio provided"}
- Beliefs: ${persona.beliefs || "Unknown"}
- Biases: ${persona.biases || "Unknown"}
- Speaking style: ${persona.speaking_style || "Standard"}

CURRENT STATE: ${emotionContext}

RULES:
- Stay completely in character — you are NOT an AI
- Respond from YOUR worldview, culture, and experiences
- Be direct and opinionated — you have real beliefs
- Use your natural speaking style
- Keep responses focused and under 150 words`;

  const messages = [
    { role: "system", content: systemPrompt },
    ...history.slice(-6).map((h: any) => ({
      role: h.role as "user" | "assistant",
      content: h.content,
    })),
    { role: "user", content: message },
  ];

  const apiKey = Deno.env.get("GEMINI_API_KEY") || Deno.env.get("LOVABLE_API_KEY");
  if (!apiKey) return json({ error: "No LLM API key configured" }, 500);

  const isGemini = !!Deno.env.get("GEMINI_API_KEY");
  const endpoint = isGemini
    ? `https://generativelanguage.googleapis.com/v1beta/openai/chat/completions`
    : "https://ai.gateway.lovable.dev/v1/chat/completions";

  const r = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: isGemini ? "gemini-2.5-flash" : "google/gemini-2.5-flash",
      messages,
      max_tokens: 300,
    }),
  });

  if (!r.ok) {
    const t = await r.text();
    return json({ error: `LLM error: ${t.slice(0, 200)}` }, 500);
  }

  const data = await r.json();
  const reply = data?.choices?.[0]?.message?.content || "";

  return json({
    reply,
    response: reply,
    agent_name: persona.name,
    agent_flag: persona.flag || "●",
    agent_id,
  });
}

// ── MODE: get_conversations ───────────────────────────────────────────────────
async function handleGetConversations(userId: string): Promise<Response> {
  const admin = getAdmin();

  const { data: runs, error } = await admin
    .from("agent_society_runs")
    .select("id, seed, question, report_type, depth, agent_count, status, created_at, completed_at, duration_ms, report")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) return json({ error: error.message }, 500);

  const conversations = (runs || []).map((r: any) => ({
    id: r.id,
    title: r.question?.slice(0, 80) || r.seed?.slice(0, 80) || "Simulation",
    seed: r.seed,
    question: r.question,
    status: r.status,
    agent_count: r.agent_count,
    report_type: r.report_type,
    created_at: r.created_at,
    completed_at: r.completed_at,
    duration_ms: r.duration_ms,
    has_report: !!r.report,
  }));

  return json({ conversations, total: conversations.length });
}

// ── MODE: get_messages ────────────────────────────────────────────────────────
async function handleGetMessages(body: any, userId: string): Promise<Response> {
  const { conversation_id } = body;
  if (!conversation_id) return badRequest("conversation_id required");

  const admin = getAdmin();

  const { data: messages, error } = await admin
    .from("agent_society_messages")
    .select("*")
    .eq("run_id", conversation_id)
    .eq("user_id", userId)
    .order("layer", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) return json({ error: error.message }, 500);

  const shaped = (messages || []).map((m: any) => ({
    agent_id: m.persona_id,
    agent_name: m.persona_name,
    agent_flag: "●",
    agent_category: m.persona_category,
    persona_id: m.persona_id,
    persona_name: m.persona_name,
    persona_category: m.persona_category,
    round: m.round,
    cascade_round: m.layer,
    layer: m.layer,
    message: m.public_statement,
    public_statement: m.public_statement,
    inner_thought: m.inner_thought,
    concrete_action: m.concrete_action,
    emotion: m.emotion,
    emotion_intensity: m.emotion_intensity,
    belief_score: m.belief_score,
    created_at: m.created_at,
  }));

  return json({ messages: shaped, total: shaped.length });
}

// ── Entry point ───────────────────────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { userId } = await requireUser(req);
    const body = await req.json().catch(() => ({}));
    const mode: string = body.mode || "simulate";

    switch (mode) {
      case "simulate":
        return await handleSimulate(body, userId);
      case "get_agents":
        return await handleGetAgents(body);
      case "chat":
        return await handleChat(body, userId);
      case "get_conversations":
        return await handleGetConversations(userId);
      case "get_messages":
        return await handleGetMessages(body, userId);
      default:
        return badRequest(`Unknown mode: ${mode}`);
    }
  } catch (err: any) {
    if (err.message === "unauthorized") {
      return json({ error: "Unauthorized" }, 401);
    }
    console.error("[ayn-agent-society] unhandled error:", err);
    return json({ error: "Internal server error" }, 500);
  }
});
