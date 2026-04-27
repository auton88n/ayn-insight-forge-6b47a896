/**
 * enginApi.ts — Client for the AYN ENGIN Python swarm-simulation backend
 * (MiroFish-style: Seed → Graph → Simulate → Report → Chat).
 *
 * Single source of truth for all calls to engin.aynn.io. If the Python
 * routes change, only this file changes.
 */
import { ENGIN_URL } from '@/config';
import { supabase } from '@/integrations/supabase/client';

// ─── Types ──────────────────────────────────────────────────────────────────
export type AgentCategory =
  | 'government' | 'central_bank' | 'market' | 'bank'
  | 'company' | 'person' | 'institution' | 'other';

export interface EnginAgent {
  id: string;
  name: string;
  category: AgentCategory;
  country?: string;          // ISO3
  flag?: string;             // emoji or url
  emotion?: string;          // confident | worried | excited | …
  emotion_intensity?: number;// 0-1
  bio?: string;
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

// ─── Public API ─────────────────────────────────────────────────────────────
export const enginApi = {
  async createSimulation(input: CreateSimInput): Promise<SimulationMeta> {
    return call('POST', '/simulations', input);
  },
  async getSimulation(simId: string): Promise<SimulationMeta> {
    return call('GET', `/simulations/${simId}`);
  },
  async getGraph(simId: string): Promise<EnginGraph> {
    return call('GET', `/simulations/${simId}/graph`);
  },
  async getAgents(simId: string): Promise<EnginAgent[]> {
    return call('GET', `/simulations/${simId}/agents`);
  },
  async getReport(simId: string): Promise<EnginReport> {
    return call('GET', `/simulations/${simId}/report`);
  },
  async chatWithAgent(simId: string, agentId: string, message: string): Promise<{ reply: string }> {
    return call('POST', `/simulations/${simId}/agents/${agentId}/chat`, { message });
  },
  async chatWithReport(simId: string, message: string): Promise<{ reply: string }> {
    return call('POST', `/simulations/${simId}/report/chat`, { message });
  },
  async inject(simId: string, variable: string, value: unknown): Promise<{ ok: true }> {
    return call('POST', `/simulations/${simId}/inject`, { variable, value });
  },

  /**
   * Open SSE stream of simulation events. Returns the EventSource so the
   * caller can close it. Falls back gracefully if endpoint missing.
   */
  openStream(
    simId: string,
    handlers: {
      onTurn?: (e: { turn: number; total: number }) => void;
      onSignal?: (e: EnginSignal) => void;
      onEmotion?: (e: { agent_id: string; emotion: string; intensity?: number }) => void;
      onDone?: (e: { report?: EnginReport }) => void;
      onError?: (err: Event) => void;
    },
  ): EventSource | null {
    if (typeof window === 'undefined' || typeof EventSource === 'undefined') return null;
    const url = `${ENGIN_URL}/simulations/${simId}/stream`;
    let es: EventSource;
    try { es = new EventSource(url, { withCredentials: false }); } catch { return null; }

    const safeJSON = <T,>(d: string): T | null => { try { return JSON.parse(d) as T; } catch { return null; } };

    es.addEventListener('turn',    (ev: MessageEvent) => { const d = safeJSON<{ turn: number; total: number }>(ev.data); if (d) handlers.onTurn?.(d); });
    es.addEventListener('signal',  (ev: MessageEvent) => { const d = safeJSON<EnginSignal>(ev.data);                if (d) handlers.onSignal?.(d); });
    es.addEventListener('emotion', (ev: MessageEvent) => { const d = safeJSON<{ agent_id: string; emotion: string; intensity?: number }>(ev.data); if (d) handlers.onEmotion?.(d); });
    es.addEventListener('done',    (ev: MessageEvent) => { const d = safeJSON<{ report?: EnginReport }>(ev.data) || {}; handlers.onDone?.(d); es.close(); });
    es.onerror = (e) => { handlers.onError?.(e); };

    return es;
  },
};

export { EnginError };
