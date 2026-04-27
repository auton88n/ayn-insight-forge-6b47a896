import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SimStage } from './useEnginSim';

const STAGES: { id: SimStage; label: string }[] = [
  { id: 'seed',     label: 'Seed' },
  { id: 'graph',    label: 'Graph' },
  { id: 'simulate', label: 'Simulate' },
  { id: 'report',   label: 'Report' },
  { id: 'chat',     label: 'Chat' },
];

interface Props {
  stage: SimStage;
  onReset: () => void;
}

export function StageStepper({ stage, onReset }: Props) {
  const idx = STAGES.findIndex(s => s.id === stage);
  return (
    <div className="flex items-center gap-2 sm:gap-4 px-4 sm:px-6 py-3 border-b border-border/40 bg-background/60 backdrop-blur-xl overflow-x-auto">
      {STAGES.map((s, i) => {
        const done    = i < idx;
        const current = i === idx;
        return (
          <div key={s.id} className="flex items-center gap-2 sm:gap-3 shrink-0">
            <div className={cn(
              'w-6 h-6 rounded-full grid place-items-center text-[10px] font-mono font-bold border transition-all',
              done    && 'bg-primary text-primary-foreground border-primary',
              current && 'bg-primary/15 text-primary border-primary/60 ring-2 ring-primary/20',
              !done && !current && 'bg-card/40 text-muted-foreground/60 border-border/40',
            )}>
              {done ? <Check className="w-3 h-3" /> : (i + 1).toString().padStart(2, '0')}
            </div>
            <span className={cn(
              'text-[11px] font-mono uppercase tracking-[0.2em] hidden sm:inline',
              current ? 'text-foreground' : done ? 'text-muted-foreground' : 'text-muted-foreground/40',
            )}>
              {s.label}
            </span>
            {i < STAGES.length - 1 && (
              <span className={cn('w-6 sm:w-10 h-px', done ? 'bg-primary/60' : 'bg-border/40')} />
            )}
          </div>
        );
      })}
      <button onClick={onReset}
        className="ml-auto text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground hover:text-foreground transition-colors shrink-0">
        reset
      </button>
    </div>
  );
}
