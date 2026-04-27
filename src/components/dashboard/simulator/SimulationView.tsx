import { GraphCanvas } from './GraphCanvas';
import { EnginAgent, EnginGraph } from '@/lib/enginApi';

interface Props {
  agents: EnginAgent[];
  graph: EnginGraph | null;
  emotions: Record<string, { emotion: string; intensity?: number }>;
  turn: number;
  totalTurns: number;
  onSelectAgent?: (id: string) => void;
}

export function SimulationView({ agents, graph, emotions, turn, totalTurns, onSelectAgent }: Props) {
  const pct = totalTurns > 0 ? Math.min(100, (turn / totalTurns) * 100) : 0;
  return (
    <div className="flex flex-col h-full min-h-0 gap-3">
      {/* Telemetry strip */}
      <div className="flex items-center gap-4 px-4 py-2.5 rounded-xl bg-card/40 border border-border/40">
        <div className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
          <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground">Agent Network</span>
          <span className="text-[10px] font-mono text-muted-foreground/60">{agents.length} nodes</span>
        </div>
        <div className="ml-auto flex items-center gap-3">
          <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground">Turn</span>
          <span className="text-sm font-mono text-foreground">{turn} / {totalTurns || '—'}</span>
          <div className="w-32 h-1 bg-muted/30 rounded-full overflow-hidden">
            <div className="h-full bg-primary transition-all duration-500" style={{ width: `${pct}%` }} />
          </div>
        </div>
      </div>

      {/* Graph */}
      <div className="flex-1 min-h-0">
        <GraphCanvas agents={agents} graph={graph} emotions={emotions} onSelect={onSelectAgent} />
      </div>
    </div>
  );
}
