import { GraphCanvas } from './GraphCanvas';
import { EnginAgent, EnginGraph } from '@/lib/enginApi';

interface Props {
  agents: EnginAgent[];
  graph: EnginGraph | null;
  emotions: Record<string, { emotion: string; intensity?: number }>;
  loading?: boolean;
  onSelectAgent?: (id: string) => void;
}

export function SimulationView({ agents, graph, emotions, loading, onSelectAgent }: Props) {
  return (
    <div className="flex flex-col h-full min-h-0 gap-3">
      {/* Telemetry strip */}
      <div className="flex items-center gap-4 px-4 py-2.5 rounded-xl bg-card/40 border border-border/40">
        <div className="flex items-center gap-2">
          <span className={`w-1.5 h-1.5 rounded-full ${loading ? 'bg-amber-400 animate-pulse' : 'bg-cyan-400'}`} />
          <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground">Agent Network</span>
          <span className="text-[10px] font-mono text-muted-foreground/60">{agents.length} nodes</span>
        </div>
        <div className="ml-auto flex items-center gap-3">
          {loading ? (
            <>
              <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-amber-400">Simulating</span>
              <div className="w-32 h-1 bg-muted/30 rounded-full overflow-hidden">
                <div className="h-full bg-amber-400/60 animate-pulse rounded-full" style={{ width: '60%' }} />
              </div>
            </>
          ) : (
            <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-cyan-400">Ready</span>
          )}
        </div>
      </div>

      {/* Graph */}
      <div className="flex-1 min-h-0">
        <GraphCanvas agents={agents} graph={graph} emotions={emotions} onSelect={onSelectAgent} />
      </div>
    </div>
  );
}
