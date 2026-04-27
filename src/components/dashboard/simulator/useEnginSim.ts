/**
 * useEnginSim — orchestrates the MiroFish-style simulator lifecycle:
 *   idle → building_graph → running → completed
 * Wraps enginApi with React state.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  enginApi, EnginAgent, EnginGraph, EnginReport, EnginSignal,
  SimulationMeta, CreateSimInput,
} from '@/lib/enginApi';

export type SimStage = 'seed' | 'graph' | 'simulate' | 'report' | 'chat';

export interface SimState {
  stage: SimStage;
  meta: SimulationMeta | null;
  graph: EnginGraph | null;
  agents: EnginAgent[];
  signals: EnginSignal[];
  emotions: Record<string, { emotion: string; intensity?: number }>;
  turn: number;
  totalTurns: number;
  report: EnginReport | null;
  loading: boolean;
  error: string | null;
}

const initial: SimState = {
  stage: 'seed',
  meta: null, graph: null, agents: [], signals: [], emotions: {},
  turn: 0, totalTurns: 0, report: null,
  loading: false, error: null,
};

export function useEnginSim() {
  const [s, setS] = useState<SimState>(initial);
  const esRef = useRef<EventSource | null>(null);

  const reset = useCallback(() => {
    esRef.current?.close();
    esRef.current = null;
    setS(initial);
  }, []);

  useEffect(() => () => { esRef.current?.close(); }, []);

  const goToStage = useCallback((stage: SimStage) => setS(p => ({ ...p, stage })), []);

  const start = useCallback(async (input: CreateSimInput) => {
    setS(p => ({ ...p, loading: true, error: null, stage: 'graph' }));
    try {
      const meta = await enginApi.createSimulation(input);
      setS(p => ({ ...p, meta, totalTurns: meta.rounds_total || input.rounds || 0 }));

      // Build graph + agents in parallel (best-effort)
      const [graph, agents] = await Promise.all([
        enginApi.getGraph(meta.sim_id).catch(() => ({ nodes: [], edges: [] }) as EnginGraph),
        enginApi.getAgents(meta.sim_id).catch(() => [] as EnginAgent[]),
      ]);
      setS(p => ({ ...p, graph, agents, stage: 'simulate' }));

      // Open SSE
      const es = enginApi.openStream(meta.sim_id, {
        onTurn:    (e) => setS(p => ({ ...p, turn: e.turn, totalTurns: e.total || p.totalTurns })),
        onSignal:  (sig) => setS(p => ({ ...p, signals: [sig, ...p.signals].slice(0, 50) })),
        onEmotion: (e) => setS(p => ({ ...p, emotions: { ...p.emotions, [e.agent_id]: { emotion: e.emotion, intensity: e.intensity } } })),
        onDone:    async ({ report }) => {
          let final = report;
          if (!final) {
            try { final = await enginApi.getReport(meta.sim_id); } catch {/* ignore */}
          }
          setS(p => ({ ...p, report: final ?? p.report, stage: 'report', loading: false }));
        },
        onError:   () => {/* SSE closes automatically; we leave state as-is */},
      });
      esRef.current = es;
      if (!es) {
        // SSE unavailable — poll the report endpoint as a fallback
        try {
          const rep = await enginApi.getReport(meta.sim_id);
          setS(p => ({ ...p, report: rep, stage: 'report', loading: false }));
        } catch {
          setS(p => ({ ...p, loading: false }));
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Engine unavailable';
      toast.error('Engin offline', { description: 'Could not reach engin.aynn.io. Check VITE_ENGIN_URL or backend status.' });
      setS(p => ({ ...p, loading: false, error: msg, stage: 'seed' }));
    }
  }, []);

  return { state: s, start, reset, goToStage };
}
