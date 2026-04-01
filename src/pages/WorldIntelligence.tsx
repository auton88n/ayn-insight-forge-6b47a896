import { useEffect, useState, useMemo, useCallback, useRef, lazy, Suspense } from 'react';

import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { SUPABASE_URL } from '@/config';
import {
  ArrowLeft, RefreshCw, Clock, TrendingUp,
  Globe2, BarChart3, Zap, Target, Activity,
  ChevronRight, ThumbsUp, ThumbsDown, Shield,
  Building2, Radio, Flame, ArrowUpRight, ArrowDownRight, Minus
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import type { Json } from '@/integrations/supabase/types';
import { HeatMap2D, MapPoint } from '@/components/dashboard/HeatMap2D';
import { INTELLIGENCE_SEEDS, THREAT_TICKER } from '@/data/mapSeeds';
// R3F imports kept but AgentNodeGraph is render-gated to prevent dual WebGL context
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Sphere, Text, Billboard, Line } from '@react-three/drei';
import * as THREE from 'three';

const AgentSociety = lazy(() => import('@/components/dashboard/world/AgentSociety'));
const WorldSimulator = lazy(() => import('@/components/dashboard/world/WorldSimulator'));
const AccuracyScoreboard = lazy(() => import('@/components/dashboard/world/AccuracyScoreboard'));
const PredictionCard = lazy(() => import('@/components/dashboard/world/PredictionCard'));

// ─── WorldMonitor live map hook ──────────────────────────────────────────────
// Polls conflict, maritime, cyber, seismology & wildfire domains every 3 mins
async function fetchWMDomain(domain: string, token: string): Promise<any[]> {
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/worldmonitor-proxy?domain=${domain}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) return [];
    const data = await res.json();
    // WorldMonitor returns items array at different paths depending on domain
    return data?.items ?? data?.data ?? data?.events ?? data?.alerts ?? data?.results ?? [];
  } catch { return []; }
}

function parseConflictPoints(items: any[]): MapPoint[] {
  return items
    .filter((i: any) => i?.location?.coordinates ?? i?.coordinates ?? i?.lat)
    .map((i: any): MapPoint => {
      const lng = i.location?.coordinates?.[0] ?? i.coordinates?.[0] ?? i.lng ?? i.longitude;
      const lat = i.location?.coordinates?.[1] ?? i.coordinates?.[1] ?? i.lat ?? i.latitude;
      if (!lng || !lat) return null as any;
      const risk = (i.severity ?? i.intensity ?? '').toLowerCase().includes('critical') ? 'critical'
        : (i.severity ?? '').toLowerCase().includes('high') ? 'high' : 'alert';
      return {
        id: i.id ?? String(lat),
        coordinates: [lng, lat] as [number, number],
        label: (i.title ?? i.name ?? i.region ?? 'CONFLICT').substring(0, 18).toUpperCase(),
        detail: i.summary ?? i.description ?? i.status ?? '',
        category: 'Conflict',
        risk,
      };
    }).filter(Boolean);
}

function parseMaritimePoints(items: any[]): MapPoint[] {
  return items
    .filter((i: any) => i?.position?.coordinates ?? i?.location?.coordinates ?? i?.lat)
    .map((i: any): MapPoint => {
      const lng = i.position?.coordinates?.[0] ?? i.location?.coordinates?.[0] ?? i.lng ?? i.longitude;
      const lat = i.position?.coordinates?.[1] ?? i.location?.coordinates?.[1] ?? i.lat ?? i.latitude;
      if (!lng || !lat) return null as any;
      return {
        id: i.mmsi ?? i.id ?? String(lat),
        coordinates: [lng, lat] as [number, number],
        label: (i.name ?? i.vessel_name ?? i.ship_name ?? i.type ?? 'VESSEL').substring(0, 14).toUpperCase(),
        detail: `${i.type ?? ''} · ${i.flag ?? ''} · ${ i.destination ?? i.status ?? ''}`.trim().replace(/^·\s*/, ''),
        category: 'Maritime',
        risk: 'maritime' as any,
        // heading/speed not on MapPoint type
      };
    }).filter(Boolean).slice(0, 40); // cap at 40 ships to avoid clutter
}

function parseCyberPoints(items: any[]): MapPoint[] {
  return items
    .filter((i: any) => i?.origin?.coordinates ?? i?.location?.coordinates ?? i?.lat)
    .map((i: any): MapPoint => {
      const lng = i.origin?.coordinates?.[0] ?? i.location?.coordinates?.[0] ?? i.lng;
      const lat = i.origin?.coordinates?.[1] ?? i.location?.coordinates?.[1] ?? i.lat;
      if (!lng || !lat) return null as any;
      return {
        id: i.id ?? String(lat),
        coordinates: [lng, lat] as [number, number],
        label: (i.actor ?? i.type ?? i.attack_type ?? 'CYBER').substring(0, 16).toUpperCase(),
        detail: i.description ?? i.target ?? '',
        category: 'Cyber',
        risk: 'cyber' as any,
      };
    }).filter(Boolean).slice(0, 20);
}

function parseDisasterPoints(items: any[], type: 'seismology' | 'wildfire'): MapPoint[] {
  return items
    .filter((i: any) => i?.coordinates ?? i?.location?.coordinates ?? i?.lat)
    .map((i: any): MapPoint => {
      const lng = i.coordinates?.[0] ?? i.location?.coordinates?.[0] ?? i.lng;
      const lat = i.coordinates?.[1] ?? i.location?.coordinates?.[1] ?? i.lat;
      if (!lng || !lat) return null as any;
      const mag = i.magnitude ?? i.richter_scale ?? 0;
      return {
        id: i.id ?? String(lat),
        coordinates: [lng, lat] as [number, number],
        label: type === 'seismology'
          ? `M${mag.toFixed(1)} ${(i.place ?? i.region ?? '').substring(0, 10).toUpperCase()}`
          : (i.name ?? i.location ?? 'WILDFIRE').substring(0, 16).toUpperCase(),
        detail: type === 'seismology'
          ? `M${mag} earthquake · depth ${i.depth ?? '?'}km`
          : `${i.area_ha ?? i.size ?? '?'} ha · ${i.containment ?? '?'}% contained`,
        category: 'Disaster',
        risk: 'disaster' as any,
      };
    }).filter(Boolean).slice(0, 25);
}

function parseAviationPoints(items: any[]): MapPoint[] {
  return items
    .filter((i: any) => i?.position?.coordinates ?? i?.location?.coordinates ?? i?.lat)
    .map((i: any): MapPoint => {
      const lng = i.position?.coordinates?.[0] ?? i.location?.coordinates?.[0] ?? i.lng;
      const lat = i.position?.coordinates?.[1] ?? i.location?.coordinates?.[1] ?? i.lat;
      if (!lng || !lat) return null as any;
      return {
        id: i.icao ?? i.callsign ?? i.id ?? String(lat),
        coordinates: [lng, lat] as [number, number],
        label: (i.callsign ?? i.flight ?? i.incident_type ?? 'AIRCRAFT').substring(0, 14).toUpperCase(),
        detail: i.description ?? i.status ?? i.origin ?? '',
        category: 'Aviation',
        risk: 'aviation' as any,
        // heading/speed not on MapPoint type
      };
    }).filter(Boolean).slice(0, 30);
}


