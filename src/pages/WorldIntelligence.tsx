import { useEffect, useState, useMemo, useCallback, useRef, lazy, Suspense } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import {
  ArrowLeft, RefreshCw, Globe2, Radio, Activity,
  ChevronRight, Shield, Building2, Flame, Target,
  AlertTriangle, Users, Zap, TrendingUp, BarChart3
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { HeatMap2D, MapPoint } from '@/components/dashboard/HeatMap2D';
import ParticleCanvas from '@/components/dashboard/world/ParticleCanvas';
import { INTELLIGENCE_SEEDS, THREAT_TICKER } from '@/data/mapSeeds';
import { PremiumCard, ShimmerButton, PulsatingButton, GlassCard, BorderBeam, SpotlightCard } from '@/components/ui/premium';

const AccuracyScoreboard = lazy(() => import('@/components/dashboard/world/AccuracyScoreboard'));
const PredictionCard     = lazy(() => import('@/components/dashboard/world/PredictionCard'));
const AgentSociety       = lazy(() => import('@/components/dashboard/world/AgentSociety'));

// ─── Types ────────────────────────────────────────────────────────────────────
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
  escalation_risk?: string; conflict_signals?: Record<string, string>;
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
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function safeArr(v: any): any[] { return Array.isArray(v) ? v : []; }
function safeObj(v: any): Record<string, any> {
  return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
}
function timeAgo(d: string | null): string {
  if (!d) return '';
  const m = Math.floor((Date.now() - new Date(d).getTime()) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  return `${Math.floor(m / 60)}h ago`;
}

const SEVERITY_RING: Record<string, string> = {
  critical: 'ring-red-500/40 bg-red-500/8',
  high:     'ring-orange-500/30 bg-orange-500/6',
  medium:   'ring-amber-500/25 bg-amber-500/5',
  low:      'ring-white/8 bg-white/3',
};
const SEVERITY_DOT: Record<string, string> = {
  critical: 'bg-red-400 shadow-[0_0_8px_#f87171]',
  high:     'bg-orange-400 shadow-[0_0_8px_#fb923c]',
  medium:   'bg-amber-400 shadow-[0_0_6px_#fbbf24]',
  low:      'bg-slate-400',
};
const DOMAIN_COLOR: Record<string, string> = {
  warnings: '#ef4444', conflicts: '#ef4444', geopolitics: '#f97316',
  economy: '#f59e0b', technology: '#a78bfa', jobs: '#60a5fa',
  regions: '#06b6d4', business: '#34d399',
};
const ASSET_META: Record<string, { label: string; icon: string }> = {
  gold:    { label: 'Gold',    icon: '🥇' },
  silver:  { label: 'Silver',  icon: '🥈' },
  oil:     { label: 'Brent',   icon: '🛢️' },
  btc:     { label: 'Bitcoin', icon: '₿'  },
  eth:     { label: 'ETH',     icon: 'Ξ'  },
  copper:  { label: 'Copper',  icon: '🔶' },
  wheat:   { label: 'Wheat',   icon: '🌾' },
  usd_jpy: { label: 'USD/JPY', icon: '¥'  },
};
const SIC_COORDS: Record<string, [number, number]> = {
  USA:[-95.7,37.0],CHN:[104.1,35.8],EU:[10.4,51.1],GBR:[-3.4,55.3],
  SAU:[45.0,23.8],ARE:[53.8,23.4],JPN:[138.2,36.2],IND:[78.9,20.5],
  BRA:[-51.9,-14.2],RUS:[105.3,61.5],KOR:[127.7,35.9],
  ZAF:[22.9,-30.5],CAN:[-106.3,56.1],AUS:[133.7,-25.2],
};

// ─── Side panel: World Prediction detail ─────────────────────────────────────
function PredictionDetail({ pred, onClose }: { pred: WorldPrediction; onClose: () => void }) {
  const col = DOMAIN_COLOR[pred.domain?.toLowerCase()] || '#06b6d4';
  return (
    <motion.div
      initial={{ opacity: 0, x: 460 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 460 }}
      transition={{ type: 'spring', damping: 30, stiffness: 240 }}
      className="fixed top-0 right-0 bottom-0 w-full sm:w-[480px] z-[100] flex flex-col"
      style={{ background: 'rgba(4,5,22,0.97)', backdropFilter: 'saturate(180%) blur(24px)', borderLeft: `1px solid ${col}25`, borderTopColor: `${col}50` }}
    >
      <div className="p-5 border-b border-white/6 shrink-0">
        <div className="flex items-start gap-3 justify-between">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <span className="text-[8px] font-mono font-black uppercase tracking-[0.2em] px-2 py-0.5 rounded-full" style={{ color: col, background: `${col}18`, border: `1px solid ${col}35` }}>
                {pred.domain}
              </span>
              <span className="text-[8px] font-mono text-white/30 uppercase">{pred.region}</span>
              {pred.escalation_risk && (
                <span className={cn("text-[7px] font-mono font-black px-1.5 py-0.5 rounded-full border uppercase", SEVERITY_RING[pred.escalation_risk] || SEVERITY_RING.low, "ring-1")}>
                  {pred.escalation_risk}
                </span>
              )}
            </div>
            <h2 className="text-[15px] font-mono font-black text-white/90 leading-snug">{pred.title}</h2>
            <div className="flex items-center gap-2 mt-1.5">
              <div className="flex items-center gap-1">
                <div className="w-1.5 h-1.5 rounded-full" style={{ background: col, boxShadow: `0 0 6px ${col}` }} />
                <span className="text-[9px] font-mono font-black" style={{ color: col }}>{pred.confidence}% confidence</span>
              </div>
              {pred.probability && <span className="text-[8px] font-mono text-white/25">· {pred.probability}</span>}
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg bg-white/5 border border-white/8 hover:bg-white/10 text-white/40 hover:text-white transition-all text-[13px] font-mono shrink-0">✕</button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-5 space-y-4 scrollbar-thin">
        {pred.financial_trigger && (
          <div className="rounded-xl p-4" style={{ background: `${col}0d`, border: `1px solid ${col}28`, borderTop: `1px solid ${col}55` }}>
            <div className="text-[8px] font-mono uppercase tracking-wider mb-1.5" style={{ color: col, opacity: 0.7 }}>💰 Financial Signal</div>
            <p className="text-[11px] font-mono font-black leading-relaxed" style={{ color: col }}>{pred.financial_trigger}</p>
          </div>
        )}
        {pred.what_is_happening && (
          <div><div className="text-[8px] font-mono text-white/25 uppercase tracking-wider mb-2">What's Happening</div>
          <p className="text-[11px] font-mono text-white/60 leading-[1.8]">{pred.what_is_happening}</p></div>
        )}
        {pred.what_it_means && (
          <div><div className="text-[8px] font-mono text-white/25 uppercase tracking-wider mb-2">What This Leads To</div>
          <p className="text-[11px] font-mono text-white/60 leading-[1.8]">{pred.what_it_means}</p></div>
        )}
        {pred.historical_parallel && (
          <div className="rounded-xl p-4 bg-purple-500/5 border border-purple-500/15">
            <div className="text-[8px] font-mono text-purple-400/60 uppercase tracking-wider mb-1.5">📖 Historical Parallel</div>
            <p className="text-[10px] font-mono text-purple-200/55 leading-relaxed">{pred.historical_parallel}</p>
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          {pred.who_wins && (
            <div className="rounded-xl p-3 bg-emerald-500/5 border border-emerald-500/15">
              <div className="text-[8px] font-mono text-emerald-400/60 uppercase mb-1.5">✅ Winners</div>
              <p className="text-[10px] font-mono text-emerald-200/60 leading-relaxed">{pred.who_wins}</p>
            </div>
          )}
          {pred.who_gets_hurt && (
            <div className="rounded-xl p-3 bg-red-500/5 border border-red-500/15">
              <div className="text-[8px] font-mono text-red-400/60 uppercase mb-1.5">❌ Losers</div>
              <p className="text-[10px] font-mono text-red-200/55 leading-relaxed">{pred.who_gets_hurt}</p>
            </div>
          )}
        </div>
        {(pred.actionable_move || pred.what_to_do_now) && (
          <div className="rounded-xl p-4" style={{ background: 'rgba(0,255,200,0.04)', border: '1px solid rgba(0,255,200,0.15)' }}>
            <div className="text-[8px] font-mono text-cyan-400/60 uppercase tracking-wider mb-2">⚡ Your Move Now</div>
            {pred.actionable_move && <p className="text-[11px] font-mono font-black text-cyan-200/85 leading-relaxed mb-1.5">{pred.actionable_move}</p>}
            {pred.what_to_do_now && <p className="text-[10px] font-mono text-cyan-200/50 leading-relaxed">{pred.what_to_do_now}</p>}
          </div>
        )}
      </div>
    </motion.div>
  );
}

// ─── Side panel: Country Dossier ─────────────────────────────────────────────
function CountryDossier({ intel, onClose }: { intel: CountryIntel; onClose: () => void }) {
  const econ = intel.economy || {};
  return (
    <motion.div
      initial={{ opacity: 0, x: 460 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 460 }}
      transition={{ type: 'spring', damping: 30, stiffness: 240 }}
      className="fixed top-0 right-0 bottom-0 w-full sm:w-[440px] z-[100] flex flex-col"
      style={{ background: 'rgba(4,5,22,0.97)', backdropFilter: 'saturate(180%) blur(24px)', borderLeft: '1px solid rgba(0,255,200,0.15)' }}
    >
      <div className="p-5 border-b border-white/6 shrink-0 flex items-start justify-between">
        <div>
          <div className="text-[8px] font-mono text-cyan-400/50 uppercase tracking-[0.2em] mb-1">Country Dossier</div>
          <h2 className="text-2xl font-mono font-black text-white">{intel.country_name}</h2>
          {econ.gdp?.formatted && <div className="text-[9px] font-mono text-white/30 mt-1">GDP {econ.gdp.formatted}</div>}
        </div>
        <button onClick={onClose} className="p-2 rounded-lg bg-white/5 border border-white/8 hover:bg-white/10 text-white/40 hover:text-white transition-all text-[13px] font-mono">✕</button>
      </div>
      <div className="flex-1 overflow-y-auto p-5 space-y-5 scrollbar-thin">
        <div className="grid grid-cols-2 gap-2">
          {[
            { label: 'GDP Growth', value: econ.gdp_growth?.value != null ? `${econ.gdp_growth.value > 0 ? '+' : ''}${econ.gdp_growth.value.toFixed(1)}%` : null, good: (econ.gdp_growth?.value || 0) > 0 },
            { label: 'Inflation',  value: econ.inflation?.value != null ? `${econ.inflation.value.toFixed(1)}%` : null, good: (econ.inflation?.value || 0) < 3 },
            { label: 'Unemployment', value: econ.unemployment?.value != null ? `${econ.unemployment.value.toFixed(1)}%` : null, good: (econ.unemployment?.value || 0) < 5 },
            { label: 'Income/Person', value: econ.income_per_person?.formatted || null, good: true },
          ].filter(s => s.value).map(s => (
            <div key={s.label} className="bg-white/3 border border-white/6 rounded-xl p-3">
              <div className="text-[7px] font-mono text-white/25 uppercase mb-1">{s.label}</div>
              <div className={cn('text-sm font-mono font-black', s.good ? 'text-white/80' : 'text-amber-400')}>{s.value}</div>
            </div>
          ))}
        </div>
        {intel.intelligence_brief?.length > 0 && (
          <div>
            <div className="text-[8px] font-mono text-white/25 uppercase tracking-wider mb-3">Economic Snapshot</div>
            <div className="space-y-1">
              {intel.intelligence_brief.map((line, i) => (
                <div key={i} className="flex gap-2 py-1.5 border-b border-white/4 last:border-0">
                  <span className="text-white/15 font-mono text-[10px] shrink-0">›</span>
                  <span className="text-[10px] font-mono text-white/50 leading-relaxed">{line}</span>
                </div>
              ))}
            </div>
          </div>
        )}
        {intel.hot_sectors?.filter(Boolean).length! > 0 && (
          <div>
            <div className="text-[8px] font-mono text-white/25 uppercase tracking-wider mb-3 flex items-center gap-2">
              <Flame className="w-3 h-3 text-orange-400" /> Hot Sectors
            </div>
            <div className="flex flex-wrap gap-2">
              {intel.hot_sectors!.filter(Boolean).map((s, i) => (
                <span key={i} className="text-[10px] font-mono px-2.5 py-1 rounded-full bg-orange-500/8 border border-orange-500/18 text-orange-300/70">{s}</span>
              ))}
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function WorldIntelligence() {
  const navigate = useNavigate();
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const currentTime = useRef(new Date()).current;
  const scrollRef   = useRef<HTMLDivElement>(null);

  // ── View mode: WORLD vs AGENTS ────────────────────────────────────────────
  const [activeView, setActiveView] = useState<'world' | 'agents'>('world');

  // Data
  const [snapshot, setSnapshot]         = useState<any>(null);
  const [predictions, setPredictions]   = useState<Prediction[]>([]);
  const [signals, setSignals]           = useState<WorldSignal[]>([]);
  const [worldPreds, setWorldPreds]     = useState<WorldPrediction[]>([]);
  const [countryIntel, setCountryIntel] = useState<CountryIntel[]>([]);
  const [userId, setUserId]             = useState<string | undefined>();

  // UI
  const [activeHorizon, setActiveHorizon] = useState<'1_week' | '1_month' | '1_year'>('1_week');
  const [assetFilter, setAssetFilter]     = useState('all');
  const [activeDomain, setActiveDomain]   = useState('all');
  const [votingId, setVotingId]           = useState<string | null>(null);
  const [selectedPred, setSelectedPred]   = useState<WorldPrediction | null>(null);
  const [selectedCountry, setSelectedCountry] = useState<CountryIntel | null>(null);

  useEffect(() => { if (scrollRef.current) scrollRef.current.scrollTop = 0; window.scrollTo(0, 0); }, []);
  useEffect(() => { supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id)); }, []);

  const fetchSnapshot = useCallback(async () => {
    try {
      const { data } = await supabase.from('ayn_market_snapshot').select('snapshot,fetched_at').eq('singleton_key', 1).single();
      if (data) setSnapshot(data);
    } catch {}
  }, []);

  const fetchPredictions = useCallback(async () => {
    try {
      const { data: calibData } = await supabase.from('ayn_accuracy_calibration' as any).select('asset,real_accuracy_pct,reliability_tier,should_show_uncertainty,calibration_factor');
      const calibMap: Record<string, any> = {};
      for (const c of (calibData || []) as any[]) calibMap[c.asset] = c;
      const { data: consensus } = await supabase.from('ayn_consensus_predictions' as any)
        .select('id,asset,horizon,target_date,baseline_value,consensus_direction,consensus_pct_change,consensus_confidence,consensus_strength,ayn_reasoning,agreement,fusion_method,boost_factor')
        .eq('status', 'active').order('consensus_confidence', { ascending: false }).limit(60);
      const { data: aynPreds } = await supabase.from('ayn_predictions')
        .select('id,asset,horizon,target_date,baseline_value,predicted_value,predicted_low,predicted_high,predicted_direction,predicted_pct_change,confidence,reasoning,generated_by')
        .eq('status', 'active').in('generated_by', ['ayn_prediction_engine_v10', 'ayn_prediction_engine_v9'])
        .order('confidence', { ascending: false }).limit(60);
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
            ...p, baseline_value: Number(p.baseline_value), predicted_value: Number(p.predicted_value),
            predicted_low: Number(p.predicted_low), predicted_high: Number(p.predicted_high),
            predicted_pct_change: Number(p.predicted_pct_change),
            predicted_direction: (p.predicted_direction || 'sideways') as 'up' | 'down' | 'sideways',
            confidence: Number(p.confidence || 50), calibration: calibMap[p.asset] || null,
            agree_count: 0, disagree_count: 0, user_vote: null,
          }));
      if (!preds.length) return;
      const { data: voteCounts } = await supabase.from('ayn_prediction_vote_counts' as any).select('prediction_id,agree_count,disagree_count');
      let userVoteMap: Record<string, 'agree' | 'disagree'> = {};
      if (userId) {
        const { data: uv } = await supabase.from('ayn_prediction_votes').select('prediction_id,vote').eq('user_id', userId).in('prediction_id', preds.map(p => p.id));
        if (uv) userVoteMap = Object.fromEntries(uv.map(v => [v.prediction_id, v.vote as 'agree' | 'disagree']));
      }
      const vMap = Object.fromEntries((voteCounts || []).map((v: any) => [v.prediction_id, v]));
      setPredictions(preds.map(p => ({ ...p, agree_count: vMap[p.id]?.agree_count || 0, disagree_count: vMap[p.id]?.disagree_count || 0, user_vote: (userVoteMap[p.id] || null) as any })));
    } catch (e) { console.error('predictions:', e); }
  }, [userId]);

  const fetchSignals = useCallback(async () => {
    try {
      const { data } = await supabase.from('ayn_world_signals').select('*').eq('status', 'active').order('created_at', { ascending: false }).limit(30);
      if (data) setSignals(data as WorldSignal[]);
    } catch {}
  }, []);

  const fetchWorldPreds = useCallback(async () => {
    try {
      const { data } = await supabase.from('ayn_world_predictions')
        .select('id,domain,region,title,confidence,probability,what_is_happening,what_it_means,who_wins,who_gets_hurt,historical_parallel,what_to_do_now,actionable_move,financial_trigger,escalation_risk,conflict_signals,key_drivers,main_risks,tags')
        .eq('status', 'active').order('confidence', { ascending: false }).order('created_at', { ascending: false }).limit(100);
      if (data) setWorldPreds(data as WorldPrediction[]);
    } catch {}
  }, []);

  const fetchCountryIntel = useCallback(async () => {
    try {
      const { data } = await supabase.from('ayn_country_intelligence').select('country_code,country_name,intelligence_brief,economy,hot_sectors,opportunities').limit(20);
      if (data) setCountryIntel(data as CountryIntel[]);
    } catch {}
  }, []);

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

  // Derived
  const snap         = useMemo(() => safeObj(snapshot?.snapshot), [snapshot]);
  const macro        = useMemo(() => safeObj(snap.macro), [snap]);
  const sentiment    = useMemo(() => safeObj(safeObj(snap.markets)?.sentiment), [snap]);
  const cryptoPrices = useMemo(() => safeObj(safeObj(safeObj(snap.markets)?.crypto)?.crypto_prices), [snap]);
  const sicIntel     = useMemo(() => safeObj(snap.sic_intel), [snap]);
  const briefItems   = useMemo(() => {
    const fromDB = safeArr(snap.intelligence_brief);
    if (fromDB.length) return fromDB;
    const items: string[] = [];
    if (sentiment.value != null) items.push(`📊 Fear & Greed at ${sentiment.value} — ${sentiment.classification || 'monitoring'}.`);
    const fed = safeObj(macro.fed_funds_rate);
    if (fed.value) items.push(`⚡ Fed Rate at ${fed.value}% — policy dominant macro driver.`);
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
    if (sentiment.value) items.push({ label: 'F&G', value: `${sentiment.value}` });
    return items;
  }, [cryptoPrices, macro, sentiment]);

  const filteredPreds = useMemo(() => {
    const seen = new Set<string>();
    const ORDER = ['btc', 'eth', 'gold', 'silver', 'oil', 'copper', 'wheat', 'usd_jpy'];
    return predictions
      .filter(p => p.horizon === activeHorizon && (assetFilter === 'all' || p.asset === assetFilter))
      .filter(p => { const k = `${p.asset}-${p.horizon}`; if (seen.has(k)) return false; seen.add(k); return true; })
      .sort((a, b) => { const ai = ORDER.indexOf(a.asset); const bi = ORDER.indexOf(b.asset); if (ai === -1 && bi === -1) return 0; if (ai === -1) return 1; if (bi === -1) return -1; return ai - bi; });
  }, [predictions, activeHorizon, assetFilter]);

  const domains = useMemo(() => {
    const CORE = ['all', 'warnings', 'conflicts', 'geopolitics', 'economy', 'technology', 'jobs', 'regions', 'business'];
    const inDB = [...new Set(worldPreds.map(p => p.domain.toLowerCase()))];
    return CORE.filter(d => d === 'all' || inDB.includes(d));
  }, [worldPreds]);

  const filteredWorldPreds = useMemo(() =>
    worldPreds.filter(p => activeDomain === 'all' || p.domain.toLowerCase() === activeDomain).slice(0, 24),
  [worldPreds, activeDomain]);

  const mapPoints: MapPoint[] = useMemo(() => {
    const pts: MapPoint[] = [...INTELLIGENCE_SEEDS];
    Object.entries(sicIntel).forEach(([code, d]) => {
      const coords = SIC_COORDS[code]; if (!coords) return;
      const data = d as any;
      if (!pts.some(p => Math.abs(p.coordinates[0] - coords[0]) < 3 && Math.abs(p.coordinates[1] - coords[1]) < 3))
        pts.push({ id: code, coordinates: coords, label: data.name || code, risk: data.risk_level === 'CRITICAL' ? 'critical' : 'stable', category: 'S.I.C.', detail: 'Click for dossier →' });
    });
    return pts;
  }, [sicIntel]);

  const handleMapClick = (pt: MapPoint) => {
    const ISO2: Record<string, string> = { US:'USA',CN:'CHN',DE:'EU',GB:'GBR',SA:'SAU',AE:'ARE',JP:'JPN',IN:'IND',BR:'BRA',RU:'RUS',KR:'KOR',ZA:'ZAF',CA:'CAN',AU:'AUS',FR:'EU' };
    if (!pt.id) return;
    const intel = countryIntel.find(c => ISO2[c.country_code] === pt.id || c.country_code === pt.id);
    if (intel) setSelectedCountry(intel);
  };

  // ── Signal counts ─────────────────────────────────────────────────────────
  const criticalCount = signals.filter(s => s.severity === 'critical').length;
  const highCount     = signals.filter(s => s.severity === 'high').length;

  if (loading) return (
    <div className="min-h-screen bg-[#030610] flex items-center justify-center">
      <div className="text-center space-y-4">
        <div className="relative w-16 h-16 mx-auto">
          <div className="absolute inset-0 rounded-full border-2 border-cyan-500/20 border-t-cyan-400 animate-spin" />
          <Globe2 className="w-7 h-7 text-cyan-400/60 absolute inset-0 m-auto" />
        </div>
        <p className="text-cyan-400/70 text-[10px] font-mono tracking-[0.4em] uppercase">Initializing Intelligence</p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#030610] text-white font-mono flex flex-col overflow-x-hidden">
      <style>{`
        @keyframes wi-ticker { 0%{transform:translateX(0)} 100%{transform:translateX(-50%)} }
        @keyframes wi-scanline { 0%{transform:translateY(-100%)} 100%{transform:translateY(100vh)} }
        @keyframes wi-pulse-dot { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:0.4;transform:scale(0.8)} }
        @keyframes wi-glow-in { from{opacity:0;transform:scale(0.97) translateY(6px)} to{opacity:1;transform:scale(1) translateY(0)} }
        .wi-scrollbar::-webkit-scrollbar{width:2px} .wi-scrollbar::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.06);border-radius:99px}
      `}</style>

      {/* ── Scanline atmosphere overlay ─────────────────────────────────────── */}
      <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
        <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse at 50% 0%, rgba(0,255,200,0.03) 0%, transparent 60%), radial-gradient(ellipse at 100% 100%, rgba(0,100,255,0.03) 0%, transparent 50%)' }} />
      </div>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <header className="shrink-0 z-50 h-13 flex items-center" style={{ background: 'rgba(3,6,16,0.95)', backdropFilter: 'blur(20px)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div className="flex items-center justify-between px-4 w-full h-full">
          {/* Left */}
          <div className="flex items-center gap-3">
            <button onClick={() => navigate(-1)} className="p-1.5 rounded-lg hover:bg-white/6 transition-colors">
              <ArrowLeft className="w-4 h-4 text-white/40" />
            </button>
            <div className="w-px h-5 bg-white/8" />
            <div className="flex items-center gap-2">
              <PulsatingButton pulseColor="rgba(0,255,200,0.45)" pulseDuration={3} className="w-2 h-2 rounded-full bg-cyan-400 cursor-default p-0 border-0 min-w-0 min-h-0" style={{ padding: 0, width: 8, height: 8 }}><span /></PulsatingButton>
              <span className="text-[11px] font-black tracking-[0.2em] text-cyan-400">AYN // WORLD INTELLIGENCE</span>
            </div>

            {/* ── VIEW TABS ─────────────────────────────────────────────── */}
            <div className="hidden sm:flex items-center gap-0.5 ml-4 p-1 rounded-xl" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
              {([
                { id: 'world',  icon: Globe2, label: 'WORLD MAP' },
                { id: 'agents', icon: Users,  label: 'AGENT SOCIETY' },
              ] as const).map(tab => (
                <button key={tab.id} onClick={() => setActiveView(tab.id)}
                  className={cn('flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[9px] font-black tracking-[0.12em] transition-all duration-200 uppercase',
                    activeView === tab.id
                      ? 'text-cyan-400 bg-cyan-500/12 border border-cyan-500/25 shadow-[0_0_12px_rgba(0,255,200,0.08)]'
                      : 'text-white/30 hover:text-white/60 hover:bg-white/4')}>
                  <tab.icon className="w-3 h-3" />
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* Right */}
          <div className="flex items-center gap-2">
            {/* Signal status */}
            {criticalCount > 0 && (
              <div className="hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-red-500/10 border border-red-500/25">
                <div className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />
                <span className="text-[8px] font-black text-red-400 tracking-wider">{criticalCount} CRITICAL</span>
              </div>
            )}
            <span className="hidden lg:block text-[8px] text-white/15 tabular-nums">{format(currentTime, 'HH:mm')} UTC</span>
            {snapshot?.fetched_at && <span className="hidden xl:block text-[8px] text-white/12">Updated {timeAgo(snapshot.fetched_at)}</span>}

            <ShimmerButton onClick={() => { setRefreshing(true); Promise.all([fetchSnapshot(), fetchSignals(), fetchWorldPreds(), fetchPredictions()]).finally(() => setRefreshing(false)); }}
              disabled={refreshing} shimmerColor="rgba(0,255,200,0.1)"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[9px] font-black text-white/35 hover:text-cyan-400 border border-white/8 hover:border-cyan-500/25 transition-all">
              <RefreshCw className={cn('w-3 h-3', refreshing && 'animate-spin')} />
              SWEEP
            </ShimmerButton>
          </div>
        </div>
      </header>

      {/* ── Mobile view tabs ─────────────────────────────────────────────────── */}
      <div className="sm:hidden flex items-center gap-1 p-2 border-b border-white/6" style={{ background: 'rgba(3,6,16,0.9)' }}>
        {([
          { id: 'world', icon: Globe2, label: 'WORLD MAP' },
          { id: 'agents', icon: Users, label: 'AGENT SOCIETY' },
        ] as const).map(tab => (
          <button key={tab.id} onClick={() => setActiveView(tab.id)}
            className={cn('flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-[9px] font-black tracking-wider transition-all',
              activeView === tab.id ? 'text-cyan-400 bg-cyan-500/12 border border-cyan-500/25' : 'text-white/30')}>
            <tab.icon className="w-3 h-3" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── Live price ticker ─────────────────────────────────────────────────── */}
      {tickerItems.length > 0 && (
        <div className="shrink-0 overflow-hidden h-7 border-b border-white/4" style={{ background: 'rgba(0,0,0,0.5)' }}>
          <div className="flex animate-[wi-ticker_80s_linear_infinite] gap-10 items-center h-full px-4 whitespace-nowrap">
            {[...tickerItems, ...tickerItems].map((item, i) => (
              <span key={i} className="inline-flex items-center gap-1.5 text-[9px] font-mono">
                <span className="text-white/20 font-black tracking-wider">{item.label}</span>
                <span className="text-white/60 font-black">{item.value}</span>
                {item.change !== undefined && (
                  <span className={cn('font-black text-[8px]', item.change > 0 ? 'text-emerald-400' : item.change < 0 ? 'text-red-400' : 'text-white/15')}>
                    {item.change > 0 ? '▲' : '▼'}{Math.abs(item.change).toFixed(2)}%
                  </span>
                )}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* ── Main content ───────────────────────────────────────────────────────── */}
      <div ref={scrollRef} className="flex-1 overflow-x-hidden overflow-y-auto wi-scrollbar relative z-10">
        <AnimatePresence mode="wait">

          {/* ════════════════════════════════════════════════════════════════
              WORLD VIEW
          ════════════════════════════════════════════════════════════════ */}
          {activeView === 'world' && (
            <motion.div key="world" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>

              {/* ── HERO: Particle field + Globe (full width, tall) ──────── */}
              <ParticleCanvas particleCount={80000} className="w-full relative" style={{ height: 560 }}>
                {/* Dark vignette so globe pops */}
                <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse at center, transparent 30%, rgba(3,6,16,0.7) 100%)' }} />
                <div className="w-full h-full" style={{ background: 'rgba(0,0,0,0.15)' }}>
                  <HeatMap2D
                    points={mapPoints}
                    height={560}
                    onPointClick={handleMapClick}
                    showLayerToggle={true}
                    isLive={true}
                    ticker={THREAT_TICKER}
                  />
                </div>
                {/* Stat overlay: top-right corner of globe */}
                <div className="absolute top-16 right-4 flex flex-col gap-2 pointer-events-none">
                  {signals.length > 0 && (
                    <GlassCard className="px-3 py-2 pointer-events-none">
                      <div className="text-[7px] text-white/25 uppercase tracking-wider mb-1">Live Signals</div>
                      <div className="text-xl font-black text-white/90">{signals.length}</div>
                      {criticalCount > 0 && <div className="text-[8px] text-red-400 font-black">{criticalCount} critical</div>}
                    </GlassCard>
                  )}
                  {worldPreds.length > 0 && (
                    <GlassCard className="px-3 py-2 pointer-events-none">
                      <div className="text-[7px] text-white/25 uppercase tracking-wider mb-1">Predictions</div>
                      <div className="text-xl font-black text-white/90">{worldPreds.length}</div>
                    </GlassCard>
                  )}
                </div>
              </ParticleCanvas>

              <div className="max-w-[1440px] mx-auto px-3 sm:px-4 lg:px-5 py-6 space-y-8">

                {/* ── INTEL BRIEF + MARKET SNAPSHOT ──────────────────────── */}
                <div className="grid grid-cols-1 xl:grid-cols-[1fr_340px] gap-5">
                  {/* Brief */}
                  <GlassCard className="overflow-hidden p-0">
                    <div className="flex items-center gap-2.5 px-5 py-3.5 border-b border-white/5" style={{ background: 'linear-gradient(90deg, rgba(0,255,200,0.05), transparent)' }}>
                      <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.7)]" />
                      <Radio className="w-3.5 h-3.5 text-emerald-400" />
                      <span className="text-[10px] font-black text-emerald-400 tracking-[0.2em] uppercase">Intelligence Brief</span>
                      <div className="flex-1" />
                      <span className="text-[7px] text-white/15">AYN GLOBAL · LIVE</span>
                    </div>
                    <div className="p-4 space-y-1.5">
                      {briefItems.map((item, i) => (
                        <motion.div key={i} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }}
                          className={cn('text-[11px] font-mono leading-relaxed py-2.5 px-4 rounded-r-lg border-l-2',
                            String(item).includes('⚠') || String(item).toLowerCase().includes('fear')
                              ? 'border-l-red-500/60 text-red-200/65 bg-red-500/5'
                              : 'border-l-emerald-400/35 text-white/52 bg-white/[0.02]')}>
                          {String(item)}
                        </motion.div>
                      ))}
                    </div>
                  </GlassCard>

                  {/* Market snapshot */}
                  <div className="space-y-3">
                    <GlassCard className="p-4">
                      <div className="text-[8px] text-white/25 uppercase tracking-[0.2em] mb-3 font-black">Sentiment</div>
                      <div className={cn('text-5xl font-black mb-1 tabular-nums',
                        (sentiment.value||0) <= 25 ? 'text-red-400' : (sentiment.value||0) <= 45 ? 'text-orange-400' : (sentiment.value||0) <= 55 ? 'text-amber-400' : 'text-emerald-400')}>
                        {sentiment.value ?? '—'}
                      </div>
                      <div className="text-[9px] text-white/30 mb-3">{sentiment.classification || 'Fear & Greed'}</div>
                      <div className="h-1.5 bg-white/6 rounded-full overflow-hidden">
                        <motion.div initial={{ width: 0 }} animate={{ width: `${sentiment.value || 0}%` }} transition={{ duration: 1, ease: 'easeOut' }}
                          className={cn('h-full rounded-full', (sentiment.value||0) <= 45 ? 'bg-gradient-to-r from-red-600 to-orange-400' : 'bg-gradient-to-r from-emerald-600 to-emerald-400')} />
                      </div>
                    </GlassCard>
                    <GlassCard className="p-4">
                      <div className="text-[8px] text-white/25 uppercase tracking-[0.2em] mb-3 font-black">US Macro</div>
                      {[
                        { k: 'fed_funds_rate', label: 'Fed Rate', suffix: '%' },
                        { k: 'treasury_10yr', label: '10Y Yield', suffix: '%' },
                        { k: 'yield_curve', label: 'Yield Curve', field: 'signal' },
                      ].map(({ k, label, suffix, field }) => {
                        const d = safeObj(macro[k]); const val = field ? d[field as keyof typeof d] : d.value;
                        if (!val) return null;
                        return (
                          <div key={k} className="flex justify-between items-center py-2 border-b border-white/4 last:border-0">
                            <span className="text-[10px] text-white/40">{label}</span>
                            <span className="text-[13px] text-white/85 font-black">{String(val)}{suffix||''}</span>
                          </div>
                        );
                      })}
                    </GlassCard>
                  </div>
                </div>

                {/* ── LIVE SIGNALS ─────────────────────────────────────────── */}
                {signals.length > 0 && (
                  <section>
                    <div className="flex items-center gap-2.5 mb-4">
                      <div className="w-1 h-5 rounded-full bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.6)]" />
                      <AlertTriangle className="w-4 h-4 text-red-400" />
                      <span className="text-[10px] font-black text-red-400 tracking-[0.18em] uppercase">Live World Signals</span>
                      <span className="text-[8px] font-mono text-white/18">{signals.length} active</span>
                      <div className="flex-1 h-px" style={{ background: 'linear-gradient(90deg, rgba(239,68,68,0.3), transparent)' }} />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                      {signals.slice(0, 9).map((s, idx) => (
                        <motion.div key={s.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.04 }}>
                          <SpotlightCard spotlightColor="rgba(255,255,255,0.04)" spotlightSize={220}
                            className={cn('rounded-xl p-4 border relative overflow-hidden h-full',
                              s.severity === 'critical' ? 'border-red-500/25 bg-red-500/5'
                              : s.severity === 'high' ? 'border-orange-500/18 bg-orange-500/4'
                              : 'border-white/7 bg-white/[0.02]')}>
                            <BorderBeam
                              colorFrom={s.severity === 'critical' ? 'rgba(239,68,68,0.8)' : s.severity === 'high' ? 'rgba(251,146,60,0.6)' : 'rgba(255,255,255,0.12)'}
                              colorTo="transparent" duration={s.severity === 'critical' ? 2.5 : 5} size={50} />
                            <div className="flex items-center gap-2 mb-2.5">
                              <div className={cn('w-2 h-2 rounded-full shrink-0', SEVERITY_DOT[s.severity] || SEVERITY_DOT.low)} style={{ animation: s.severity === 'critical' ? 'wi-pulse-dot 1s ease-in-out infinite' : undefined }} />
                              <span className={cn('text-[7px] font-black uppercase tracking-[0.18em] px-2 py-0.5 rounded-full border',
                                s.severity === 'critical' ? 'text-red-400 border-red-500/35 bg-red-500/10'
                                : s.severity === 'high' ? 'text-orange-400 border-orange-500/30 bg-orange-500/8'
                                : 'text-white/35 border-white/10 bg-white/4')}>
                                {s.severity}
                              </span>
                              <span className="text-[7px] font-mono text-white/20 uppercase ml-auto">{s.region?.replace('_', ' ')}</span>
                            </div>
                            <p className="text-[11px] font-mono text-white/80 leading-snug mb-3 font-bold">{s.headline}</p>
                            <div className="flex items-center gap-3 pt-2 border-t border-white/5">
                              {[
                                { label: '🛢️', val: s.impact_on_oil },
                                { label: '🥇', val: s.impact_on_gold },
                              ].map(({ label, val }) => val && val !== 'stable' && (
                                <span key={label} className={cn('text-[8px] font-mono font-black flex items-center gap-1',
                                  val === 'spike' ? 'text-red-400' : val === 'drop' ? 'text-emerald-400' : 'text-amber-400')}>
                                  {label} {val === 'spike' ? '↑' : val === 'drop' ? '↓' : '~'}
                                </span>
                              ))}
                              {s.countries_involved?.length > 0 && (
                                <span className="text-[7px] font-mono text-white/20 ml-auto">{s.countries_involved.slice(0, 2).join(' · ')}</span>
                              )}
                            </div>
                          </SpotlightCard>
                        </motion.div>
                      ))}
                    </div>
                  </section>
                )}

                {/* ── GLOBAL INTELLIGENCE PREDICTIONS ──────────────────────── */}
                {worldPreds.length > 0 && (
                  <section>
                    <div className="flex items-center gap-2.5 mb-4">
                      <div className="w-1 h-5 rounded-full bg-cyan-400 shadow-[0_0_8px_rgba(0,255,200,0.5)]" />
                      <Globe2 className="w-4 h-4 text-cyan-400" />
                      <span className="text-[10px] font-black text-cyan-400 tracking-[0.18em] uppercase">Global Intelligence</span>
                      <span className="text-[8px] font-mono text-white/18">{worldPreds.length} predictions</span>
                      <div className="flex-1 h-px" style={{ background: 'linear-gradient(90deg, rgba(0,255,200,0.25), transparent)' }} />
                    </div>

                    {/* Domain filter */}
                    <div className="flex flex-wrap gap-1 mb-4 p-1.5 rounded-xl" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                      {domains.map(d => {
                        const col = d === 'all' ? '#06b6d4' : (DOMAIN_COLOR[d] || '#9ca3af');
                        return (
                          <button key={d} onClick={() => setActiveDomain(d)}
                            className="px-3 py-1.5 rounded-lg text-[8px] font-black uppercase tracking-wider transition-all"
                            style={{
                              color: activeDomain === d ? col : 'rgba(255,255,255,0.3)',
                              background: activeDomain === d ? `${col}14` : 'transparent',
                              border: activeDomain === d ? `1px solid ${col}35` : '1px solid transparent',
                            }}>
                            {d === 'all' ? 'ALL' : d.toUpperCase()}
                          </button>
                        );
                      })}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                      {filteredWorldPreds.map((p, idx) => {
                        const col = DOMAIN_COLOR[p.domain?.toLowerCase()] || '#9ca3af';
                        const isConflict = ['conflicts', 'warnings'].includes(p.domain?.toLowerCase());
                        return (
                          <motion.div key={p.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.03 }}>
                            <PremiumCard
                              showBeam beamColor={isConflict ? 'rgba(239,68,68,0.55)' : `${col}70`}
                              beamDuration={isConflict ? 3.5 : 6}
                              spotlightColor="rgba(255,255,255,0.05)" spotlightSize={200}
                              onClick={() => setSelectedPred(p)} role="button" tabIndex={0}
                              onKeyDown={(e: React.KeyboardEvent) => e.key === 'Enter' && setSelectedPred(p)}
                              className={cn('cursor-pointer group h-full', isConflict && p.escalation_risk === 'critical' ? '!border-red-500/22' : isConflict ? '!border-orange-500/18' : '')}
                              style={{}}>
                              <div className="p-4">
                                {/* Domain + region + confidence */}
                                <div className="flex items-center justify-between mb-3">
                                  <span className="text-[7px] font-black uppercase tracking-[0.18em] px-2 py-0.5 rounded-full" style={{ color: col, background: `${col}16`, border: `1px solid ${col}30` }}>
                                    {p.domain}
                                  </span>
                                  <div className="flex items-center gap-1.5">
                                    {p.escalation_risk && (
                                      <div className={cn('w-1.5 h-1.5 rounded-full', SEVERITY_DOT[p.escalation_risk] || 'bg-white/20')} />
                                    )}
                                    <span className="text-[8px] font-black text-white/35">{p.confidence}%</span>
                                  </div>
                                </div>
                                <div className="text-[7px] font-mono text-white/25 uppercase tracking-wider mb-1.5">{p.region}</div>
                                <h3 className="text-[12px] font-black text-white/85 leading-snug mb-2.5 group-hover:text-white transition-colors line-clamp-2">{p.title}</h3>
                                <p className="text-[10px] font-mono text-white/40 leading-relaxed line-clamp-2 mb-3">{p.what_is_happening}</p>
                                <div className="flex items-center justify-between pt-2.5 border-t border-white/5">
                                  <div className="flex gap-1.5">
                                    {p.financial_trigger && <span className="text-[7px] font-black px-1.5 py-0.5 rounded bg-amber-500/10 border border-amber-500/20 text-amber-400/70">$ SIGNAL</span>}
                                    {p.who_wins && <span className="text-[7px] font-black px-1.5 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/18 text-emerald-400/70">WINNERS</span>}
                                  </div>
                                  <span className="text-[7px] font-mono text-white/18 group-hover:text-white/40 transition-colors">Analyse →</span>
                                </div>
                              </div>
                            </PremiumCard>
                          </motion.div>
                        );
                      })}
                    </div>
                  </section>
                )}

                {/* ── PRICE PREDICTION ENGINE ───────────────────────────────── */}
                <section>
                  <div className="flex items-center gap-2.5 mb-4">
                    <div className="w-1 h-5 rounded-full bg-purple-400 shadow-[0_0_8px_rgba(167,139,250,0.5)]" />
                    <Target className="w-4 h-4 text-purple-400" />
                    <span className="text-[10px] font-black text-purple-400 tracking-[0.18em] uppercase">Price Prediction Engine</span>
                    <span className="text-[8px] font-mono text-white/18">{filteredPreds.length} active</span>
                    <div className="flex-1 h-px" style={{ background: 'linear-gradient(90deg, rgba(167,139,250,0.3), transparent)' }} />
                  </div>

                  <Suspense fallback={<div className="h-24 animate-pulse rounded-xl bg-white/3 border border-white/6 mb-4" />}>
                    <AccuracyScoreboard />
                  </Suspense>

                  {/* Horizon + asset filters */}
                  <div className="flex flex-wrap gap-2 my-4">
                    <div className="flex gap-0.5 p-1 rounded-lg" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
                      {(['1_week', '1_month', '1_year'] as const).map(h => (
                        <button key={h} onClick={() => setActiveHorizon(h)}
                          className={cn('px-3 py-1.5 rounded-md text-[8px] font-black uppercase tracking-wider transition-all',
                            activeHorizon === h ? 'bg-purple-500/18 text-purple-400 border border-purple-500/30' : 'text-white/25 hover:text-white/50')}>
                          {h === '1_week' ? '1W' : h === '1_month' ? '1M' : '1Y'}
                        </button>
                      ))}
                    </div>
                    <div className="flex gap-0.5 p-1 rounded-lg flex-wrap" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
                      <button onClick={() => setAssetFilter('all')} className={cn('px-2.5 py-1.5 rounded-md text-[8px] font-black transition-all', assetFilter === 'all' ? 'bg-white/10 text-white' : 'text-white/25 hover:text-white/50')}>ALL</button>
                      {Object.entries(ASSET_META).map(([a, m]) => (
                        <button key={a} onClick={() => setAssetFilter(a)} title={m.label} className={cn('px-2.5 py-1.5 rounded-md text-[12px] transition-all', assetFilter === a ? 'bg-white/10' : 'text-white/40 hover:text-white/70')}>{m.icon}</button>
                      ))}
                    </div>
                  </div>

                  {filteredPreds.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                      {filteredPreds.map(p => (
                        <Suspense key={p.id} fallback={<div className="h-28 animate-pulse rounded-xl bg-white/3 border border-white/6" />}>
                          <PredictionCard pred={p} onVote={handleVote} userId={userId} voting={votingId === p.id} />
                        </Suspense>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-10 text-white/18 text-[10px] font-mono">No predictions for this filter.</div>
                  )}
                </section>

                {/* ── COUNTRY ECONOMIC INTELLIGENCE ──────────────────────────── */}
                {countryIntel.length > 0 && (
                  <section>
                    <div className="flex items-center gap-2.5 mb-4">
                      <div className="w-1 h-5 rounded-full bg-cyan-400 shadow-[0_0_8px_rgba(0,255,200,0.4)]" />
                      <Building2 className="w-4 h-4 text-cyan-400" />
                      <span className="text-[10px] font-black text-cyan-400 tracking-[0.18em] uppercase">Country Intelligence</span>
                      <div className="flex-1 h-px" style={{ background: 'linear-gradient(90deg, rgba(0,255,200,0.2), transparent)' }} />
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2.5">
                      {countryIntel.map(ci => {
                        const econ = ci.economy || {};
                        const gdpGrowth = econ.gdp_growth?.value;
                        const infl = econ.inflation?.value;
                        return (
                          <SpotlightCard key={ci.country_code} spotlightColor="rgba(0,255,200,0.05)" spotlightSize={150}
                            onClick={() => setSelectedCountry(ci)}
                            className="bg-white/[0.025] border border-white/7 rounded-xl p-3.5 hover:border-cyan-500/22 transition-all group cursor-pointer [border-top-color:rgba(255,255,255,0.1)]">
                            <div className="flex items-start justify-between mb-2.5">
                              <div className="text-[11px] font-black text-white/80 group-hover:text-white transition-colors leading-tight">{ci.country_name}</div>
                              <ChevronRight className="w-3 h-3 text-white/15 group-hover:text-cyan-400 transition-colors shrink-0" />
                            </div>
                            {econ.gdp?.formatted && <div className="text-[8px] text-white/20 mb-2">{econ.gdp.formatted}</div>}
                            <div className="space-y-1">
                              {gdpGrowth != null && (
                                <div className="flex justify-between text-[8px]">
                                  <span className="text-white/25">GDP</span>
                                  <span className={cn('font-black', econ.gdp_growth?.trend === 'rising' ? 'text-emerald-400' : 'text-amber-400')}>{gdpGrowth > 0 ? '+' : ''}{gdpGrowth.toFixed(1)}%</span>
                                </div>
                              )}
                              {infl != null && (
                                <div className="flex justify-between text-[8px]">
                                  <span className="text-white/25">CPI</span>
                                  <span className={cn('font-black', infl > 5 ? 'text-red-400' : infl > 3 ? 'text-amber-400' : 'text-emerald-400')}>{infl.toFixed(1)}%</span>
                                </div>
                              )}
                            </div>
                          </SpotlightCard>
                        );
                      })}
                    </div>
                  </section>
                )}

                <div className="text-center py-4 text-[7px] font-mono text-white/8 uppercase tracking-wider">
                  Sources: FRED · Yahoo Finance · CoinGecko · Fear&Greed · AYN Prediction Engine · World Bank
                </div>
              </div>
            </motion.div>
          )}

          {/* ════════════════════════════════════════════════════════════════
              AGENT SOCIETY VIEW
          ════════════════════════════════════════════════════════════════ */}
          {activeView === 'agents' && (
            <motion.div key="agents" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}
              className="min-h-full">
              {/* Agent Society header bar */}
              <div className="border-b border-purple-500/15 px-5 py-3 flex items-center gap-3" style={{ background: 'linear-gradient(90deg, rgba(168,85,247,0.06), transparent)' }}>
                <div className="w-2 h-2 rounded-full bg-purple-400 shadow-[0_0_8px_rgba(168,85,247,0.7)] animate-pulse" />
                <span className="text-[10px] font-black text-purple-400 tracking-[0.18em] uppercase">Agent Society</span>
                <span className="text-[8px] font-mono text-white/20">// Live AI agents · World reaction simulation</span>
                <div className="flex-1 h-px" style={{ background: 'linear-gradient(90deg, rgba(168,85,247,0.2), transparent)' }} />
              </div>
              <div className="p-4">
                <Suspense fallback={
                  <div className="flex items-center justify-center h-80">
                    <div className="text-center space-y-3">
                      <div className="w-12 h-12 rounded-full border-2 border-purple-500/20 border-t-purple-400 animate-spin mx-auto" />
                      <p className="text-[9px] font-mono text-purple-400/50 tracking-widest">LOADING AGENT NETWORK</p>
                    </div>
                  </div>
                }>
                  <AgentSociety />
                </Suspense>
              </div>
            </motion.div>
          )}

        </AnimatePresence>
      </div>

      {/* ── Side panels ───────────────────────────────────────────────────────── */}
      <AnimatePresence>
        {selectedPred && <PredictionDetail pred={selectedPred} onClose={() => setSelectedPred(null)} />}
      </AnimatePresence>
      <AnimatePresence>
        {selectedCountry && <CountryDossier intel={selectedCountry} onClose={() => setSelectedCountry(null)} />}
      </AnimatePresence>
    </div>
  );
}
