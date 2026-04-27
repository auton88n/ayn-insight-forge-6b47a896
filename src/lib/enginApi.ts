/**
 * enginApi.ts — Client for the AYN ENGIN Python swarm-simulation backend.
 *
 * The deployed backend at engine.aynn.io is a synchronous single-session
 * engine with flat routes:
 *   POST /simulate   — run a full simulation (synchronous, ~15-20s)
 *   GET  /agents     — list all 77 world agents
 *   POST /chat       — chat with a specific agent
 *   POST /inject     — inject a signal into the engine
 *   GET  /health     — health check
 *
 * This file maps the backend's response shapes into the types the UI expects.
 */
import { ENGIN_URL } from '@/config';
import { supabase } from '@/integrations/supabase/client';

// ─── Types ──────────────────────────────────────────────────────────────────
export type AgentCategory =
  | 'government' | 'central_bank' | 'market' | 'bank'
  | 'company' | 'person' | 'institution' | 'stock_market' | 'other';

export interface EnginAgent {
  id: string;
  name: string;
  category: AgentCategory;
  country?: string;          // ISO3
  flag?: string;             // emoji or url
  emotion?: string;          // confident | worried | excited | …
  emotion_intensity?: number;// 0-100 from backend, normalized to 0-1 in adapter
  bio?: string;
  belief_score?: number;
  memory_count?: number;
}

export interface GraphNode { id: string; label: string; type?: string; weight?: number }
export interface GraphEdge { source: string; target: string; type?: string; weight?: number }
export interface EnginGraph { nodes: GraphNode[]; edges: GraphEdge[] }

export interface EnginSignal {
  id: string;
  turn?: number;
  region?: string;
  severity?: 'critical' | 'high' | 'medium' | 'low';
  headline: string;
  summary?: string;
  tags?: string[];
  created_at?: string;
}

export interface EnginReport {
  question: string;
  outcomes: { label: string; probability: number; rationale?: string }[];
  drivers: { label: string; weight: number; direction?: 'up' | 'down' | 'neutral' }[];
  confidence: number;       // 0-1
  summary: string;
  timeline?: { t: string; event: string }[];
  dissent?: { agent_id: string; agent_name: string; view: string }[];
}

export interface SimulationMeta {
  sim_id: string;
  status: 'pending' | 'building_graph' | 'running' | 'completed' | 'failed';
  question: string;
  seed_excerpt?: string;
  rounds_total?: number;
  rounds_done?: number;
  agent_count?: number;
  created_at?: string;
}

export interface CreateSimInput {
  seed: string;
  question: string;
  rounds?: number;
  agents?: number;
}

// ─── Backend response types ─────────────────────────────────────────────────

/** Raw message from POST /simulate */
interface BackendAgentMessage {
  agent_id: string;
  agent_name: string;
  agent_flag?: string;
  agent_category?: string;
  round: number;
  public_statement?: string;
  inner_thought?: string;
  concrete_action?: string;
  numerical_prediction?: string;
  belief_score?: number;
  belief_score_change?: number;
  emotion?: string;
  emotion_intensity?: number;
  response_time_seconds?: number;
}

/** Raw synthesis from POST /simulate */
interface BackendSynthesis {
  headline_outcome?: string;
  probability?: string;
  confidence_score?: number;
  top_predictions?: { prediction: string; probability: number; rationale?: string }[];
  winners?: string[];
  losers?: string[];
  key_risks?: string[];
  watch_indicators?: string[];
  human_impact?: string;
  error?: string;
}

/** Full response from POST /simulate */
export interface BackendSimResult {
  conversation_id: string;
  event: string;
  signal_type?: string;
  messages: BackendAgentMessage[];
  synthesis: BackendSynthesis;
  predictions: unknown[];
  avg_belief_score: number;
  financial_snapshot: Record<string, unknown>;
  duration_seconds: number;
}

/** Raw agent from GET /agents */
interface BackendAgent {
  id: string;
  name: string;
  flag?: string;
  category?: string;
  belief_score?: number;
  memory_count?: number;
}

// ─── Auth ───────────────────────────────────────────────────────────────────
async function authHeaders(): Promise<Record<string, string>> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;
    return token ? { Authorization: `Bearer ${token}` } : {};
  } catch {
    return {};
  }
}

