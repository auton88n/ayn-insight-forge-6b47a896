import { useEffect, useState, useMemo, useCallback, useRef, lazy, Suspense } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import {
  ArrowLeft, RefreshCw, Globe2, Radio, Activity,
  ChevronRight, Shield, Building2, Flame, Zap, Target,
  TrendingUp, AlertTriangle, BarChart3, Clock
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { HeatMap2D, MapPoint } from '@/components/dashboard/HeatMap2D';
import ParticleCanvas from '@/components/dashboard/world/ParticleCanvas';
import { INTELLIGENCE_SEEDS, THREAT_TICKER } from '@/data/mapSeeds';

const AccuracyScoreboard = lazy(() => import('@/components/dashboard/world/AccuracyScoreboard'));
const PredictionCard     = lazy(() => import('@/components/dashboard/world/PredictionCard'));
const AgentSociety       = lazy(() => import('@/components/dashboard/world/AgentSociety'));
const WorldSimulator     = lazy(() => import('@/components/dashboard/world/WorldSimulator'));

// ─── Types ───────────────────────────────────────────────────────────────────
interface Prediction {
  id: string; asset: string; horizon: string; target_date: string;
  baseline_value: number; predicted_value: number;
  predicted_low: number; predicted_high: number;
  predicted_direction: 'up' | 'down' | 'sideways';
  predicted_pct_change: number; confidence: number; reasoning: string;
  calibration?: any; agree_count?: number; disagree_count?: number;
  user_vote?: 'agree' | 'disagree' | null;
  consensus_strength?: string; agreement?: boolean | null;
  fusion_method?: string; boost_factor?: string | null; generated_by?: string | null;
}

interface WorldSignal {
  id: string; signal_type: string; severity: string; headline: string;
  summary?: string; region: string; countries_involved: string[];
  impact_on_oil: string; impact_on_gold: string; impact_on_btc: string;
  created_at: string;
}

interface WorldPrediction {
  id: string; domain: string; region: string; title: string;
  confidence: number; probability: string;
  what_is_happening: string; what_it_means: string;
  who_wins: string; who_gets_hurt: string;
  historical_parallel: string; what_to_do_now: string;
  actionable_move?: string; financial_trigger?: string;
  escalation_risk?: string;
  conflict_signals?: Record<string, string>;
  key_drivers: string[]; main_risks: string[];
}

interface CountryIntel {
  country_code: string; country_name: string;
  intelligence_brief: string[];
  economy: {
    gdp?: { formatted: string };
    gdp_growth?: { value: number; trend: string };
    inflation?: { value: number; trend: string };
    unemployment?: { value: number; trend: string };
    income_per_person?: { formatted: string };
  };
  hot_sectors?: string[];
  opportunities?: string[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function safeArr(v: any): any[] { return Array.isArray(v) ? v : []; }
function safeObj(v: any): Record<string, any> {
  return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
}
function timeAgo(d: string | null): string {
  if (!d) return '';
  const m = Math.floor((Date.now() - new Date(d).getTime()) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return format(new Date(d), 'MMM d');
}

const DOMAIN_LABELS: Record<string, string> = {
  regions: 'Regional Intelligence', jobs: 'Jobs & Labor', technology: 'Technology',
  warnings: 'Early Warnings', economy: 'Economy', conflicts: 'Conflicts',
  geopolitics: 'Geopolitics', business: 'Business',
};
const DOMAIN_COLORS: Record<string, string> = {
  regions: 'text-cyan-400', jobs: 'text-blue-400', technology: 'text-purple-400',
  warnings: 'text-red-400', economy: 'text-amber-400', conflicts: 'text-red-400',
  geopolitics: 'text-orange-400', business: 'text-emerald-400',
};
const SEVERITY_COLOR: Record<string, string> = {
  critical: 'text-red-400 border-red-500/30 bg-red-500/8',
  high: 'text-orange-400 border-orange-500/25 bg-orange-500/6',
  medium: 'text-amber-400 border-amber-500/20 bg-amber-500/5',
  low: 'text-slate-400 border-slate-500/20 bg-slate-500/4',
};
const IMPACT_ICON: Record<string, string> = {
  spike: '↑', drop: '↓', volatile: '~', stable: '→',
};
const IMPACT_COLOR: Record<string, string> = {
  spike: 'text-red-400', drop: 'text-emerald-400',
  volatile: 'text-amber-400', stable: 'text-white/30',
};

const ASSET_META: Record<string, { label: string; unit: string; icon: string }> = {
  gold: { label: 'Gold', unit: '/oz', icon: '🥇' },
  silver: { label: 'Silver', unit: '/oz', icon: '🥈' },
  oil: { label: 'Brent', unit: '/bbl', icon: '🛢️' },
  btc: { label: 'Bitcoin', unit: '', icon: '₿' },
  eth: { label: 'Ethereum', unit: '', icon: 'Ξ' },
  copper: { label: 'Copper', unit: '/mt', icon: '🔶' },
  wheat: { label: 'Wheat', unit: '/mt', icon: '🌾' },
  usd_jpy: { label: 'USD/JPY', unit: '', icon: '¥' },
};

const SIC_COORDS: Record<string, [number, number]> = {
  USA: [-95.7, 37.0], CHN: [104.1, 35.8], EU: [10.4, 51.1], GBR: [-3.4, 55.3],
  SAU: [45.0, 23.8], ARE: [53.8, 23.4], JPN: [138.2, 36.2], IND: [78.9, 20.5],
  BRA: [-51.9, -14.2], RUS: [105.3, 61.5], IRQ: [43.6, 33.2], KOR: [127.7, 35.9],
  ZAF: [22.9, -30.5], CAN: [-106.3, 56.1], AUS: [133.7, -25.2],
};

// ─── Side panel: World Prediction Detail ─────────────────────────────────────
function PredictionDetail({ pred, onClose }: { pred: WorldPrediction; onClose: () => void }) {
  const isConflict = pred.domain === 'conflicts' || pred.escalation_risk;
  return (
    <motion.div
      initial={{ opacity: 0, x: 440 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 440 }}
      transition={{ type: 'spring', damping: 28, stiffness: 220 }}
      className="fixed top-0 right-0 bottom-0 w-full sm:w-[500px] bg-[#06060a]/98 backdrop-blur-2xl border-l border-white/10 z-[100] flex flex-col"
    >
      {/* Header */}
      <div className="p-5 border-b border-white/8 shrink-0">
        <div className="flex items-start justify-between">
          <div className="flex-1 pr-4">
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <span className={cn('text-[8px] font-mono font-bold px-2 py-0.5 rounded-full border uppercase tracking-wider',
                DOMAIN_COLORS[pred.domain] || 'text-white/40',
                'border-current/30 bg-current/5'
              )}>
                {DOMAIN_LABELS[pred.domain] || pred.domain}
              </span>
              <span className="text-[8px] font-mono text-white/25 uppercase">{pred.region}</span>
              {pred.escalation_risk && (
                <span className={cn('text-[8px] font-mono font-bold px-2 py-0.5 rounded-full border uppercase',
                  SEVERITY_COLOR[pred.escalation_risk] || SEVERITY_COLOR.low)}>
                  {pred.escalation_risk}
                </span>
              )}
            </div>
            <h2 className="text-base font-mono font-bold text-white leading-snug">{pred.title}</h2>
            <div className="flex items-center gap-2 mt-1.5">
              <span className="text-[9px] font-mono text-white/50 font-bold">{pred.confidence}% confidence</span>
              <span className="text-[9px] font-mono text-white/25">·</span>
              <span className="text-[9px] font-mono text-white/25">{pred.probability}</span>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-white/6 text-white/35 hover:text-white transition-colors text-xl font-mono shrink-0">×</button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-5 space-y-5 scrollbar-thin">
        {/* Financial trigger (conflicts) */}
        {pred.financial_trigger && (
          <div className="bg-red-500/8 border border-red-500/20 rounded-xl p-4">
            <div className="text-[8px] font-mono text-red-400/70 uppercase tracking-wider mb-2">💰 Financial Signal</div>
            <p className="text-[11px] font-mono text-red-200/75 leading-relaxed font-bold">{pred.financial_trigger}</p>
          </div>
        )}

        {/* Conflict signals */}
        {pred.conflict_signals && Object.keys(pred.conflict_signals).length > 0 && (
          <div>
            <div className="text-[8px] font-mono text-white/25 uppercase tracking-wider mb-3">Market Signals</div>
            <div className="space-y-2">
              {[
                { key: 'oil_signal', label: '🛢️ Oil', color: 'text-orange-300/70 bg-orange-500/5 border-orange-500/15' },
                { key: 'gold_signal', label: '🥇 Gold', color: 'text-amber-300/70 bg-amber-500/5 border-amber-500/15' },
                { key: 'currency_signal', label: '¥ Currency', color: 'text-cyan-300/70 bg-cyan-500/5 border-cyan-500/15' },
                { key: 'sanctions_signal', label: '⚖️ Sanctions', color: 'text-purple-300/70 bg-purple-500/5 border-purple-500/15' },
              ].filter(s => pred.conflict_signals?.[s.key]).map(s => (
                <div key={s.key} className={cn('px-3 py-2.5 rounded-lg border', s.color)}>
                  <div className="text-[8px] font-mono font-bold mb-1 opacity-70">{s.label}</div>
                  <p className="text-[10px] font-mono leading-relaxed">{pred.conflict_signals?.[s.key]}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* What's happening */}
        <div>
          <div className="text-[8px] font-mono text-white/25 uppercase tracking-wider mb-2">What's Happening</div>
          <p className="text-[11px] font-mono text-white/60 leading-relaxed">{pred.what_is_happening}</p>
        </div>

        {/* What it means */}
        <div>
          <div className="text-[8px] font-mono text-white/25 uppercase tracking-wider mb-2">What This Leads To</div>
          <p className="text-[11px] font-mono text-white/60 leading-relaxed">{pred.what_it_means}</p>
        </div>

        {/* Historical parallel */}
        {pred.historical_parallel && (
          <div className="bg-purple-500/5 border border-purple-500/12 rounded-xl p-4">
            <div className="text-[8px] font-mono text-purple-400/60 uppercase tracking-wider mb-2">📖 Historical Parallel</div>
            <p className="text-[10px] font-mono text-purple-200/55 leading-relaxed">{pred.historical_parallel}</p>
          </div>
        )}

        {/* Who wins / loses */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-emerald-500/5 border border-emerald-500/12 rounded-xl p-3">
            <div className="text-[8px] font-mono text-emerald-400/60 uppercase tracking-wider mb-2">✅ Who Wins</div>
            <p className="text-[10px] font-mono text-emerald-200/55 leading-relaxed">{pred.who_wins}</p>
          </div>
          <div className="bg-red-500/5 border border-red-500/12 rounded-xl p-3">
            <div className="text-[8px] font-mono text-red-400/60 uppercase tracking-wider mb-2">❌ Who Gets Hurt</div>
            <p className="text-[10px] font-mono text-red-200/55 leading-relaxed">{pred.who_gets_hurt}</p>
          </div>
        </div>

        {/* Action */}
        {(pred.actionable_move || pred.what_to_do_now) && (
          <div className="bg-cyan-500/6 border border-cyan-500/18 rounded-xl p-4">
            <div className="text-[8px] font-mono text-cyan-400/60 uppercase tracking-wider mb-2">⚡ Your Move Now</div>
            {pred.actionable_move && (
              <p className="text-[11px] font-mono text-cyan-200/80 font-bold leading-relaxed mb-2">{pred.actionable_move}</p>
            )}
            {pred.what_to_do_now && (
              <p className="text-[10px] font-mono text-cyan-200/50 leading-relaxed">{pred.what_to_do_now}</p>
            )}
          </div>
        )}

        {/* Drivers & risks */}
        {(safeArr(pred.key_drivers).length > 0 || safeArr(pred.main_risks).length > 0) && (
          <div className="grid grid-cols-2 gap-3">
            {safeArr(pred.key_drivers).length > 0 && (
              <div>
                <div className="text-[8px] font-mono text-white/25 uppercase tracking-wider mb-2">Key Drivers</div>
                {safeArr(pred.key_drivers).map((d, i) => (
                  <div key={i} className="flex gap-1.5 text-[9px] font-mono text-white/40 mb-1">
                    <span className="text-white/20 shrink-0">›</span>{d}
                  </div>
                ))}
              </div>
            )}
            {safeArr(pred.main_risks).length > 0 && (
              <div>
                <div className="text-[8px] font-mono text-white/25 uppercase tracking-wider mb-2">What Would Prove This Wrong</div>
                {safeArr(pred.main_risks).map((r, i) => (
                  <div key={i} className="flex gap-1.5 text-[9px] font-mono text-white/40 mb-1">
                    <span className="text-red-400/40 shrink-0">!</span>{r}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </motion.div>
  );
}

// ─── Side panel: Country Dossier ─────────────────────────────────────────────
function CountryDossier({ intel, sic, onClose }: { intel: CountryIntel; sic: any; onClose: () => void }) {
  const econ = intel.economy || {};
  return (
    <motion.div
      initial={{ opacity: 0, x: 440 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 440 }}
      transition={{ type: 'spring', damping: 28, stiffness: 220 }}
      className="fixed top-0 right-0 bottom-0 w-full sm:w-[460px] bg-[#060609]/97 backdrop-blur-2xl border-l border-cyan-500/20 z-[100] flex flex-col"
    >
      <div className="p-5 border-b border-white/8 shrink-0">
        <div className="flex items-start justify-between">
          <div>
            <div className="text-[9px] font-mono text-cyan-400/50 uppercase tracking-[0.2em] mb-1">Country Dossier</div>
            <h2 className="text-2xl font-mono font-bold text-white">{intel.country_name}</h2>
            <div className="flex items-center gap-3 mt-1.5">
              {econ.gdp?.formatted && <span className="text-[10px] font-mono text-white/35">GDP {econ.gdp.formatted}</span>}
              {econ.gdp_growth?.value != null && (
                <span className={cn('text-[10px] font-mono font-bold',
                  econ.gdp_growth.trend === 'rising' ? 'text-emerald-400' : 'text-amber-400')}>
                  {econ.gdp_growth.trend === 'rising' ? '▲' : '▼'} {Math.abs(econ.gdp_growth.value).toFixed(1)}% GDP
                </span>
              )}
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-white/6 text-white/35 hover:text-white transition-colors text-xl font-mono">×</button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-5 space-y-6 scrollbar-thin">
        {/* Key indicators */}
        <div>
          <div className="text-[8px] font-mono text-white/25 uppercase tracking-wider mb-3">Key Indicators</div>
          <div className="grid grid-cols-2 gap-2">
            {[
              { label: 'Inflation', value: econ.inflation?.value != null ? `${econ.inflation.value.toFixed(1)}%` : null, good: (econ.inflation?.value || 0) < 3 },
              { label: 'Unemployment', value: econ.unemployment?.value != null ? `${econ.unemployment.value.toFixed(1)}%` : null, good: (econ.unemployment?.value || 0) < 5 },
              { label: 'Income/Person', value: econ.income_per_person?.formatted || null, good: true },
              { label: 'GDP Growth', value: econ.gdp_growth?.value != null ? `${econ.gdp_growth.value > 0 ? '+' : ''}${econ.gdp_growth.value.toFixed(1)}%` : null, good: (econ.gdp_growth?.value || 0) > 0 },
            ].filter(s => s.value).map(s => (
              <div key={s.label} className="bg-white/3 border border-white/5 rounded-lg p-3">
                <div className="text-[8px] font-mono text-white/25 uppercase mb-1">{s.label}</div>
                <div className={cn('text-sm font-mono font-bold', s.good ? 'text-white/75' : 'text-amber-400')}>{s.value}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Intelligence brief */}
        {intel.intelligence_brief?.length > 0 && (
          <div>
            <div className="text-[8px] font-mono text-white/25 uppercase tracking-wider mb-3 flex items-center gap-2">
              <Activity className="w-3 h-3 text-emerald-400" /> Economic Snapshot
            </div>
            <div className="space-y-1">
              {intel.intelligence_brief.map((line, i) => (
                <div key={i} className="flex items-start gap-2 py-1.5 border-b border-white/4 last:border-0">
                  <span className="text-white/15 shrink-0 font-mono text-[10px]">›</span>
                  <span className="text-[10px] font-mono text-white/45 leading-relaxed">{line}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Hot sectors */}
        {intel.hot_sectors && intel.hot_sectors.filter(Boolean).length > 0 && (
          <div>
            <div className="text-[8px] font-mono text-white/25 uppercase tracking-wider mb-3 flex items-center gap-2">
              <Flame className="w-3 h-3 text-orange-400" /> Hot Sectors
            </div>
            <div className="flex flex-wrap gap-2">
              {intel.hot_sectors.filter(Boolean).map((s, i) => (
                <span key={i} className="text-[10px] font-mono px-2.5 py-1 rounded-full bg-orange-500/8 border border-orange-500/18 text-orange-300/70">{s}</span>
              ))}
            </div>
          </div>
        )}

        {/* Live news */}
        {safeArr(sic?.news).filter((n: any) => n?.title?.length > 5).length > 0 && (
          <div>
            <div className="text-[8px] font-mono text-white/25 uppercase tracking-wider mb-3 flex items-center gap-2">
              <Radio className="w-3 h-3 text-cyan-400" /> Live Intelligence
            </div>
            <div className="space-y-2">
              {safeArr(sic.news).filter((n: any) => n?.title?.length > 5).slice(0, 5).map((item: any, i: number) => (
                <div key={i} className="bg-black/40 border border-white/5 p-3 rounded-lg">
                  <p className="text-[10px] font-mono text-white/60 leading-relaxed">{item.title}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
}

// ─── Section header ───────────────────────────────────────────────────────────
function SectionHeader({ icon: Icon, label, color, count }: {
  icon: any; label: string; color: string; count?: number
}) {
  return (
    <div className="flex items-center gap-2 mb-4">
      <Icon className={cn('w-4 h-4', color)} />
      <span className={cn('text-[10px] font-mono font-bold tracking-[0.15em] uppercase', color)}>{label}</span>
      <div className={cn('flex-1 h-px bg-gradient-to-r from-current to-transparent opacity-20', color)} />
      {count !== undefined && <span className="text-[8px] text-white/18 font-mono">{count} active</span>}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function WorldIntelligence() {
  const navigate = useNavigate();
  const [loading, setLoading]     = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const currentTime = useRef(new Date()).current;

  // Data
  const [snapshot, setSnapshot]           = useState<any>(null);
  const [predictions, setPredictions]     = useState<Prediction[]>([]);
  const [signals, setSignals]             = useState<WorldSignal[]>([]);
  const [worldPreds, setWorldPreds]       = useState<WorldPrediction[]>([]);
  const [countryIntel, setCountryIntel]   = useState<CountryIntel[]>([]);
  const [userId, setUserId]               = useState<string | undefined>();

  // UI state
  const [activeHorizon, setActiveHorizon] = useState<'1_week' | '1_month' | '1_year'>('1_week');
  const [assetFilter, setAssetFilter]     = useState('all');
  const [activeDomain, setActiveDomain]   = useState('all');
  const [votingId, setVotingId]           = useState<string | null>(null);
  const [selectedPred, setSelectedPred]   = useState<WorldPrediction | null>(null);
  const [selectedCountry, setSelectedCountry] = useState<{ intel: CountryIntel; sic: any } | null>(null);

  // Auth
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id));
  }, []);

  // Fetch: market snapshot
  const fetchSnapshot = useCallback(async () => {
    try {
      const { data } = await supabase
        .from('ayn_market_snapshot')
        .select('snapshot, fetched_at')
        .eq('singleton_key', 1)
        .single();
      if (data) setSnapshot(data);
    } catch {}
  }, []);

  // Fetch: price predictions
  const fetchPredictions = useCallback(async () => {
    try {
      const { data: calibData } = await supabase
        .from('ayn_accuracy_calibration' as any)
        .select('asset, real_accuracy_pct, reliability_tier, should_show_uncertainty, calibration_factor');
      const calibMap: Record<string, any> = {};
      for (const c of (calibData || []) as any[]) calibMap[c.asset] = c;

      const { data: consensus } = await supabase
        .from('ayn_consensus_predictions' as any)
        .select('id,asset,horizon,target_date,baseline_value,consensus_direction,consensus_pct_change,consensus_confidence,consensus_strength,ayn_reasoning,agreement,fusion_method,boost_factor')
        .eq('status', 'active')
        .order('consensus_confidence', { ascending: false })
        .limit(60);

      const { data: aynPreds } = await supabase
        .from('ayn_predictions')
        .select('id,asset,horizon,target_date,baseline_value,predicted_value,predicted_low,predicted_high,predicted_direction,predicted_pct_change,confidence,reasoning,generated_by')
        .eq('status', 'active')
        .in('generated_by', ['ayn_prediction_engine_v10', 'ayn_prediction_engine_v9'])
        .order('confidence', { ascending: false })
        .limit(60);

      const preds = (consensus && consensus.length > 0)
        ? (consensus as any[]).map(c => ({
          id: c.id, asset: c.asset, horizon: c.horizon, target_date: c.target_date,
          baseline_value: Number(c.baseline_value),
          predicted_value: Number(c.baseline_value) * (1 + Number(c.consensus_pct_change) / 100),
          predicted_low: Number(c.baseline_value) * (1 + Number(c.consensus_pct_change) / 100 - 0.03),
          predicted_high: Number(c.baseline_value) * (1 + Number(c.consensus_pct_change) / 100 + 0.03),
          predicted_direction: c.consensus_direction?.toLowerCase() as 'up' | 'down' | 'sideways',
          predicted_pct_change: Number(c.consensus_pct_change),
          confidence: Number(c.consensus_confidence || 50),
          calibration: calibMap[c.asset] || null,
          reasoning: c.ayn_reasoning || '',
          generated_by: 'consensus', consensus_strength: c.consensus_strength,
          agreement: c.agreement, fusion_method: c.fusion_method, boost_factor: c.boost_factor,
          agree_count: 0, disagree_count: 0, user_vote: null,
        }))
        : (aynPreds || []).map(p => ({
          ...p,
          baseline_value: Number(p.baseline_value),
          predicted_value: Number(p.predicted_value),
          predicted_low: Number(p.predicted_low),
          predicted_high: Number(p.predicted_high),
          predicted_pct_change: Number(p.predicted_pct_change),
          predicted_direction: (p.predicted_direction || 'sideways') as 'up' | 'down' | 'sideways',
          confidence: Number(p.confidence || 50),
          calibration: calibMap[p.asset] || null,
          agree_count: 0, disagree_count: 0, user_vote: null,
        }));

      if (!preds.length) return;

      const { data: voteCounts } = await supabase
        .from('ayn_prediction_vote_counts' as any)
        .select('prediction_id,agree_count,disagree_count');

      let userVoteMap: Record<string, 'agree' | 'disagree'> = {};
      if (userId) {
        const { data: uv } = await supabase.from('ayn_prediction_votes')
          .select('prediction_id,vote').eq('user_id', userId)
          .in('prediction_id', preds.map(p => p.id));
        if (uv) userVoteMap = Object.fromEntries(uv.map(v => [v.prediction_id, v.vote as 'agree' | 'disagree']));
      }
      const vMap = Object.fromEntries((voteCounts || []).map((v: any) => [v.prediction_id, v]));
      setPredictions(preds.map(p => ({
        ...p,
        agree_count: vMap[p.id]?.agree_count || 0,
        disagree_count: vMap[p.id]?.disagree_count || 0,
        user_vote: (userVoteMap[p.id] || null) as 'agree' | 'disagree' | null,
      })));
    } catch (e) { console.error('predictions:', e); }
  }, [userId]);

  // Fetch: world signals
  const fetchSignals = useCallback(async () => {
    try {
      const { data } = await supabase
        .from('ayn_world_signals')
        .select('*')
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(30);
      if (data) setSignals(data as WorldSignal[]);
    } catch {}
  }, []);

  // Fetch: world predictions (all domains)
  const fetchWorldPreds = useCallback(async () => {
    try {
      const { data } = await supabase
        .from('ayn_world_predictions')
        .select('id,domain,region,title,confidence,probability,what_is_happening,what_it_means,who_wins,who_gets_hurt,historical_parallel,what_to_do_now,actionable_move,financial_trigger,escalation_risk,conflict_signals,key_drivers,main_risks,tags')
        .eq('status', 'active')
        .order('confidence', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(100);
      if (data) setWorldPreds(data as WorldPrediction[]);
    } catch {}
  }, []);

  // Fetch: country intel
  const fetchCountryIntel = useCallback(async () => {
    try {
      const { data } = await supabase
        .from('ayn_country_intelligence')
        .select('country_code,country_name,intelligence_brief,economy,hot_sectors,opportunities')
        .limit(20);
      if (data) setCountryIntel(data as CountryIntel[]);
    } catch {}
  }, []);

  // Boot
  useEffect(() => {
    fetchSnapshot().finally(() => setLoading(false));
    setTimeout(() => fetchSignals(), 200);
    setTimeout(() => fetchWorldPreds(), 400);
    setTimeout(() => fetchPredictions(), 600);
    setTimeout(() => fetchCountryIntel(), 900);
    const poll = setInterval(fetchSnapshot, 5 * 60 * 1000);
    return () => clearInterval(poll);
  }, [fetchSnapshot, fetchSignals, fetchWorldPreds, fetchPredictions, fetchCountryIntel]);

  const handleVote = async (predId: string, vote: 'agree' | 'disagree') => {
    if (!userId || votingId) return;
    setVotingId(predId);
    try {
      const existing = predictions.find(p => p.id === predId);
      if (existing?.user_vote === vote) {
        await supabase.from('ayn_prediction_votes').delete().eq('prediction_id', predId).eq('user_id', userId);
      } else {
        await supabase.from('ayn_prediction_votes').upsert({ prediction_id: predId, user_id: userId, vote }, { onConflict: 'prediction_id,user_id' });
      }
      await fetchPredictions();
    } finally { setVotingId(null); }
  };

  // Derived data
  const snap       = useMemo(() => safeObj(snapshot?.snapshot), [snapshot]);
  const macro      = useMemo(() => safeObj(snap.macro), [snap]);
  const sentiment  = useMemo(() => safeObj(safeObj(snap.markets)?.sentiment), [snap]);
  const cryptoPrices = useMemo(() => safeObj(safeObj(safeObj(snap.markets)?.crypto)?.crypto_prices), [snap]);
  const sicIntel   = useMemo(() => safeObj(snap.sic_intel), [snap]);
  const briefItems = useMemo(() => {
    const fromDB = safeArr(snap.intelligence_brief);
    if (fromDB.length) return fromDB;
    const items: string[] = [];
    if (sentiment.value != null) items.push(`📊 Fear & Greed at ${sentiment.value} — ${sentiment.classification || 'monitoring markets'}.`);
    const fed = safeObj(macro.fed_funds_rate);
    if (fed.value) items.push(`⚡ Fed Rate at ${fed.value}% — central bank policy dominant macro driver.`);
    return items.length ? items : ['⏳ Intelligence brief populates on next data sweep.'];
  }, [snap, sentiment, macro]);

  const tickerItems = useMemo(() => {
    const items: { label: string; value: string; change?: number }[] = [];
    Object.entries(cryptoPrices).forEach(([sym, d]: [string, any]) =>
      items.push({ label: sym, value: `$${Number(d.price).toLocaleString()}`, change: parseFloat(d.change_24h_pct || '0') }));
    const fed = safeObj(macro.fed_funds_rate);
    const t10 = safeObj(macro.treasury_10yr);
    if (fed.value) items.push({ label: 'FED', value: `${fed.value}%` });
    if (t10.value) items.push({ label: '10Y', value: `${t10.value}%` });
    if (sentiment.value) items.push({ label: 'F&G', value: `${sentiment.value} · ${sentiment.classification || ''}` });
    return items;
  }, [cryptoPrices, macro, sentiment]);

  // Filtered predictions
  const filteredPreds = useMemo(() => {
    const seen = new Set<string>();
    return predictions
      .filter(p => p.horizon === activeHorizon && (assetFilter === 'all' || p.asset === assetFilter))
      .filter(p => {
        const key = `${p.asset}-${p.horizon}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .sort((a, b) => {
        const ORDER = ['btc', 'eth', 'gold', 'silver', 'oil', 'copper', 'wheat', 'usd_jpy'];
        const ai = ORDER.indexOf(a.asset); const bi = ORDER.indexOf(b.asset);
        if (ai === -1 && bi === -1) return a.asset.localeCompare(b.asset);
        if (ai === -1) return 1; if (bi === -1) return -1;
        return ai - bi;
      });
  }, [predictions, activeHorizon, assetFilter]);

  // Available domains in world predictions
  const domains = useMemo(() => {
    const CORE = ['all', 'warnings', 'conflicts', 'geopolitics', 'economy', 'technology', 'jobs', 'regions', 'business'];
    const inDB = [...new Set(worldPreds.map(p => p.domain.toLowerCase()))];
    return CORE.filter(d => d === 'all' || inDB.includes(d));
  }, [worldPreds]);

  // Normalise domain matching
  const filteredWorldPreds = useMemo(() => {
    return worldPreds
      .filter(p => activeDomain === 'all' || p.domain.toLowerCase() === activeDomain)
      .slice(0, 24);
  }, [worldPreds, activeDomain]);

  // Map points
  const mapPoints: MapPoint[] = useMemo(() => {
    const pts: MapPoint[] = [...INTELLIGENCE_SEEDS];
    Object.entries(sicIntel).forEach(([code, d]) => {
      const coords = SIC_COORDS[code];
      if (!coords) return;
      const data = d as any;
      const alreadyCovered = pts.some(p =>
        Math.abs(p.coordinates[0] - coords[0]) < 3 &&
        Math.abs(p.coordinates[1] - coords[1]) < 3
      );
      if (!alreadyCovered) pts.push({
        id: code, coordinates: coords,
        label: data.name || code,
        risk: data.risk_level === 'CRITICAL' ? 'critical' : 'stable',
        category: 'S.I.C.',
        detail: 'Click for dossier →',
      });
    });
    return pts;
  }, [sicIntel]);

  const handleMapClick = (pt: MapPoint) => {
    const ISO2: Record<string, string> = {
      US: 'USA', CN: 'CHN', DE: 'EU', GB: 'GBR', SA: 'SAU', AE: 'ARE',
      JP: 'JPN', IN: 'IND', BR: 'BRA', RU: 'RUS', KR: 'KOR', ZA: 'ZAF',
      CA: 'CAN', AU: 'AUS', FR: 'EU',
    };
    if (!pt.id) return;
    const intel = countryIntel.find(c => ISO2[c.country_code] === pt.id || c.country_code === pt.id);
    if (intel) setSelectedCountry({ intel, sic: sicIntel[pt.id] || {} });
  };

  if (loading) return (
    <div className="min-h-screen bg-[#050508] flex items-center justify-center">
      <div className="text-center space-y-3">
        <Globe2 className="w-10 h-10 text-cyan-400 animate-pulse mx-auto" />
        <p className="text-cyan-400 text-[10px] font-mono tracking-[0.3em]">LOADING INTELLIGENCE</p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#050508] text-white font-mono flex flex-col overflow-x-hidden">
      <style>{`
        @keyframes ticker { 0% { transform: translateX(0) } 100% { transform: translateX(-50%) } }
        .scrollbar-thin::-webkit-scrollbar { width: 3px }
        .scrollbar-thin::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.07); border-radius: 99px }
      `}</style>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <header className="shrink-0 border-b border-white/6 bg-black/80 backdrop-blur-xl z-50 h-12 flex items-center">
        <div className="flex items-center justify-between px-4 w-full">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate(-1)} className="p-1.5 rounded hover:bg-white/5 transition-colors">
              <ArrowLeft className="w-4 h-4 text-white/40" />
            </button>
            <div className="flex items-center gap-2">
              <div className="relative w-2 h-2">
                <div className="w-2 h-2 rounded-full bg-cyan-400 shadow-[0_0_8px_rgba(0,255,200,0.6)]" />
                <div className="absolute inset-0 rounded-full bg-cyan-400 animate-ping opacity-25" />
              </div>
              <span className="text-[11px] text-cyan-400 tracking-[0.18em] font-bold">AYN WORLD INTELLIGENCE</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden sm:block text-[9px] text-white/18 tabular-nums">{format(currentTime, 'HH:mm')} UTC</span>
            {snapshot?.fetched_at && (
              <span className="hidden md:block text-[9px] text-white/15">Updated {timeAgo(snapshot.fetched_at)}</span>
            )}
            <div className="flex items-center gap-1 px-2 py-1 rounded bg-emerald-500/8 border border-emerald-500/15">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-[9px] font-bold text-emerald-400">LIVE</span>
            </div>
            <button
              onClick={() => { setRefreshing(true); Promise.all([fetchSnapshot(), fetchSignals(), fetchWorldPreds(), fetchPredictions()]).finally(() => setRefreshing(false)); }}
              disabled={refreshing}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded text-[10px] text-white/35 hover:text-cyan-400 hover:bg-white/4 border border-white/8 transition-all"
            >
              <RefreshCw className={cn('w-3 h-3', refreshing && 'animate-spin')} /> SWEEP
            </button>
          </div>
        </div>
      </header>

      {/* ── Ticker ─────────────────────────────────────────────────────────── */}
      {tickerItems.length > 0 && (
        <div className="shrink-0 overflow-hidden border-b border-white/5 bg-black/60 h-7">
          <div className="flex animate-[ticker_90s_linear_infinite] gap-10 items-center h-full px-4 whitespace-nowrap">
            {[...tickerItems, ...tickerItems].map((item, i) => (
              <span key={i} className="inline-flex items-center gap-1.5 text-[10px] font-mono">
                <span className="text-white/25">{item.label}</span>
                <span className="text-white/65 font-semibold">{item.value}</span>
                {item.change !== undefined && (
                  <span className={cn('font-bold', item.change > 0 ? 'text-emerald-400' : item.change < 0 ? 'text-red-400' : 'text-white/20')}>
                    {item.change > 0 ? '▲' : '▼'}{Math.abs(item.change).toFixed(2)}%
                  </span>
                )}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="flex-1 overflow-x-hidden overflow-y-auto">
        <div className="w-full max-w-[1440px] mx-auto px-3 pt-4 sm:px-4 lg:px-5 space-y-8 pb-10">

          {/* ── 1. PARTICLE CANVAS + MAP ─────────────────────────────── */}
          <ParticleCanvas
            particleCount={60000}
            className="rounded-2xl"
            style={{ height: 460 }}
          >
            {/* Map sits on top of particle field */}
            <div className="w-full h-full" style={{ background: 'rgba(0,0,0,0.45)' }}>
              <HeatMap2D
                points={mapPoints}
                height={460}
                onPointClick={handleMapClick}
                showLayerToggle={true}
                isLive={true}
                ticker={THREAT_TICKER}
              />
            </div>
          </ParticleCanvas>

          {/* ── 2. INTELLIGENCE BRIEF + SENTIMENT ───────────────────────── */}
          <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] gap-5">
            {/* Brief */}
            <div className="bg-black/50 border border-white/6 rounded-2xl overflow-hidden">
              <div className="flex items-center gap-2.5 px-5 py-3.5 border-b border-white/5 bg-gradient-to-r from-emerald-500/6 to-transparent">
                <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_6px_rgba(16,185,129,0.6)]" />
                <Radio className="w-4 h-4 text-emerald-400" />
                <span className="text-[11px] font-mono font-bold text-emerald-400 tracking-widest uppercase">Intelligence Brief</span>
              </div>
              <div className="p-4 space-y-2">
                {briefItems.map((item, i) => (
                  <div key={i} className={cn('text-[11px] font-mono leading-relaxed py-2.5 px-4 border-l-2 rounded-r-lg',
                    String(item).toLowerCase().includes('fear') || String(item).includes('⚠')
                      ? 'border-l-red-500/50 text-red-200/60 bg-red-500/4'
                      : 'border-l-emerald-400/30 text-white/55 bg-white/2')}>
                    {String(item)}
                  </div>
                ))}
              </div>
            </div>

            {/* Sentiment + Macro */}
            <div className="space-y-4">
              <div className="bg-black/50 border border-white/6 rounded-2xl p-5">
                <div className="text-[9px] text-white/30 uppercase tracking-widest mb-3 font-mono font-bold">Market Sentiment</div>
                <div className={cn('text-5xl font-mono font-bold mb-1',
                  (sentiment.value || 0) <= 25 ? 'text-red-400' : (sentiment.value || 0) <= 45 ? 'text-orange-400' : 'text-emerald-400')}>
                  {sentiment.value ?? '—'}
                </div>
                <div className="text-[10px] text-white/30 mb-3 font-mono">{sentiment.classification || 'Fear & Greed Index'}</div>
                <div className="h-2 bg-white/6 rounded-full overflow-hidden">
                  <div className={cn('h-full rounded-full transition-all duration-1000',
                    (sentiment.value || 0) <= 25 ? 'bg-gradient-to-r from-red-600 to-red-400' : 'bg-gradient-to-r from-emerald-600 to-emerald-400')}
                    style={{ width: `${sentiment.value || 0}%` }} />
                </div>
              </div>
              <div className="bg-black/50 border border-white/6 rounded-2xl p-5">
                <div className="text-[9px] text-white/30 uppercase tracking-widest mb-3 font-mono font-bold">US Macro</div>
                <div className="space-y-2.5">
                  {[
                    { k: 'fed_funds_rate', label: 'Fed Rate', suffix: '%' },
                    { k: 'treasury_10yr', label: '10Y Yield', suffix: '%' },
                    { k: 'unemployment_rate', label: 'Unemployment', suffix: '%' },
                    { k: 'yield_curve', label: 'Yield Curve', field: 'signal' },
                  ].map(({ k, label, suffix, field }) => {
                    const d = safeObj(macro[k]);
                    const val = field ? d[field as keyof typeof d] : d.value;
                    if (!val) return null;
                    return (
                      <div key={k} className="flex justify-between items-center py-2 border-b border-white/4 last:border-0">
                        <span className="text-[11px] text-white/40 font-mono">{label}</span>
                        <span className="text-[13px] text-white/80 font-mono font-bold">{String(val)}{suffix || ''}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* ── 3. LIVE SIGNALS ─────────────────────────────────────────── */}
          {signals.length > 0 && (
            <div>
              <SectionHeader icon={AlertTriangle} label="Live World Signals" color="text-red-400" count={signals.length} />
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                {signals.slice(0, 9).map(s => (
                  <div key={s.id} className={cn('bg-black/50 border rounded-xl p-4',
                    s.severity === 'critical' ? 'border-red-500/20' : s.severity === 'high' ? 'border-orange-500/15' : 'border-white/6')}>
                    <div className="flex items-center justify-between mb-2">
                      <span className={cn('text-[8px] font-mono font-bold px-2 py-0.5 rounded-full border uppercase',
                        SEVERITY_COLOR[s.severity] || SEVERITY_COLOR.low)}>
                        {s.severity}
                      </span>
                      <span className="text-[8px] font-mono text-white/20 uppercase">{s.region?.replace('_', ' ')}</span>
                    </div>
                    <p className="text-[11px] font-mono text-white/70 leading-snug mb-3">{s.headline}</p>
                    <div className="flex items-center gap-3 text-[9px] font-mono">
                      <span className={cn(IMPACT_COLOR[s.impact_on_oil] || 'text-white/30')}>
                        🛢️ Oil {IMPACT_ICON[s.impact_on_oil] || ''}
                      </span>
                      <span className={cn(IMPACT_COLOR[s.impact_on_gold] || 'text-white/30')}>
                        🥇 Gold {IMPACT_ICON[s.impact_on_gold] || ''}
                      </span>
                      {s.countries_involved?.length > 0 && (
                        <span className="text-white/20 ml-auto">{s.countries_involved.slice(0, 2).join(' · ')}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── 4. WORLD PREDICTIONS (all domains) ──────────────────────── */}
          {worldPreds.length > 0 && (
            <div>
              <SectionHeader icon={Globe2} label="Global Intelligence Predictions" color="text-cyan-400" count={worldPreds.length} />

              {/* Domain filter tabs */}
              <div className="flex flex-wrap gap-1.5 mb-4 bg-black/40 border border-white/8 rounded-xl p-2">
                {domains.map(d => (
                  <button key={d} onClick={() => setActiveDomain(d)}
                    className={cn('px-3 py-1.5 rounded-lg text-[9px] font-mono font-bold transition-all capitalize',
                      activeDomain === d
                        ? cn('bg-white/10 border border-white/15', DOMAIN_COLORS[d] || 'text-white')
                        : 'text-white/30 hover:text-white/60 hover:bg-white/4')}>
                    {d === 'all' ? 'ALL DOMAINS' : (DOMAIN_LABELS[d] || d).toUpperCase()}
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {filteredWorldPreds.map(p => {
                  const domainColor = DOMAIN_COLORS[p.domain.toLowerCase()] || 'text-white/40';
                  const isConflict = p.domain === 'conflicts' && p.escalation_risk;
                  return (
                    <motion.button key={p.id}
                      initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                      onClick={() => setSelectedPred(p)}
                      className={cn('text-left bg-black/50 border rounded-xl overflow-hidden hover:bg-black/70 transition-all group',
                        isConflict && p.escalation_risk === 'critical' ? 'border-red-500/20 hover:border-red-500/35'
                          : isConflict ? 'border-orange-500/15 hover:border-orange-500/25'
                          : 'border-white/6 hover:border-white/12')}>
                      {/* Domain badge row */}
                      <div className={cn('flex items-center justify-between px-4 py-2 border-b border-white/5',
                        isConflict ? 'bg-red-500/4' : 'bg-white/2')}>
                        <span className={cn('text-[8px] font-mono font-bold uppercase tracking-wider', domainColor)}>
                          {DOMAIN_LABELS[p.domain.toLowerCase()] || p.domain}
                        </span>
                        <div className="flex items-center gap-2">
                          {p.escalation_risk && (
                            <span className={cn('text-[7px] font-mono font-bold px-1.5 py-0.5 rounded border uppercase',
                              SEVERITY_COLOR[p.escalation_risk] || SEVERITY_COLOR.low)}>
                              {p.escalation_risk}
                            </span>
                          )}
                          <span className="text-[8px] font-mono text-white/25">{p.confidence}%</span>
                        </div>
                      </div>

                      {/* Content */}
                      <div className="px-4 pt-3 pb-2">
                        <div className="text-[8px] font-mono text-white/25 uppercase mb-1">{p.region}</div>
                        <h3 className="text-[12px] font-mono font-bold text-white/85 leading-snug group-hover:text-white transition-colors line-clamp-2">
                          {p.title}
                        </h3>
                      </div>

                      <div className="px-4 pb-3">
                        <p className="text-[10px] font-mono text-white/40 leading-relaxed line-clamp-2">
                          {p.what_is_happening}
                        </p>
                      </div>

                      <div className="px-4 pb-3 flex items-center justify-between">
                        <div className="flex gap-1.5">
                          {p.financial_trigger && (
                            <span className="text-[7px] font-mono px-1.5 py-0.5 rounded bg-amber-500/8 border border-amber-500/15 text-amber-300/60">$ Signal</span>
                          )}
                          {p.who_wins && (
                            <span className="text-[7px] font-mono px-1.5 py-0.5 rounded bg-emerald-500/8 border border-emerald-500/15 text-emerald-300/60">Winners</span>
                          )}
                        </div>
                        <span className="text-[8px] font-mono text-white/18 group-hover:text-white/40 transition-colors">Full analysis →</span>
                      </div>
                    </motion.button>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── 5. PRICE PREDICTIONS ────────────────────────────────────── */}
          <div>
            <SectionHeader icon={Target} label="AYN Price Prediction Engine" color="text-purple-400" count={filteredPreds.length} />

            <Suspense fallback={<div className="h-32 animate-pulse bg-white/5 rounded-xl border border-white/10 mb-4" />}>
              <AccuracyScoreboard />
            </Suspense>

            {/* Filters */}
            <div className="flex flex-wrap gap-2 mb-4 mt-4">
              <div className="flex gap-1 bg-black/40 border border-white/8 rounded-lg p-1">
                {(['1_week', '1_month', '1_year'] as const).map(h => (
                  <button key={h} onClick={() => setActiveHorizon(h)}
                    className={cn('px-3 py-1.5 rounded text-[9px] font-mono font-bold transition-all',
                      activeHorizon === h ? 'bg-purple-500/18 text-purple-400 border border-purple-500/25' : 'text-white/25 hover:text-white/50')}>
                    {h === '1_week' ? '1W' : h === '1_month' ? '1M' : '1Y'}
                  </button>
                ))}
              </div>
              <div className="flex gap-1 bg-black/40 border border-white/8 rounded-lg p-1 flex-wrap">
                <button onClick={() => setAssetFilter('all')}
                  className={cn('px-2.5 py-1.5 rounded text-[9px] font-mono transition-all',
                    assetFilter === 'all' ? 'bg-white/8 text-white' : 'text-white/25 hover:text-white/50')}>ALL</button>
                {Object.entries(ASSET_META).map(([a, m]) => (
                  <button key={a} onClick={() => setAssetFilter(a)} title={m.label}
                    className={cn('px-2.5 py-1.5 rounded text-[11px] transition-all',
                      assetFilter === a ? 'bg-white/8' : 'text-white/40 hover:text-white/70')}>
                    {m.icon}
                  </button>
                ))}
              </div>
            </div>

            {filteredPreds.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {filteredPreds.map(p => (
                  <Suspense key={p.id} fallback={<div className="h-32 animate-pulse bg-white/5 rounded-xl border border-white/10" />}>
                    <PredictionCard pred={p} onVote={handleVote} userId={userId} voting={votingId === p.id} />
                  </Suspense>
                ))}
              </div>
            ) : (
              <p className="text-center py-12 text-white/18 text-[11px] font-mono">No predictions for this filter.</p>
            )}
          </div>

          {/* ── 6. COUNTRY ECONOMIC INTELLIGENCE ────────────────────────── */}
          {countryIntel.length > 0 && (
            <div>
              <SectionHeader icon={Building2} label="Country Economic Intelligence" color="text-cyan-400" />
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                {countryIntel.map(ci => {
                  const econ = ci.economy || {};
                  return (
                    <button key={ci.country_code}
                      onClick={() => {
                        const ISO2: Record<string, string> = { US: 'USA', CN: 'CHN', DE: 'EU', GB: 'GBR', SA: 'SAU', AE: 'ARE', JP: 'JPN', IN: 'IND', BR: 'BRA', RU: 'RUS', KR: 'KOR', ZA: 'ZAF', CA: 'CAN', AU: 'AUS' };
                        const sicKey = ISO2[ci.country_code] || ci.country_code;
                        setSelectedCountry({ intel: ci, sic: sicIntel[sicKey] || {} });
                      }}
                      className="text-left bg-black/50 border border-white/6 rounded-xl p-4 hover:border-cyan-500/20 hover:bg-black/65 transition-all group">
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <div className="text-[11px] font-mono font-bold text-white/75 group-hover:text-white transition-colors">{ci.country_name}</div>
                          <div className="text-[8px] text-white/22 font-mono">{econ.gdp?.formatted || ''}</div>
                        </div>
                        <ChevronRight className="w-3.5 h-3.5 text-white/18 group-hover:text-cyan-400 transition-colors" />
                      </div>
                      <div className="space-y-1.5">
                        {econ.gdp_growth?.value != null && (
                          <div className="flex justify-between text-[9px] font-mono">
                            <span className="text-white/28">GDP Growth</span>
                            <span className={cn('font-bold', econ.gdp_growth.trend === 'rising' ? 'text-emerald-400' : 'text-amber-400')}>
                              {econ.gdp_growth.value > 0 ? '+' : ''}{econ.gdp_growth.value.toFixed(1)}%
                            </span>
                          </div>
                        )}
                        {econ.inflation?.value != null && (
                          <div className="flex justify-between text-[9px] font-mono">
                            <span className="text-white/28">Inflation</span>
                            <span className={cn('font-bold', econ.inflation.value > 5 ? 'text-red-400' : econ.inflation.value > 3 ? 'text-amber-400' : 'text-emerald-400')}>
                              {econ.inflation.value.toFixed(1)}%
                            </span>
                          </div>
                        )}
                        {econ.unemployment?.value != null && (
                          <div className="flex justify-between text-[9px] font-mono">
                            <span className="text-white/28">Unemployment</span>
                            <span className="text-white/55 font-bold">{econ.unemployment.value.toFixed(1)}%</span>
                          </div>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── 7. AGENT SOCIETY ────────────────────────────────────────── */}
          <Suspense fallback={<div className="h-64 animate-pulse bg-white/5 rounded-xl border border-white/10" />}>
            <AgentSociety />
          </Suspense>

          {/* Footer */}
          <div className="text-center pb-4 pt-2">
            <div className="text-[7px] font-mono text-white/10 uppercase tracking-wider">
              Sources: FRED · Yahoo Finance · CoinGecko · Fear&Greed Index · AYN Prediction Engine · World Bank · AYN Global Intelligence
            </div>
          </div>
        </div>
      </div>

      {/* ── Side panels ─────────────────────────────────────────────────────── */}
      <AnimatePresence>
        {selectedPred && (
          <PredictionDetail pred={selectedPred} onClose={() => setSelectedPred(null)} />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {selectedCountry && (
          <CountryDossier intel={selectedCountry.intel} sic={selectedCountry.sic} onClose={() => setSelectedCountry(null)} />
        )}
      </AnimatePresence>
    </div>
  );
}
