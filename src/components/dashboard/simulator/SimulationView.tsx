import { GraphCanvas } from './GraphCanvas';
import { AgentActivityFeed } from './AgentActivityFeed';
import { EnginAgent, EnginGraph } from '@/lib/enginApi';

interface Props {
  agents: EnginAgent[];
  graph:  EnginGraph | null;
  emotions: Record<string, { emotion: string; intensity?: number }>;
  loading?: boolean;
  onSelectAgent?: (id: string) => void;
}

const LAYERS = [
  { n:1, label:'Economic',       color:'#f59e0b' },
  { n:2, label:'Institutional',  color:'#3b82f6' },
  { n:3, label:'Elite',          color:'#8b5cf6' },
  { n:4, label:'Narrative',      color:'#ef4444' },
  { n:5, label:'Community',      color:'#10b981' },
  { n:6, label:'Human',          color:'#ec4899' },
  { n:7, label:'Synthesis',      color:'#06b6d4' },
];

export function SimulationView({ agents, graph, emotions, loading, onSelectAgent }: Props) {
  return (
    <div className="flex flex-col h-full min-h-0 gap-2">

      {/* Status bar */}
      <div className="flex items-center gap-3 px-3 py-2 rounded-xl bg-card/30 border border-border/30 shrink-0">
        <span className={`w-2 h-2 rounded-full shrink-0 ${loading ? 'bg-amber-400 animate-pulse' : agents.length > 0 ? 'bg-cyan-400' : 'bg-slate-600'}`} />
        <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground">
          {loading ? 'Simulation running…' : agents.length > 0 ? 'Agent Network Ready' : 'Awaiting agents'}
        </span>
        <span className="text-[10px] font-mono text-muted-foreground/40">{agents.length} nodes</span>

        {/* Layer progress bars */}
        {loading && (
          <div className="ml-auto flex items-end gap-0.5 h-5">
            {LAYERS.map((l, i) => (
              <div key={l.n} className="flex flex-col items-center gap-0.5">
                <div className="w-3 rounded-sm animate-pulse"
                  style={{
                    backgroundColor: l.color,
                    height: `${8 + i * 2}px`,
                    opacity: 0.5,
                    animationDelay: `${i * 0.18}s`,
                  }} />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Main 2-panel view */}
      <div className="flex-1 min-h-0 grid grid-cols-[1fr_280px] gap-2">

        {/* Left — force graph */}
        <div className="rounded-2xl border border-border/20 bg-black/20 overflow-hidden">
          <GraphCanvas
            agents={agents}
            graph={graph}
            emotions={emotions}
            onSelect={onSelectAgent}
          />
        </div>

        {/* Right — live activity feed */}
        <div className="rounded-2xl border border-border/20 bg-card/10 overflow-hidden">
          <AgentActivityFeed
            agents={agents}
            emotions={emotions}
            loading={!!loading}
          />
        </div>
      </div>

      {/* Layer legend */}
      <div className="flex items-center gap-3 px-1 shrink-0 flex-wrap">
        {LAYERS.map(l => (
          <div key={l.n} className="flex items-center gap-1">
            <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: l.color }} />
            <span className="text-[9px] font-mono text-muted-foreground/40">L{l.n} {l.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
