/**
 * useEnginSim — orchestrates the simulator lifecycle:
 *   idle (seed) → graph (loading agents) → simulate (running) → completed (report)
 *
 * The backend at engine.aynn.io is synchronous — POST /simulate takes ~15-20s
 * and returns the full result. We simulate turn progress client-side for UX.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  enginApi, EnginAgent, EnginGraph, EnginReport, EnginSignal,
  SimulationMeta, CreateSimInput, BackendSimResult,
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
  /** The raw backend result, kept for reference (e.g. conversation_id for chat) */
  rawResult: BackendSimResult | null;
}

const initial: SimState = {
  stage: 'seed',
  meta: null, graph: null, agents: [], signals: [], emotions: {},
  turn: 0, totalTurns: 0, report: null,
  loading: false, error: null,
  rawResult: null,
};

export function useEnginSim() {
  const [s, setS] = useState<SimState>(initial);
  const abortRef = useRef<AbortController | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    if (tickRef.current) clearInterval(tickRef.current);
    tickRef.current = null;
    setS(initial);
  }, []);

  // Cleanup on unmount
  useEffect(() => () => {
    abortRef.current?.abort();
    if (tickRef.current) clearInterval(tickRef.current);
  }, []);

  const goToStage = useCallback((stage: SimStage) => setS(p => ({ ...p, stage })), []);

  const start = useCallback(async (input: CreateSimInput) => {
    // Abort any previous run
    abortRef.current?.abort();
    if (tickRef.current) clearInterval(tickRef.current);

    const controller = new AbortController();
    abortRef.current = controller;

    const estimatedTurns = input.rounds || 20;
    setS(p => ({
      ...p,
      loading: true,
      error: null,
      stage: 'graph',
      totalTurns: estimatedTurns,
      turn: 0,
    }));

    try {
      // 1. Immediately fetch the agent roster to populate the sidebar
      let baseAgents: EnginAgent[] = [];
      try {
        baseAgents = await enginApi.getAgents();
        setS(p => ({
          ...p,
          agents: baseAgents,
          stage: 'simulate',
        }));
      } catch {
        // Non-fatal — we'll get agents from the simulation result
        setS(p => ({ ...p, stage: 'simulate' }));
      }

      // 2. Start client-side progress ticker while we wait for the sync call
      const startTime = Date.now();
      const estimatedMs = 18_000; // ~18 seconds typical
      tickRef.current = setInterval(() => {
        const elapsed = Date.now() - startTime;
        const progress = Math.min(elapsed / estimatedMs, 0.95);
        const fakeTurn = Math.floor(progress * estimatedTurns);
        setS(p => ({ ...p, turn: Math.max(p.turn, fakeTurn) }));
      }, 500);

      // 3. Run the simulation (synchronous ~15-20s call)
      const { agents, emotions, graph, signals, report, result } =
        await enginApi.runSimulation(input, controller.signal);

      // 4. Clear the ticker
      if (tickRef.current) clearInterval(tickRef.current);
      tickRef.current = null;

      // 5. Update state with full results
      setS(p => ({
        ...p,
        agents,
        emotions,
        graph,
        signals,
        report,
        rawResult: result,
        meta: {
          sim_id: result.conversation_id,
          status: 'completed',
          question: input.question,
          seed_excerpt: input.seed.slice(0, 120),
          rounds_total: estimatedTurns,
          rounds_done: estimatedTurns,
          agent_count: agents.length,
          created_at: new Date().toISOString(),
        },
        turn: estimatedTurns,
        totalTurns: estimatedTurns,
        stage: 'report',
        loading: false,
      }));

      toast.success('Simulation complete', {
        description: `${agents.length} agents responded in ${result.duration_seconds}s`,
      });
    } catch (err: unknown) {
      if (tickRef.current) clearInterval(tickRef.current);
      tickRef.current = null;

      // Don't show error if we aborted intentionally
      if (err instanceof DOMException && err.name === 'AbortError') return;

      const msg = err instanceof Error ? err.message : 'Engine unavailable';
      toast.error('Engine offline', {
        description: 'Could not reach engine.aynn.io. Check VITE_ENGIN_URL or backend status.',
      });
      setS(p => ({ ...p, loading: false, error: msg, stage: 'seed' }));
    }
  }, []);

  return { state: s, start, reset, goToStage };
}
