import { useMemo, useState } from 'react';
import { Building2, Banknote, BarChart3, Building, Briefcase, Users, Globe2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { EnginAgent, AgentCategory } from '@/lib/enginApi';

const CATS: { id: AgentCategory | 'all'; label: string; icon: typeof Building2 }[] = [
  { id: 'all',          label: 'ALL',           icon: Globe2 },
  { id: 'government',   label: 'GOVERNMENTS',   icon: Building2 },
  { id: 'central_bank', label: 'CENTRAL BANKS', icon: Banknote },
  { id: 'market',       label: 'MARKETS',       icon: BarChart3 },
  { id: 'bank',         label: 'BANKS',         icon: Building },
  { id: 'company',      label: 'COMPANIES',     icon: Briefcase },
  { id: 'person',       label: 'PEOPLE',        icon: Users },
];

const EMO_COLOR: Record<string, string> = {
  confident:  'text-emerald-400',
  worried:    'text-amber-400',
  excited:    'text-cyan-400',
  panicked:   'text-red-400',
  angry:      'text-red-500',
  suspicious: 'text-violet-400',
  happy:      'text-yellow-400',
  sad:        'text-blue-400',
  neutral:    'text-muted-foreground',
};

const EMO_BARS: Record<string, number> = {
  panicked: 4, angry: 4, excited: 4, confident: 3, happy: 3, worried: 3, suspicious: 2, sad: 2, neutral: 1,
};

interface Props {
  agents: EnginAgent[];
  emotions: Record<string, { emotion: string; intensity?: number }>;
  selectedId?: string | null;
  onSelect: (a: EnginAgent) => void;
}

export function AgentRoster({ agents, emotions, selectedId, onSelect }: Props) {
  const [filter, setFilter] = useState<AgentCategory | 'all'>('all');

  const counts = useMemo(() => {
    const m: Record<string, number> = { all: agents.length };
    for (const a of agents) m[a.category] = (m[a.category] || 0) + 1;
    return m;
  }, [agents]);

  const list = filter === 'all' ? agents : agents.filter(a => a.category === filter);

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Category chips */}
      <div className="flex flex-wrap gap-1.5 p-3 border-b border-border/40">
        {CATS.map(({ id, label, icon: Icon }) => {
          const c = counts[id] ?? 0;
          if (id !== 'all' && c === 0) return null;
          const active = filter === id;
          return (
            <button key={id} onClick={() => setFilter(id)}
              className={cn(
                'flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-mono uppercase tracking-wider border transition-all',
                active
                  ? 'bg-primary/15 border-primary/40 text-primary'
                  : 'bg-card/30 border-border/30 text-muted-foreground hover:text-foreground hover:border-border/60',
              )}>
              <Icon className="w-3 h-3" />{label} <span className="opacity-60">{c}</span>
            </button>
          );
        })}
      </div>

      {/* Agents header */}
      <div className="px-4 py-3 flex items-center gap-2 border-b border-border/40">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
        <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground">Agents</span>
        <span className="ml-auto text-[10px] font-mono text-muted-foreground/60">{list.length}</span>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
        {list.length === 0 && (
          <div className="text-center py-8 text-xs font-mono text-muted-foreground/40">awaiting agents…</div>
        )}
        {list.map(a => {
          const emo = emotions[a.id]?.emotion || a.emotion || 'neutral';
          const emoCls = EMO_COLOR[emo] || 'text-muted-foreground';
          const bars = EMO_BARS[emo] ?? 2;
          const isSel = a.id === selectedId;
          return (
            <button key={a.id} onClick={() => onSelect(a)}
              className={cn(
                'w-full text-left rounded-xl border bg-card/40 hover:bg-card/70 px-3 py-2.5 transition-all flex items-center gap-3 group',
                isSel ? 'border-primary/60 bg-primary/5' : 'border-border/40 hover:border-border/70',
              )}>
              <span className="text-lg leading-none w-6 text-center shrink-0">{a.flag || '◉'}</span>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-foreground truncate">{a.name}</div>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className="text-[9px] font-mono uppercase tracking-wider text-muted-foreground/70">{a.category.replace('_', ' ')}</span>
                  {a.country && <span className="text-[9px] font-mono text-muted-foreground/40">· {a.country}</span>}
                </div>
              </div>
              <div className="text-right shrink-0">
                <div className={cn('text-[10px] font-mono capitalize', emoCls)}>{emo}</div>
                <div className="flex gap-0.5 justify-end mt-1">
                  {[1,2,3,4].map(i => (
                    <span key={i} className={cn('w-1 h-2.5 rounded-sm', i <= bars ? emoCls.replace('text-', 'bg-') : 'bg-muted/30')} />
                  ))}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
