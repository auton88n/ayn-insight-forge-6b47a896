import { AgentParticleField } from './AgentParticleField';
import { EnginAgent, EnginGraph } from '@/lib/enginApi';

interface Props {
  agents: EnginAgent[];
  graph: EnginGraph | null;
  emotions: Record<string, { emotion: string; intensity?: number }>;
  loading?: boolean;
  onSelectAgent?: (id: string) => void;
}

const LAYER_LABELS = [
  { num: 1, name: 'Economic Reality',      time: '0–24h',     color: '#f59e0b' },
  { num: 2, name: 'Institutional Response', time: '1–7 days',  color: '#3b82f6' },
  { num: 3, name: 'Corporate & Elite',      time: '1–7 days',  color: '#8b5cf6' },
  { num: 4, name: 'Narrative War',          time: '2–10 days', color: '#ef4444' },
  { num: 5, name: 'Community Reaction',     time: '1–4 weeks', color: '#10b981' },
  { num: 6, name: 'Human Behavior',         time: '2–8 weeks', color: '#ec4899' },
  { num: 7, name: 'Synthesis & Forecast',   time: '1–6 months',color: '#06b6d4' },
];

export function SimulationView({ agents, emotions, loading, onSelectAgent }: Props) {
  return (
    <div className="flex flex-col h-full min-h-0 gap-3">

      {/* Status strip */}
      <div className="flex items-center gap-4 px-4 py-2 rounded-xl bg-card/30 border border-border/30">
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${loading ? 'bg-amber-400 animate-pulse' : 'bg-cyan-400'}`} />
          <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground">
            {loading ? 'Simulation running…' : 'Agent Network'}
          </span>
        </div>
        <div className="text-[10px] font-mono text-muted-foreground/50">{agents.length} agents</div>
        {loading && (
          <div className="ml-auto flex gap-1">
            {LAYER_LABELS.map((l, i) => (
              <div key={l.num}
                className="w-1.5 h-4 rounded-sm opacity-40 animate-pulse"
                style={{ backgroundColor: l.color, animationDelay: `${i * 0.15}s` }}
              />
            ))}
          </div>
        )}
      </div>

      {/* Particle field */}
      <div className="flex-1 min-h-0 rounded-2xl border border-border/20 bg-background/20 overflow-hidden">
        <AgentParticleField agents={agents} emotions={emotions} loading={!!loading} />
      </div>

      {/* Layer timeline */}
      {loading && (
        <div className="grid grid-cols-7 gap-1">
          {LAYER_LABELS.map((l, i) => (
            <div key={l.num} className="text-center space-y-1">
              <div className="h-1 rounded-full animate-pulse" style={{ backgroundColor: l.color, opacity: 0.5, animationDelay: `${i * 0.2}s` }} />
              <div className="text-[8px] font-mono text-muted-foreground/40 truncate">L{l.num}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
