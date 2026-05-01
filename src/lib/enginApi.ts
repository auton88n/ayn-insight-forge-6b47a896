/**
 * enginApi.ts — AYN World Simulation client.
 *
 * Routes all simulation calls through the ayn-agent-society Supabase edge function.
 * No Python engine (engine.aynn.io) — fully Supabase-native.
 *
 * Edge function endpoint: /functions/v1/ayn-agent-society
 * Modes: simulate | get_agents | chat | get_conversations | get_messages |
 *         inject_event | generate_from_signal
 */
import { supabase } from '@/integrations/supabase/client';

// ─── Types ───────────────────────────────────────────────────────────────────
export type AgentCategory =
  | 'government' | 'central_bank' | 'stock_market' | 'bank' | 'company'
  | 'media' | 'religion' | 'social_class' | 'persona'
  | 'person' | 'institution' | 'market' | 'other';

export interface EnginAgent {
  id: string;
  name: string;
  category: AgentCategory;
  subcategory?: string;
  country?: string;
  region?: string;
  flag?: string;
  age?: number;
  gender?: string;
  ethnicity?: string;
  religion?: string;
  income_class?: string;
  occupation?: string;
  layer?: number;
  emotion?: string;
  emotion_intensity?: number;
  stance?: string;
  bio?: string;
  belief_score?: number;
}

export interface GraphNode { id: string; label: string; type?: string; weight?: number }
export interface GraphEdge { source: string; target: string; type?: string; weight?: number }
export interface EnginGraph { nodes: GraphNode[]; edges: GraphEdge[] }

export interface EnginSignal {
  id: string;
  turn?: number;
  layer?: number;
  region?: string;
  severity?: 'critical' | 'high' | 'medium' | 'low';
  headline: string;
  summary?: string;
  tags?: string[];
  created_at?: string;
}

export interface EnginReport {
  question?: string;
  headline_outcome?: string;
  probability?: string;
  confidence_score?: number;
  time_horizon?: string;
  predictions?: string[];
  winners?: string[];
  losers?: string[];
  demographic_impact?: {
    most_affected_groups?: string[];
    behavioral_changes?: string[];
  };
  market_signals?: Record<string, string>;
  risk_flags?: string[];
  opportunity_flags?: string[];
  human_impact?: string;
  action_recommendations?: string[];
  historical_parallel?: string;
  outcomes?: { label: string; probability: number; rationale?: string }[];
  drivers?: { label: string; weight: number; direction: string }[];
  summary?: string;
  dissent?: { agent_id: string; agent_name: string; view: string }[];
}

export interface SimulationMeta {
  sim_id?: string;
  run_id?: string;
  conversation_id?: string;
  status: string;
  question?: string;
  report_type?: string;
  depth?: string;
  agent_count?: number;
}

export interface CreateSimInput {
  seed: string;
  question: string;
  rounds?: number;
  agents?: number;
  report_type?: string;
  depth?: string;
  user_target?: Record<string, string | number | null>;
}

// ─── Core caller ─────────────────────────────────────────────────────────────
class EnginError extends Error {
  status: number;
  constructor(message: string, status: number) { super(message); this.status = status; }
}

async function callEdgeFn(mode: string, body: Record<string, unknown> = {}): Promise<any> {
  const { data, error } = await supabase.functions.invoke('ayn-agent-society', {
    body: { mode, ...body },
  });
  if (error) throw new EnginError(error.message || 'Edge function error', 500);
  if (data?.error) throw new EnginError(data.error, 500);
  return data;
}

// ─── Adapters ─────────────────────────────────────────────────────────────────
function adaptAgent(a: any): EnginAgent {
  return {
    id: a.id,
    name: a.name,
    category: (a.category || 'other') as AgentCategory,
    subcategory: a.subcategory,
    country: a.country,
    region: a.region,
    flag: a.flag || '●',
    age: a.age,
    gender: a.gender,
    ethnicity: a.ethnicity,
    religion: a.religion,
    income_class: a.income_class,
    occupation: a.occupation,
    layer: a.layer,
    emotion: a.emotion || 'neutral',
    emotion_intensity: typeof a.emotion_intensity === 'number' ? a.emotion_intensity / 100 : 0,
    stance: a.stance || '',
    bio: a.bio || '',
    belief_score: a.belief_score ?? 0,
  };
}

