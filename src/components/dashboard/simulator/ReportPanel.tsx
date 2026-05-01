import { TrendingUp, TrendingDown, Minus, MessageCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { EnginReport } from '@/lib/enginApi';

interface Props {
  report: EnginReport | null;
  onChatReport: () => void;
}

export function ReportPanel({ report: reportProp, onChatReport }: Props) {
  // Loose typing: report shape evolves with simulator backend
  const report = reportProp as any;
  if (!report) {
    return (
      <div className="grid place-items-center h-full text-xs font-mono text-muted-foreground/50">
        waiting for the swarm to converge…
      </div>
    );
  }

  return (
    <div className="overflow-y-auto h-full p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start gap-4">
        <div className="flex-1">
          <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-muted-foreground/60 mb-1">stage 04 · prediction report</p>
          <h2 className="text-2xl font-display font-bold text-foreground">{report.question}</h2>
        </div>
        <button onClick={onChatReport}
          className="flex items-center gap-2 px-3 py-2 rounded-xl bg-primary/10 border border-primary/30 text-primary text-xs font-mono uppercase tracking-wider hover:bg-primary/20 transition-all">
          <MessageCircle className="w-3.5 h-3.5" /> ask the report
        </button>
      </div>

      {/* Confidence */}
      <div className="rounded-2xl border border-border/40 bg-card/40 p-5">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground">Confidence</span>
          <span className="text-2xl font-display font-bold text-foreground">{Math.round(report.confidence * 100)}%</span>
        </div>
        <div className="h-1.5 bg-muted/30 rounded-full overflow-hidden">
          <div className="h-full bg-gradient-to-r from-cyan-400 to-violet-400" style={{ width: `${report.confidence * 100}%` }} />
        </div>
        <p className="text-sm text-muted-foreground/80 leading-relaxed mt-4">{report.summary}</p>
      </div>

      {/* Outcomes */}
      <div className="space-y-2">
        <p className="text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground/60">Outcomes</p>
        {report.outcomes?.map((o, i) => (
          <div key={i} className="rounded-xl border border-border/40 bg-card/30 p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-semibold text-foreground">{o.label}</span>
              <span className="text-sm font-mono text-foreground">{Math.round(o.probability * 100)}%</span>
            </div>
            <div className="h-1 bg-muted/30 rounded-full overflow-hidden mb-2">
              <div className="h-full bg-primary" style={{ width: `${o.probability * 100}%` }} />
            </div>
            {o.rationale && <p className="text-xs text-muted-foreground/70 leading-relaxed">{o.rationale}</p>}
          </div>
        ))}
      </div>

      {/* Drivers */}
      {report.drivers?.length > 0 && (
        <div className="space-y-2">
          <p className="text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground/60">Key drivers</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {report.drivers.map((d, i) => {
              const Icon = d.direction === 'down' ? TrendingDown : d.direction === 'neutral' ? Minus : TrendingUp;
              const cls  = d.direction === 'down' ? 'text-red-400' : d.direction === 'neutral' ? 'text-muted-foreground' : 'text-emerald-400';
              return (
                <div key={i} className="rounded-xl border border-border/40 bg-card/30 p-3 flex items-center gap-3">
                  <Icon className={cn('w-4 h-4', cls)} />
                  <span className="text-sm text-foreground flex-1">{d.label}</span>
                  <span className="text-xs font-mono text-muted-foreground/60">{Math.round(d.weight * 100)}%</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Timeline */}
      {report.timeline && report.timeline.length > 0 && (
        <div className="space-y-2">
          <p className="text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground/60">Timeline</p>
          <div className="space-y-1.5">
            {report.timeline.map((t, i) => (
              <div key={i} className="flex gap-3 text-sm">
                <span className="text-xs font-mono text-muted-foreground/60 w-20 shrink-0 pt-0.5">{t.t}</span>
                <span className="text-foreground/80">{t.event}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