interface MarketSnapshot { snapshot: Json; fetched_at: string; sources_used: string[] | null; }
interface Prediction {
  id: string; asset: string; horizon: string; target_date: string;
  baseline_value: number; predicted_value: number;
  predicted_low: number; predicted_high: number;
  predicted_direction: 'up' | 'down' | 'sideways';
  predicted_pct_change: number; confidence: number; reasoning: string; calibration?: { real_accuracy_pct: number; reliability_tier: string; should_show_uncertainty: boolean; calibration_factor: number } | null;
  agree_count?: number; disagree_count?: number; user_vote?: 'agree' | 'disagree' | null;
  consensus_strength?: string; agreement?: boolean | null; fusion_method?: string; boost_factor?: string | null; generated_by?: string;
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
    foreign_investment?: { value: number; trend: string };
  };
  hot_sectors?: string[];
  opportunities?: string[];
}

interface ConflictPrediction {
  id: string; title: string; region: string; horizon: string; target_period: string;
  confidence: number; probability: string; escalation_risk: string | null;
  financial_trigger: string | null; what_is_happening: string; what_it_means: string;
  historical_parallel: string; who_wins: string; who_gets_hurt: string;
  what_to_do_now: string; actionable_move: string | null;
  conflict_signals: { oil_signal?: string; gold_signal?: string; currency_signal?: string; sanctions_signal?: string } | null;
  key_drivers: string[]; main_risks: string[]; tags: string[];
}

function safeArr(v: any): any[] { return Array.isArray(v) ? v : []; }
function safeObj(v: any): Record<string, any> { return (v && typeof v === 'object' && !Array.isArray(v)) ? v : {}; }
function timeAgo(d: string | null): string {
  if (!d) return '';
  const diff = Date.now() - new Date(d).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return format(new Date(d), 'MMM d');
}

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

const SIC_COORDINATES: Record<string, [number, number]> = {
  'USA': [-95.7, 37.0], 'CHN': [104.1, 35.8], 'EU': [10.4, 51.1], 'GBR': [-3.4, 55.3],
  'SAU': [45.0, 23.8],  'ARE': [53.8, 23.4],  'JPN': [138.2, 36.2], 'IND': [78.9, 20.5],
  'BRA': [-51.9, -14.2],'RUS': [105.3, 61.5], 'IRQ': [43.6, 33.2], 'KOR': [127.7, 35.9],
  'ZAF': [22.9, -30.5], 'CAN': [-106.3, 56.1],'AUS': [133.7, -25.2],
};

const ISO2_TO_SIC: Record<string, string> = {
  US: 'USA', CN: 'CHN', DE: 'EU', GB: 'GBR', SA: 'SAU', AE: 'ARE',
  JP: 'JPN', IN: 'IND', BR: 'BRA', RU: 'RUS', KR: 'KOR', ZA: 'ZAF',
  CA: 'CAN', AU: 'AUS', FR: 'EU', SG: 'ARE', QA: 'ARE',
};