function adaptMessage(m: any): any {
  return {
    agent_id: m.agent_id || m.persona_id,
    agent_name: m.agent_name || m.persona_name,
    agent_flag: m.agent_flag || '●',
    agent_category: m.agent_category || m.agent_role || m.persona_category,
    round: m.cascade_round || m.layer || 1,
    public_statement: m.message || m.public_statement || '',
    inner_thought: m.internal_thought || m.inner_thought || '',
    concrete_action: m.market_action?.action || '',
    numerical_prediction: m.numerical_prediction || m.market_action?.prediction || '',
    emotion: m.emotion || 'neutral',
    emotion_intensity: m.emotion_intensity ?? 50,
    belief_score: m.belief_score ?? 0,
    timestamp: m.created_at,
  };
}

function buildGraphFromMessages(messages: any[], agents: EnginAgent[]): EnginGraph {
  const agentSet = new Set(messages.map(m => m.agent_id).filter(Boolean));
  const nodes: GraphNode[] = [...agentSet].map(id => {
    const a = agents.find(x => x.id === id);
    return { id, label: a?.name || id, type: a?.category || 'other', weight: 0.5 };
  });

  const edges: GraphEdge[] = [];
  const agentIds = [...agentSet];
  for (let i = 0; i < Math.min(agentIds.length, 30); i++) {
    for (let j = i + 1; j < Math.min(agentIds.length, 30); j++) {
      if (Math.random() < 0.15) {
        edges.push({ source: agentIds[i], target: agentIds[j], type: 'interaction', weight: Math.random() });
      }
    }
  }
  return { nodes, edges };
}

function buildSignalsFromMessages(messages: any[]): EnginSignal[] {
  return messages
    .filter(m => m.numerical_prediction && !m.numerical_prediction.includes('Unable'))
    .slice(0, 12)
    .map((m, i) => ({
      id: `sig-${i}`,
      turn: m.round || 1,
      layer: m.cascade_round,
      headline: m.numerical_prediction,
      summary: (m.public_statement || '').slice(0, 120),
      severity: Math.abs(m.belief_score || 0) > 50 ? 'high' : 'medium',
      tags: [m.agent_category || ''],
      created_at: m.timestamp,
    }));
}

