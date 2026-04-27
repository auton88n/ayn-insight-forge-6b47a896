import { cn } from '@/lib/utils';
import { ChevronRight } from 'lucide-react';
import { EnginSignal } from '@/lib/enginApi';

const SEV: Record<string, string> = {
  critical: 'text-red-400',
  high:     'text-orange-400',
  medium:   'text-amber-400',
  low:      'text-muted-foreground',
};

interface Props {
  signals: EnginSignal[];
  onClick?: (s: EnginSignal) => void;
}

export function SignalsTicker({ signals, onClick }: Props) {
  return (
    <div className="border-t border-border/40 bg-background/60 backdrop-blur-xl">
      <div className="px-4 py-2 flex items-center gap-2 border-b border-border/30">
        <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />
        <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground">Live Signals</span>
        <span className="text-[10px] font-mono text-muted-foreground/40">— click to react</span>
        <span className="ml-auto text-[10px] font-mono text-muted-foreground/40">{signals.length}</span>
      </div>
      <div className="max-h-32 overflow-y-auto divide-y divide-border/20">
        {signals.length === 0 && (
          <div className="px-4 py-3 text-xs font-mono text-muted-foreground/40">awaiting signals…</div>
        )}
        {signals.map(s => (
          <button key={s.id} onClick={() => onClick?.(s)}
            className="w-full text-left px-4 py-2 hover:bg-card/40 transition-colors flex items-center gap-3 group">
            <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', (SEV[s.severity || 'low'] || 'text-muted-foreground').replace('text-', 'bg-'))} />
            <span className="text-sm text-foreground truncate flex-1">{s.headline}</span>
            <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground/60 shrink-0 hidden sm:block">
              {s.region || ''} {s.tags?.slice(0, 2).join(' ')}
            </span>
            <ChevronRight className="w-3 h-3 text-muted-foreground/30 group-hover:text-foreground transition-colors shrink-0" />
          </button>
        ))}
      </div>
    </div>
  );
}