function CountryDossier({ intel, sic, onClose }: { intel: CountryIntel; sic: any; onClose: () => void }) {
  const econ = intel.economy || {};
  return (
    <motion.div initial={{ opacity: 0, x: 440 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 440 }}
      transition={{ type: 'spring', damping: 28, stiffness: 220 }}
      className="fixed top-0 right-0 bottom-0 w-full sm:w-[460px] bg-[#060609]/97 backdrop-blur-2xl border-l border-cyan-500/20 z-[100] flex flex-col shadow-[-20px_0_60px_rgba(0,0,0,0.4)]">
      <div className="p-5 border-b border-white/8 shrink-0">
        <div className="flex items-start justify-between">
          <div>
            <div className="text-[9px] font-mono text-cyan-400/50 uppercase tracking-[0.2em] mb-1">S.I.C. Dossier</div>
            <h2 className="text-2xl font-mono font-bold text-white">{intel.country_name}</h2>
            <div className="flex items-center gap-3 mt-1.5">
              {econ.gdp?.formatted && <span className="text-[10px] font-mono text-white/35">GDP {econ.gdp.formatted}</span>}
              {econ.gdp_growth?.value != null && (
                <span className={cn('text-[10px] font-mono font-bold', econ.gdp_growth.trend === 'rising' ? 'text-emerald-400' : 'text-amber-400')}>
                  {econ.gdp_growth.trend === 'rising' ? '▲' : '▼'} {Math.abs(econ.gdp_growth.value).toFixed(1)}% GDP
                </span>
              )}
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-white/6 text-white/35 hover:text-white transition-colors text-xl font-mono">×</button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-5 space-y-6 scrollbar-thin">
        {/* Key stats */}
        <div>
          <div className="text-[8px] font-mono text-white/25 uppercase tracking-wider mb-3">Key Indicators</div>
          <div className="grid grid-cols-2 gap-2">
            {[
              { label: 'Inflation', value: econ.inflation?.value != null ? `${econ.inflation.value.toFixed(1)}%` : null, good: (econ.inflation?.value || 0) < 3, trend: econ.inflation?.trend },
              { label: 'Unemployment', value: econ.unemployment?.value != null ? `${econ.unemployment.value.toFixed(1)}%` : null, good: (econ.unemployment?.value || 0) < 5, trend: econ.unemployment?.trend },
              { label: 'FDI', value: econ.foreign_investment?.value != null ? `${Number(econ.foreign_investment.value).toFixed(1)}% GDP` : null, good: (econ.foreign_investment?.value || 0) > 0, trend: econ.foreign_investment?.trend },
              { label: 'Income/Person', value: econ.income_per_person?.formatted || null, good: true, trend: null },
            ].filter(s => s.value).map(s => (
              <div key={s.label} className="bg-white/3 border border-white/5 rounded-lg p-3">
                <div className="text-[8px] font-mono text-white/25 uppercase mb-1">{s.label}</div>
                <div className={cn('text-sm font-mono font-bold', s.good ? 'text-white/75' : 'text-amber-400')}>{s.value}</div>
                {s.trend && <div className={cn('text-[8px] font-mono', s.trend === 'rising' ? 'text-red-400/70' : 'text-emerald-400/70')}>{s.trend}</div>}
              </div>
            ))}
          </div>
        </div>

        {/* Economic snapshot */}
        {intel.intelligence_brief?.length > 1 && (
          <div>
            <div className="text-[8px] font-mono text-white/25 uppercase tracking-wider mb-3 flex items-center gap-2">
              <Activity className="w-3 h-3 text-emerald-400" /> Economic Snapshot
            </div>
            <div className="space-y-1">
              {intel.intelligence_brief.slice(1).map((line, i) => (
                <div key={i} className="flex items-start gap-2 py-1.5 border-b border-white/4 last:border-0">
                  <span className="text-white/15 shrink-0 mt-0.5 font-mono text-[10px]">›</span>
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

        {/* Live intel from pulse engine */}
        {safeArr(sic?.news).filter((n: any) => n?.title?.length > 5).length > 0 && (
          <div>
            <div className="text-[8px] font-mono text-white/25 uppercase tracking-wider mb-3 flex items-center gap-2">
              <Radio className="w-3 h-3 text-cyan-400" /> Live Intelligence Feed
            </div>
            <div className="space-y-2">
              {safeArr(sic.news).filter((n: any) => n?.title?.length > 5).map((item: any, i: number) => (
                <div key={i} className="bg-black/40 border border-white/5 hover:border-cyan-500/18 p-3 rounded-lg transition-colors">
                  <p className="text-[10px] font-mono text-white/60 leading-relaxed">{item.title}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Trade trajectory */}
        {sic?.trajectory && (
          <div>
            <div className="text-[8px] font-mono text-white/25 uppercase tracking-wider mb-3 flex items-center gap-2">
              <Building2 className="w-3 h-3 text-purple-400" /> Trade Position
            </div>
            <div className="bg-purple-500/4 border border-purple-500/12 rounded-lg p-3">
              <p className="text-[10px] font-mono text-purple-200/50 leading-relaxed">{sic.trajectory}</p>
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
}

export default function WorldIntelligence() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const currentTime = useRef(new Date()).current; // Static — no re-render ticker
  const [snapshot, setSnapshot] = useState<MarketSnapshot | null>(null);
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [countryIntel, setCountryIntel] = useState<CountryIntel[]>([]);
  const [conflictPredictions, setConflictPredictions] = useState<ConflictPrediction[]>([]);
  const [selectedConflict, setSelectedConflict] = useState<ConflictPrediction | null>(null);
  const [userId, setUserId] = useState<string | undefined>();
  const [activeHorizon, setActiveHorizon] = useState<'1_week' | '1_month' | '1_year'>('1_week');
  const [assetFilter, setAssetFilter] = useState<string>('all');
  const [votingId, setVotingId] = useState<string | null>(null);
  const [selectedCountry, setSelectedCountry] = useState<{ intel: CountryIntel; sic: Record<string, any> } | null>(null);
  const [worldSignals, setWorldSignals] = useState<any[]>([]);
  const [liveMapPoints, setLiveMapPoints] = useState<MapPoint[]>([]);
  const [mapLastRefresh, setMapLastRefresh] = useState<Date | undefined>();
  const mapRefreshTimer = useRef<ReturnType<typeof setInterval> | null>(null);


  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id));
  }, []);

  const fetchSnapshot = useCallback(async () => {
    try {
      // Read directly from DB — no edge function needed, avoids all CORS/auth issues
      const { data, error } = await supabase
        .from('ayn_market_snapshot')
        .select('snapshot, fetched_at, sources_used')
        .eq('singleton_key', 1)
        .single();
      if (error) throw error;
      if (data && data.snapshot) {
        setSnapshot(data as unknown as MarketSnapshot);
      }
    } catch (e) { console.error('fetchSnapshot failed:', e); }
  }, []);

  const fetchPredictions = useCallback(async () => {
    try {
      // Load calibration data first
      const { data: calibData } = await supabase
        .from('ayn_accuracy_calibration' as any)
        .select('asset, real_accuracy_pct, reliability_tier, should_show_uncertainty, calibration_factor');
      const calibMap: Record<string, any> = {};
      for (const c of (calibData || []) as any[]) calibMap[c.asset] = c;

      // ── Try consensus predictions first (combined AYN + ML)
      const { data: consensus } = await supabase
        .from('ayn_consensus_predictions' as any)
        .select('id,asset,horizon,target_date,baseline_value,consensus_direction,consensus_pct_change,consensus_confidence,consensus_strength,ayn_reasoning,ayn_key_drivers,ayn_regime,agreement,fusion_method,fusion_notes,boost_factor')
        .eq('status', 'active')
        .order('consensus_confidence', { ascending: false })
        .limit(60);

      // ── Fallback to raw AYN v10 if consensus hasn't been generated yet
      const { data: aynPreds } = await supabase
        .from('ayn_predictions')
        .select('id,asset,horizon,target_date,baseline_value,predicted_value,predicted_low,predicted_high,predicted_direction,predicted_pct_change,confidence,reasoning,generated_by,key_drivers')
        .eq('status', 'active')
        .in('generated_by', ['ayn_prediction_engine_v10', 'ayn_prediction_engine_v9', 'perpetual-ml-v1'])
        .order('confidence', { ascending: false })
        .limit(60);

      // Use consensus if available, otherwise fall back to raw
      const preds = (consensus && consensus.length > 0)
        ? consensus.map((c: any) => ({
            id: c.id,
            asset: c.asset,
            horizon: c.horizon,
            target_date: c.target_date,
            baseline_value: Number(c.baseline_value),
            predicted_value: Number(c.baseline_value) * (1 + Number(c.consensus_pct_change) / 100),
            predicted_low: Number(c.baseline_value) * (1 + Number(c.consensus_pct_change) / 100 - 0.03),
            predicted_high: Number(c.baseline_value) * (1 + Number(c.consensus_pct_change) / 100 + 0.03),
            predicted_direction: c.consensus_direction?.toLowerCase() as 'up' | 'down' | 'sideways',
            predicted_pct_change: Number(c.consensus_pct_change),
            confidence: Number(c.consensus_confidence || 50),
            calibration: calibMap[c.asset] || null,
            reasoning: c.ayn_reasoning ?? c.fusion_notes ?? '',
            key_drivers: c.ayn_key_drivers ?? [],
            generated_by: 'ayn_consensus_fusion_v1',
            consensus_strength: c.consensus_strength,
            agreement: c.agreement,
            fusion_method: c.fusion_method,
            boost_factor: c.boost_factor,
            agree_count: 0, disagree_count: 0, user_vote: null,
          }))
        : (aynPreds ?? []).map(p => ({
            ...p,
            baseline_value: Number(p.baseline_value),
            predicted_value: Number(p.predicted_value),
            predicted_low: Number(p.predicted_low),
            predicted_high: Number(p.predicted_high),
            predicted_pct_change: Number(p.predicted_pct_change),
            predicted_direction: (p.predicted_direction || 'sideways') as 'up' | 'down' | 'sideways',
            confidence: Number(p.confidence || 50),
            agree_count: 0, disagree_count: 0, user_vote: null,
          }));

      if (!preds?.length) return;

      const { data: voteCounts } = await supabase
        .from('ayn_prediction_vote_counts' as any)
        .select('prediction_id,agree_count,disagree_count');

      let userVoteMap: Record<string, 'agree' | 'disagree'> = {};
      if (userId) {
        const { data: uv } = await supabase.from('ayn_prediction_votes')
          .select('prediction_id,vote').eq('user_id', userId).in('prediction_id', preds.map(p => p.id));
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

  const fetchWorldSignals = useCallback(async () => {
    try {
      const { data } = await supabase
        .from('ayn_world_signals')
        .select('*')
        .eq('status', 'active')
        .gte('signal_date', new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0])
        .order('created_at', { ascending: false })
        .limit(10);
      if (data) setWorldSignals(data);
    } catch {}
  }, []);

  const fetchConflictPredictions = useCallback(async () => {
    try {
      const { data } = await supabase
        .from('ayn_world_predictions')
        .select('id,title,region,horizon,target_period,confidence,probability,escalation_risk,financial_trigger,what_is_happening,what_it_means,historical_parallel,who_wins,who_gets_hurt,what_to_do_now,actionable_move,conflict_signals,key_drivers,main_risks,tags')
        .eq('domain', 'conflicts')
        .eq('status', 'active')
        .order('confidence', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(8);
      if (data) setConflictPredictions(data as ConflictPrediction[]);
    } catch (e) { console.error('conflict predictions:', e); }
  }, []);

  const fetchCountryIntel = useCallback(async () => {
    try {
      const { data } = await supabase.from('ayn_country_intelligence')
        .select('country_code,country_name,intelligence_brief,economy,hot_sectors,opportunities').limit(20);
      if (data) setCountryIntel(data as CountryIntel[]);
    } catch {}
  }, []);

  // ─── Live WorldMonitor map data (3-min polling) ─────────────────────────────────
  const fetchLiveMapData = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;
    if (!token) return;
    try {
      const [conflictItems, maritimeItems, cyberItems, seismoItems, wildfireItems, aviationItems] = await Promise.allSettled([
        fetchWMDomain('conflict', token),
        fetchWMDomain('maritime', token),
        fetchWMDomain('cyber', token),
        fetchWMDomain('seismology', token),
        fetchWMDomain('wildfire', token),
        fetchWMDomain('aviation', token),
      ]);
      const get = (r: PromiseSettledResult<any[]>) => r.status === 'fulfilled' ? r.value : [];
      const pts: MapPoint[] = [
        ...parseConflictPoints(get(conflictItems)),
        ...parseMaritimePoints(get(maritimeItems)),
        ...parseCyberPoints(get(cyberItems)),
        ...parseDisasterPoints(get(seismoItems), 'seismology'),
        ...parseDisasterPoints(get(wildfireItems), 'wildfire'),
        ...parseAviationPoints(get(aviationItems)),
      ];
      const staticFallback: MapPoint[] = [
        { coordinates: [33.0, 48.0], label: 'UKRAINE/RUSSIA', risk: 'critical', category: 'Conflict', detail: 'Active conflict zone' },
        { coordinates: [34.5, 31.5], label: 'GAZA/ISRAEL',   risk: 'critical', category: 'Conflict', detail: 'Active conflict zone' },
        { coordinates: [44.2, 15.4], label: 'YEMEN',          risk: 'high',     category: 'Conflict', detail: 'Houthi maritime disruption' },
        { coordinates: [32.3, 30.0], label: 'SUEZ CANAL',     risk: 'maritime' as any, category: 'Maritime', detail: 'Critical shipping corridor' },
        { coordinates: [56.5, 26.5], label: 'STRAIT HORMUZ',  risk: 'maritime' as any, category: 'Maritime', detail: '30% world oil transit' },
        { coordinates: [101.0, 2.5], label: 'MALACCA',        risk: 'maritime' as any, category: 'Maritime', detail: 'Key trade route' },
        { coordinates: [-74.0, 40.7], label: 'NYSE',          risk: 'stable',   category: 'S.I.C.', detail: 'US Markets' },
      ];
      const merged = pts.length >= 8 ? pts : [...pts, ...staticFallback];
      const deduped = merged.filter((v, i, arr) =>
        i === arr.findIndex(t =>
          Math.abs(t.coordinates[0] - v.coordinates[0]) < 2 &&
          Math.abs(t.coordinates[1] - v.coordinates[1]) < 2
        )
      );
      setLiveMapPoints(deduped);
      setMapLastRefresh(new Date());
    } catch (err) {
      console.warn('[WorldIntelligence] Live map fetch error:', err);
    }
  }, [supabase]);

  // WorldMonitor proxy disabled — always returns empty items[]
  // useEffect(() => { fetchLiveMapData(); ... }, [fetchLiveMapData]);

  useEffect(() => {
    // Staggered fetches — critical data first, rest after
    fetchSnapshot().finally(() => setLoading(false));
    setTimeout(() => fetchPredictions(), 300);
    setTimeout(() => fetchCountryIntel(), 800);
    setTimeout(() => fetchConflictPredictions(), 1200);
    setTimeout(() => fetchWorldSignals(), 1800);

    // Replace realtime channel subscription with a 5-minute polling interval
    const pollInterval = setInterval(() => {
      fetchSnapshot();
    }, 5 * 60 * 1000);

    return () => { clearInterval(pollInterval); };
  }, [fetchSnapshot, fetchPredictions, fetchCountryIntel, fetchConflictPredictions, fetchWorldSignals]);

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

  const snap = useMemo(() => safeObj(snapshot?.snapshot), [snapshot]);
  const macro = useMemo(() => safeObj(snap.macro), [snap]);
  const stocks = useMemo(() => safeObj(safeObj(snap.markets)?.stocks), [snap]);
  const crypto = useMemo(() => safeObj(safeObj(snap.markets)?.crypto), [snap]);
  const cryptoPrices = useMemo(() => safeObj(crypto.crypto_prices), [crypto]);
  const sentiment = useMemo(() => safeObj(safeObj(snap.markets)?.sentiment), [snap]);
  const briefItems = useMemo(() => {
    const fromDB = safeArr(snap.intelligence_brief);
    if (fromDB.length > 0) return fromDB;
    // Build live fallback from available snapshot data
    const items: string[] = [];
    const fg = safeObj(safeObj(snap.markets)?.sentiment);
    if (fg.value != null) {
      const label = fg.value <= 25 ? 'Extreme Fear' : fg.value <= 45 ? 'Fear' : fg.value <= 55 ? 'Neutral' : fg.value <= 75 ? 'Greed' : 'Extreme Greed';
      items.push(`📊 Fear & Greed Index at ${fg.value} — ${label}. Monitor for reversal signals.`);
    }
    const macroData = safeObj(snap.macro);
    const fedRate = safeObj(macroData.fed_funds_rate);
    if (fedRate.value != null) items.push(`⚡ Fed Funds Rate at ${fedRate.value}% — central bank policy remains dominant macro driver.`);
    const cpData = safeObj(safeObj(snap.markets)?.crypto);
    const btcPrice = safeObj(safeObj(cpData.crypto_prices)?.BTC);
    if (btcPrice.price != null) items.push(`💡 BTC at $${Number(btcPrice.price).toLocaleString()} — crypto risk appetite indicator for broader markets.`);
    if (items.length === 0) items.push('⏳ Intelligence brief will populate on next data sweep. Trigger pulse engine to refresh.');
    return items;
  }, [snap]);
  const sicIntel = useMemo(() => safeObj(snap.sic_intel), [snap]);
  const polymarket = useMemo(() => safeArr(safeObj(snap.prediction_markets)?.prediction_markets), [snap]);

  const tickerItems = useMemo(() => {
    const items: { label: string; value: string; change?: number }[] = [];
    Object.entries(cryptoPrices).forEach(([sym, d]: [string, any]) =>
      items.push({ label: sym, value: `$${Number(d.price).toLocaleString()}`, change: parseFloat(d.change_24h_pct || '0') }));
    const fedRate = safeObj(macro.fed_funds_rate);
    const t10 = safeObj(macro.treasury_10yr);
    const yc = safeObj(macro.yield_curve);
    if (fedRate.value) items.push({ label: 'FED RATE', value: `${fedRate.value}%` });
    if (t10.value) items.push({ label: '10Y YIELD', value: `${t10.value}%` });
    if (yc.signal) items.push({ label: 'YIELD CURVE', value: yc.signal });
    if (sentiment.value) items.push({ label: 'FEAR & GREED', value: `${sentiment.value} · ${sentiment.classification || ''}` });
    return items;
  }, [cryptoPrices, macro, sentiment]);

  const filteredPreds = useMemo(() => {
    const ASSET_ORDER = ['btc', 'eth', 'copper', 'gold', 'silver', 'usd_jpy', 'oil', 'wheat', 'sol', 'spy', 'qqq', 'gld'];
    const seen = new Set<string>();
    const filtered = predictions
      .filter(p => p.horizon === activeHorizon && (assetFilter === 'all' || p.asset === assetFilter))
      .filter(p => {
        const key = `${p.asset}-${p.horizon}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    return filtered.sort((a, b) => {
      const ai = ASSET_ORDER.indexOf(a.asset.toLowerCase());
      const bi = ASSET_ORDER.indexOf(b.asset.toLowerCase());
      if (ai === -1 && bi === -1) return a.asset.localeCompare(b.asset);
      if (ai === -1) return 1;
      if (bi === -1) return -1;
      return ai - bi;
    });
  }, [predictions, activeHorizon, assetFilter]);


  // Map points: seeds (always) + live WorldMonitor data + SIC overlays
  const mapPoints: MapPoint[] = useMemo(() => {
    // Start from comprehensive seed data — always displayed
    const pts: MapPoint[] = [...INTELLIGENCE_SEEDS];

    // Merge live data on top (WorldMonitor augments but doesn't replace seeds)
    liveMapPoints.forEach(live => {
      const isDuplicate = pts.some(p =>
        Math.abs(p.coordinates[0] - live.coordinates[0]) < 1.5 &&
        Math.abs(p.coordinates[1] - live.coordinates[1]) < 1.5
      );
      if (!isDuplicate) pts.push(live);
    });

    // Overlay SIC country dots where not already covered
    Object.entries(sicIntel).forEach(([code, d]) => {
      const coords = SIC_COORDINATES[code];
      if (!coords) return;
      const data = d as any;
      const hasData = (data.economic_posture?.length > 5) || (data.news?.length > 0);
      const alreadyCovered = pts.some(p =>
        Math.abs(p.coordinates[0] - coords[0]) < 3 &&
        Math.abs(p.coordinates[1] - coords[1]) < 3
      );
      if (!alreadyCovered) {
        pts.push({ id: code, coordinates: coords, label: data.name || code, risk: data.risk_level === 'CRITICAL' ? 'critical' : hasData ? 'alert' : 'stable', category: 'S.I.C.', detail: hasData ? 'Click for dossier →' : code });
      }
    });
    return pts;
  }, [liveMapPoints, sicIntel]);





  const handleMapClick = (pt: MapPoint) => {
    if (!pt.id) return;
    const intel = countryIntel.find(c => ISO2_TO_SIC[c.country_code] === pt.id || c.country_code === pt.id);
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
    <div className="min-h-screen bg-[#050508] text-white font-mono flex flex-col overflow-hidden">
      <style>{`
        @keyframes ayn-fade-pulse { 0%,100%{opacity:0.4} 50%{opacity:1} }
        @keyframes ayn-blink { 0%,100%{opacity:1} 50%{opacity:0.3} }
      `}</style>
      {/* Header */}
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
              <span className="text-[11px] text-cyan-400 tracking-[0.18em] font-bold">AYN GLOBAL INTELLIGENCE</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden sm:block text-[9px] text-white/18 tabular-nums">{format(currentTime, 'HH:mm:ss')} UTC</span>
            {snapshot?.fetched_at && <span className="hidden md:block text-[9px] text-white/15">Updated {timeAgo(snapshot.fetched_at)}</span>}
            <div className="flex items-center gap-1 px-2 py-1 rounded bg-emerald-500/8 border border-emerald-500/15">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-[9px] font-bold text-emerald-400">LIVE</span>
            </div>
            <button onClick={() => { setRefreshing(true); Promise.all([fetchSnapshot(), fetchPredictions()]).finally(() => setRefreshing(false)); }}
              disabled={refreshing}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded text-[10px] text-white/35 hover:text-cyan-400 hover:bg-white/4 border border-white/8 transition-all">
              <RefreshCw className={cn('w-3 h-3', refreshing && 'animate-spin')} /> SWEEP
            </button>
          </div>
        </div>
      </header>

      {/* Ticker */}
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

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-[1600px] mx-auto p-4 space-y-5">

          {/* ─── FULL-WIDTH MAP ─── */}
          <HeatMap2D
            points={mapPoints}
            height={460}
            onPointClick={handleMapClick}
            showLayerToggle={true}
            isLive={true}
            lastRefresh={mapLastRefresh}
            ticker={THREAT_TICKER}
          />

          {/* ─── CARDS ROW ─── */}
          {/* ─── INTEL BRIEF + MACRO (2-col below map) ─── */}
          <div className="grid grid-cols-1 xl:grid-cols-[1.6fr_1fr] gap-5">
            {/* Intelligence brief */}
            <div className="bg-black/50 border border-white/6 rounded-2xl overflow-hidden">
              <div className="flex items-center gap-2.5 px-5 py-3.5 border-b border-white/5 bg-gradient-to-r from-emerald-500/6 to-transparent">
                <div className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(16,185,129,0.6)] animate-pulse" />
                <Radio className="w-4 h-4 text-emerald-400" />
                <span className="text-[11px] font-mono font-bold text-emerald-400 tracking-widest uppercase">Intelligence Brief</span>
                <div className="flex-1" />
                <button
                  onClick={async () => {
                    try {
                      const { data: { session } } = await supabase.auth.getSession();
                      const res = await fetch(`${SUPABASE_URL}/functions/v1/ayn-pulse-engine`, {
                        method: 'POST',
                        headers: { Authorization: `Bearer ${session?.access_token}`, 'Content-Type': 'application/json' }
                      });
                      if (res.ok) { setTimeout(() => { fetchSnapshot(); }, 3000); }
                    } catch {}
                  }}
                  className="text-[9px] font-mono text-emerald-400/50 hover:text-emerald-400 transition-all uppercase tracking-wider px-3 py-1 border border-emerald-500/20 rounded-lg hover:border-emerald-500/40 hover:bg-emerald-500/5"
                >
                  ↺ Refresh
                </button>
              </div>
              <div className="p-4 space-y-2">
                {briefItems.length > 0 ? briefItems.map((item, i) => (
                  <div key={i}
                    className={cn('text-[11px] font-mono leading-relaxed py-2.5 px-4 border-l-2 rounded-r-lg',
                      String(item).toLowerCase().includes('fear') || String(item).includes('⚠')
                        ? 'border-l-red-500/50 text-red-200/60 bg-red-500/4'
                        : 'border-l-emerald-400/30 text-white/55 bg-white/2')}>
                    {String(item)}
                  </div>
                )) : <p className="text-[11px] text-white/20 text-center py-6 font-mono">Awaiting intelligence sweep...</p>}
              </div>
            </div>

            {/* Macro + Fear&Greed */}
            <div className="space-y-4">
              {/* Fear & Greed */}
              <div className="bg-black/50 border border-white/6 rounded-2xl p-5">
                <div className="text-[9px] text-white/30 uppercase tracking-widest mb-3 font-mono font-bold">Market Sentiment</div>
                <div className={cn('text-5xl font-mono font-bold mb-1',
                  (sentiment.value || 0) <= 25 ? 'text-red-400' : (sentiment.value || 0) <= 45 ? 'text-orange-400' : (sentiment.value || 0) <= 55 ? 'text-amber-400' : 'text-emerald-400')}>
                  {sentiment.value ?? '—'}
                </div>
                <div className="text-[10px] text-white/30 mb-3 font-mono">{sentiment.classification || 'Fear & Greed Index'}</div>
                <div className="h-2 bg-white/6 rounded-full overflow-hidden">
                  <div className={cn('h-full rounded-full transition-all duration-1000',
                    (sentiment.value || 0) <= 25 ? 'bg-gradient-to-r from-red-600 to-red-400'
                    : (sentiment.value || 0) <= 45 ? 'bg-gradient-to-r from-orange-600 to-orange-400'
                    : 'bg-gradient-to-r from-emerald-600 to-emerald-400')}
                    style={{ width: `${sentiment.value || 0}%` }} />
                </div>
              </div>

              {/* US Macro */}
              <div className="bg-black/50 border border-white/6 rounded-2xl p-5">
                <div className="text-[9px] text-white/30 uppercase tracking-widest mb-3 font-mono font-bold">US Macro Indicators</div>
                <div className="space-y-3">
                  {[
                    { k: 'fed_funds_rate', label: 'Fed Rate', suffix: '%' },
                    { k: 'treasury_10yr',  label: '10Y Yield', suffix: '%' },
                    { k: 'yield_curve',    label: 'Yield Curve', field: 'signal', suffix: '' },
                  ].map(({ k, label, suffix, field }) => {
                    const d = safeObj(macro[k]);
                    const val = field ? d[field as keyof typeof d] : d.value;
                    if (!val) return null;
                    return (
                      <div key={k} className="flex justify-between items-center py-2 border-b border-white/4 last:border-0">
                        <span className="text-[11px] text-white/40 font-mono">{label}</span>
                        <span className="text-[13px] text-white/80 font-mono font-bold">{String(val)}{suffix}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>



          {/* ─── STOCKS ─── */}
          {(safeArr(stocks.top_gainers).length > 0 || safeArr(stocks.top_losers).length > 0) && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <BarChart3 className="w-4 h-4 text-blue-400" />
                <span className="text-[10px] font-mono text-blue-400 font-bold tracking-[0.15em] uppercase">Stock Markets</span>
                <div className="flex-1 h-px bg-gradient-to-r from-blue-500/20 to-transparent" />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {[
                  { title: 'TOP GAINERS', data: safeArr(stocks.top_gainers), color: 'text-emerald-400', border: 'border-emerald-500/15', bg: 'from-emerald-500/4' },
                  { title: 'TOP LOSERS',  data: safeArr(stocks.top_losers),  color: 'text-red-400',     border: 'border-red-500/15',     bg: 'from-red-500/4' },
                  { title: 'MOST ACTIVE', data: safeArr(stocks.most_active), color: 'text-blue-400',    border: 'border-blue-500/15',    bg: 'from-blue-500/4' },
                ].map(col => (
                  <div key={col.title} className={cn('bg-black/50 border rounded-xl overflow-hidden', col.border)}>
                    <div className={cn('px-4 py-2.5 border-b text-[9px] font-mono font-bold tracking-wider bg-gradient-to-r to-transparent', col.color, col.border, col.bg)}>{col.title}</div>
                    <div className="divide-y divide-white/4">
                      {col.data.length > 0 ? col.data.map((s: any, i: number) => {
                        const chg = parseFloat(String(s.change_percentage || '0').replace('%', ''));
                        return (
                          <div key={i} className="flex items-center justify-between px-4 py-2.5 hover:bg-white/2 transition-colors">
                            <div>
                              <div className="text-[11px] font-mono font-bold text-white/75">{s.ticker}</div>
                              <div className="text-[8px] text-white/25 truncate max-w-[100px]">{s.name}</div>
                            </div>
                            <div className="text-right">
                              <div className="text-[11px] font-mono text-white/60">${s.price}</div>
                              <div className={cn('text-[10px] font-mono font-bold', chg > 0 ? 'text-emerald-400' : 'text-red-400')}>
                                {chg > 0 ? '+' : ''}{isNaN(chg) ? s.change_percentage : chg.toFixed(2)}%
                              </div>
                            </div>
                          </div>
                        );
                      }) : <p className="text-[10px] text-white/15 text-center py-4">No data</p>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ─── PREDICTIONS ─── */}
          <div>
            <div className="flex items-center gap-2 mb-4">
              <Target className="w-4 h-4 text-purple-400" />
              <span className="text-[10px] font-mono text-purple-400 font-bold tracking-[0.15em] uppercase">AYN Prediction Engine</span>
              <div className="flex-1 h-px bg-gradient-to-r from-purple-500/20 to-transparent" />
              <span className="text-[8px] text-white/18">{filteredPreds.length} active · vote to validate</span>
            </div>

            {/* Accuracy scoreboard */}
            <Suspense fallback={<div className="h-40 animate-pulse bg-white/5 rounded-xl border border-white/10" />}>
              <AccuracyScoreboard />
            </Suspense>

            <div className="flex flex-wrap gap-2 mb-4">
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
                <button onClick={() => setAssetFilter('all')} className={cn('px-2.5 py-1.5 rounded text-[9px] font-mono transition-all', assetFilter === 'all' ? 'bg-white/8 text-white' : 'text-white/25 hover:text-white/50')}>ALL</button>
                {Object.entries(ASSET_META).map(([a, m]) => (
                  <button key={a} onClick={() => setAssetFilter(a)} title={m.label}
                    className={cn('px-2.5 py-1.5 rounded text-[11px] transition-all', assetFilter === a ? 'bg-white/8' : 'text-white/40 hover:text-white/70')}>
                    {m.icon}
                  </button>
                ))}
              </div>
            </div>

            {filteredPreds.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {filteredPreds.map(p => (
                <Suspense fallback={<div className="h-32 animate-pulse bg-white/5 rounded-xl border border-white/10" />} key={p.id}>
                  <PredictionCard pred={p} onVote={handleVote} userId={userId} voting={votingId === p.id} />
                </Suspense>
                ))}
              </div>
            ) : (
              <div className="text-center py-12 text-white/18 text-[11px] font-mono">No predictions for this filter. Try a different horizon or asset.</div>
            )}
          </div>

          {/* ─── POLYMARKET ─── */}
          {polymarket.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Shield className="w-4 h-4 text-amber-400" />
                <span className="text-[10px] font-mono text-amber-400 font-bold tracking-[0.15em] uppercase">Prediction Markets · Polymarket</span>
                <div className="flex-1 h-px bg-gradient-to-r from-amber-500/20 to-transparent" />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {polymarket.map((p: any, i: number) => {
                  const prob = p.yes_probability || 0;
                  return (
                    <div key={i} className="bg-black/50 border border-white/6 rounded-xl p-4">
                      <p className="text-[11px] font-mono text-white/60 leading-relaxed mb-3">{p.question}</p>
                      <div className="flex items-center gap-3">
                        <div className="flex-1 h-1.5 bg-white/5 rounded-full overflow-hidden">
                          <div className={cn('h-full rounded-full', prob > 60 ? 'bg-emerald-500' : prob > 40 ? 'bg-amber-500' : 'bg-red-500')} style={{ width: `${Math.min(prob, 100)}%` }} />
                        </div>
                        <span className={cn('text-sm font-mono font-bold', prob > 60 ? 'text-emerald-400' : prob > 40 ? 'text-amber-400' : 'text-red-400')}>{prob.toFixed(0)}%</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ─── AGENT SOCIETY ─── */}
          <Suspense fallback={<div className="h-64 animate-pulse bg-white/5 rounded-xl border border-white/10" />}>
            <AgentSociety />
          </Suspense>
        </div>
        <div>
          <Suspense fallback={<div className="h-64 animate-pulse bg-white/5 rounded-xl border border-white/10" />}>
            <WorldSimulator signals={worldSignals} />
          </Suspense>

          {/* ─── CONFLICT & WAR INTELLIGENCE ─── */}
          {conflictPredictions.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-4">
                <div className="relative">
                  <div className="w-4 h-4 rounded-full bg-red-500/20 border border-red-500/40 flex items-center justify-center">
                    <div className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />
                  </div>
                </div>
                <span className="text-[10px] font-mono text-red-400 font-bold tracking-[0.15em] uppercase">Conflict & War Intelligence</span>
                <div className="flex-1 h-px bg-gradient-to-r from-red-500/30 to-transparent" />
                <span className="text-[8px] text-white/18">Driven by financial signals · Updated daily</span>
              </div>
              <div className="mb-3 bg-red-500/5 border border-red-500/15 rounded-lg px-4 py-2.5">
                <p className="text-[10px] font-mono text-red-300/60 leading-relaxed">
                  <span className="text-red-400 font-bold">Core principle: Money predicts wars.</span> Oil above $90 = Middle East conflict premium. Gold above $3,500 = institutional fear. Currency collapse = regime instability. Sanctions list growing = diplomatic options exhausted. Every prediction below is grounded in live financial data.
                </p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {conflictPredictions.map((c) => {
                  const riskColor = c.escalation_risk === 'critical' ? 'text-red-400 border-red-500/30 bg-red-500/5'
                    : c.escalation_risk === 'high' ? 'text-orange-400 border-orange-500/30 bg-orange-500/5'
                    : c.escalation_risk === 'elevated' ? 'text-amber-400 border-amber-500/30 bg-amber-500/5'
                    : 'text-yellow-400 border-yellow-500/20 bg-yellow-500/4';
                  const riskBorder = c.escalation_risk === 'critical' ? 'border-red-500/20'
                    : c.escalation_risk === 'high' ? 'border-orange-500/15'
                    : c.escalation_risk === 'elevated' ? 'border-amber-500/15'
                    : 'border-white/6';

                  return (
                    <motion.button
                      key={c.id}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      onClick={() => setSelectedConflict(c)}
                      className={cn('text-left bg-black/60 border rounded-xl overflow-hidden hover:bg-black/70 transition-all group', riskBorder)}
                    >
                      {/* Header */}
                      <div className={cn('flex items-center justify-between px-4 py-2.5 border-b', riskBorder, c.escalation_risk === 'critical' ? 'bg-red-500/5' : c.escalation_risk === 'high' ? 'bg-orange-500/4' : 'bg-amber-500/3')}>
                        <div className="flex items-center gap-2">
                          {c.escalation_risk && (
                            <span className={cn('text-[8px] font-mono font-bold px-2 py-0.5 rounded-full border uppercase tracking-wider', riskColor)}>
                              {c.escalation_risk}
                            </span>
                          )}
                          <span className="text-[8px] font-mono text-white/25 uppercase">{c.region?.replace('_', ' ')} · {c.target_period}</span>
                        </div>
                        <span className="text-[9px] font-mono text-white/25">{c.confidence}% conf</span>
                      </div>

                      {/* Title */}
                      <div className="px-4 pt-3 pb-2">
                        <h3 className="text-[12px] font-mono font-bold text-white/85 leading-snug group-hover:text-white transition-colors">{c.title}</h3>
                      </div>

                      {/* Financial trigger */}
                      {c.financial_trigger && (
                        <div className="px-4 pb-2">
                          <div className="flex items-start gap-1.5">
                            <span className="text-[8px] font-mono text-red-400/60 uppercase shrink-0 mt-0.5">$ Signal:</span>
                            <span className="text-[9px] font-mono text-white/45 leading-relaxed">{c.financial_trigger}</span>
                          </div>
                        </div>
                      )}

                      {/* What's happening preview */}
                      <div className="px-4 pb-3">
                        <p className="text-[10px] font-mono text-white/40 leading-relaxed line-clamp-2">{c.what_is_happening}</p>
                      </div>

                      {/* Money signals row */}
                      {c.conflict_signals && (
                        <div className="px-4 pb-3 flex flex-wrap gap-1.5">
                          {c.conflict_signals.oil_signal && (
                            <span className="text-[8px] font-mono px-2 py-0.5 rounded bg-orange-500/8 border border-orange-500/15 text-orange-300/60">🛢️ Oil</span>
                          )}
                          {c.conflict_signals.gold_signal && (
                            <span className="text-[8px] font-mono px-2 py-0.5 rounded bg-amber-500/8 border border-amber-500/15 text-amber-300/60">🥇 Gold</span>
                          )}
                          {c.conflict_signals.currency_signal && (
                            <span className="text-[8px] font-mono px-2 py-0.5 rounded bg-cyan-500/8 border border-cyan-500/15 text-cyan-300/60">¥ FX</span>
                          )}
                          {c.conflict_signals.sanctions_signal && (
                            <span className="text-[8px] font-mono px-2 py-0.5 rounded bg-purple-500/8 border border-purple-500/15 text-purple-300/60">⚖️ Sanctions</span>
                          )}
                          <span className="text-[8px] font-mono text-white/18 ml-auto">Click for full analysis →</span>
                        </div>
                      )}
                    </motion.button>
                  );
                })}
              </div>
            </div>
          )}

          {/* ─── COUNTRY GRID ─── */}
          {countryIntel.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Building2 className="w-4 h-4 text-cyan-400" />
                <span className="text-[10px] font-mono text-cyan-400 font-bold tracking-[0.15em] uppercase">Country Economic Intelligence</span>
                <div className="flex-1 h-px bg-gradient-to-r from-cyan-500/20 to-transparent" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                {countryIntel.map(ci => {
                  const econ = ci.economy || {};
                  const g = econ.gdp_growth?.value;
                  const infl = econ.inflation?.value;
                  const unemp = econ.unemployment?.value;
                  return (
                    <button key={ci.country_code}
                      onClick={() => {
                        const sicKey = ISO2_TO_SIC[ci.country_code] || ci.country_code;
                        setSelectedCountry({ intel: ci, sic: sicIntel[sicKey] || {} });
                      }}
                      className="text-left bg-black/50 border border-white/6 rounded-xl p-4 hover:border-cyan-500/20 hover:bg-black/65 transition-all group">
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <div className="text-[11px] font-mono font-bold text-white/75 group-hover:text-white transition-colors">{ci.country_name}</div>
                          <div className="text-[8px] text-white/22 font-mono">{econ.gdp?.formatted || ''}</div>
                        </div>
                        <ChevronRight className="w-3.5 h-3.5 text-white/18 group-hover:text-cyan-400 transition-colors mt-0.5" />
                      </div>
                      <div className="space-y-1.5">
                        {g != null && (
                          <div className="flex justify-between text-[9px] font-mono">
                            <span className="text-white/28">GDP Growth</span>
                            <span className={cn('font-bold', econ.gdp_growth?.trend === 'rising' ? 'text-emerald-400' : 'text-amber-400')}>{g > 0 ? '+' : ''}{g.toFixed(1)}%</span>
                          </div>
                        )}
                        {infl != null && (
                          <div className="flex justify-between text-[9px] font-mono">
                            <span className="text-white/28">Inflation</span>
                            <span className={cn('font-bold', infl > 5 ? 'text-red-400' : infl > 3 ? 'text-amber-400' : 'text-emerald-400')}>{infl.toFixed(1)}%</span>
                          </div>
                        )}
                        {unemp != null && (
                          <div className="flex justify-between text-[9px] font-mono">
                            <span className="text-white/28">Unemployment</span>
                            <span className="text-white/55 font-bold">{unemp.toFixed(1)}%</span>
                          </div>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="text-center pb-6 pt-2">
            <div className="text-[7px] font-mono text-white/10 uppercase tracking-wider">
              Sources: FRED · Yahoo Finance · CoinGecko · Fear&Greed · Polymarket · AYN Prediction Engine v8 · World Bank
            </div>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {selectedConflict && (
          <motion.div
            initial={{ opacity: 0, x: 440 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 440 }}
            transition={{ type: 'spring', damping: 28, stiffness: 220 }}
            className="fixed top-0 right-0 bottom-0 w-full sm:w-[500px] bg-[#06060a]/98 backdrop-blur-2xl border-l border-red-500/20 z-[100] flex flex-col shadow-[-20px_0_60px_rgba(0,0,0,0.5)]"
          >
            <div className="p-5 border-b border-white/8 shrink-0">
              <div className="flex items-start justify-between">
                <div className="flex-1 pr-4">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />
                    <span className="text-[9px] font-mono text-red-400/60 uppercase tracking-[0.2em]">Conflict Intelligence</span>
                    {selectedConflict.escalation_risk && (
                      <span className={cn('text-[8px] font-mono font-bold px-2 py-0.5 rounded-full border uppercase',
                        selectedConflict.escalation_risk === 'critical' ? 'text-red-400 border-red-500/40 bg-red-500/10'
                        : selectedConflict.escalation_risk === 'high' ? 'text-orange-400 border-orange-500/30 bg-orange-500/8'
                        : 'text-amber-400 border-amber-500/25 bg-amber-500/6')}>
                        {selectedConflict.escalation_risk}
                      </span>
                    )}
                  </div>
                  <h2 className="text-lg font-mono font-bold text-white leading-snug">{selectedConflict.title}</h2>
                  <div className="flex items-center gap-3 mt-1.5">
                    <span className="text-[9px] font-mono text-white/30">{selectedConflict.region?.replace('_', ' ').toUpperCase()}</span>
                    <span className="text-[9px] font-mono text-white/30">·</span>
                    <span className="text-[9px] font-mono text-white/30">{selectedConflict.target_period}</span>
                    <span className="text-[9px] font-mono text-white/30">·</span>
                    <span className="text-[9px] font-mono text-white/50 font-bold">{selectedConflict.confidence}% confidence</span>
                  </div>
                </div>
                <button onClick={() => setSelectedConflict(null)} className="p-2 rounded-lg hover:bg-white/6 text-white/35 hover:text-white transition-colors text-xl font-mono shrink-0">×</button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-5 scrollbar-thin">
              {/* Financial trigger */}
              {selectedConflict.financial_trigger && (
                <div className="bg-red-500/8 border border-red-500/20 rounded-xl p-4">
                  <div className="text-[8px] font-mono text-red-400/70 uppercase tracking-wider mb-2">💰 Financial Signal Driving This</div>
                  <p className="text-[11px] font-mono text-red-200/75 leading-relaxed font-bold">{selectedConflict.financial_trigger}</p>
                </div>
              )}

              {/* Money signals breakdown */}
              {selectedConflict.conflict_signals && (
                <div>
                  <div className="text-[8px] font-mono text-white/25 uppercase tracking-wider mb-3">What the Markets Are Saying</div>
                  <div className="space-y-2">
                    {[
                      { key: 'oil_signal', label: '🛢️ Oil Signal', color: 'text-orange-300/70 bg-orange-500/5 border-orange-500/15' },
                      { key: 'gold_signal', label: '🥇 Gold Signal', color: 'text-amber-300/70 bg-amber-500/5 border-amber-500/15' },
                      { key: 'currency_signal', label: '¥ Currency Signal', color: 'text-cyan-300/70 bg-cyan-500/5 border-cyan-500/15' },
                      { key: 'sanctions_signal', label: '⚖️ Sanctions Signal', color: 'text-purple-300/70 bg-purple-500/5 border-purple-500/15' },
                    ].filter(s => selectedConflict.conflict_signals?.[s.key as keyof typeof selectedConflict.conflict_signals]).map(s => (
                      <div key={s.key} className={cn('px-3 py-2.5 rounded-lg border', s.color)}>
                        <div className="text-[8px] font-mono font-bold mb-1 opacity-70">{s.label}</div>
                        <p className="text-[10px] font-mono leading-relaxed">{selectedConflict.conflict_signals?.[s.key as keyof typeof selectedConflict.conflict_signals]}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* What's happening */}
              <div>
                <div className="text-[8px] font-mono text-white/25 uppercase tracking-wider mb-2">What's Happening Now</div>
                <p className="text-[11px] font-mono text-white/60 leading-relaxed">{selectedConflict.what_is_happening}</p>
              </div>

              {/* What it means */}
              <div>
                <div className="text-[8px] font-mono text-white/25 uppercase tracking-wider mb-2">What This Leads To</div>
                <p className="text-[11px] font-mono text-white/60 leading-relaxed">{selectedConflict.what_it_means}</p>
              </div>

              {/* Historical parallel */}
              {selectedConflict.historical_parallel && (
                <div className="bg-purple-500/5 border border-purple-500/12 rounded-xl p-4">
                  <div className="text-[8px] font-mono text-purple-400/60 uppercase tracking-wider mb-2">📖 Historical Parallel</div>
                  <p className="text-[10px] font-mono text-purple-200/55 leading-relaxed">{selectedConflict.historical_parallel}</p>
                </div>
              )}

              {/* Who wins / who loses */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-emerald-500/5 border border-emerald-500/12 rounded-xl p-3">
                  <div className="text-[8px] font-mono text-emerald-400/60 uppercase tracking-wider mb-2">✅ Who Wins</div>
                  <p className="text-[10px] font-mono text-emerald-200/55 leading-relaxed">{selectedConflict.who_wins}</p>
                </div>
                <div className="bg-red-500/5 border border-red-500/12 rounded-xl p-3">
                  <div className="text-[8px] font-mono text-red-400/60 uppercase tracking-wider mb-2">❌ Who Gets Hurt</div>
                  <p className="text-[10px] font-mono text-red-200/55 leading-relaxed">{selectedConflict.who_gets_hurt}</p>
                </div>
              </div>

              {/* Actionable move */}
              {(selectedConflict.actionable_move || selectedConflict.what_to_do_now) && (
                <div className="bg-cyan-500/6 border border-cyan-500/18 rounded-xl p-4">
                  <div className="text-[8px] font-mono text-cyan-400/60 uppercase tracking-wider mb-2">⚡ Your Move Now</div>
                  {selectedConflict.actionable_move && (
                    <p className="text-[11px] font-mono text-cyan-200/80 font-bold leading-relaxed mb-2">{selectedConflict.actionable_move}</p>
                  )}
                  {selectedConflict.what_to_do_now && (
                    <p className="text-[10px] font-mono text-cyan-200/50 leading-relaxed">{selectedConflict.what_to_do_now}</p>
                  )}
                </div>
              )}

              {/* Key drivers + risks */}
              <div className="grid grid-cols-2 gap-3">
                {safeArr(selectedConflict.key_drivers).length > 0 && (
                  <div>
                    <div className="text-[8px] font-mono text-white/25 uppercase tracking-wider mb-2">Key Drivers</div>
                    <div className="space-y-1">
                      {safeArr(selectedConflict.key_drivers).map((d: string, i: number) => (
                        <div key={i} className="flex items-start gap-1.5 text-[9px] font-mono text-white/40">
                          <span className="text-white/20 shrink-0">›</span>{d}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {safeArr(selectedConflict.main_risks).length > 0 && (
                  <div>
                    <div className="text-[8px] font-mono text-white/25 uppercase tracking-wider mb-2">What Makes This Wrong</div>
                    <div className="space-y-1">
                      {safeArr(selectedConflict.main_risks).map((r: string, i: number) => (
                        <div key={i} className="flex items-start gap-1.5 text-[9px] font-mono text-white/40">
                          <span className="text-red-400/40 shrink-0">!</span>{r}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {selectedCountry && (
          <CountryDossier intel={selectedCountry.intel} sic={selectedCountry.sic} onClose={() => setSelectedCountry(null)} />
        )}
      </AnimatePresence>

      <style>{`
        @keyframes ticker { 0% { transform: translateX(0); } 100% { transform: translateX(-50%); } }
        .scrollbar-thin::-webkit-scrollbar { width: 3px; }
        .scrollbar-thin::-webkit-scrollbar-track { background: transparent; }
        .scrollbar-thin::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.07); border-radius: 99px; }
      `}</style>
    </div>
  );
}
