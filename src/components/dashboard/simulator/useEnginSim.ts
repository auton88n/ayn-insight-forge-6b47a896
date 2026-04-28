/**
 * useEnginSim — orchestrates the AYN simulation lifecycle.
 * Uses enginApi.runSimulation() → POST /simulate (synchronous, returns everything).
 */
import { useCallback, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  enginApi, EnginAgent, EnginGraph, EnginReport, EnginSignal,
  CreateSimInput,
} from '@/lib/enginApi';

export type SimStage = 'seed' | 'graph' | 'simulate' | 'report' | 'chat';

export interface SimState {
  stage: SimStage;
  graph: EnginGraph | null;
  agents: EnginAgent[];
  signals: EnginSignal[];
  emotions: Record<string, { emotion: string; intensity?: number }>;
  report: EnginReport | null;
  loading: boolean;
  error: string | null;
}

const initial: SimState = {
  stage: 'seed',
  graph: null,
  agents: [],
  signals: [],
  emotions: {},
  report: null,
  loading: false,
  error: null,
};

export function useEnginSim() {
  const [s, setS] = useState<SimState>(initial);
  const abortRef = useRef<AbortController | null>(null);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setS(initial);
  }, []);

  const goToStage = useCallback((stage: SimStage) => setS(p => ({ ...p, stage })), []);

  const start = useCallback(async (input: CreateSimInput) => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    setS(p => ({ ...p, loading: true, error: null, stage: 'graph', agents: [], signals: [], emotions: {}, graph: null, report: null }));

    try {
      // Show agents immediately while simulation runs
      try {
        const agents = await enginApi.getAgents();
        setS(p => ({ ...p, agents, stage: 'simulate' }));
      } catch {
        setS(p => ({ ...p, stage: 'simulate' }));
      }

      // Run the full simulation — synchronous, takes ~15-20s
      const { agents, emotions, graph, signals, report } = await enginApi.runSimulation(input, ctrl.signal);

      if (ctrl.signal.aborted) return;

      setS(p => ({
        ...p,
        agents,
        emotions,
        graph,
        signals,
        report,
        stage: 'report',
        loading: false,
        error: null,
      }));

    } catch (err: unknown) {
      if ((err as { name?: string }).name === 'AbortError') return;
      const msg = err instanceof Error ? err.message : 'Engine unavailable';
      const isCors = msg === 'Failed to fetch' || msg.includes('NetworkError') || msg.includes('CORS');
      const description = isCors
        ? 'CORS blocked — engine is running but browser rejected the request. Check Railway ALLOWED_ORIGINS.'
        : `Engine error: ${msg}`;
      toast.error('Simulation failed', { description });
      setS(p => ({ ...p, loading: false, error: msg, stage: 'seed' }));
    }
  }, []);

  return { state: s, start, reset, goToStage };
}
