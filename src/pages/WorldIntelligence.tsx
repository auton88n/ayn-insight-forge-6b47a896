import { useEffect, useState, useMemo, useCallback, useRef, lazy, Suspense } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import {
  ArrowLeft, RefreshCw, Globe2, Radio, Activity,
  ChevronRight, Shield, Building2, Flame, Target,
  AlertTriangle, Users, Zap, TrendingUp, BarChart3,
  Network, TrendingDown, Eye, LayoutDashboard, Signal,
  MapPin, ChevronLeft, Menu
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { HeatMap2D, MapPoint } from '@/components/dashboard/HeatMap2D';
import { INTELLIGENCE_SEEDS, THREAT_TICKER } from '@/data/mapSeeds';

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
interface MasterPrediction {
  id: string; run_id: string; created_at: string;
  title: string; thesis: string; horizon: string;
  probability_pct: number; confidence: number;
  who_wins: string; who_wins_detail: string;
  who_loses: string; who_loses_detail: string;
  actionable_move: string; what_to_watch: string;
  driving_signals: Array<{signal: string; value: string; direction: string}>;
  contradicting: Array<{signal: string; reason: string}>;
  historical_anchor: string; wisdom_applied: string;
  domain: string; region: string; tags: string[];
  graph_coherence: number; signal_quality: number;
}
interface CountryIntel {
  country_code: string; country_name: string;
  intelligence_brief: any[];
  economy: {
    gdp?: { formatted: string };
    gdp_growth?: { value: number; trend: string };
    inflation?: { value: number; trend: string };
    unemployment?: { value: number; trend: string };
    income_per_person?: { formatted: string };
  };
  hot_sectors?: any[];
  opportunities?: any[];
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

const DOMAIN_COLOR: Record<string, string> = {
  warnings: '#ef4444', conflicts: '#ef4444', geopolitics: '#f97316',
  economy: '#f59e0b', technology: '#a78bfa', jobs: '#60a5fa',
  regions: '#06b6d4', business: '#34d399',
  markets: '#60a5fa', energy: '#34d399', society: '#f472b6',
  demographics: '#94a3b8', opportunities: '#4ade80',
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

type ViewSection = 'overview' | 'signals' | 'predictions' | 'countries' | 'agents';

const NAV_ITEMS: { id: ViewSection; icon: typeof LayoutDashboard; label: string }[] = [
  { id: 'overview',    icon: LayoutDashboard, label: 'Overview' },
  { id: 'signals',     icon: Signal,          label: 'Signals' },
  { id: 'predictions', icon: Target,          label: 'Predictions' },
  { id: 'countries',   icon: MapPin,          label: 'Countries' },
  { id: 'agents',      icon: Users,           label: 'Agents' },
];

// ─── Country Dossier Side Panel ──────────────────────────────────────────────
function CountryDossier({ intel, onClose }: { intel: CountryIntel; onClose: () => void }) {
  const econ = intel.economy || {};
  return (
    <motion.div
      initial={{ opacity: 0, x: 460 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 460 }}
      transition={{ type: 'spring', damping: 30, stiffness: 240 }}
      className="fixed top-0 right-0 bottom-0 w-full sm:w-[440px] z-[100] flex flex-col bg-background border-l border-border"
    >
      <div className="p-5 border-b border-border shrink-0 flex items-start justify-between">
        <div>
          <p className="text-xs text-muted-foreground uppercase tracking-widest mb-1">Country Dossier</p>
          <h2 className="text-2xl font-display font-bold text-foreground">{intel.country_name}</h2>
          {econ.gdp?.formatted && <p className="text-xs text-muted-foreground mt-1">GDP {econ.gdp.formatted}</p>}
        </div>
        <button onClick={onClose} className="p-2 rounded-lg bg-muted hover:bg-muted/80 text-muted-foreground hover:text-foreground transition-all">✕</button>
      </div>
      <div className="flex-1 overflow-y-auto p-5 space-y-5">
        <div className="grid grid-cols-2 gap-2">
          {[
            { label: 'GDP Growth', value: econ.gdp_growth?.value != null ? `${econ.gdp_growth.value > 0 ? '+' : ''}${econ.gdp_growth.value.toFixed(1)}%` : null, good: (econ.gdp_growth?.value || 0) > 0 },
            { label: 'Inflation',  value: econ.inflation?.value != null ? `${econ.inflation.value.toFixed(1)}%` : null, good: (econ.inflation?.value || 0) < 3 },
            { label: 'Unemployment', value: econ.unemployment?.value != null ? `${econ.unemployment.value.toFixed(1)}%` : null, good: (econ.unemployment?.value || 0) < 5 },
            { label: 'Income/Person', value: econ.income_per_person?.formatted || null, good: true },
          ].filter(s => s.value).map(s => (
            <div key={s.label} className="bg-muted/50 border border-border rounded-xl p-3">
              <p className="text-[10px] text-muted-foreground uppercase mb-1">{s.label}</p>
              <p className={cn('text-sm font-semibold', s.good ? 'text-foreground' : 'text-amber-500')}>{s.value}</p>
            </div>
          ))}
        </div>
        {intel.intelligence_brief?.length > 0 && (
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wider mb-3 font-semibold">Economic Snapshot</p>
            <div className="space-y-1">
              {intel.intelligence_brief.map((line, i) => {
                const text = typeof line === 'string' ? line : (line?.title || line?.snippet || JSON.stringify(line));
                return (
                  <div key={i} className="flex gap-2 py-1.5 border-b border-border last:border-0">
                    <span className="text-muted-foreground text-xs shrink-0">›</span>
                    <span className="text-xs text-muted-foreground leading-relaxed">{text}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
        {intel.hot_sectors?.filter(Boolean).length! > 0 && (
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wider mb-3 font-semibold flex items-center gap-2">
              <Flame className="w-3.5 h-3.5 text-orange-500" /> Hot Sectors
            </p>
            <div className="flex flex-wrap gap-2">
              {intel.hot_sectors!.filter(Boolean).map((s, i) => {
                const label = typeof s === 'string' ? s : (s?.name || s?.title || JSON.stringify(s));
                return <span key={i} className="text-xs px-2.5 py-1 rounded-full bg-orange-500/10 border border-orange-500/20 text-orange-600 dark:text-orange-400">{label}</span>;
              })}
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
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const currentTime = useRef(new Date()).current;

  // Navigation
  const [activeSection, setActiveSection] = useState<ViewSection>('overview');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Data
  const [snapshot, setSnapshot] = useState<any>(null);
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [signals, setSignals] = useState<WorldSignal[]>([]);
  const [masterPreds, setMasterPreds] = useState<MasterPrediction[]>([]);
  const [selectedMaster, setSelectedMaster] = useState<MasterPrediction | null>(null);
  const [masterFilter, setMasterFilter] = useState<string>('all');
  const [countryIntel, setCountryIntel] = useState<CountryIntel[]>([]);
  const [userId, setUserId] = useState<string | undefined>();

  // UI
  const [activeHorizon, setActiveHorizon] = useState<'1_week' | '1_month' | '1_year'>('1_week');
  const [assetFilter, setAssetFilter] = useState('all');
  const [votingId, setVotingId] = useState<string | null>(null);
  const [selectedCountry, setSelectedCountry] = useState<CountryIntel | null>(null);

  useEffect(() => { window.scrollTo(0, 0); }, []);
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

  const fetchMasterPreds = useCallback(async () => {
    try {
      const { data } = await (supabase.from('ayn_master_predictions' as any)
        .select('*').order('created_at', { ascending: false }).limit(8) as any);
      if (data) setMasterPreds(data as MasterPrediction[]);
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
    setTimeout(() => fetchMasterPreds(), 600);
    setTimeout(() => fetchPredictions(), 600);
    setTimeout(() => fetchCountryIntel(), 900);
    const poll = setInterval(fetchSnapshot, 5 * 60 * 1000);
    return () => clearInterval(poll);
  }, [fetchSnapshot, fetchSignals, fetchPredictions, fetchCountryIntel]);

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
  const snap         = useMemo(() => safeObj(snapshot?.snapshot), [snapshot]);
  const macro        = useMemo(() => safeObj(snap.macro), [snap]);
  const sentiment    = useMemo(() => safeObj(safeObj(snap.markets)?.sentiment), [snap]);
  const cryptoPrices = useMemo(() => safeObj(safeObj(safeObj(snap.markets)?.crypto)?.crypto_prices), [snap]);
  const sicIntel     = useMemo(() => safeObj(snap.sic_intel), [snap]);
  const briefItems   = useMemo(() => {
    const fromDB = safeArr(snap.intelligence_brief);
    if (fromDB.length) return fromDB;
    const items: string[] = [];
    if (sentiment.value != null) items.push(`Fear & Greed at ${sentiment.value} — ${sentiment.classification || 'monitoring'}.`);
    const fed = safeObj(macro.fed_funds_rate);
    if (fed.value) items.push(`Fed Rate at ${fed.value}% — policy dominant macro driver.`);
    return items.length ? items : ['Intelligence brief populates on next data sweep.'];
  }, [snap, sentiment, macro]);

  const tickerItems = useMemo(() => {
    const items: { label: string; value: string; change?: number }[] = [];
    Object.entries(cryptoPrices).forEach(([sym, d]: [string, any]) =>
      items.push({ label: sym.toUpperCase(), value: `$${Number(d.price).toLocaleString()}`, change: parseFloat(d.change_24h_pct || '0') }));
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
    const ISO2: Record<string, string> = { US:'USA',CN:'CHN',DE:'DEU',GB:'GBR',SA:'SAU',AE:'ARE',JP:'JPN',IN:'IND',BR:'BRA',RU:'RUS',KR:'KOR',ZA:'ZAF',CA:'CAN',AU:'AUS',FR:'FRA',QA:'QAT',SG:'SGP',EG:'EGY',NG:'NGA',MX:'MEX',ID:'IDN',TR:'TUR',PK:'PAK',TH:'THA',MY:'MYS' };
    if (!pt.id) return;
    const intel = countryIntel.find(c => ISO2[c.country_code] === pt.id || c.country_code === pt.id);
    if (intel) setSelectedCountry(intel);
  };

  const criticalCount = signals.filter(s => s.severity === 'critical').length;

  const handleRefresh = () => {
    setRefreshing(true);
    Promise.all([fetchSnapshot(), fetchSignals(), fetchPredictions(), fetchMasterPreds()]).finally(() => setRefreshing(false));
  };

  // ─── Loading state ──────────────────────────────────────────────────────────
  if (loading) return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="text-center space-y-4">
        <div className="relative w-16 h-16 mx-auto">
          <div className="absolute inset-0 rounded-full border-2 border-border border-t-foreground animate-spin" />
          <Globe2 className="w-7 h-7 text-muted-foreground absolute inset-0 m-auto" />
        </div>
        <p className="text-muted-foreground text-sm tracking-widest uppercase">Loading Intelligence</p>
      </div>
    </div>
  );

  // ─── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      {/* ── Top Header ──────────────────────────────────────────────────────── */}
      <header className="shrink-0 z-50 h-14 flex items-center border-b border-border bg-background/95 backdrop-blur-xl px-4">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <button onClick={() => navigate(-1)} className="p-2 rounded-lg hover:bg-muted transition-colors">
            <ArrowLeft className="w-4 h-4 text-muted-foreground" />
          </button>
          {/* Mobile menu toggle */}
          <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)} className="p-2 rounded-lg hover:bg-muted transition-colors md:hidden">
            <Menu className="w-4 h-4 text-muted-foreground" />
          </button>
          <div className="hidden sm:block w-px h-6 bg-border" />
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <h1 className="text-sm font-display font-bold tracking-tight truncate">World Intelligence</h1>
          </div>
        </div>

        {/* Right side */}
        <div className="flex items-center gap-3">
          {criticalCount > 0 && (
            <div className="hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-destructive/10 border border-destructive/20">
              <div className="w-1.5 h-1.5 rounded-full bg-destructive animate-pulse" />
              <span className="text-[10px] font-semibold text-destructive tracking-wider">{criticalCount} CRITICAL</span>
            </div>
          )}
          <span className="hidden lg:block text-xs text-muted-foreground tabular-nums">{format(currentTime, 'HH:mm')} UTC</span>
          {snapshot?.fetched_at && <span className="hidden xl:block text-xs text-muted-foreground">Updated {timeAgo(snapshot.fetched_at)}</span>}
          <button onClick={handleRefresh} disabled={refreshing}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground border border-border hover:bg-muted transition-all">
            <RefreshCw className={cn('w-3.5 h-3.5', refreshing && 'animate-spin')} />
            <span className="hidden sm:inline">Refresh</span>
          </button>
        </div>
      </header>

      {/* ── Price Ticker ───────────────────────────────────────────────────── */}
      {tickerItems.length > 0 && (
        <div className="shrink-0 overflow-hidden h-9 border-b border-border bg-muted/30">
          <div className="flex animate-[wi-ticker_80s_linear_infinite] gap-8 items-center h-full px-4 whitespace-nowrap">
            {[...tickerItems, ...tickerItems].map((item, i) => (
              <span key={i} className="inline-flex items-center gap-2 text-xs">
                <span className="text-muted-foreground font-medium">{item.label}</span>
                <span className="text-foreground font-semibold">{item.value}</span>
                {item.change !== undefined && (
                  <span className={cn('font-semibold text-[11px]', item.change > 0 ? 'text-emerald-600 dark:text-emerald-400' : item.change < 0 ? 'text-red-600 dark:text-red-400' : 'text-muted-foreground')}>
                    {item.change > 0 ? '↑' : '↓'}{Math.abs(item.change).toFixed(2)}%
                  </span>
                )}
              </span>
            ))}
          </div>
        </div>
      )}

      <style>{`@keyframes wi-ticker { 0%{transform:translateX(0)} 100%{transform:translateX(-50%)} }`}</style>

      <div className="flex flex-1 overflow-hidden">
        {/* ── Sidebar ──────────────────────────────────────────────────────── */}
        <aside className={cn(
          "shrink-0 border-r border-border bg-card hidden md:flex flex-col transition-all duration-300",
          sidebarCollapsed ? "w-16" : "w-56"
        )}>
          <nav className="flex-1 py-3 px-2 space-y-1">
            {NAV_ITEMS.map(item => {
              const isActive = activeSection === item.id;
              const count = item.id === 'signals' ? signals.length : item.id === 'predictions' ? masterPreds.length + filteredPreds.length : item.id === 'countries' ? countryIntel.length : undefined;
              return (
                <button key={item.id} onClick={() => setActiveSection(item.id)}
                  className={cn(
                    "w-full flex items-center gap-3 rounded-xl transition-all duration-200 group",
                    sidebarCollapsed ? "px-3 py-3 justify-center" : "px-3 py-2.5",
                    isActive
                      ? "bg-foreground text-background shadow-sm"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted"
                  )}>
                  <item.icon className="w-4 h-4 shrink-0" />
                  {!sidebarCollapsed && (
                    <>
                      <span className="text-sm font-medium flex-1 text-left">{item.label}</span>
                      {count !== undefined && count > 0 && (
                        <span className={cn("text-[10px] font-semibold px-1.5 py-0.5 rounded-full",
                          isActive ? "bg-background/20 text-background" : "bg-muted text-muted-foreground"
                        )}>{count}</span>
                      )}
                    </>
                  )}
                </button>
              );
            })}
          </nav>
          <div className="p-2 border-t border-border">
            <button onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
              className="w-full flex items-center justify-center py-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
              {sidebarCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
            </button>
          </div>
        </aside>

        {/* ── Mobile Nav Overlay ────────────────────────────────────────────── */}
        <AnimatePresence>
          {mobileMenuOpen && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 md:hidden bg-background/80 backdrop-blur-sm"
              onClick={() => setMobileMenuOpen(false)}>
              <motion.div initial={{ x: -240 }} animate={{ x: 0 }} exit={{ x: -240 }}
                transition={{ type: 'spring', damping: 25 }}
                className="w-60 h-full bg-card border-r border-border p-4 space-y-2"
                onClick={e => e.stopPropagation()}>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-4 px-2">Navigation</p>
                {NAV_ITEMS.map(item => (
                  <button key={item.id} onClick={() => { setActiveSection(item.id); setMobileMenuOpen(false); }}
                    className={cn(
                      "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all text-sm",
                      activeSection === item.id
                        ? "bg-foreground text-background font-semibold"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted"
                    )}>
                    <item.icon className="w-4 h-4" />
                    {item.label}
                  </button>
                ))}
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Main Content ──────────────────────────────────────────────────── */}
        <main className="flex-1 overflow-y-auto">
          <AnimatePresence mode="wait">

            {/* ════════ OVERVIEW ════════ */}
            {activeSection === 'overview' && (
              <motion.div key="overview" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}
                className="p-4 sm:p-6 space-y-6 max-w-[1400px] mx-auto">

                {/* Map */}
                <div className="rounded-2xl overflow-hidden border border-border" style={{ height: 'clamp(300px, 50vh, 500px)' }}>
                  <HeatMap2D
                    points={mapPoints}
                    height={undefined as any}
                    onPointClick={handleMapClick}
                    showLayerToggle={true}
                    isLive={true}
                    ticker={THREAT_TICKER}
                  />
                </div>

                {/* Brief + Sentiment */}
                <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-5">
                  {/* Intelligence Brief */}
                  <div className="bg-card rounded-2xl border border-border overflow-hidden">
                    <div className="flex items-center gap-2.5 px-5 py-3.5 border-b border-border">
                      <Radio className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                      <h2 className="text-sm font-semibold">Intelligence Brief</h2>
                      <div className="flex-1" />
                      <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Live</span>
                    </div>
                    <div className="p-4 space-y-2">
                      {briefItems.map((item, i) => (
                        <motion.div key={i} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }}
                          className={cn('text-sm leading-relaxed py-2.5 px-4 rounded-lg border-l-2',
                            String(item).includes('⚠') || String(item).toLowerCase().includes('fear')
                              ? 'border-l-destructive/60 text-destructive/80 bg-destructive/5'
                              : 'border-l-emerald-500/50 text-muted-foreground bg-muted/30')}>
                          {String(item)}
                        </motion.div>
                      ))}
                    </div>
                  </div>

                  {/* Right column: Sentiment + Macro */}
                  <div className="space-y-4">
                    <div className="bg-card rounded-2xl border border-border p-5">
                      <p className="text-xs text-muted-foreground uppercase tracking-wider mb-3 font-semibold">Market Sentiment</p>
                      <div className={cn('text-4xl font-display font-bold mb-1 tabular-nums',
                        (sentiment.value||0) <= 25 ? 'text-red-600 dark:text-red-400' : (sentiment.value||0) <= 45 ? 'text-orange-600 dark:text-orange-400' : (sentiment.value||0) <= 55 ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400')}>
                        {sentiment.value ?? '—'}
                      </div>
                      <p className="text-sm text-muted-foreground mb-3">{sentiment.classification || 'Fear & Greed Index'}</p>
                      <div className="h-2 bg-muted rounded-full overflow-hidden">
                        <motion.div initial={{ width: 0 }} animate={{ width: `${sentiment.value || 0}%` }} transition={{ duration: 1, ease: 'easeOut' }}
                          className={cn('h-full rounded-full', (sentiment.value||0) <= 45 ? 'bg-gradient-to-r from-red-600 to-orange-500' : 'bg-gradient-to-r from-emerald-600 to-emerald-400')} />
                      </div>
                    </div>
                    <div className="bg-card rounded-2xl border border-border p-5">
                      <p className="text-xs text-muted-foreground uppercase tracking-wider mb-3 font-semibold">US Macro</p>
                      {[
                        { k: 'fed_funds_rate', label: 'Fed Rate', suffix: '%' },
                        { k: 'treasury_10yr', label: '10Y Yield', suffix: '%' },
                        { k: 'yield_curve', label: 'Yield Curve', field: 'signal' },
                      ].map(({ k, label, suffix, field }) => {
                        const d = safeObj(macro[k]); const val = field ? d[field as keyof typeof d] : d.value;
                        if (!val) return null;
                        return (
                          <div key={k} className="flex justify-between items-center py-2.5 border-b border-border last:border-0">
                            <span className="text-sm text-muted-foreground">{label}</span>
                            <span className="text-sm text-foreground font-semibold">{String(val)}{suffix||''}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* Quick signal summary */}
                {signals.length > 0 && (
                  <div className="bg-card rounded-2xl border border-border p-5">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 text-destructive" />
                        <h2 className="text-sm font-semibold">Latest Signals</h2>
                        <span className="text-xs text-muted-foreground">{signals.length} active</span>
                      </div>
                      <button onClick={() => setActiveSection('signals')} className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1">
                        View all <ChevronRight className="w-3 h-3" />
                      </button>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                      {signals.slice(0, 3).map(s => (
                        <div key={s.id} className={cn('rounded-xl p-4 border',
                          s.severity === 'critical' ? 'border-red-500/25 bg-red-500/5' : s.severity === 'high' ? 'border-orange-500/20 bg-orange-500/5' : 'border-border bg-muted/30')}>
                          <div className="flex items-center gap-2 mb-2">
                            <div className={cn('w-2 h-2 rounded-full', s.severity === 'critical' ? 'bg-red-500 animate-pulse' : s.severity === 'high' ? 'bg-orange-500' : 'bg-muted-foreground')} />
                            <span className={cn('text-[10px] font-semibold uppercase tracking-wider',
                              s.severity === 'critical' ? 'text-red-600 dark:text-red-400' : s.severity === 'high' ? 'text-orange-600 dark:text-orange-400' : 'text-muted-foreground')}>{s.severity}</span>
                            <span className="text-[10px] text-muted-foreground ml-auto">{s.region?.replace('_', ' ')}</span>
                          </div>
                          <p className="text-sm text-foreground leading-snug font-medium">{s.headline}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </motion.div>
            )}

            {/* ════════ SIGNALS ════════ */}
            {activeSection === 'signals' && (
              <motion.div key="signals" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}
                className="p-4 sm:p-6 space-y-5 max-w-[1400px] mx-auto">
                <div className="flex items-center gap-3 mb-2">
                  <AlertTriangle className="w-5 h-5 text-destructive" />
                  <h2 className="text-lg font-display font-bold">Live World Signals</h2>
                  <span className="text-sm text-muted-foreground">{signals.length} active</span>
                </div>
                {signals.length > 0 ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                    {signals.map((s, idx) => (
                      <motion.div key={s.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.03 }}
                        className={cn('rounded-2xl p-5 border bg-card',
                          s.severity === 'critical' ? 'border-red-500/30' : s.severity === 'high' ? 'border-orange-500/25' : 'border-border')}>
                        <div className="flex items-center gap-2 mb-3">
                          <div className={cn('w-2.5 h-2.5 rounded-full', s.severity === 'critical' ? 'bg-red-500 animate-pulse' : s.severity === 'high' ? 'bg-orange-500' : 'bg-muted-foreground')} />
                          <span className={cn('text-xs font-semibold uppercase tracking-wider',
                            s.severity === 'critical' ? 'text-red-600 dark:text-red-400' : s.severity === 'high' ? 'text-orange-600 dark:text-orange-400' : 'text-muted-foreground')}>{s.severity}</span>
                          <span className="text-xs text-muted-foreground uppercase ml-auto">{s.region?.replace('_', ' ')}</span>
                        </div>
                        <p className="text-sm text-foreground leading-relaxed font-semibold mb-3">{s.headline}</p>
                        {s.summary && <p className="text-sm text-muted-foreground leading-relaxed mb-3">{s.summary}</p>}
                        <div className="flex items-center gap-4 pt-3 border-t border-border">
                          {[
                            { label: '🛢️ Oil', val: s.impact_on_oil },
                            { label: '🥇 Gold', val: s.impact_on_gold },
                            { label: '₿ BTC', val: s.impact_on_btc },
                          ].map(({ label, val }) => val && val !== 'stable' && (
                            <span key={label} className={cn('text-xs font-medium',
                              val === 'spike' ? 'text-red-600 dark:text-red-400' : val === 'drop' ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground')}>
                              {label} {val === 'spike' ? '↑' : val === 'drop' ? '↓' : '~'}
                            </span>
                          ))}
                          {s.countries_involved?.length > 0 && (
                            <span className="text-xs text-muted-foreground ml-auto">{s.countries_involved.slice(0, 3).join(', ')}</span>
                          )}
                        </div>
                      </motion.div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-16 text-muted-foreground">
                    <Signal className="w-10 h-10 mx-auto mb-3 opacity-30" />
                    <p className="text-sm">No active signals at this time</p>
                  </div>
                )}
              </motion.div>
            )}

            {/* ════════ PREDICTIONS ════════ */}
            {activeSection === 'predictions' && (
              <motion.div key="predictions" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}
                className="p-4 sm:p-6 space-y-6 max-w-[1400px] mx-auto">

                {/* Graph Intelligence */}
                <section>
                  <div className="flex items-center gap-3 mb-4">
                    <Network className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                    <h2 className="text-lg font-display font-bold">Graph Intelligence</h2>
                    <span className="text-sm text-muted-foreground">{masterPreds.length > 0 ? `${masterPreds.length} signals` : 'awaiting data'}</span>
                  </div>

                  {masterPreds.length === 0 ? (
                    <div className="rounded-2xl border border-border bg-card p-8 text-center">
                      <Network className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
                      <p className="text-sm text-muted-foreground mb-1">Graph engine connects signals, prices, and patterns to generate predictions</p>
                      <p className="text-xs text-muted-foreground/60">Runs every 4 hours automatically</p>
                    </div>
                  ) : (
                    <>
                      {/* Category filter */}
                      {(() => {
                        const CATS = [
                          { id: 'all', label: 'All', color: '#a78bfa' },
                          { id: 'markets', label: 'Markets', color: '#60a5fa' },
                          { id: 'geopolitics', label: 'Geopolitics', color: '#f97316' },
                          { id: 'conflicts', label: 'Conflicts', color: '#ef4444' },
                          { id: 'economy', label: 'Economy', color: '#f59e0b' },
                          { id: 'energy', label: 'Energy', color: '#34d399' },
                          { id: 'technology', label: 'Tech', color: '#a78bfa' },
                          { id: 'society', label: 'Society', color: '#f472b6' },
                        ];
                        const activeDomains = new Set(masterPreds.map(p => p.domain?.toLowerCase()));
                        const visible = CATS.filter(c => c.id === 'all' || activeDomains.has(c.id));
                        return (
                          <div className="flex gap-2 flex-wrap mb-5">
                            {visible.map(cat => {
                              const count = cat.id === 'all' ? masterPreds.length : masterPreds.filter(p => p.domain?.toLowerCase() === cat.id).length;
                              const isActive = masterFilter === cat.id;
                              return (
                                <button key={cat.id} onClick={() => setMasterFilter(cat.id)}
                                  className={cn("px-3 py-1.5 rounded-full text-xs font-medium transition-all border",
                                    isActive ? "border-border bg-foreground text-background" : "border-border text-muted-foreground hover:text-foreground hover:bg-muted")}>
                                  {cat.label} <span className="opacity-60 ml-1">{count}</span>
                                </button>
                              );
                            })}
                          </div>
                        );
                      })()}

                      <div className="space-y-4">
                        {masterPreds
                          .filter(mp => masterFilter === 'all' || mp.domain?.toLowerCase() === masterFilter)
                          .map((mp, idx) => {
                          const coherenceColor = mp.graph_coherence >= 80 ? 'text-emerald-600 dark:text-emerald-400' : mp.graph_coherence >= 60 ? 'text-amber-600 dark:text-amber-400' : 'text-red-600 dark:text-red-400';
                          const domainCol = DOMAIN_COLOR[mp.domain?.toLowerCase()] || '#a78bfa';
                          const isSelected = selectedMaster?.id === mp.id;
                          return (
                            <motion.div key={mp.id}
                              initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.04 }}
                              className={cn("rounded-2xl border bg-card overflow-hidden cursor-pointer transition-all",
                                isSelected ? "border-foreground/20 shadow-lg" : "border-border hover:border-foreground/10")}
                              onClick={() => setSelectedMaster(isSelected ? null : mp)}>
                              <div className="p-5">
                                <div className="flex items-start justify-between gap-3 mb-3">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full border"
                                      style={{ color: domainCol, borderColor: `${domainCol}40`, backgroundColor: `${domainCol}10` }}>
                                      {mp.domain}
                                    </span>
                                    <span className="text-xs text-muted-foreground">{mp.region}</span>
                                    <span className="text-xs text-muted-foreground">{mp.horizon?.replace(/_/g, ' ')}</span>
                                  </div>
                                  <div className="flex items-center gap-4 shrink-0">
                                    <div className="text-right">
                                      <p className={cn("text-sm font-bold", coherenceColor)}>{mp.graph_coherence}%</p>
                                      <p className="text-[10px] text-muted-foreground">coherence</p>
                                    </div>
                                    <div className="text-right">
                                      <p className="text-base font-bold text-foreground">{mp.probability_pct}%</p>
                                      <p className="text-[10px] text-muted-foreground">probability</p>
                                    </div>
                                  </div>
                                </div>
                                <h3 className="text-base font-semibold text-foreground leading-snug mb-2">{mp.title}</h3>
                                <p className="text-sm text-muted-foreground leading-relaxed line-clamp-2 mb-4">{mp.thesis}</p>
                                <div className="grid grid-cols-2 gap-3 mb-3">
                                  <div className="rounded-xl p-3 bg-emerald-500/5 border border-emerald-500/15">
                                    <div className="flex items-center gap-1.5 mb-1.5">
                                      <TrendingUp className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                                      <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 uppercase">Winners</span>
                                    </div>
                                    <p className="text-xs text-muted-foreground leading-relaxed">{mp.who_wins}</p>
                                  </div>
                                  <div className="rounded-xl p-3 bg-red-500/5 border border-red-500/15">
                                    <div className="flex items-center gap-1.5 mb-1.5">
                                      <TrendingDown className="w-3.5 h-3.5 text-red-600 dark:text-red-400" />
                                      <span className="text-[10px] font-semibold text-red-600 dark:text-red-400 uppercase">Losers</span>
                                    </div>
                                    <p className="text-xs text-muted-foreground leading-relaxed">{mp.who_loses}</p>
                                  </div>
                                </div>
                                <div className="rounded-xl p-3 bg-primary/5 border border-border">
                                  <div className="flex items-center gap-1.5 mb-1.5">
                                    <Zap className="w-3.5 h-3.5 text-foreground" />
                                    <span className="text-[10px] font-semibold text-foreground uppercase">Your Move</span>
                                  </div>
                                  <p className="text-sm font-medium text-foreground">{mp.actionable_move}</p>
                                </div>
                                <div className="flex items-center justify-between mt-3 pt-3 border-t border-border">
                                  <div className="flex gap-1.5 flex-wrap">
                                    {mp.driving_signals?.slice(0, 3).map((s: any, i: number) => (
                                      <span key={i} className={cn('text-[10px] px-2 py-0.5 rounded-full border',
                                        s.direction === 'bullish' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400' :
                                        s.direction === 'bearish' ? 'bg-red-500/10 border-red-500/20 text-red-600 dark:text-red-400' :
                                        'bg-muted border-border text-muted-foreground')}>{s.signal}</span>
                                    ))}
                                  </div>
                                  <span className="text-xs text-muted-foreground">{isSelected ? 'Collapse ↑' : 'Details →'}</span>
                                </div>
                              </div>
                              <AnimatePresence>
                                {isSelected && (
                                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }}
                                    className="border-t border-border bg-muted/30 overflow-hidden">
                                    <div className="p-5 space-y-4">
                                      {mp.who_wins_detail && (<div><p className="text-[10px] text-emerald-600 dark:text-emerald-400 uppercase font-semibold mb-1">Why they win</p><p className="text-sm text-muted-foreground leading-relaxed">{mp.who_wins_detail}</p></div>)}
                                      {mp.who_loses_detail && (<div><p className="text-[10px] text-red-600 dark:text-red-400 uppercase font-semibold mb-1">Why they lose</p><p className="text-sm text-muted-foreground leading-relaxed">{mp.who_loses_detail}</p></div>)}
                                      {mp.what_to_watch && (
                                        <div className="rounded-xl p-4 bg-amber-500/5 border border-amber-500/15">
                                          <div className="flex items-center gap-1.5 mb-2"><Eye className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" /><span className="text-[10px] font-semibold text-amber-600 dark:text-amber-400 uppercase">Watch For</span></div>
                                          <p className="text-sm text-muted-foreground">{mp.what_to_watch}</p>
                                        </div>
                                      )}
                                      {mp.historical_anchor && (
                                        <div className="rounded-xl p-4 bg-purple-500/5 border border-purple-500/15">
                                          <p className="text-[10px] text-purple-600 dark:text-purple-400 uppercase font-semibold mb-1">Historical Pattern</p>
                                          <p className="text-sm text-muted-foreground">{mp.historical_anchor}</p>
                                        </div>
                                      )}
                                      {mp.contradicting?.length > 0 && (
                                        <div>
                                          <p className="text-[10px] text-amber-600 dark:text-amber-400 uppercase font-semibold mb-2">Risks to This Thesis</p>
                                          <div className="space-y-1.5">
                                            {mp.contradicting.map((c: any, i: number) => (
                                              <p key={i} className="text-sm text-muted-foreground"><span className="font-medium text-amber-600 dark:text-amber-400">{c.signal}</span> — {c.reason}</p>
                                            ))}
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                  </motion.div>
                                )}
                              </AnimatePresence>
                            </motion.div>
                          );
                        })}
                        {masterPreds.filter(mp => masterFilter === 'all' || mp.domain?.toLowerCase() === masterFilter).length === 0 && (
                          <div className="text-center py-12 text-muted-foreground text-sm">No predictions in this category</div>
                        )}
                      </div>
                    </>
                  )}
                </section>

                {/* Price Predictions */}
                <section>
                  <div className="flex items-center gap-3 mb-4">
                    <BarChart3 className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                    <h2 className="text-lg font-display font-bold">Price Predictions</h2>
                    <span className="text-sm text-muted-foreground">{filteredPreds.length} active</span>
                  </div>

                  <Suspense fallback={<div className="h-20 animate-pulse rounded-xl bg-muted border border-border mb-4" />}>
                    <AccuracyScoreboard />
                  </Suspense>

                  {/* Horizon + asset filters */}
                  <div className="flex flex-wrap gap-3 my-4">
                    <div className="flex gap-1 p-1 rounded-xl border border-border bg-muted/30">
                      {(['1_week', '1_month', '1_year'] as const).map(h => (
                        <button key={h} onClick={() => setActiveHorizon(h)}
                          className={cn('px-3 py-1.5 rounded-lg text-xs font-medium transition-all',
                            activeHorizon === h ? 'bg-foreground text-background shadow-sm' : 'text-muted-foreground hover:text-foreground')}>
                          {h === '1_week' ? '1 Week' : h === '1_month' ? '1 Month' : '1 Year'}
                        </button>
                      ))}
                    </div>
                    <div className="flex gap-1 p-1 rounded-xl border border-border bg-muted/30 flex-wrap">
                      <button onClick={() => setAssetFilter('all')} className={cn('px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all', assetFilter === 'all' ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground')}>All</button>
                      {Object.entries(ASSET_META).map(([a, m]) => (
                        <button key={a} onClick={() => setAssetFilter(a)} title={m.label} className={cn('px-2.5 py-1.5 rounded-lg text-sm transition-all', assetFilter === a ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground')}>{m.icon}</button>
                      ))}
                    </div>
                  </div>

                  {filteredPreds.length > 0 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                      {filteredPreds.map(p => (
                        <Suspense key={p.id} fallback={<div className="h-28 animate-pulse rounded-xl bg-muted border border-border" />}>
                          <PredictionCard pred={p} onVote={handleVote} userId={userId} voting={votingId === p.id} />
                        </Suspense>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-12 text-muted-foreground text-sm">No predictions for this filter</div>
                  )}
                </section>
              </motion.div>
            )}

            {/* ════════ COUNTRIES ════════ */}
            {activeSection === 'countries' && (
              <motion.div key="countries" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}
                className="p-4 sm:p-6 space-y-5 max-w-[1400px] mx-auto">
                <div className="flex items-center gap-3 mb-2">
                  <Building2 className="w-5 h-5 text-foreground" />
                  <h2 className="text-lg font-display font-bold">Country Intelligence</h2>
                  <span className="text-sm text-muted-foreground">{countryIntel.length} countries</span>
                </div>
                {countryIntel.length > 0 ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {countryIntel.map(ci => {
                      const econ = ci.economy || {};
                      const gdpGrowth = econ.gdp_growth?.value;
                      const infl = econ.inflation?.value;
                      return (
                        <div key={ci.country_code} onClick={() => setSelectedCountry(ci)}
                          className="bg-card border border-border rounded-2xl p-4 hover:border-foreground/15 transition-all cursor-pointer group">
                          <div className="flex items-start justify-between mb-3">
                            <h3 className="text-sm font-semibold text-foreground group-hover:text-foreground/90 leading-tight">{ci.country_name}</h3>
                            <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors shrink-0" />
                          </div>
                          {econ.gdp?.formatted && <p className="text-xs text-muted-foreground mb-3">{econ.gdp.formatted}</p>}
                          <div className="space-y-2">
                            {gdpGrowth != null && (
                              <div className="flex justify-between text-xs">
                                <span className="text-muted-foreground">GDP Growth</span>
                                <span className={cn('font-semibold', econ.gdp_growth?.trend === 'rising' ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400')}>{gdpGrowth > 0 ? '+' : ''}{gdpGrowth.toFixed(1)}%</span>
                              </div>
                            )}
                            {infl != null && (
                              <div className="flex justify-between text-xs">
                                <span className="text-muted-foreground">Inflation</span>
                                <span className={cn('font-semibold', infl > 5 ? 'text-red-600 dark:text-red-400' : infl > 3 ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400')}>{infl.toFixed(1)}%</span>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-center py-16 text-muted-foreground">
                    <MapPin className="w-10 h-10 mx-auto mb-3 opacity-30" />
                    <p className="text-sm">No country data available</p>
                  </div>
                )}
              </motion.div>
            )}

            {/* ════════ AGENTS ════════ */}
            {activeSection === 'agents' && (
              <motion.div key="agents" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}
                className="min-h-full">
                <div className="border-b border-border px-5 py-4 flex items-center gap-3">
                  <div className="w-2 h-2 rounded-full bg-purple-500 animate-pulse" />
                  <h2 className="text-sm font-semibold">Agent Society</h2>
                  <span className="text-xs text-muted-foreground">Live AI agents · World reaction simulation</span>
                </div>
                <div className="p-3 sm:p-5">
                  <Suspense fallback={
                    <div className="flex items-center justify-center h-80">
                      <div className="text-center space-y-3">
                        <div className="w-12 h-12 rounded-full border-2 border-border border-t-foreground animate-spin mx-auto" />
                        <p className="text-xs text-muted-foreground tracking-widest uppercase">Loading Agent Network</p>
                      </div>
                    </div>
                  }>
                    <AgentSociety />
                  </Suspense>
                </div>
              </motion.div>
            )}

          </AnimatePresence>
        </main>
      </div>

      {/* ── Mobile Bottom Nav ──────────────────────────────────────────────────── */}
      <nav className="md:hidden shrink-0 border-t border-border bg-card flex items-center justify-around py-1.5 px-2">
        {NAV_ITEMS.map(item => (
          <button key={item.id} onClick={() => setActiveSection(item.id)}
            className={cn("flex flex-col items-center gap-0.5 py-1.5 px-2 rounded-lg transition-colors min-w-[52px]",
              activeSection === item.id ? "text-foreground" : "text-muted-foreground")}>
            <item.icon className="w-4 h-4" />
            <span className="text-[10px] font-medium">{item.label}</span>
          </button>
        ))}
      </nav>

      {/* ── Side panels ───────────────────────────────────────────────────────── */}
      <AnimatePresence>
        {selectedCountry && <CountryDossier intel={selectedCountry} onClose={() => setSelectedCountry(null)} />}
      </AnimatePresence>
    </div>
  );
}
