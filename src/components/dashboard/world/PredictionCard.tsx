import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';
import { ArrowUpRight, ArrowDownRight, Minus, ThumbsUp, ThumbsDown } from 'lucide-react';

const ASSET_META: Record<string, { label: string; unit: string; icon: string; color: string }> = {
  gold:    { label: 'Gold',        unit: '/oz',  icon: '🥇', color: 'text-amber-400' },
  silver:  { label: 'Silver',      unit: '/oz',  icon: '🥈', color: 'text-slate-300' },
  oil:     { label: 'Brent Crude', unit: '/bbl', icon: '🛢️', color: 'text-orange-400' },
  btc:     { label: 'Bitcoin',     unit: '',     icon: '₿',  color: 'text-yellow-400' },
  eth:     { label: 'Ethereum',    unit: '',     icon: 'Ξ',  color: 'text-blue-400' },
  copper:  { label: 'Copper',      unit: '/mt',  icon: '🔶', color: 'text-orange-300' },
  wheat:   { label: 'Wheat',       unit: '/mt',  icon: '🌾', color: 'text-yellow-300' },
  usd_jpy: { label: 'USD/JPY',     unit: '',     icon: '¥',  color: 'text-cyan-400' },
};

interface Prediction {
  id: string; asset: string; horizon: string; target_date: string;
  baseline_value: number; predicted_value: number;
  predicted_low: number; predicted_high: number;
  predicted_direction: 'up' | 'down' | 'sideways';
  predicted_pct_change: number; confidence: number; reasoning: string; calibration?: { real_accuracy_pct: number; reliability_tier: string; should_show_uncertainty: boolean; calibration_factor: number } | null;
  agree_count?: number; disagree_count?: number; user_vote?: 'agree' | 'disagree' | null;
  consensus_strength?: string; agreement?: boolean | null; fusion_method?: string; boost_factor?: string | null; generated_by?: string | null;
}