// ─── Core fetch ─────────────────────────────────────────────────────────────
class EnginError extends Error {
  status: number;
  constructor(message: string, status: number) { super(message); this.status = status; }
}

async function call<T>(
  method: 'GET' | 'POST',
  path: string,
  body?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  const headers = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    ...(await authHeaders()),
  };
  const res = await fetch(`${ENGIN_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
    signal,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new EnginError(text || res.statusText || 'engin error', res.status);
  }
  return (await res.json()) as T;
}

// ─── Adapters ───────────────────────────────────────────────────────────────

/** Convert backend agent list into frontend EnginAgent[] */
function adaptAgents(raw: BackendAgent[]): EnginAgent[] {
  return raw.map(a => ({
    id: a.id,
    name: a.name,
    flag: a.flag,
    category: (a.category || 'other') as AgentCategory,
    belief_score: a.belief_score ?? 0,
    memory_count: a.memory_count ?? 0,
  }));
}

/** Merge per-round messages into enriched agents with last emotion */
function enrichAgentsFromMessages(
  baseAgents: EnginAgent[],
  messages: BackendAgentMessage[],
): { agents: EnginAgent[]; emotions: Record<string, { emotion: string; intensity?: number }> } {
  const emotionMap: Record<string, { emotion: string; intensity?: number }> = {};
  const agentData: Record<string, Partial<EnginAgent>> = {};

  for (const msg of messages) {
    // Keep latest round per agent
    agentData[msg.agent_id] = {
      emotion: msg.emotion || 'neutral',
      emotion_intensity: (msg.emotion_intensity ?? 50) / 100,
      bio: msg.public_statement || undefined,
    };
    emotionMap[msg.agent_id] = {
      emotion: msg.emotion || 'neutral',
      intensity: (msg.emotion_intensity ?? 50) / 100,
    };
  }

  const agents = baseAgents.map(a => ({
    ...a,
    ...(agentData[a.id] || {}),
  }));

  return { agents, emotions: emotionMap };
}

/** Build a synthetic graph from agents that spoke in the simulation */
function buildGraphFromMessages(messages: BackendAgentMessage[]): EnginGraph {
  const agentIds = [...new Set(messages.map(m => m.agent_id))];
  const nodes: GraphNode[] = agentIds.map(id => {
    const msg = messages.find(m => m.agent_id === id);
    return { id, label: msg?.agent_name || id, type: msg?.agent_category };
  });

  // Create edges between agents that spoke in the same round
  const rounds = new Map<number, string[]>();
  for (const m of messages) {
    const list = rounds.get(m.round) || [];
    list.push(m.agent_id);
    rounds.set(m.round, list);
  }

  const edgeSet = new Set<string>();
  const edges: GraphEdge[] = [];
  for (const ids of rounds.values()) {
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const key = [ids[i], ids[j]].sort().join('::');
        if (!edgeSet.has(key)) {
          edgeSet.add(key);
          edges.push({ source: ids[i], target: ids[j], type: 'round-peer' });
        }
      }
    }
  }

  return { nodes, edges };
}

/** Extract signals from agent messages (notable statements) */
function extractSignals(messages: BackendAgentMessage[], event: string): EnginSignal[] {
  const signals: EnginSignal[] = [];
  const seen = new Set<string>();

  for (const msg of messages) {
    if (!msg.concrete_action || msg.concrete_action === 'Waiting for more information') continue;
    const key = `${msg.agent_id}-${msg.round}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const intensity = (msg.emotion_intensity ?? 50);
    const severity: EnginSignal['severity'] =
      intensity >= 80 ? 'critical' :
      intensity >= 60 ? 'high' :
      intensity >= 40 ? 'medium' : 'low';

    signals.push({
      id: key,
      turn: msg.round,
      severity,
      headline: `${msg.agent_name}: ${msg.concrete_action}`,
      summary: msg.public_statement || undefined,
      tags: [msg.agent_category || 'other', msg.emotion || 'neutral'],
    });
  }

  return signals.slice(0, 50);
}

