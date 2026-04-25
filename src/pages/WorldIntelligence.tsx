import { useEffect, useState, useMemo, useCallback, useRef, lazy, Suspense } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import {
  ArrowLeft, RefreshCw, Globe2, Radio, Activity,
  ChevronRight, Shield, Building2, Flame,
  AlertTriangle, Users, Zap, TrendingUp, BarChart3,
  Network, LayoutDashboard, Signal,
  MapPin, ChevronLeft, Menu
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { HeatMap2D, MapPoint } from '@/components/dashboard/HeatMap2D';
import { INTELLIGENCE_SEEDS, THREAT_TICKER } from '@/data/mapSeeds';
import { SpotlightCard, BorderBeam } from '@/components/ui/premium';

const AgentSociety       = lazy(() => import('@/components/dashboard/world/AgentSociety'));
const AgentConvViewer    = lazy(() => import('@/components/dashboard/world/AgentConvViewer'));

// ─── Types ────────────────────────────────────────────────────────────────────
interface WorldSignal {
  id: string; signal_type: string; severity: string; headline: string;
  summary?: string; region: string; countries_involved: string[];
  impact_on_oil: string; impact_on_gold: string; impact_on_btc: string;
  created_at: string;
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

const SIC_COORDS: Record<string, [number, number]> = {
  USA:[-95.7,37.0],CHN:[104.1,35.8],EU:[10.4,51.1],GBR:[-3.4,55.3],
  SAU:[45.0,23.8],ARE:[53.8,23.4],JPN:[138.2,36.2],IND:[78.9,20.5],
  BRA:[-51.9,-14.2],RUS:[105.3,61.5],KOR:[127.7,35.9],
  ZAF:[22.9,-30.5],CAN:[-106.3,56.1],AUS:[133.7,-25.2],
};

type ViewSection = 'overview' | 'agents';

const NAV_ITEMS: { id: ViewSection; icon: typeof LayoutDashboard; label: string }[] = [
  { id: 'overview', icon: LayoutDashboard, label: 'Overview' },
  { id: 'agents',   icon: Users,           label: 'Agents' },
];

// ─── Premium Glass Card ──────────────────────────────────────────────────────
function GlassCard({ className, children, hover = true, ...props }: React.HTMLAttributes<HTMLDivElement> & { hover?: boolean }) {
  return (
    <div className={cn(
      'relative rounded-2xl border border-white/[0.06] bg-white/[0.03] backdrop-blur-xl',
      '[border-top-color:rgba(255,255,255,0.1)]',
      'shadow-[0_8px_32px_rgba(0,0,0,0.3),inset_0_1px_0_rgba(255,255,255,0.04)]',
      hover && 'hover:-translate-y-0.5 hover:shadow-[0_16px_48px_rgba(0,0,0,0.4),inset_0_1px_0_rgba(255,255,255,0.06)] hover:border-white/[0.1]',
      'transition-all duration-300',
      className
    )} {...props}>
      {children}
    </div>
  );
}

// ─── Section Header ──────────────────────────────────────────────────────────
function SectionHeader({ label, title, description, icon: Icon, count }: {
  label?: string; title: string; description?: string;
  icon?: React.ElementType; count?: number;
}) {
  return (
    <div className="mb-8">
      {(Icon || label) && (
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground/60 mb-2 flex items-center gap-2">
          {Icon && <Icon className="w-3.5 h-3.5" />}
          {label}
          {count !== undefined && <span className="text-muted-foreground/40">· {count}</span>}
        </p>
      )}
      <h2 className="text-2xl font-display font-bold text-foreground tracking-tight">{title}</h2>
      {description && <p className="text-sm text-muted-foreground/70 mt-1 max-w-lg">{description}</p>}
    </div>
  );
}

// ─── Country Dossier Side Panel ──────────────────────────────────────────────
function CountryDossier({ intel, onClose }: { intel: CountryIntel; onClose: () => void }) {
  const econ = intel.economy || {};
  return (
    <>
      {/* Backdrop overlay */}
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 z-[99] bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <motion.div
        initial={{ opacity: 0, x: 520 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 520 }}
        transition={{ type: 'spring', damping: 30, stiffness: 240 }}
        className="fixed top-0 right-0 bottom-0 w-full sm:w-[520px] z-[100] flex flex-col bg-background/95 backdrop-blur-2xl border-l border-white/[0.06]"
      >
        <div className="p-6 border-b border-white/[0.06] shrink-0 flex items-start justify-between">
          <div>
            <p className="text-[10px] text-muted-foreground/60 uppercase tracking-[0.2em] mb-2 font-semibold">Country Dossier</p>
            <h2 className="text-2xl font-display font-bold text-foreground">{intel.country_name}</h2>
            {econ.gdp?.formatted && <p className="text-sm text-muted-foreground mt-1">GDP {econ.gdp.formatted}</p>}
          </div>
          <button onClick={onClose} className="p-2.5 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] text-muted-foreground hover:text-foreground transition-all border border-white/[0.06]">✕</button>
        </div>
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: 'GDP Growth', value: econ.gdp_growth?.value != null ? `${econ.gdp_growth.value > 0 ? '+' : ''}${econ.gdp_growth.value.toFixed(1)}%` : null, good: (econ.gdp_growth?.value || 0) > 0, pct: Math.min(100, Math.abs(econ.gdp_growth?.value || 0) * 10) },
              { label: 'Inflation',  value: econ.inflation?.value != null ? `${econ.inflation.value.toFixed(1)}%` : null, good: (econ.inflation?.value || 0) < 3, pct: Math.min(100, (econ.inflation?.value || 0) * 10) },
              { label: 'Unemployment', value: econ.unemployment?.value != null ? `${econ.unemployment.value.toFixed(1)}%` : null, good: (econ.unemployment?.value || 0) < 5, pct: Math.min(100, (econ.unemployment?.value || 0) * 8) },
              { label: 'Income/Person', value: econ.income_per_person?.formatted || null, good: true, pct: 60 },
            ].filter(s => s.value).map(s => (
              <GlassCard key={s.label} hover={false} className="p-4">
                <p className="text-[10px] text-muted-foreground/60 uppercase tracking-wider mb-2 font-semibold">{s.label}</p>
                <p className={cn('text-lg font-bold mb-2', s.good ? 'text-foreground' : 'text-amber-500')}>{s.value}</p>
                <div className="h-1 bg-white/[0.06] rounded-full overflow-hidden">
                  <div className={cn('h-full rounded-full transition-all', s.good ? 'bg-emerald-500/60' : 'bg-amber-500/60')} style={{ width: `${s.pct}%` }} />
                </div>
              </GlassCard>
            ))}
          </div>
          {intel.intelligence_brief?.length > 0 && (
            <div>
              <div className="h-px bg-gradient-to-r from-transparent via-white/[0.06] to-transparent mb-5" />
              <p className="text-[10px] text-muted-foreground/60 uppercase tracking-[0.2em] mb-4 font-semibold">Economic Snapshot</p>
              <div className="space-y-1">
                {intel.intelligence_brief.map((line, i) => {
                  const text = typeof line === 'string' ? line : (line?.title || line?.snippet || JSON.stringify(line));
                  return (
                    <div key={i} className="flex gap-3 py-2 border-b border-white/[0.04] last:border-0">
                      <span className="text-primary/40 text-xs shrink-0 mt-0.5">›</span>
                      <span className="text-sm text-muted-foreground leading-relaxed">{text}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          {intel.hot_sectors?.filter(Boolean).length! > 0 && (
            <div>
              <div className="h-px bg-gradient-to-r from-transparent via-white/[0.06] to-transparent mb-5" />
              <p className="text-[10px] text-muted-foreground/60 uppercase tracking-[0.2em] mb-4 font-semibold flex items-center gap-2">
                <Flame className="w-3.5 h-3.5 text-orange-500" /> Hot Sectors
              </p>
              <div className="flex flex-wrap gap-2">
                {intel.hot_sectors!.filter(Boolean).map((s, i) => {
                  const label = typeof s === 'string' ? s : (s?.name || s?.title || JSON.stringify(s));
                  return <span key={i} className="text-xs px-3 py-1.5 rounded-full bg-orange-500/10 border border-orange-500/20 text-orange-600 dark:text-orange-400">{label}</span>;
                })}
              </div>
            </div>
          )}
        </div>
      </motion.div>
    </>
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
  const [signals, setSignals] = useState<WorldSignal[]>([]);
  const [signalFilter, setSignalFilter] = useState<string>('all');
  const [countryIntel, setCountryIntel] = useState<CountryIntel[]>([]);
  const [userId, setUserId] = useState<string | undefined>();
  const [agentConversations, setAgentConversations] = useState<any[]>([]);
  const [agentActiveConvId, setAgentActiveConvId] = useState<string | null>(null);

  // UI
  const [selectedCountry, setSelectedCountry] = useState<CountryIntel | null>(null);

  useEffect(() => { window.scrollTo(0, 0); }, []);

  // Auto-select first conversation when agent conversations load
  useEffect(() => {
    if (agentConversations.length > 0 && !agentActiveConvId) {
      setAgentActiveConvId(agentConversations[0].id);
    }
  }, [agentConversations, agentActiveConvId]);
  useEffect(() => { supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id)); }, []);

  const fetchSnapshot = useCallback(async () => {
    try {
      const { data } = await supabase.from('ayn_market_snapshot').select('snapshot,fetched_at').eq('singleton_key', 1).single();
      if (data) setSnapshot(data);
    } catch {}
  }, []);

  const fetchSignals = useCallback(async () => {
    try {
      const { data } = await supabase.from('ayn_world_signals').select('*').eq('status', 'active').order('created_at', { ascending: false }).limit(30);
      if (data) setSignals(data as WorldSignal[]);
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
    setTimeout(() => fetchCountryIntel(), 600);
    const poll = setInterval(fetchSnapshot, 5 * 60 * 1000);
    return () => clearInterval(poll);
  }, [fetchSnapshot, fetchSignals, fetchCountryIntel]);
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
    <div className="h-screen bg-background flex items-center justify-center">
      <div className="text-center space-y-4">
        <div className="relative w-16 h-16 mx-auto">
          <div className="absolute inset-0 rounded-full border-2 border-white/[0.06] border-t-primary animate-spin" />
          <Globe2 className="w-7 h-7 text-muted-foreground absolute inset-0 m-auto" />
        </div>
        <p className="text-muted-foreground text-sm tracking-[0.2em] uppercase font-display">Loading Intelligence</p>
      </div>
    </div>
  );

  // ─── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="h-screen bg-background text-foreground flex flex-col overflow-hidden">
      {/* ── Top Header ──────────────────────────────────────────────────────── */}
      <header className="shrink-0 z-50 h-14 flex items-center border-b border-white/[0.06] bg-background/80 backdrop-blur-2xl px-5">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <button onClick={() => navigate(-1)} className="p-2 rounded-xl hover:bg-white/[0.05] transition-colors">
            <ArrowLeft className="w-4 h-4 text-muted-foreground" />
          </button>
          <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)} className="p-2 rounded-xl hover:bg-white/[0.05] transition-colors md:hidden">
            <Menu className="w-4 h-4 text-muted-foreground" />
          </button>
          <div className="hidden sm:block w-px h-6 bg-white/[0.06]" />
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.4)]" />
            <h1 className="text-sm font-display font-bold tracking-tight truncate">Spheres</h1>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {criticalCount > 0 && (
            <div className="hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-destructive/10 border border-destructive/20">
              <div className="w-1.5 h-1.5 rounded-full bg-destructive animate-pulse" />
              <span className="text-[10px] font-semibold text-destructive tracking-wider">{criticalCount} CRITICAL</span>
            </div>
          )}
          <span className="hidden lg:block text-xs text-muted-foreground/60 tabular-nums font-medium">{format(currentTime, 'HH:mm')} UTC</span>
          {snapshot?.fetched_at && <span className="hidden xl:block text-xs text-muted-foreground/50">Updated {timeAgo(snapshot.fetched_at)}</span>}
          <button onClick={handleRefresh} disabled={refreshing}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-medium text-muted-foreground hover:text-foreground border border-white/[0.06] hover:bg-white/[0.05] transition-all">
            <RefreshCw className={cn('w-3.5 h-3.5', refreshing && 'animate-spin')} />
            <span className="hidden sm:inline">Refresh</span>
          </button>
        </div>
      </header>

      {/* ── Price Ticker ───────────────────────────────────────────────────── */}
      {tickerItems.length > 0 && (
        <div className="shrink-0 overflow-hidden h-11 border-b border-white/[0.04] bg-white/[0.02] backdrop-blur-sm">
          <div className="flex animate-[wi-ticker_80s_linear_infinite] items-center h-full px-4 whitespace-nowrap">
            {[...tickerItems, ...tickerItems].map((item, i) => (
              <span key={i} className="inline-flex items-center gap-2.5 text-xs mr-8">
                <span className="text-muted-foreground/50 font-medium uppercase tracking-wider text-[10px]">{item.label}</span>
                <span className="text-foreground font-semibold text-sm">{item.value}</span>
                {item.change !== undefined && (
                  <span className={cn('font-semibold text-[11px]', item.change > 0 ? 'text-emerald-400' : item.change < 0 ? 'text-red-400' : 'text-muted-foreground')}>
                    {item.change > 0 ? '↑' : '↓'}{Math.abs(item.change).toFixed(2)}%
                  </span>
                )}
                {/* Divider */}
                <span className="w-px h-3.5 bg-white/[0.06] ml-3" />
              </span>
            ))}
          </div>
        </div>
      )}

      <style>{`@keyframes wi-ticker { 0%{transform:translateX(0)} 100%{transform:translateX(-50%)} }`}</style>

      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* ── Sidebar ──────────────────────────────────────────────────────── */}
        <aside className={cn(
          "shrink-0 border-r border-white/[0.04] hidden md:flex flex-col overflow-hidden transition-all duration-300",
          "bg-gradient-to-b from-card to-background",
          sidebarCollapsed ? "w-[68px]" : "w-60"
        )}>
          <nav className="flex-1 py-3 px-3 space-y-0.5">
            {NAV_ITEMS.map(item => {
              const isActive = activeSection === item.id;
              const count = undefined;
              return (
                <button key={item.id} onClick={() => setActiveSection(item.id)}
                  title={sidebarCollapsed ? item.label : undefined}
                  className={cn(
                    "w-full flex items-center gap-3 rounded-xl transition-all duration-200 group relative",
                    sidebarCollapsed ? "px-3 py-2 justify-center" : "px-3 py-2",
                    isActive
                      ? "bg-primary/10 text-primary shadow-[0_0_12px_rgba(14,165,233,0.15)] border border-primary/20"
                      : "text-muted-foreground hover:text-foreground hover:bg-white/[0.04] border border-transparent"
                  )}>
                  <item.icon className={cn("w-4 h-4 shrink-0", isActive && "text-primary")} />
                  {!sidebarCollapsed && (
                    <>
                      <span className="text-sm font-medium flex-1 text-left">{item.label}</span>
                      {count !== undefined && count > 0 && (
                        <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full",
                          isActive ? "bg-primary/20 text-primary" : "bg-white/[0.06] text-muted-foreground"
                        )}>{count}</span>
                      )}
                    </>
                  )}
                </button>
              );
            })}
          </nav>
          <div className="p-3 border-t border-white/[0.04]">
            <button onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
              className="w-full flex items-center justify-center py-2.5 rounded-xl text-muted-foreground hover:text-foreground hover:bg-white/[0.04] transition-colors">
              {sidebarCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
            </button>
          </div>
        </aside>

        {/* ── Mobile Nav Overlay ────────────────────────────────────────────── */}
        <AnimatePresence>
          {mobileMenuOpen && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 md:hidden bg-black/50 backdrop-blur-sm"
              onClick={() => setMobileMenuOpen(false)}>
              <motion.div initial={{ x: -260 }} animate={{ x: 0 }} exit={{ x: -260 }}
                transition={{ type: 'spring', damping: 25 }}
                className="w-64 h-full bg-background/95 backdrop-blur-2xl border-r border-white/[0.06] p-5 space-y-2"
                onClick={e => e.stopPropagation()}>
                <p className="text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-[0.2em] mb-5 px-2">Navigation</p>
                {NAV_ITEMS.map(item => (
                  <button key={item.id} onClick={() => { setActiveSection(item.id); setMobileMenuOpen(false); }}
                    className={cn(
                      "w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all text-sm",
                      activeSection === item.id
                        ? "bg-primary/10 text-primary font-semibold border border-primary/20"
                        : "text-muted-foreground hover:text-foreground hover:bg-white/[0.04]"
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
        <main className="flex-1 min-h-0 overflow-y-auto scroll-smooth" style={{ overscrollBehavior: 'contain' }}>
          <AnimatePresence mode="wait">

            {/* ════════ OVERVIEW ════════ */}
            {activeSection === 'overview' && (
              <motion.div key="overview" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}
                className="p-6 sm:p-8 lg:p-10 pb-16 space-y-8 max-w-[1400px] mx-auto">

                {/* Map — hero focal point */}
                <div className="rounded-3xl overflow-hidden border border-white/[0.06] shadow-[0_16px_48px_rgba(0,0,0,0.4)]" style={{ height: 'clamp(480px, 70vh, 780px)' }}>
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
                <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-8">
                  {/* Intelligence Brief */}
                  <SpotlightCard className="rounded-2xl border border-white/[0.06] bg-white/[0.03] backdrop-blur-xl overflow-hidden">
                    <div className="flex items-center gap-2.5 px-6 py-4 border-b border-white/[0.04]">
                      <Radio className="w-4 h-4 text-emerald-400" />
                      <h2 className="text-sm font-semibold text-foreground">Intelligence Brief</h2>
                      <div className="flex-1" />
                      <div className="flex items-center gap-1.5">
                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                        <span className="text-[10px] text-emerald-400/70 uppercase tracking-wider font-semibold">Live</span>
                      </div>
                    </div>
                    <div className="p-5 space-y-2.5">
                      {briefItems.map((item, i) => (
                        <motion.div key={i} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.06 }}
                          className={cn('text-sm leading-relaxed py-3 px-5 rounded-xl border-l-[3px]',
                            String(item).includes('⚠') || String(item).toLowerCase().includes('fear')
                              ? 'border-l-destructive/60 text-destructive/80 bg-destructive/5'
                              : 'border-l-primary/40 text-muted-foreground bg-white/[0.02]')}>
                          {String(item)}
                        </motion.div>
                      ))}
                    </div>
                  </SpotlightCard>

                  {/* Right column: Sentiment + Macro */}
                  <div className="space-y-6">
                    <SpotlightCard className="rounded-2xl border border-white/[0.06] bg-white/[0.03] backdrop-blur-xl p-6">
                      <p className="text-[10px] text-muted-foreground/60 uppercase tracking-[0.2em] mb-4 font-semibold">Market Sentiment</p>
                      <div className={cn('text-5xl font-display font-bold mb-1.5 tabular-nums',
                        (sentiment.value||0) <= 25 ? 'text-red-400' : (sentiment.value||0) <= 45 ? 'text-orange-400' : (sentiment.value||0) <= 55 ? 'text-amber-400' : 'text-emerald-400')}>
                        {sentiment.value ?? '—'}
                      </div>
                      <p className="text-sm text-muted-foreground/70 mb-4">{sentiment.classification || 'Fear & Greed Index'}</p>
                      <div className="h-2.5 bg-white/[0.06] rounded-full overflow-hidden">
                        <motion.div initial={{ width: 0 }} animate={{ width: `${sentiment.value || 0}%` }} transition={{ duration: 1.2, ease: 'easeOut' }}
                          className={cn('h-full rounded-full', (sentiment.value||0) <= 45 ? 'bg-gradient-to-r from-red-500 to-orange-500' : 'bg-gradient-to-r from-emerald-500 to-emerald-400')} />
                      </div>
                    </SpotlightCard>
                    <GlassCard hover={false} className="p-6">
                      <p className="text-[10px] text-muted-foreground/60 uppercase tracking-[0.2em] mb-4 font-semibold">US Macro</p>
                      {[
                        { k: 'fed_funds_rate', label: 'Fed Rate', suffix: '%' },
                        { k: 'treasury_10yr', label: '10Y Yield', suffix: '%' },
                        { k: 'yield_curve', label: 'Yield Curve', field: 'signal' },
                      ].map(({ k, label, suffix, field }) => {
                        const d = safeObj(macro[k]); const val = field ? d[field as keyof typeof d] : d.value;
                        if (!val) return null;
                        return (
                          <div key={k} className="flex justify-between items-center py-3 border-b border-white/[0.04] last:border-0">
                            <span className="text-sm text-muted-foreground/70">{label}</span>
                            <span className="text-sm text-foreground font-semibold">{String(val)}{suffix||''}</span>
                          </div>
                        );
                      })}
                    </GlassCard>
                  </div>
                </div>

                {/* Quick signal summary */}
                {signals.length > 0 && (
                  <GlassCard hover={false} className="p-6">
                    <div className="flex items-center justify-between mb-5">
                      <div className="flex items-center gap-2.5">
                        <AlertTriangle className="w-4 h-4 text-destructive" />
                        <h2 className="text-sm font-semibold">Latest Signals</h2>
                        <span className="text-xs text-muted-foreground/50">{signals.length} active</span>
                      </div>
                      <button onClick={() => setActiveSection('signals')} className="text-xs text-muted-foreground/50 hover:text-foreground transition-colors flex items-center gap-1 group">
                        View all <ChevronRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
                      </button>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                      {signals.slice(0, 3).map(s => (
                        <div key={s.id} className={cn('rounded-xl p-4 border-l-[4px] bg-white/[0.02]',
                          s.severity === 'critical' ? 'border-l-red-500 border border-red-500/15' : s.severity === 'high' ? 'border-l-orange-500 border border-orange-500/15' : 'border-l-muted-foreground/30 border border-white/[0.04]')}>
                          <div className="flex items-center gap-2 mb-2.5">
                            <span className={cn('text-[10px] font-semibold uppercase tracking-wider',
                              s.severity === 'critical' ? 'text-red-400' : s.severity === 'high' ? 'text-orange-400' : 'text-muted-foreground')}>{s.severity}</span>
                            <span className="text-[10px] text-muted-foreground/40 ml-auto">{s.region?.replace('_', ' ')}</span>
                          </div>
                          <p className="text-sm text-foreground leading-snug font-medium">{s.headline}</p>
                          {/* Impact badges */}
                          <div className="flex gap-1.5 mt-3 flex-wrap">
                            {[
                              { label: 'Oil', val: s.impact_on_oil },
                              { label: 'Gold', val: s.impact_on_gold },
                              { label: 'BTC', val: s.impact_on_btc },
                            ].filter(x => x.val && x.val !== 'stable').map(x => (
                              <span key={x.label} className={cn('text-[10px] font-medium px-2 py-0.5 rounded-full',
                                x.val === 'spike' ? 'bg-red-500/10 text-red-400' : 'bg-emerald-500/10 text-emerald-400')}>
                                {x.label} {x.val === 'spike' ? '↑' : '↓'}
                              </span>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </GlassCard>
                )}

                {/* ════════ SIGNALS ════════ */}
                <div className="h-px bg-gradient-to-r from-transparent via-white/[0.06] to-transparent" />
                <SectionHeader icon={AlertTriangle} label="Intelligence" title="Live World Signals" description="Real-time geopolitical, economic, and market signals from global sources." count={signals.length} />
                {signals.length > 0 ? (
                  <>
                    {/* Severity filter */}
                    {(() => {
                      const SEVS = [
                        { id: 'all', label: 'All', color: '' },
                        { id: 'critical', label: 'Critical', color: 'text-red-400' },
                        { id: 'high', label: 'High', color: 'text-orange-400' },
                        { id: 'medium', label: 'Medium', color: 'text-amber-400' },
                        { id: 'low', label: 'Low', color: 'text-muted-foreground' },
                      ];
                      const activeSevs = new Set(signals.map(s => s.severity));
                      const visible = SEVS.filter(sv => sv.id === 'all' || activeSevs.has(sv.id));
                      return (
                        <div className="flex gap-2 flex-wrap mb-2">
                          {visible.map(sv => {
                            const count = sv.id === 'all' ? signals.length : signals.filter(s => s.severity === sv.id).length;
                            const isActive = signalFilter === sv.id;
                            return (
                              <button key={sv.id} onClick={() => setSignalFilter(sv.id)}
                                className={cn("px-3 py-1.5 rounded-full text-xs font-medium transition-all border",
                                  isActive ? "border-border bg-foreground text-background" : "border-border text-muted-foreground hover:text-foreground hover:bg-white/[0.04]")}>
                                {sv.label} <span className="opacity-60 ml-1">{count}</span>
                              </button>
                            );
                          })}
                        </div>
                      );
                    })()}
                    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5">
                    {signals.filter(s => signalFilter === 'all' || s.severity === signalFilter).map((s, idx) => (
                      <motion.div key={s.id} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.04 }}
                        className={cn('rounded-2xl overflow-hidden border-l-[4px] bg-white/[0.03] backdrop-blur-xl border border-white/[0.06] transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_16px_48px_rgba(0,0,0,0.3)]',
                          s.severity === 'critical' ? 'border-l-red-500' : s.severity === 'high' ? 'border-l-orange-500' : 'border-l-muted-foreground/30')}>
                        <div className="p-5">
                          <div className="flex items-center gap-2 mb-3">
                            <span className={cn('text-[10px] font-semibold uppercase tracking-wider',
                              s.severity === 'critical' ? 'text-red-400' : s.severity === 'high' ? 'text-orange-400' : 'text-muted-foreground')}>{s.severity}</span>
                            <span className="text-[10px] text-muted-foreground/40 uppercase ml-auto">{s.region?.replace('_', ' ')}</span>
                          </div>
                          <p className="text-sm text-foreground leading-relaxed font-semibold mb-3">{s.headline}</p>
                          {s.summary && <p className="text-sm text-muted-foreground/70 leading-relaxed mb-4">{s.summary}</p>}
                          <div className="flex items-center gap-3 pt-3 border-t border-white/[0.04] flex-wrap">
                            {[
                              { label: '🛢️ Oil', val: s.impact_on_oil },
                              { label: '🥇 Gold', val: s.impact_on_gold },
                              { label: '₿ BTC', val: s.impact_on_btc },
                            ].map(({ label, val }) => val && val !== 'stable' && (
                              <span key={label} className={cn('text-[10px] font-medium px-2 py-0.5 rounded-full',
                                val === 'spike' ? 'bg-red-500/10 text-red-400' : val === 'drop' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-white/[0.04] text-muted-foreground')}>
                                {label} {val === 'spike' ? '↑' : val === 'drop' ? '↓' : '~'}
                              </span>
                            ))}
                            {s.countries_involved?.length > 0 && (
                              <span className="text-[10px] text-muted-foreground/40 ml-auto">{s.countries_involved.slice(0, 3).join(', ')}</span>
                            )}
                          </div>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                  </>
                ) : (
                  <div className="text-center py-12 text-muted-foreground">
                    <Signal className="w-10 h-10 mx-auto mb-3 opacity-20" />
                    <p className="text-sm">No active signals at this time</p>
                  </div>
                )}

                {/* ════════ COUNTRIES ════════ */}
                <div className="h-px bg-gradient-to-r from-transparent via-white/[0.06] to-transparent" />
                <SectionHeader icon={Building2} label="Dossiers" title="Country Intelligence" description="Economic profiles, hot sectors, and opportunity maps for monitored countries." count={countryIntel.length} />
                {countryIntel.length > 0 ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
                    {countryIntel.map(ci => {
                      const econ = ci.economy || {};
                      const gdpGrowth = econ.gdp_growth?.value;
                      const infl = econ.inflation?.value;
                      return (
                        <GlassCard key={ci.country_code} className="p-5 cursor-pointer group" onClick={() => setSelectedCountry(ci)}>
                          <div className="flex items-start justify-between mb-4">
                            <h3 className="text-sm font-semibold text-foreground leading-tight">{ci.country_name}</h3>
                            <ChevronRight className="w-4 h-4 text-muted-foreground/30 group-hover:text-primary group-hover:translate-x-0.5 transition-all shrink-0" />
                          </div>
                          {econ.gdp?.formatted && <p className="text-xs text-muted-foreground/50 mb-4">{econ.gdp.formatted}</p>}
                          <div className="space-y-3">
                            {gdpGrowth != null && (
                              <div>
                                <div className="flex justify-between text-xs mb-1.5">
                                  <span className="text-muted-foreground/50">GDP Growth</span>
                                  <span className={cn('font-semibold', gdpGrowth > 0 ? 'text-emerald-400' : 'text-amber-400')}>{gdpGrowth > 0 ? '+' : ''}{gdpGrowth.toFixed(1)}%</span>
                                </div>
                                <div className="h-1 bg-white/[0.06] rounded-full overflow-hidden">
                                  <div className={cn('h-full rounded-full', gdpGrowth > 0 ? 'bg-emerald-500/50' : 'bg-amber-500/50')} style={{ width: `${Math.min(100, Math.abs(gdpGrowth) * 12)}%` }} />
                                </div>
                              </div>
                            )}
                            {infl != null && (
                              <div>
                                <div className="flex justify-between text-xs mb-1.5">
                                  <span className="text-muted-foreground/50">Inflation</span>
                                  <span className={cn('font-semibold', infl > 5 ? 'text-red-400' : infl > 3 ? 'text-amber-400' : 'text-emerald-400')}>{infl.toFixed(1)}%</span>
                                </div>
                                <div className="h-1 bg-white/[0.06] rounded-full overflow-hidden">
                                  <div className={cn('h-full rounded-full', infl > 5 ? 'bg-red-500/50' : infl > 3 ? 'bg-amber-500/50' : 'bg-emerald-500/50')} style={{ width: `${Math.min(100, infl * 8)}%` }} />
                                </div>
                              </div>
                            )}
                          </div>
                          {/* Hover overlay */}
                          <div className="absolute inset-0 rounded-2xl flex items-center justify-center bg-black/40 backdrop-blur-sm opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                            <span className="text-sm font-semibold text-white flex items-center gap-1.5">View Dossier <ChevronRight className="w-4 h-4" /></span>
                          </div>
                        </GlassCard>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-center py-12 text-muted-foreground">
                    <MapPin className="w-10 h-10 mx-auto mb-3 opacity-20" />
                    <p className="text-sm">No country data available</p>
                  </div>
                )}
              </motion.div>
            )}

            {/* ════════ AGENTS ════════ */}
            {activeSection === 'agents' && (
              <motion.div key="agents" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}
                className="flex flex-col pb-16">
                {/* Header */}
                <div className="border-b border-white/[0.04] px-6 sm:px-8 py-5 flex items-center gap-3 shrink-0">
                  <div className="w-2 h-2 rounded-full bg-purple-500 animate-pulse shadow-[0_0_8px_rgba(168,85,247,0.4)]" />
                  <h2 className="text-sm font-display font-semibold">Agent Society</h2>
                  <span className="text-xs text-muted-foreground/40">Live AI agents · World reaction simulation</span>
                </div>
                {/* Agent Society — padded content */}
                <div className="px-4 sm:px-6 lg:px-8 pt-4 sm:pt-6">
                  <Suspense fallback={
                    <div className="flex items-center justify-center h-80">
                      <div className="text-center space-y-3">
                        <div className="w-12 h-12 rounded-full border-2 border-white/[0.06] border-t-primary animate-spin mx-auto" />
                        <p className="text-xs text-muted-foreground/40 tracking-[0.2em] uppercase font-display">Loading Agent Network</p>
                      </div>
                    </div>
                  }>
                    <AgentSociety
                      onConversationsChange={setAgentConversations}
                      externalActiveConvId={agentActiveConvId}
                    />
                  </Suspense>
                </div>

                {/* ── Discussion tabs — FULL WIDTH of the entire section ── */}
                {agentConversations.length > 0 && (
                  <div className="mx-4 sm:mx-6 lg:mx-8 mt-4 mb-6 rounded-xl overflow-hidden"
                    style={{border:'1px solid rgba(168,85,247,0.18)',background:'rgba(0,0,0,0.5)'}}>
                    <div className="flex items-center gap-2 px-4 py-2.5 border-b border-white/[0.05]"
                      style={{background:'rgba(168,85,247,0.05)'}}>
                      <div className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-pulse"
                        style={{boxShadow:'0 0 4px rgba(168,85,247,0.7)'}} />
                      <span className="text-[10px] font-semibold font-mono text-white/40 uppercase tracking-widest">
                        Discussions
                      </span>
                      <span className="text-[10px] font-mono text-white/20 ml-1">{agentConversations.length}</span>
                    </div>
                    <div className="flex flex-wrap gap-2 px-4 py-3"
                      style={{scrollbarWidth:'none'}}>
                      {agentConversations.slice(0,12).map((conv: any) => {
                        const isActive = agentActiveConvId === conv.id;
                        const isCritical = conv.signal_severity === 'critical';
                        const isSignal = !!conv.signal_id;
                        return (
                          <button key={conv.id}
                            onClick={() => setAgentActiveConvId(conv.id)}
                            className="flex items-center gap-1.5 font-mono transition-all"
                            style={{
                              fontSize: 11,
                              padding: '6px 14px',
                              borderRadius: 8,
                              border: isActive
                                ? '1px solid rgba(168,85,247,0.55)'
                                : isSignal && isCritical
                                ? '1px solid rgba(239,68,68,0.22)'
                                : isSignal
                                ? '1px solid rgba(245,158,11,0.2)'
                                : '1px solid rgba(255,255,255,0.08)',
                              background: isActive ? 'rgba(168,85,247,0.16)' : 'rgba(255,255,255,0.03)',
                              color: isActive ? '#a855f7' : 'rgba(255,255,255,0.45)',
                              maxWidth: 260,
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                            }}>
                            {isSignal && <span style={{fontSize:10}}>{isCritical ? '🔴' : '🟡'}</span>}
                            <span style={{overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                              {conv.topic?.slice(0, 45) || 'Conversation'}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* ── Conversation feed — full width under tabs ── */}
                {agentActiveConvId && (
                  <div className="mx-4 sm:mx-6 lg:mx-8 mb-6 rounded-2xl overflow-hidden"
                    style={{border:'1px solid rgba(168,85,247,0.2)',background:'linear-gradient(180deg,rgba(5,0,15,0.97),rgba(0,0,0,0.99))'}}>
                    {/* Active topic header */}
                    {(() => {
                      const conv = agentConversations.find((c:any)=>c.id===agentActiveConvId);
                      if (!conv) return null;
                      return (
                        <div className="flex items-center gap-3 px-5 py-3 border-b border-white/[0.06]"
                          style={{background:'rgba(168,85,247,0.05)'}}>
                          <div className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-pulse shrink-0"/>
                          {conv.signal_severity==='critical'&&<span className="text-[10px]">🔴</span>}
                          {conv.signal_severity==='high'&&<span className="text-[10px]">🟡</span>}
                          <span className="text-sm font-mono text-white/70 font-semibold flex-1 truncate">{conv.topic}</span>
                          {conv.signal_headline && (
                            <span className="text-[9px] font-mono text-white/30 truncate hidden lg:block max-w-xs">triggered by: {conv.signal_headline}</span>
                          )}
                        </div>
                      );
                    })()}
                    {/* Lazy-load the message viewer from AgentSociety */}
                    <Suspense fallback={<div className="h-24 flex items-center justify-center text-xs font-mono text-white/20">Loading messages...</div>}>
                      <AgentConvViewer convId={agentActiveConvId} />
                    </Suspense>
                  </div>
                )}
              </motion.div>
            )}

          </AnimatePresence>
        </main>
      </div>

      {/* ── Mobile Bottom Nav ──────────────────────────────────────────────────── */}
      <nav className="md:hidden shrink-0 border-t border-white/[0.04] bg-background/80 backdrop-blur-2xl flex items-center justify-around py-2 px-2">
        {NAV_ITEMS.map(item => {
          const isActive = activeSection === item.id;
          return (
            <button key={item.id} onClick={() => setActiveSection(item.id)}
              className={cn("relative flex flex-col items-center gap-1 py-2 px-3 rounded-xl transition-colors min-w-[52px]",
                isActive ? "text-primary" : "text-muted-foreground/50")}>
              {isActive && <span className="absolute top-0 left-1/2 -translate-x-1/2 w-6 h-0.5 rounded-full bg-primary" />}
              <item.icon className="w-5 h-5" />
              <span className="text-[10px] font-medium">{item.label}</span>
            </button>
          );
        })}
      </nav>

      {/* ── Side panels ───────────────────────────────────────────────────────── */}
      <AnimatePresence>
        {selectedCountry && <CountryDossier intel={selectedCountry} onClose={() => setSelectedCountry(null)} />}
      </AnimatePresence>
    </div>
  );
}
