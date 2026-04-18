import { useEffect, useState } from 'react';
import { supabaseApi } from '@/lib/supabaseApi';
import { tokenStore } from '@/lib/spineAuth';


function AccuracyScoreboard() {
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const token = tokenStore.getAccessToken() || '';
        const rows = await supabaseApi.get<any[]>(
          'ayn_prediction_outcomes?select=was_direction_correct,accuracy_score,actual_date,actual_direction,actual_pct_change,value_error_pct,prediction_id,ayn_predictions(asset,horizon,predicted_direction,predicted_pct_change)&order=actual_date.desc&limit=200',
          token
        );

        if (!rows?.length) return;

        // Per-asset stats
        const byAsset: Record<string, { correct: number; wrong: number; recent: any[] }> = {};
        let totalCorrect = 0;
        let totalWrong = 0;
        let streak = 0;
        let streakRunning = true;

        for (const r of rows) {
          const asset = (r as any).ayn_predictions?.asset || 'unknown';
          if (!byAsset[asset]) byAsset[asset] = { correct: 0, wrong: 0, recent: [] };

          if (r.was_direction_correct) {
            byAsset[asset].correct++;
            totalCorrect++;
            if (streakRunning) streak++;
          } else {
            byAsset[asset].wrong++;
            totalWrong++;
            streakRunning = false;
          }

          if (byAsset[asset].recent.length < 3) {
            byAsset[asset].recent.push({
              correct: r.was_direction_correct,
              actual: r.actual_direction,
              predicted: (r as any).ayn_predictions?.predicted_direction,
              date: r.actual_date,
            });
          }
        }

        const total = totalCorrect + totalWrong;
        const pct = Math.round(100 * totalCorrect / total);

        // Power score: accuracy drives it, streak adds up to 15pts
        const streakBonus = Math.min(15, streak * 2);
        const power = Math.min(100, Math.round(pct * 0.85 + streakBonus));

        setData({ totalCorrect, totalWrong, total, pct, power, streak, byAsset });
      } catch(e) { console.error(e); }
    };
    load();
  }, []);

  if (!data || data.total === 0) return null;

  const { totalCorrect, totalWrong, total, pct, power, streak, byAsset } = data;

  const powerLabel =
    power >= 85 ? 'ORACLE' :
    power >= 73 ? 'STRONG' :
    power >= 58 ? 'DEVELOPING' :
    power >= 42 ? 'LEARNING' : 'CALIBRATING';

  const powerColor =
    power >= 85 ? '#a855f7' :
    power >= 73 ? '#34d399' :
    power >= 58 ? '#f59e0b' :
    power >= 42 ? '#fb923c' : '#f87171';

  const barColor =
    pct >= 80 ? '#34d399' :
    pct >= 65 ? '#f59e0b' :
    pct >= 50 ? '#fb923c' : '#f87171';

  const ASSET_ICONS: Record<string, string> = {
    btc: '₿', eth: 'Ξ', gold: 'Au', silver: 'Ag',
    oil: '🛢', copper: 'Cu', usd_jpy: '¥', wheat: '🌾',
  };

  const assetList = Object.entries(byAsset as Record<string, { correct: number; wrong: number; recent: any[] }>)
    .sort((a, b) => {
      const pa = a[1].correct / (a[1].correct + a[1].wrong);
      const pb = b[1].correct / (b[1].correct + b[1].wrong);
      return pb - pa;
    });

  return (
    <div className="mb-4 rounded-xl border border-white/8 bg-black/40 p-4 space-y-4">

      {/* TOP ROW: Power meter + totals */}
      <div className="flex items-center gap-5">

        {/* Power circle */}
        <div className="flex-shrink-0 text-center w-20">
          <div className="relative w-16 h-16 mx-auto">
            <svg viewBox="0 0 64 64" className="w-16 h-16 -rotate-90">
              <circle cx="32" cy="32" r="26" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="6" />
              <circle cx="32" cy="32" r="26" fill="none" stroke={powerColor} strokeWidth="6"
                strokeDasharray={`${(power / 100) * 163.4} 163.4`}
                strokeLinecap="round" style={{ transition: 'stroke-dasharray 1s ease' }} />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-lg font-black font-mono leading-none" style={{ color: powerColor }}>{power}</span>
            </div>
          </div>
          <div className="text-[9px] font-black font-mono uppercase tracking-widest mt-1" style={{ color: powerColor }}>
            {powerLabel}
          </div>
        </div>

        {/* Big correct/wrong */}
        <div className="flex-1 space-y-2">
          <div className="flex items-baseline gap-3">
            <span className="text-3xl font-black font-mono text-emerald-400">{totalCorrect}</span>
            <span className="text-sm text-white/25 font-mono">correct</span>
            <span className="text-3xl font-black font-mono text-red-400 ml-2">{totalWrong}</span>
            <span className="text-sm text-white/25 font-mono">wrong</span>
            <span className="text-sm font-mono text-white/30 ml-2">of {total}</span>
            {streak >= 3 && (
              <span className="ml-3 text-[10px] font-mono font-bold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full">
                🔥 {streak} in a row
              </span>
            )}
          </div>

          {/* Accuracy bar */}
          <div>
            <div className="flex justify-between text-[8px] font-mono text-white/25 mb-1">
              <span>{pct}% accuracy</span>
              <span>80% target</span>
            </div>
            <div className="h-2 rounded-full bg-white/6 overflow-hidden relative">
              <div className="h-full rounded-full transition-all duration-1000"
                style={{ width: `${pct}%`, backgroundColor: barColor }} />
              {/* 80% marker */}
              <div className="absolute top-0 bottom-0 w-px bg-white/30" style={{ left: '80%' }} />
            </div>
          </div>

          <div className="text-[9px] font-mono" style={{ color: powerColor + 'aa' }}>
            {pct >= 80
              ? `✓ Above 80% — predictions are reliable`
              : `${80 - pct}% more accuracy needed to reach full power`}
          </div>
        </div>
      </div>

      {/* ASSET GRID: right vs wrong per asset */}
      <div className="grid grid-cols-4 gap-2">
        {assetList.map(([asset, stats]) => {
          const assetTotal = stats.correct + stats.wrong;
          const assetPct = Math.round(100 * stats.correct / assetTotal);
          const color = assetPct >= 80 ? '#34d399' : assetPct >= 60 ? '#f59e0b' : '#f87171';
          return (
            <div key={asset} className="rounded-lg bg-white/4 border border-white/6 p-2.5">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[9px] font-mono font-bold text-white/50 uppercase">{asset}</span>
                <span className="text-[9px] font-mono font-black" style={{ color }}>{assetPct}%</span>
              </div>
              {/* Mini bar */}
              <div className="h-1 rounded-full bg-white/8 overflow-hidden mb-1.5">
                <div className="h-full rounded-full" style={{ width: `${assetPct}%`, backgroundColor: color }} />
              </div>
              {/* ✅❌ dots for recent */}
              <div className="flex items-center gap-1">
                {stats.recent.map((r: any, i: number) => (
                  <span key={i} className="text-[10px]">{r.correct ? '✅' : '❌'}</span>
                ))}
                <span className="text-[8px] font-mono text-white/25 ml-auto">{stats.correct}/{assetTotal}</span>
              </div>
            </div>
          );
        })}
      </div>

    </div>
  );
}

export default AccuracyScoreboard;