function adaptReport(synthesis: any, question: string): EnginReport {
  if (!synthesis) return { question, summary: 'Simulation completed', predictions: [] };
  return {
    question,
    headline_outcome: synthesis.headline_outcome || '',
    probability: synthesis.probability || 'Medium',
    confidence_score: synthesis.confidence_score || 50,
    time_horizon: synthesis.time_horizon || '',
    predictions: synthesis.predictions || [],
    winners: synthesis.winners || [],
    losers: synthesis.losers || [],
    demographic_impact: synthesis.demographic_impact,
    market_signals: synthesis.market_signals,
    risk_flags: synthesis.risk_flags || [],
    opportunity_flags: synthesis.opportunity_flags || [],
    human_impact: synthesis.human_impact || '',
    action_recommendations: synthesis.action_recommendations || [],
    historical_parallel: synthesis.historical_parallel || '',
    summary: synthesis.headline_outcome || 'Simulation complete',
    outcomes: synthesis.predictions?.map((p: string, i: number) => ({
      label: p, probability: Math.max(0.2, 0.8 - i * 0.12), rationale: undefined,
    })) || [],
    dissent: synthesis.dissent || [],
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────
export const enginApi = {

  /** Fetch all 87 agents from world_personas */
  async getAgents(filters?: { category?: string; region?: string; layer?: number }): Promise<EnginAgent[]> {
    const data = await callEdgeFn('get_agents', { filters: filters || {} });
    return (data.agents || []).map(adaptAgent);
  },

  /** Run a full world simulation */
  async runSimulation(
    input: CreateSimInput,
    signal?: AbortSignal,
  ): Promise<{
    agents: EnginAgent[];
    emotions: Record<string, { emotion: string; intensity?: number }>;
    graph: EnginGraph;
    signals: EnginSignal[];
    report: EnginReport;
    meta: SimulationMeta;
  }> {
    const event = `${input.question}. Context: ${input.seed}`.slice(0, 600);

    const data = await callEdgeFn('simulate', {
      event,
      seed: input.seed,
      report_type: input.report_type || 'full',
      depth: input.depth || 'standard',
      user_target: input.user_target || null,
    });

    const rawMessages: any[] = data.messages || [];
    const messages = rawMessages.map(adaptMessage);

    // Build agent list with emotions from messages
    const baseAgents = await this.getAgents().catch(() => []);
    const emotionMap: Record<string, { emotion: string; intensity?: number }> = {};
    for (const m of rawMessages) {
      if (m.agent_id) {
        emotionMap[m.agent_id] = {
          emotion: m.emotion || 'neutral',
          intensity: (m.emotion_intensity ?? 50) / 100,
        };
      }
    }

    const agents = baseAgents.map(a => ({
      ...a,
      ...(emotionMap[a.id] ? { emotion: emotionMap[a.id].emotion, emotion_intensity: emotionMap[a.id].intensity } : {}),
    }));

    return {
      agents,
      emotions: emotionMap,
      graph: buildGraphFromMessages(rawMessages, agents),
      signals: buildSignalsFromMessages(rawMessages),
      report: adaptReport(data.synthesis, input.question),
      meta: {
        run_id: data.run_id,
        conversation_id: data.conversation_id,
        status: 'completed',
        question: input.question,
        report_type: input.report_type || 'full',
        depth: input.depth || 'standard',
        agent_count: data.agent_count || rawMessages.length,
      },
    };
  },

  /** Chat with a specific agent */
  async chatWithAgent(
    agentId: string,
    message: string,
    history: { role: string; content: string }[] = [],
  ): Promise<{ reply: string; agent_name?: string; agent_flag?: string }> {
    const data = await callEdgeFn('chat', { agent_id: agentId, message, history });
    return {
      reply: data.response || data.reply || '',
      agent_name: data.agent_name,
      agent_flag: data.agent_flag,
    };
  },

  /** Get past simulation conversations */
  async getConversations(): Promise<{
    conversations: any[];
    agents: EnginAgent[];
    categories: { id: string; label: string; icon?: string }[];
  }> {
    const data = await callEdgeFn('get_conversations');
    return {
      conversations: data.conversations || [],
      agents: (data.agents || []).map(adaptAgent),
      categories: data.categories || [],
    };
  },

  /** Get messages from a conversation */
  async getMessages(conversationId: string): Promise<any[]> {
    const data = await callEdgeFn('get_messages', { conversation_id: conversationId });
    return (data.messages || []).map(adaptMessage);
  },

  /** Trigger simulation from a world signal */
  async triggerFromSignal(signalId: string): Promise<any> {
    return callEdgeFn('generate_from_signal', { signal_id: signalId });
  },

  /** Get latest world signals for feed button */
  async getWorldSignals(): Promise<EnginSignal[]> {
    const { data, error } = await supabase
      .from('ayn_world_signals')
      .select('id,headline,summary,signal_type,severity,region,created_at')
      .order('created_at', { ascending: false })
      .limit(10);
    if (error || !data) return [];
    return data.map(s => ({
      id: s.id,
      headline: s.headline,
      summary: s.summary || '',
      severity: (s.severity || 'medium') as EnginSignal['severity'],
      region: s.region || '',
      tags: [s.signal_type || ''],
      created_at: s.created_at || undefined,
    }));
  },
};

export { EnginError };