/** Convert backend synthesis into frontend EnginReport */
function adaptReport(synthesis: BackendSynthesis, question: string, messages: BackendAgentMessage[]): EnginReport {
  const confidence = (synthesis.confidence_score ?? 50) / 100;

  // Build outcomes from top_predictions
  const outcomes = (synthesis.top_predictions || []).map(p => ({
    label: p.prediction,
    probability: (p.probability ?? 50) / 100,
    rationale: p.rationale,
  }));

  // Build drivers from winners/losers/key_risks
  const drivers: EnginReport['drivers'] = [];
  for (const w of synthesis.winners || []) {
    drivers.push({ label: w, weight: 0.7, direction: 'up' as const });
  }
  for (const l of synthesis.losers || []) {
    drivers.push({ label: l, weight: 0.6, direction: 'down' as const });
  }
  for (const r of synthesis.key_risks || []) {
    drivers.push({ label: r, weight: 0.5, direction: 'neutral' as const });
  }

  // Summary from headline + human_impact
  const summaryParts = [synthesis.headline_outcome, synthesis.human_impact].filter(Boolean);
  const summary = summaryParts.join(' — ') || 'Simulation complete — see individual agent responses.';

  // Build dissent from agents with strong negative emotions
  const dissent = messages
    .filter(m => ['worried', 'panicked', 'angry', 'suspicious'].includes(m.emotion || ''))
    .slice(0, 5)
    .map(m => ({
      agent_id: m.agent_id,
      agent_name: m.agent_name,
      view: m.public_statement || m.inner_thought || '',
    }));

  return {
    question,
    outcomes,
    drivers,
    confidence,
    summary,
    dissent: dissent.length > 0 ? dissent : undefined,
  };
}

// ─── Public API ─────────────────────────────────────────────────────────────
export const enginApi = {
  /**
   * Fetch all world agents from GET /agents.
   * Returns the full roster (77 agents). No sim_id needed.
   */
  async getAgents(): Promise<EnginAgent[]> {
    const raw = await call<{ agents: BackendAgent[] }>('GET', '/agents');
    return adaptAgents(raw.agents);
  },

  /**
   * Run a full synchronous simulation via POST /simulate.
   * Takes ~15-20s. Returns the complete result including messages, synthesis, etc.
   */
  async runSimulation(
    input: CreateSimInput,
    signal?: AbortSignal,
  ): Promise<{
    result: BackendSimResult;
    agents: EnginAgent[];
    emotions: Record<string, { emotion: string; intensity?: number }>;
    graph: EnginGraph;
    signals: EnginSignal[];
    report: EnginReport;
  }> {
    // Combine seed + question into the "event" field the backend expects
    const event = `${input.seed}\n\nQuestion: ${input.question}`;

    const result = await call<BackendSimResult>('POST', '/simulate', {
      event,
      mode: 'full',
    }, signal);

    // Fetch base agents first, then enrich with simulation data
    let baseAgents: EnginAgent[];
    try {
      baseAgents = await this.getAgents();
    } catch {
      // If /agents fails, build from messages
      baseAgents = [...new Set(result.messages.map(m => m.agent_id))].map(id => {
        const msg = result.messages.find(m => m.agent_id === id)!;
        return {
          id,
          name: msg.agent_name,
          flag: msg.agent_flag,
          category: (msg.agent_category || 'other') as AgentCategory,
        };
      });
    }

    const { agents, emotions } = enrichAgentsFromMessages(baseAgents, result.messages);
    const graph = buildGraphFromMessages(result.messages);
    const signals = extractSignals(result.messages, result.event);
    const report = adaptReport(result.synthesis, input.question, result.messages);

    return { result, agents, emotions, graph, signals, report };
  },

  /**
   * Chat with a specific agent via POST /chat.
   */
  async chatWithAgent(agentId: string, message: string, history: { role: string; content: string }[] = []): Promise<{ reply: string }> {
    const res = await call<{ reply?: string; response?: string; message?: string }>('POST', '/chat', {
      agent_id: agentId,
      message,
      history,
    });
    return { reply: res.reply || res.response || res.message || '[no response]' };
  },

  /**
   * Inject a signal into the engine via POST /inject.
   */
  async inject(event: string, signalHeadline?: string): Promise<{ ok: true }> {
    await call('POST', '/inject', {
      mode: 'inject_event',
      event,
      signal_headline: signalHeadline,
    });
    return { ok: true };
  },

  /**
   * Health check via GET /health.
   */
  async health(): Promise<{ status: string; engine_ready: boolean; agent_count: number }> {
    return call('GET', '/health');
  },
};

export { EnginError };