function PredictionCard({ pred, onVote, userId, voting }: {
  pred: Prediction;
  onVote: (id: string, vote: 'agree' | 'disagree') => void;
  userId?: string;
  voting: boolean;
}) {
  const meta = ASSET_META[pred.asset] || { label: pred.asset.toUpperCase(), unit: '', icon: '📊', color: 'text-white' };
  const isUp = pred.predicted_direction === 'up';
  const isDown = pred.predicted_direction === 'down';
  const dirColor = isUp ? 'text-emerald-400' : isDown ? 'text-red-400' : 'text-amber-400';

  const low = pred.predicted_low || pred.predicted_value * 0.95;
  const high = pred.predicted_high || pred.predicted_value * 1.05;
  const range = high - low;
  const currentPct = range > 0 ? Math.max(2, Math.min(98, ((pred.baseline_value - low) / range) * 100)) : 50;
  const targetPct  = range > 0 ? Math.max(2, Math.min(98, ((pred.predicted_value - low) / range) * 100)) : 50;

  const totalVotes = (pred.agree_count || 0) + (pred.disagree_count || 0);
  const agreePct = totalVotes > 0 ? ((pred.agree_count || 0) / totalVotes) * 100 : 50;
  const daysLeft = Math.round((new Date(pred.target_date).getTime() - Date.now()) / 86400000);

  const fmt = (v: number) => {
    if (!v && v !== 0) return '—';
    if (v >= 10000) return `$${v.toLocaleString('en', { maximumFractionDigits: 0 })}`;
    if (v >= 100)   return `$${v.toFixed(2)}`;
    return `${v.toFixed(2)}`;
  };

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
      className="bg-black/60 border border-white/8 rounded-xl overflow-hidden hover:border-white/14 transition-all">
      {/* Card header */}
      <div className={cn('flex items-center justify-between px-4 py-3 border-b border-white/5',
        isUp ? 'bg-emerald-500/5' : isDown ? 'bg-red-500/5' : 'bg-amber-500/5')}>
        <div className="flex items-center gap-2.5">
          <span className="text-lg leading-none">{meta.icon}</span>
          <div>
            <div className={cn('text-[11px] font-mono font-bold tracking-wider', meta.color)}>{meta.label}</div>
            <div className="text-[9px] text-white/25">Target {pred.target_date} · {daysLeft}d left</div>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <div className={cn('flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-mono font-bold',
            isUp ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/25'
                 : isDown ? 'bg-red-500/15 text-red-400 border border-red-500/25'
                 : 'bg-amber-500/15 text-amber-400 border border-amber-500/25')}>
            {isUp ? <ArrowUpRight className="w-3 h-3" /> : isDown ? <ArrowDownRight className="w-3 h-3" /> : <Minus className="w-3 h-3" />}
            {Number(pred.predicted_pct_change) > 0 ? '+' : ''}{Number(pred.predicted_pct_change).toFixed(1)}%
          </div>
          <div className={cn("text-[9px] font-mono px-2 py-1 rounded-full",
            pred.calibration?.reliability_tier === 'strong' ? 'bg-emerald-500/15 text-emerald-400'
            : pred.calibration?.reliability_tier === 'moderate' ? 'bg-blue-500/15 text-blue-400'
            : pred.calibration?.reliability_tier === 'weak' ? 'bg-amber-500/15 text-amber-400'
            : pred.calibration?.reliability_tier === 'unreliable' ? 'bg-red-500/15 text-red-400'
            : 'bg-white/5 text-white/25'
          )}>
            {pred.calibration ? Math.round(pred.calibration.real_accuracy_pct) : pred.confidence}%
          </div>
        </div>
      </div>

      {/* Fusion Engine Agreement Banner */}
      {pred.generated_by === 'ayn_consensus_fusion_v1' && pred.agreement === true && (
        <div className="flex items-center gap-2 px-4 py-1.5 bg-indigo-500/10 border-b border-indigo-500/20">
          <div className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse shadow-[0_0_6px_rgba(129,140,248,0.8)]" />
          <span className="text-[8px] font-mono text-indigo-300 font-bold tracking-widest uppercase">
            Both Engines Agree
          </span>
          {pred.boost_factor && (
            <span className="text-[7.5px] font-mono text-indigo-200/50 ml-auto bg-indigo-500/10 px-1.5 py-0.5 rounded border border-indigo-500/20">
              {pred.boost_factor}
            </span>
          )}
        </div>
      )}

      {/* Uncertainty warning for unreliable assets */}
      {pred.calibration?.should_show_uncertainty && (
        <div className="flex items-center gap-2 px-4 py-2 bg-amber-500/6 border-b border-amber-500/15">
          <span className="text-amber-400 text-[10px]">⚠</span>
          <span className="text-[8px] font-mono text-amber-400/70">
            Low track record: {Math.round(pred.calibration.real_accuracy_pct)}% historical accuracy on {pred.asset.toUpperCase()} · treat with caution
          </span>
        </div>
      )}
      {pred.calibration?.reliability_tier === 'strong' && (
        <div className="flex items-center gap-2 px-4 py-1.5 bg-emerald-500/5 border-b border-emerald-500/10">
          <span className="text-emerald-400 text-[10px]">✓</span>
          <span className="text-[8px] font-mono text-emerald-400/60">
            Strong track record: {Math.round(pred.calibration.real_accuracy_pct)}% historical accuracy on {pred.asset.toUpperCase()}
          </span>
        </div>
      )}

      {/* Price gauge */}
      <div className="px-4 py-4">
        <div className="flex justify-between items-end mb-3">
          <div>
            <div className="text-[8px] text-white/25 font-mono mb-0.5">NOW</div>
            <div className="text-sm font-mono font-bold text-white/60">{fmt(pred.baseline_value)}{meta.unit}</div>
          </div>
          <div className="text-center">
            <div className="text-[8px] text-white/25 font-mono mb-0.5">AYN TARGET</div>
            <div className={cn('text-xl font-mono font-bold', dirColor)}>{fmt(pred.predicted_value)}{meta.unit}</div>
          </div>
          <div className="text-right">
            <div className="text-[8px] text-white/25 font-mono mb-0.5">RANGE</div>
            <div className="text-[9px] font-mono text-white/35">{fmt(low)}–{fmt(high)}</div>
          </div>
        </div>

        {/* Gauge track */}
        <div className="relative h-6 bg-white/4 rounded-full overflow-visible my-1">
          {/* Fill between current and target */}
          <div className={cn('absolute inset-y-2 rounded-full opacity-15',
              isUp ? 'bg-emerald-400' : isDown ? 'bg-red-400' : 'bg-amber-400')}
            style={{
              left: `${Math.min(currentPct, targetPct)}%`,
              right: `${100 - Math.max(currentPct, targetPct)}%`,
            }} />
          {/* Current dot */}
          <div className="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full border-2 border-white/50 z-10 shadow-lg"
            style={{ left: `calc(${currentPct}% - 6px)` }} />
          {/* Target dot */}
          <div className={cn('absolute top-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded-full border-2 z-10 shadow-lg',
              isUp ? 'bg-emerald-400 border-emerald-200' : isDown ? 'bg-red-400 border-red-200' : 'bg-amber-400 border-amber-200')}
            style={{ left: `calc(${targetPct}% - 7px)` }} />
          <div className="absolute left-2 top-1/2 -translate-y-1/2 text-[7px] font-mono text-white/15 pointer-events-none">LOW</div>
          <div className="absolute right-2 top-1/2 -translate-y-1/2 text-[7px] font-mono text-white/15 pointer-events-none">HIGH</div>
        </div>

        <p className="text-[10px] font-mono text-white/35 leading-relaxed line-clamp-2 mt-3">{pred.reasoning}</p>
      </div>

      {/* Vote */}
      <div className="px-4 pb-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[9px] font-mono text-white/25 uppercase tracking-wider">Do you agree with AYN?</span>
          {totalVotes > 0 && <span className="text-[9px] font-mono text-white/15">{totalVotes} votes</span>}
        </div>
        <div className="flex gap-2">
          {(['agree', 'disagree'] as const).map(v => (
            <button key={v} onClick={() => userId && !voting && onVote(pred.id, v)} disabled={!userId || voting}
              className={cn('flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-[10px] font-mono font-bold transition-all border',
                pred.user_vote === v
                  ? v === 'agree' ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400' : 'bg-red-500/20 border-red-500/40 text-red-400'
                  : 'bg-white/3 border-white/8 text-white/25 hover:border-white/15 hover:text-white/50 disabled:opacity-30 disabled:cursor-not-allowed')}>
              {v === 'agree' ? <ThumbsUp className="w-3 h-3" /> : <ThumbsDown className="w-3 h-3" />}
              {v.toUpperCase()} {v === 'agree' && pred.agree_count ? `(${pred.agree_count})` : ''}
              {v === 'disagree' && pred.disagree_count ? `(${pred.disagree_count})` : ''}
            </button>
          ))}
        </div>
        {totalVotes > 0 && (
          <div className="mt-2">
            <div className="h-1 bg-white/5 rounded-full overflow-hidden">
              <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${agreePct}%` }} />
            </div>
            <div className="flex justify-between text-[8px] font-mono text-white/15 mt-0.5">
              <span>Agree {agreePct.toFixed(0)}%</span><span>Disagree {(100-agreePct).toFixed(0)}%</span>
            </div>
          </div>
        )}
        {!userId && <p className="text-[9px] text-white/15 text-center mt-2 font-mono">Sign in to vote</p>}
      </div>
    </motion.div>
  );
}

export default PredictionCard;
