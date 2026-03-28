import { useEffect, useState, useMemo, useCallback, useRef } from 'react';

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
        heading: i.heading ?? i.course,
        speed: i.speed,
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
        heading: i.heading ?? i.track,
        speed: i.speed_knots ?? i.speed,
      };
    }).filter(Boolean).slice(0, 30);
}


interface MarketSnapshot { snapshot: Json; fetched_at: string; sources_used: string[] | null; }
interface Prediction {
  id: string; asset: string; horizon: string; target_date: string;
  baseline_value: number; predicted_value: number;
  predicted_low: number; predicted_high: number;
  predicted_direction: 'up' | 'down' | 'sideways';
  predicted_pct_change: number; confidence: number; reasoning: string;
  agree_count?: number; disagree_count?: number; user_vote?: 'agree' | 'disagree' | null;
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


// ─── Agent Society Component ──────────────────────────────────────────────────
const EMOTION_CONFIG: Record<string, {
  emoji: string; color: string; bg: string; border: string; label: string; particle: string;
}> = {
  neutral:    { emoji: '😐', color: '#9ca3af', bg: 'rgba(156,163,175,0.06)', border: 'rgba(156,163,175,0.15)', label: 'Neutral',    particle: '' },
  confident:  { emoji: '😤', color: '#34d399', bg: 'rgba(52,211,153,0.08)',  border: 'rgba(52,211,153,0.25)',  label: 'Confident',  particle: '⬆' },
  panicked:   { emoji: '😱', color: '#f87171', bg: 'rgba(248,113,113,0.12)', border: 'rgba(248,113,113,0.4)',  label: 'PANICKING',  particle: '‼' },
  happy:      { emoji: '😊', color: '#fde047', bg: 'rgba(253,224,71,0.08)',  border: 'rgba(253,224,71,0.25)',  label: 'Happy',      particle: '✦' },
  angry:      { emoji: '😡', color: '#ef4444', bg: 'rgba(239,68,68,0.12)',   border: 'rgba(239,68,68,0.45)',   label: 'FURIOUS',    particle: '✕' },
  worried:    { emoji: '😟', color: '#f59e0b', bg: 'rgba(245,158,11,0.08)',  border: 'rgba(245,158,11,0.25)',  label: 'Worried',    particle: '?' },
  suspicious: { emoji: '🤨', color: '#a78bfa', bg: 'rgba(167,139,250,0.08)', border: 'rgba(167,139,250,0.25)', label: 'Suspicious', particle: '•' },
  excited:    { emoji: '🤩', color: '#22d3ee', bg: 'rgba(34,211,238,0.08)',  border: 'rgba(34,211,238,0.25)',  label: 'Excited',    particle: '★' },
  sad:        { emoji: '😢', color: '#60a5fa', bg: 'rgba(96,165,250,0.08)',  border: 'rgba(96,165,250,0.2)',   label: 'Sad',        particle: '▼' },
  tense:      { emoji: '😬', color: '#fb923c', bg: 'rgba(251,146,60,0.08)',  border: 'rgba(251,146,60,0.3)',   label: 'Tense',      particle: '~' },
};

const ROLE_BADGE: Record<string, { icon: string; color: string }> = {
  government:   { icon: '🏛', color: '#9ca3af' },
  central_bank: { icon: '🏦', color: '#fde047' },
  market:       { icon: '📊', color: '#34d399' },
  military:     { icon: '⚔',  color: '#f87171' },
};

function EmotionMeter({ intensity, color }: { intensity: number; color: string }) {
  return (
    <div className="flex flex-col gap-0.5 items-center" style={{ height: 36 }}>
      {[...Array(5)].map((_, i) => {
        const threshold = (5 - i) * 20;
        const active = intensity >= threshold;
        return (
          <div key={i} className="w-1 rounded-full transition-all duration-500"
            style={{
              height: 5,
              backgroundColor: active ? color : 'rgba(255,255,255,0.06)',
              boxShadow: active ? `0 0 4px ${color}` : 'none',
              opacity: active ? 0.9 : 0.3,
            }} />
        );
      })}
    </div>
  );
}

function AgentAvatar({ flag, emotion, size = 'md' }: { flag: string; emotion: string; size?: 'sm' | 'md' | 'lg' }) {
  const em = EMOTION_CONFIG[emotion] || EMOTION_CONFIG.neutral;
  const sz = size === 'lg' ? 52 : size === 'md' ? 38 : 28;
  const fontSize = size === 'lg' ? 28 : size === 'md' ? 20 : 14;
  const isExtreme = ['panicked', 'angry'].includes(emotion);

  return (
    <div className="relative flex-shrink-0" style={{ width: sz, height: sz }}>
      {/* Outer glow ring — pulses on extreme emotion */}
      <div className="absolute inset-0 rounded-xl transition-all duration-700"
        style={{
          border: `1px solid ${em.border}`,
          boxShadow: isExtreme ? `0 0 20px ${em.color}55, 0 0 40px ${em.color}22` : `0 0 8px ${em.color}22`,
          animation: isExtreme ? 'pulse 1s ease-in-out infinite' : 'none',
        }} />
      {/* Face */}
      <div className="absolute inset-0.5 rounded-xl flex items-center justify-center"
        style={{ background: em.bg, backdropFilter: 'blur(8px)' }}>
        <span style={{ fontSize }}>{flag}</span>
      </div>
      {/* Emotion emoji — bottom right */}
      <div className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full flex items-center justify-center text-[9px]"
        style={{ background: 'rgba(0,0,0,0.9)', border: `1px solid ${em.border}`, zIndex: 10 }}>
        {em.emoji}
      </div>
    </div>
  );
}

function AgentMessage({ msg, prev, idx }: { msg: any; prev: any; idx: number }) {
  const [showThought, setShowThought] = useState(false);
  const em = EMOTION_CONFIG[msg.emotion] || EMOTION_CONFIG.neutral;
  const intensity = msg.emotion_intensity || 50;
  const isExtreme = intensity >= 80;
  const isNew = idx === 0;

  // Message type accent
  const typeAccent = msg.message_type === 'warning' ? '#ef4444'
    : msg.message_type === 'decision' ? '#34d399'
    : msg.message_type === 'question' ? '#60a5fa'
    : msg.message_type === 'reaction' ? em.color
    : null;

  return (
    <motion.div
      initial={{ opacity: 0, x: -16, scale: 0.97 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
      className="flex gap-3 group"
    >
      {/* Avatar + meter */}
      <div className="flex flex-col items-center gap-1.5 flex-shrink-0">
        <AgentAvatar flag={msg.agent_flag || '🏛'} emotion={msg.emotion} size="md" />
        <EmotionMeter intensity={intensity} color={em.color} />
      </div>

      {/* Bubble */}
      <div className="flex-1 min-w-0 pb-1">
        {/* Name bar */}
        <div className="flex items-center gap-2 mb-1.5">
          <span className="text-[10px] font-mono font-black" style={{ color: em.color }}>{msg.agent_name}</span>
          {ROLE_BADGE[msg.agent_role] && (
            <span className="text-[8px]" style={{ color: ROLE_BADGE[msg.agent_role].color }}>
              {ROLE_BADGE[msg.agent_role].icon}
            </span>
          )}
          <span className="text-[7px] font-mono px-1.5 py-0.5 rounded-full font-bold"
            style={{ color: em.color, background: em.bg, border: `1px solid ${em.border}` }}>
            {em.emoji} {em.label}
            {em.particle && <span className="ml-0.5 opacity-70">{em.particle}</span>}
          </span>
          {isExtreme && (
            <motion.span
              animate={{ opacity: [1, 0.3, 1] }}
              transition={{ duration: 0.8, repeat: Infinity }}
              className="text-[7px] font-mono font-black"
              style={{ color: em.color }}
            >
              {intensity}% INTENSITY
            </motion.span>
          )}
          {msg.message_type !== 'statement' && (
            <span className="ml-auto text-[6px] font-mono uppercase tracking-widest"
              style={{ color: typeAccent || 'rgba(255,255,255,0.2)' }}>
              [{msg.message_type}]
            </span>
          )}
        </div>

        {/* Message bubble */}
        <div className="relative rounded-xl px-4 py-3 text-[10px] font-mono text-white/75 leading-relaxed"
          style={{
            background: `linear-gradient(135deg, ${em.bg}, rgba(0,0,0,0.4))`,
            border: `1px solid ${em.border}`,
            boxShadow: isExtreme ? `0 0 24px ${em.color}22, inset 0 1px 0 ${em.color}15` : `inset 0 1px 0 rgba(255,255,255,0.04)`,
          }}>
          {/* Type accent bar */}
          {typeAccent && (
            <div className="absolute left-0 top-2 bottom-2 w-0.5 rounded-full" style={{ background: typeAccent, boxShadow: `0 0 6px ${typeAccent}` }} />
          )}
          {msg.responding_to_agent && (
            <div className="text-[8px] mb-1.5 opacity-40 flex items-center gap-1">
              <span>↩</span>
              <span>responding to {msg.responding_to_agent}</span>
            </div>
          )}
          {msg.message}
        </div>

        {/* Internal thought toggle */}
        {msg.internal_thought && (
          <div className="mt-1.5 ml-1">
            <button onClick={() => setShowThought(!showThought)}
              className="text-[7px] font-mono italic transition-colors flex items-center gap-1"
              style={{ color: showThought ? '#a78bfa' : 'rgba(255,255,255,0.2)' }}>
              <span>💭</span>
              <span>{showThought ? 'hide inner thoughts' : 'reveal inner thoughts'}</span>
            </button>
            <AnimatePresence>
              {showThought && (
                <motion.div
                  initial={{ opacity: 0, height: 0, marginTop: 0 }}
                  animate={{ opacity: 1, height: 'auto', marginTop: 6 }}
                  exit={{ opacity: 0, height: 0, marginTop: 0 }}
                  className="overflow-hidden"
                >
                  <div className="rounded-lg px-3 py-2 text-[9px] font-mono italic leading-relaxed"
                    style={{
                      color: '#c4b5fd',
                      background: 'rgba(167,139,250,0.06)',
                      border: '1px solid rgba(167,139,250,0.15)',
                      borderLeft: '2px solid rgba(167,139,250,0.4)',
                    }}>
                    "{msg.internal_thought}"
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}

        {/* Market action */}
        {msg.market_action && (
          <div className="mt-1.5 flex items-center gap-2 px-3 py-1.5 rounded-lg text-[8px] font-mono"
            style={{ background: 'rgba(52,211,153,0.06)', border: '1px solid rgba(52,211,153,0.2)', color: '#34d399' }}>
            <span>📊</span>
            <span className="font-bold">{msg.market_action.action}</span>
            {msg.market_action.reason && <span className="opacity-50">— {msg.market_action.reason}</span>}
          </div>
        )}
      </div>
    </motion.div>
  );
}

function AgentMoodBoard({ states }: { states: any[] }) {
  if (!states?.length) return null;
  return (
    <div className="grid grid-cols-5 gap-2 mb-5">
      {states.map(s => {
        const em = EMOTION_CONFIG[s.current_emotion] || EMOTION_CONFIG.neutral;
        const intensity = s.emotion_intensity || 50;
        return (
          <div key={s.agent_id} className="relative rounded-xl p-2.5 text-center transition-all group cursor-default"
            style={{
              background: `linear-gradient(135deg, ${em.bg}, rgba(0,0,0,0.5))`,
              border: `1px solid ${em.border}`,
              boxShadow: intensity >= 75 ? `0 0 16px ${em.color}22` : 'none',
            }}>
            {/* Big emoji */}
            <div className="text-xl mb-1">{em.emoji}</div>
            {/* Flag */}
            <div className="text-base mb-0.5">{s.agent_id === 'blackrock' ? '💰' : ''}</div>
            {/* Name */}
            <div className="text-[7px] font-mono font-bold truncate" style={{ color: em.color }}>
              {s.agent_name.split(' ')[0].toUpperCase()}
            </div>
            {/* Emotion */}
            <div className="text-[6px] font-mono opacity-60 mt-0.5">{em.label}</div>
            {/* Stress bar */}
            <div className="h-0.5 mt-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
              <div className="h-full rounded-full transition-all duration-1000"
                style={{ width: `${intensity}%`, background: em.color, boxShadow: `0 0 4px ${em.color}` }} />
            </div>
            {/* Concern tooltip on hover */}
            {s.key_concern && (
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block z-50 whitespace-nowrap">
                <div className="text-[7px] font-mono rounded-lg px-2 py-1"
                  style={{ background: 'rgba(0,0,0,0.95)', border: `1px solid ${em.border}`, color: em.color }}>
                  {s.key_concern.slice(0, 60)}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function AgentSociety() {
  const [conversations, setConversations] = useState<any[]>([]);
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [agentStates, setAgentStates] = useState<any[]>([]);
  const [generating, setGenerating] = useState(false);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const SUPA_URL = 'https://dfkoxuokfkttjhfjcecx.supabase.co';
  const msgsEndRef = useRef<HTMLDivElement>(null);

  const loadData = async () => {
    try {
      const res = await fetch(`${SUPA_URL}/functions/v1/ayn-agent-society`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'get_conversations' }),
      });
      if (res.ok) {
        const data = await res.json();
        setConversations(data.conversations || []);
        setAgentStates(data.agent_states || []);
        if (data.conversations?.length && !activeConvId) setActiveConvId(data.conversations[0].id);
      }
    } catch {}
  };

  useEffect(() => { loadData(); }, []);

  useEffect(() => {
    if (!activeConvId) return;
    const load = async () => {
      setLoadingMsgs(true);
      try {
        const res = await fetch(`${SUPA_URL}/functions/v1/ayn-agent-society`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mode: 'get_messages', conversation_id: activeConvId }),
        });
        if (res.ok) { const d = await res.json(); setMessages(d.messages || []); }
      } catch {} finally { setLoadingMsgs(false); }
    };
    load();
  }, [activeConvId]);

  useEffect(() => {
    msgsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const generate = async () => {
    setGenerating(true);
    try {
      const res = await fetch(`${SUPA_URL}/functions/v1/ayn-agent-society`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'generate_conversation' }),
      });
      if (res.ok) {
        const data = await res.json();
        await loadData();
        if (data.conversation_id) { setActiveConvId(data.conversation_id); setMessages(data.messages || []); }
      }
    } catch {} finally { setGenerating(false); }
  };

  const activeConv = conversations.find(c => c.id === activeConvId);
  const hasPanic = messages.some(m => m.emotion === 'panicked');
  const hasAnger = messages.some(m => m.emotion === 'angry');
  const avgTension = messages.length
    ? Math.round(messages.reduce((s, m) => s + (m.emotion_intensity || 50), 0) / messages.length)
    : 0;

  return (
    <div className="mb-6">
      {/* ── Header bar */}
      <div className="flex items-center gap-3 mb-4">
        <div className="flex items-center gap-1.5">
          <motion.div
            animate={{ scale: [1, 1.3, 1], opacity: [0.7, 1, 0.7] }}
            transition={{ duration: 2, repeat: Infinity }}
            className="w-2 h-2 rounded-full bg-purple-400"
            style={{ boxShadow: '0 0 8px #a855f7' }}
          />
        </div>
        <span className="text-[11px] font-mono font-black text-purple-400 tracking-[0.18em] uppercase">Agent Society</span>
        <span className="text-[8px] font-mono text-white/20">// Live AI agents · World reaction simulation</span>
        <div className="flex-1 h-px" style={{ background: 'linear-gradient(90deg, rgba(168,85,247,0.2), transparent)' }} />
        {avgTension > 0 && (
          <div className="text-[8px] font-mono px-2 py-0.5 rounded-full"
            style={{
              color: avgTension >= 75 ? '#f87171' : avgTension >= 55 ? '#fb923c' : '#9ca3af',
              background: avgTension >= 75 ? 'rgba(248,113,113,0.1)' : 'rgba(255,255,255,0.04)',
              border: `1px solid ${avgTension >= 75 ? 'rgba(248,113,113,0.3)' : 'rgba(255,255,255,0.08)'}`,
            }}>
            TENSION {avgTension}%
          </div>
        )}
        <button onClick={generate} disabled={generating}
          className="text-[8px] font-mono px-3 py-1 rounded-full transition-all disabled:opacity-40"
          style={{ color: '#a855f7', background: 'rgba(168,85,247,0.1)', border: '1px solid rgba(168,85,247,0.3)' }}>
          {generating ? '⟳ generating...' : '⚡ new conversation'}
        </button>
      </div>

      {/* ── Mood board */}
      {agentStates.length > 0 && <AgentMoodBoard states={agentStates} />}

      {/* ── Conversation tabs */}
      {conversations.length > 0 && (
        <div className="flex gap-1.5 mb-3 overflow-x-auto pb-1">
          {conversations.slice(0, 5).map(conv => (
            <button key={conv.id} onClick={() => setActiveConvId(conv.id)}
              className="text-[7px] font-mono px-3 py-1.5 rounded-full border transition-all text-left flex-shrink-0 max-w-[180px] truncate"
              style={{
                background: activeConvId === conv.id ? 'rgba(168,85,247,0.12)' : 'rgba(255,255,255,0.02)',
                borderColor: activeConvId === conv.id ? 'rgba(168,85,247,0.4)' : 'rgba(255,255,255,0.08)',
                color: activeConvId === conv.id ? '#a855f7' : 'rgba(255,255,255,0.3)',
              }}>
              {conv.topic?.slice(0, 45) || 'Conversation'}
            </button>
          ))}
        </div>
      )}

      {/* ── Empty state */}
      {conversations.length === 0 && !generating && (
        <div className="rounded-2xl p-10 text-center"
          style={{ border: '1px dashed rgba(168,85,247,0.2)', background: 'rgba(168,85,247,0.03)' }}>
          <div className="text-4xl mb-4 opacity-60">🌍</div>
          <p className="text-[11px] font-mono text-white/30 mb-2">The agent society is silent.</p>
          <p className="text-[9px] font-mono text-white/15 mb-6">Generate a conversation to watch world powers react, argue, panic, and strategize.</p>
          <button onClick={generate}
            className="text-[9px] font-mono px-6 py-3 rounded-xl transition-all"
            style={{ color: '#a855f7', background: 'rgba(168,85,247,0.1)', border: '1px solid rgba(168,85,247,0.3)' }}>
            ⚡ Activate Agent Society
          </button>
        </div>
      )}

      {generating && (
        <div className="rounded-2xl p-8 text-center"
          style={{ border: '1px solid rgba(168,85,247,0.2)', background: 'rgba(168,85,247,0.04)' }}>
          <motion.div animate={{ opacity: [0.4, 1, 0.4] }} transition={{ duration: 1.5, repeat: Infinity }}>
            <div className="text-[10px] font-mono text-purple-400 tracking-widest">
              ⟳  AGENTS FORMING OPINIONS  ·  PROCESSING WORLD EVENTS  ·  GENERATING REACTIONS
            </div>
          </motion.div>
        </div>
      )}

      {/* ── Chat room */}
      {activeConv && (
        <div className="rounded-2xl overflow-hidden"
          style={{
            border: '1px solid rgba(168,85,247,0.15)',
            background: 'linear-gradient(180deg, rgba(5,0,15,0.95) 0%, rgba(0,0,0,0.98) 100%)',
            boxShadow: '0 0 60px rgba(168,85,247,0.06)',
          }}>

          {/* Topic bar */}
          <div className="flex items-center gap-3 px-5 py-3 border-b border-white/5"
            style={{ background: 'linear-gradient(90deg, rgba(168,85,247,0.06) 0%, transparent 60%)' }}>
            <div className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-pulse" />
            <span className="text-[8px] font-mono text-white/25 uppercase tracking-widest">Live Discussion</span>
            <span className="text-[9px] font-mono text-white/55 font-bold flex-1 truncate">{activeConv.topic}</span>
            {hasPanic && (
              <motion.span animate={{ opacity: [1, 0.3, 1] }} transition={{ duration: 0.6, repeat: Infinity }}
                className="text-[7px] font-mono font-black px-2 py-0.5 rounded-full"
                style={{ color: '#f87171', background: 'rgba(248,113,113,0.15)', border: '1px solid rgba(248,113,113,0.3)' }}>
                🚨 AGENT PANIC DETECTED
              </motion.span>
            )}
            {!hasPanic && hasAnger && (
              <span className="text-[7px] font-mono px-2 py-0.5 rounded-full"
                style={{ color: '#ef4444', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)' }}>
                ⚠ HIGH TENSION
              </span>
            )}
          </div>

          {/* Messages */}
          <div className="px-5 py-4 space-y-6 overflow-y-auto" style={{ maxHeight: 560 }}>
            {loadingMsgs && (
              <div className="text-center py-8 text-[9px] font-mono text-white/20">Loading conversation...</div>
            )}
            <AnimatePresence initial={false}>
              {messages.map((msg, i) => (
                <AgentMessage key={msg.id} msg={msg} prev={messages[i - 1]} idx={messages.length - 1 - i} />
              ))}
            </AnimatePresence>
            <div ref={msgsEndRef} />
          </div>

          {/* Footer stats */}
          {messages.length > 0 && (
            <div className="flex items-center gap-4 px-5 py-2.5 border-t border-white/4"
              style={{ background: 'rgba(0,0,0,0.5)' }}>
              <span className="text-[7px] font-mono text-white/20">{messages.length} messages</span>
              <span className="text-[7px] font-mono text-white/15">·</span>
              <span className="text-[7px] font-mono text-white/20">
                {messages.filter(m => m.internal_thought).length} thoughts hidden
              </span>
              <span className="text-[7px] font-mono text-white/15">·</span>
              <span className="text-[7px] font-mono text-white/20">
                {messages.filter(m => m.market_action).length} market actions
              </span>
              {messages.some(m => m.emotion_intensity >= 80) && (
                <span className="ml-auto text-[7px] font-mono" style={{ color: '#f87171' }}>
                  ⚠ extreme emotions detected
                </span>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── World Simulator Component ────────────────────────────────────────────────
const TIME_LAYER_CONFIG: Record<string, { label: string; color: string; bg: string; icon: string }> = {
  historical: { label: 'Historical Anchor', color: 'text-purple-400', bg: 'bg-purple-500/8 border-purple-500/20', icon: '📜' },
  present:    { label: 'Now',              color: 'text-amber-400',  bg: 'bg-amber-500/8 border-amber-500/20',  icon: '⚡' },
  near_future:{ label: 'Next 2–8 Weeks',  color: 'text-blue-400',   bg: 'bg-blue-500/8 border-blue-500/20',    icon: '🔮' },
  far_future:  { label: '3–6 Months',     color: 'text-emerald-400',bg: 'bg-emerald-500/8 border-emerald-500/20',icon: '🌐' },
};

const ACTOR_EMOJI: Record<string, string> = {
  'United States': '🇺🇸', 'China': '🇨🇳', 'Russia': '🇷🇺', 'European Union': '🇪🇺',
  'Federal Reserve': '🏦', 'OPEC+': '🛢', 'Saudi Arabia': '🇸🇦', 'Iran': '🇮🇷',
  'Israel': '🇮🇱', 'BlackRock / Institutional Capital': '💰',
};

const MARKET_IMPACT_COLOR: Record<string, string> = {
  spike: 'text-red-400', rally: 'text-emerald-400', selloff: 'text-red-400',
  weaken: 'text-red-400', strengthen: 'text-emerald-400', volatile: 'text-amber-400',
  stable: 'text-white/40', drop: 'text-red-400', recovery: 'text-emerald-400',
};

function SimEventNode({ event, isRoot }: { event: any; isRoot?: boolean }) {
  const [expanded, setExpanded] = useState(isRoot || false);
  const layer = TIME_LAYER_CONFIG[event.time_layer] || TIME_LAYER_CONFIG.present;
  const reactions = event.actor_reactions || [];
  const impact = event.market_impact || {};
  const prob = event.probability;

  return (
    <div className={cn('rounded-xl border p-3 transition-all', layer.bg, isRoot && 'ring-1 ring-amber-500/30')}>
      {/* Header */}
      <div className="flex items-start gap-2">
        <span className="text-base flex-shrink-0 mt-0.5">{layer.icon}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className={cn('text-[8px] font-mono font-bold uppercase tracking-widest', layer.color)}>{layer.label}</span>
            {prob !== undefined && prob < 100 && (
              <span className="text-[8px] font-mono text-white/30">{prob}% likely</span>
            )}
            {event.cascade_depth > 0 && (
              <span className="text-[8px] font-mono text-white/20">depth {event.cascade_depth}</span>
            )}
          </div>
          <p className="text-[11px] font-mono font-bold text-white/85 leading-snug">{event.title}</p>
          {event.summary && (
            <p className="text-[9px] text-white/45 mt-1 leading-relaxed line-clamp-2">{event.summary}</p>
          )}

          {/* Market impact pills */}
          {Object.keys(impact).length > 0 && (
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              {Object.entries(impact).filter(([k]) => k !== 'lesson').map(([asset, val]: [string, any]) => (
                <span key={asset} className={cn('text-[8px] font-mono', MARKET_IMPACT_COLOR[String(val)] || 'text-white/40')}>
                  {asset === 'oil' ? '🛢' : asset === 'gold' ? 'Au' : asset === 'btc' ? '₿' : asset === 'usd' ? '$' : asset === 'equities' ? '📈' : ''} {String(val)}
                </span>
              ))}
            </div>
          )}

          {/* Expand/collapse */}
          {(reactions.length > 0 || event.historical_outcome || event.historical_parallel) && (
            <button onClick={() => setExpanded(!expanded)}
              className="text-[8px] font-mono text-white/25 hover:text-white/50 mt-2 transition-colors">
              {expanded ? '↑ collapse' : `↓ ${reactions.length > 0 ? `${reactions.length} actor reactions` : 'details'}`}
            </button>
          )}
        </div>
      </div>

      {/* Expanded: actor reactions */}
      {expanded && (
        <div className="mt-3 pt-3 border-t border-white/6 space-y-2">
          {event.historical_outcome && (
            <div className="bg-purple-500/8 rounded-lg px-3 py-2">
              <div className="text-[8px] font-mono text-purple-400/70 uppercase mb-1">What happened last time</div>
              <p className="text-[9px] text-white/50 leading-relaxed">{event.historical_outcome}</p>
            </div>
          )}
          {reactions.map((r: any, i: number) => (
            <div key={i} className="flex items-start gap-2 bg-white/3 rounded-lg px-3 py-2">
              <span className="text-sm flex-shrink-0">{ACTOR_EMOJI[r.actor] || '🏛'}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-[9px] font-mono font-bold text-white/70">{r.actor}</span>
                  <span className="text-[8px] font-mono text-white/25">{r.timeline}</span>
                  {r.confidence && <span className="text-[8px] font-mono text-white/20">{r.confidence}%</span>}
                </div>
                <p className="text-[9px] text-white/50 mt-0.5">{r.action}</p>
                {r.secondary_effect && (
                  <p className="text-[8px] text-amber-400/50 mt-0.5">→ {r.secondary_effect}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function WorldSimulator({ signals }: { signals: any[] }) {
  const [simulations, setSimulations] = useState<any[]>([]);
  const [activeSimId, setActiveSimId] = useState<string | null>(null);
  const [cascadeEvents, setCascadeEvents] = useState<any[]>([]);
  const [simulating, setSimulating] = useState(false);
  const [loadingCascade, setLoadingCascade] = useState(false);
  const SUPABASE_URL_LOCAL = (window as any).__SUPABASE_URL__ || '';

  // Load existing simulations
  useEffect(() => {
    const load = async () => {
      try {
        const { data } = await supabase
          .from('ayn_world_simulations')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(10);
        if (data?.length) {
          setSimulations(data);
          setActiveSimId(data[0].id);
        }
      } catch {}
    };
    load();
  }, []);

  // Load cascade when simulation selected
  useEffect(() => {
    if (!activeSimId) return;
    const load = async () => {
      setLoadingCascade(true);
      try {
        const { data } = await supabase
          .from('ayn_world_events')
          .select('*')
          .eq('simulation_run_id', activeSimId)
          .order('cascade_depth', { ascending: true });
        setCascadeEvents(data || []);
      } catch {} finally { setLoadingCascade(false); }
    };
    load();
  }, [activeSimId]);

  const runSim = async (signalId?: string) => {
    setSimulating(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token || '';
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL || 'https://dfkoxuokfkttjhfjcecx.supabase.co'}/functions/v1/ayn-world-simulator`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(signalId ? { mode: 'simulate_signal', signal_id: signalId } : { mode: 'simulate_signal' }),
      });
      if (res.ok) {
        const result = await res.json();
        if (result.simulation_id) {
          // Reload simulations
          const { data } = await supabase.from('ayn_world_simulations').select('*').order('created_at', { ascending: false }).limit(10);
          setSimulations(data || []);
          setActiveSimId(result.simulation_id);
        }
      }
    } catch(e) { console.error(e); } finally { setSimulating(false); }
  };

  // Group events by time layer
  const byLayer = {
    historical: cascadeEvents.filter(e => e.time_layer === 'historical'),
    present: cascadeEvents.filter(e => e.time_layer === 'present'),
    near_future: cascadeEvents.filter(e => e.time_layer === 'near_future'),
    far_future: cascadeEvents.filter(e => e.time_layer === 'far_future'),
  };

  const activeSim = simulations.find(s => s.id === activeSimId);

  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-2 mb-4">
        <div className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
        <span className="text-[10px] font-mono font-bold text-amber-400 tracking-[0.15em] uppercase">World Simulator</span>
        <div className="flex-1 h-px bg-gradient-to-r from-amber-500/20 to-transparent" />
        <button
          onClick={() => runSim()}
          disabled={simulating}
          className="text-[9px] font-mono text-amber-400/60 hover:text-amber-400 transition-colors disabled:opacity-40 flex items-center gap-1"
        >
          {simulating ? '⟳ simulating...' : '⚡ simulate new signal'}
        </button>
      </div>

      {/* Simulation selector */}
      {simulations.length > 0 && (
        <div className="flex gap-1.5 mb-4 flex-wrap">
          {simulations.slice(0, 5).map(sim => (
            <button
              key={sim.id}
              onClick={() => setActiveSimId(sim.id)}
              className={cn(
                'text-[8px] font-mono px-2.5 py-1 rounded-lg border transition-all text-left max-w-[200px] truncate',
                activeSimId === sim.id
                  ? 'bg-amber-500/15 border-amber-500/40 text-amber-400'
                  : 'bg-white/3 border-white/8 text-white/35 hover:text-white/60'
              )}
            >
              {sim.trigger_title?.slice(0, 40) || 'Simulation'}
            </button>
          ))}
        </div>
      )}

      {/* No simulations yet */}
      {simulations.length === 0 && !simulating && (
        <div className="border border-dashed border-amber-500/20 rounded-xl p-8 text-center mb-4">
          <div className="text-2xl mb-2">🌐</div>
          <p className="text-[11px] font-mono text-white/40 mb-3">No simulations yet. Run one to see the full causal chain.</p>
          <button onClick={() => runSim()} className="text-[9px] font-mono text-amber-400 bg-amber-500/10 border border-amber-500/30 px-4 py-2 rounded-lg hover:bg-amber-500/20 transition-all">
            ⚡ Run First Simulation
          </button>
        </div>
      )}

      {simulating && (
        <div className="border border-amber-500/20 rounded-xl p-6 text-center mb-4 bg-amber-500/5">
          <div className="text-[10px] font-mono text-amber-400 animate-pulse">⟳ Simulating causal cascade... analyzing actors, market impacts, historical parallels...</div>
        </div>
      )}

      {/* Active simulation: timeline */}
      {activeSim && cascadeEvents.length > 0 && (
        <div className="space-y-4">
          {/* Simulation meta */}
          <div className="flex items-center gap-3 text-[8px] font-mono text-white/25 px-1">
            <span>🌐 {activeSim.total_events_generated} events</span>
            <span>·</span>
            <span>🏛 {(activeSim.actors_activated || []).length} actors activated</span>
            <span>·</span>
            <span>{new Date(activeSim.created_at).toLocaleDateString()}</span>
          </div>

          {/* Time layers as columns/sections */}
          {(['historical', 'present', 'near_future', 'far_future'] as const).map(layer => {
            const events = byLayer[layer];
            if (!events.length) return null;
            const cfg = TIME_LAYER_CONFIG[layer];
            return (
              <div key={layer}>
                {/* Layer header with connecting line */}
                <div className="flex items-center gap-2 mb-2">
                  <span className={cn('text-[9px] font-mono font-bold uppercase tracking-widest', cfg.color)}>{cfg.icon} {cfg.label}</span>
                  <div className={cn('flex-1 h-px opacity-30', layer === 'historical' ? 'bg-purple-400' : layer === 'present' ? 'bg-amber-400' : layer === 'near_future' ? 'bg-blue-400' : 'bg-emerald-400')} />
                  {layer !== 'historical' && layer !== 'present' && (
                    <span className="text-[8px] font-mono text-white/20">↑ caused by present</span>
                  )}
                </div>
                <div className={cn('space-y-2', layer !== 'present' && 'pl-3 border-l border-white/6')}>
                  {events.map(ev => (
                    <SimEventNode key={ev.id} event={ev} isRoot={ev.event_type === 'trigger' && layer === 'present'} />
                  ))}
                </div>
              </div>
            );
          })}

          {/* Signals that triggered this */}
          {signals.length > 0 && (
            <div className="pt-3 border-t border-white/6">
              <div className="text-[8px] font-mono text-white/20 mb-2 uppercase tracking-widest">Simulate a specific signal</div>
              <div className="grid grid-cols-1 gap-1.5">
                {signals.slice(0, 4).map((sig, i) => (
                  <button
                    key={i}
                    onClick={() => runSim(sig.id)}
                    disabled={simulating}
                    className="text-left bg-white/3 border border-white/6 rounded-lg px-3 py-2 hover:bg-white/6 transition-all disabled:opacity-40 group"
                  >
                    <span className="text-[9px] font-mono text-white/50 group-hover:text-white/70 transition-colors">{sig.headline?.slice(0, 80)}</span>
                    <span className="text-[8px] font-mono text-amber-400/50 ml-2">→ simulate</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function AccuracyScoreboard() {
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const { data: rows } = await supabase
          .from('ayn_prediction_outcomes')
          .select('was_direction_correct, accuracy_score, actual_date, actual_direction, actual_pct_change, value_error_pct, prediction_id, ayn_predictions(asset, horizon, predicted_direction, predicted_pct_change)')
          .order('actual_date', { ascending: false })
          .limit(200);

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
          <div className="text-[9px] font-mono text-white/25 bg-white/5 px-2 py-1 rounded-full">
            {pred.confidence}%
          </div>
        </div>
      </div>

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
  const [currentTime, setCurrentTime] = useState(new Date());
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

  useEffect(() => {
    fetchLiveMapData();
    const t = setInterval(fetchLiveMapData, 3 * 60 * 1000);
    return () => clearInterval(t);
  }, [fetchLiveMapData]);

  useEffect(() => {
    Promise.all([fetchSnapshot(), fetchPredictions(), fetchCountryIntel(), fetchConflictPredictions(), fetchWorldSignals()]).finally(() => setLoading(false));

    const ch = supabase.channel('wi').on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'ayn_market_snapshot' }, p => setSnapshot(p.new as MarketSnapshot)).subscribe();
    const tick = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => { supabase.removeChannel(ch); clearInterval(tick); };
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
          <div className="rounded-2xl overflow-hidden border border-white/8 shadow-[0_0_60px_rgba(0,255,200,0.04)]">
            <HeatMap2D
              points={mapPoints}
              height={580}
              onPointClick={handleMapClick}
              showLayerToggle={true}
              isLive={true}
              lastRefresh={mapLastRefresh}
              ticker={THREAT_TICKER}
            />
          </div>

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
                  <motion.div key={i} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.07 }}
                    className={cn('text-[11px] font-mono leading-relaxed py-2.5 px-4 border-l-2 rounded-r-lg',
                      String(item).toLowerCase().includes('fear') || String(item).includes('⚠')
                        ? 'border-l-red-500/50 text-red-200/60 bg-red-500/4'
                        : 'border-l-emerald-400/30 text-white/55 bg-white/2')}>
                    {String(item)}
                  </motion.div>
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
            <AccuracyScoreboard />

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
                  <PredictionCard key={p.id} pred={p} onVote={handleVote} userId={userId} voting={votingId === p.id} />
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
          <AgentSociety />

          {/* ─── WORLD SIMULATOR ─── */}
          <WorldSimulator signals={worldSignals} />

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
