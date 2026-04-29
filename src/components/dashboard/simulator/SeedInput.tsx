/**
 * SeedInput v2 — World Simulation launcher
 * Particles.js agent field + report type buttons + demographic targeting
 */
import { useState, useEffect, useRef } from 'react';
import { Sparkles, Upload, ChevronRight, Globe, TrendingUp, Users, Building2, Zap, Radio } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ENGIN_URL } from '@/config';

declare global { interface Window { particlesJS: (id: string, config: object) => void; pJSDom?: { pJS: { fn: { vendors: { destroypJS: () => void } } } }[] } }

const PRESETS = [
  { label: 'Suez bypass permanent',      seed: 'Major shippers permanently reroute around the Suez Canal via Cape of Good Hope after sustained Red Sea disruption. Insurance, fuel, and transit times reprice globally.', question: 'Which industries gain or lose the most over the next 12 months?' },
  { label: 'Fed cuts 50bps surprise',    seed: 'The US Federal Reserve announces an unexpected 50bps rate cut citing labor-market softness. Treasury yields drop sharply.',                                                 question: 'How do EM currencies, gold, and tech equities react over 30 days?' },
  { label: 'AI labor displacement',      seed: 'A leading SaaS vendor releases autonomous task-completion agents priced at one-tenth the cost of human BPO labor.',                                                      question: 'Which job categories collapse first and how do governments respond?' },
  { label: 'Gold breaks $5,000',         seed: 'Gold breaches $5,000/oz for the first time as central banks accelerate de-dollarization and geopolitical uncertainty peaks.',                                           question: 'What happens to the dollar, emerging markets, and crypto?' },
  { label: 'Iran-Israel war escalates',  seed: 'Iran launches a direct missile strike on Israeli territory. Israel retaliates. The US activates carrier groups. Strait of Hormuz threatened.',                          question: 'How do oil, food prices, and global markets react in 72 hours?' },
  { label: 'iPhone 17 at $2,500',        seed: 'Apple launches iPhone 17 at $2,500 — double the previous flagship price — citing AI chip costs and supply chain restructuring.',                                        question: 'How do different income classes react and what happens to Apple market share?' },
];

const REPORT_TYPES = [
  { id: 'government',  label: 'Government',  icon: Building2,  color: 'from-blue-500/20 to-blue-600/10',   border: 'border-blue-500/30',   active: 'bg-blue-500/20 border-blue-400/60 text-blue-300',   desc: 'Geopolitical stability, policy response, protest risk' },
  { id: 'marketing',   label: 'Marketing',   icon: TrendingUp, color: 'from-orange-500/20 to-orange-600/10', border: 'border-orange-500/30', active: 'bg-orange-500/20 border-orange-400/60 text-orange-300', desc: 'Consumer sentiment, purchase intent, demographic breakdown' },
  { id: 'investment',  label: 'Investment',  icon: Zap,         color: 'from-yellow-500/20 to-yellow-600/10', border: 'border-yellow-500/30', active: 'bg-yellow-500/20 border-yellow-400/60 text-yellow-300', desc: 'Price predictions, capital flows, sector winners/losers' },
  { id: 'social',      label: 'Social',      icon: Users,       color: 'from-purple-500/20 to-purple-600/10', border: 'border-purple-500/30', active: 'bg-purple-500/20 border-purple-400/60 text-purple-300', desc: 'Community impact by ethnicity, religion, class, region' },
  { id: 'full',        label: 'Full World',  icon: Globe,       color: 'from-cyan-500/20 to-cyan-600/10',    border: 'border-cyan-500/30',   active: 'bg-cyan-500/20 border-cyan-400/60 text-cyan-300',     desc: 'All dimensions — complete world simulation' },
];

const DEPTH_OPTIONS = [
  { id: 'quick',    label: 'Quick',    agents: '30', time: '~90s',  cost: '$0.02', desc: 'Fast scan' },
  { id: 'standard', label: 'Standard', agents: '50', time: '~3min', cost: '$0.05', desc: 'Balanced' },
  { id: 'deep',     label: 'Deep',     agents: '80', time: '~6min', cost: '$0.10', desc: 'Full depth' },
];

const REGIONS = ['north_america','europe','middle_east','east_asia','south_asia','southeast_asia','latin_america','sub_saharan_africa','central_asia'];
const RELIGIONS = ['sunni_muslim','catholic','evangelical_christian','hindu','buddhist','orthodox','secular'];
const INCOME_LEVELS = ['extreme_poverty','low','working_class','lower_middle','middle_class','upper_middle','global_upper_class'];
const GENDERS = ['male','female'];

interface Props {
  loading: boolean;
  onStart: (input: {
    seed: string; question: string; rounds: number; agents: number;
    report_type: string; depth: string; user_target: Record<string,string|number|null>;
  }) => void;
}

export function SeedInput({ loading, onStart }: Props) {
  const [seed, setSeed]               = useState('');
  const [question, setQuestion]       = useState('');
  const [reportType, setReportType]   = useState('full');
  const [depth, setDepth]             = useState('standard');
  const [showFilters, setShowFilters] = useState(false);
  const [region, setRegion]           = useState('');
  const [religion, setReligion]       = useState('');
  const [incomeLevel, setIncomeLevel] = useState('');
  const [gender, setGender]           = useState('');
  const [ageMin, setAgeMin]           = useState('');
  const [ageMax, setAgeMax]           = useState('');
  const [loadingSignals, setLoadingSignals] = useState(false);
  const particlesRef = useRef<HTMLDivElement>(null);
  const pjsLoaded    = useRef(false);

  // ── Load particles.js from CDN ─────────────────────────────────────────
  useEffect(() => {
    if (pjsLoaded.current) return;
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/particles.js/2.0.0/particles.min.js';
    script.onload = () => { pjsLoaded.current = true; initParticles(); };
    document.head.appendChild(script);
    return () => { destroyParticles(); };
  }, []);

  const destroyParticles = () => {
    try { window.pJSDom?.forEach(p => p.pJS.fn.vendors.destroypJS()); (window as Record<string,unknown>).pJSDom = []; } catch {}
  };

  const initParticles = () => {
    if (!window.particlesJS || !document.getElementById('ayn-particles')) return;
    window.particlesJS('ayn-particles', {
      particles: {
        number: { value: 120, density: { enable: true, value_area: 800 } },
        color: { value: ['#06b6d4','#8b5cf6','#f59e0b','#10b981','#ef4444','#3b82f6'] },
        shape: { type: 'circle' },
        opacity: { value: 0.6, random: true, anim: { enable: true, speed: 0.5, opacity_min: 0.1, sync: false } },
        size: { value: 3, random: true, anim: { enable: true, speed: 2, size_min: 0.5, sync: false } },
        line_linked: {
          enable: true, distance: 120, color: '#06b6d4',
          opacity: 0.15, width: 1
        },
        move: {
          enable: true, speed: 0.8, direction: 'none', random: true,
          straight: false, out_mode: 'bounce', attract: { enable: true, rotateX: 600, rotateY: 1200 }
        },
      },
      interactivity: {
        detect_on: 'canvas',
        events: {
          onhover: { enable: true, mode: 'bubble' },
          onclick:  { enable: true, mode: 'repulse' },
          resize: true,
        },
        modes: {
          bubble:  { distance: 160, size: 6,  duration: 0.4, opacity: 0.9, speed: 3 },
          repulse: { distance: 120, duration: 0.4 },
          push:    { particles_nb: 4 },
        },
      },
      retina_detect: true,
    });
  };

  // ── Pull live world signals ────────────────────────────────────────────
  const pullLiveSignals = async () => {
    setLoadingSignals(true);
    try {
      const r = await fetch(`${ENGIN_URL}/world-signals`, { method: 'GET' });
      if (r.ok) {
        const data = await r.json();
        const signals = data.signals || [];
        if (signals.length > 0) {
          const top = signals[0];
          setSeed(`${top.headline}. ${top.summary || ''}`);
          setQuestion('How will this affect global markets, governments, and ordinary people?');
        }
      }
    } catch {
      // fallback — compose from latest preset
      setSeed(PRESETS[3].seed);
      setQuestion(PRESETS[3].question);
    } finally {
      setLoadingSignals(false);
    }
  };

  const usePreset = (p: typeof PRESETS[number]) => { setSeed(p.seed); setQuestion(p.question); };

  const handleFile = (file: File) => {
    if (file.size > 5 * 1024 * 1024) return;
    const reader = new FileReader();
    reader.onload = () => setSeed(String(reader.result || '').slice(0, 20000));
    reader.readAsText(file);
  };

  const canStart = seed.trim().length > 20 && question.trim().length > 5 && !loading;

  const handleStart = () => {
    if (!canStart) return;
    const depthAgents = { quick: 30, standard: 50, deep: 80 };
    onStart({
      seed: seed.trim(),
      question: question.trim(),
      rounds: 20,
      agents: depthAgents[depth as keyof typeof depthAgents] || 50,
      report_type: reportType,
      depth,
      user_target: {
        region: region || null,
        religion: religion || null,
        income_level: incomeLevel || null,
        gender: gender || null,
        age_min: ageMin ? parseInt(ageMin) : null,
        age_max: ageMax ? parseInt(ageMax) : null,
      },
    });
  };

  const activeRT = REPORT_TYPES.find(r => r.id === reportType)!;
  const ActiveIcon = activeRT.icon;

  return (
    <div className="relative w-full min-h-screen flex flex-col">

      {/* ── Particles background ─────────────────────────────────────── */}
      <div id="ayn-particles" ref={particlesRef}
        className="absolute inset-0 pointer-events-none z-0"
        style={{ background: 'transparent' }}
      />

      {/* ── Content ──────────────────────────────────────────────────── */}
      <div className="relative z-10 max-w-4xl mx-auto w-full px-4 py-8 space-y-6">

        {/* Header */}
        <div className="text-center space-y-3">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 text-[10px] font-mono uppercase tracking-[0.3em]">
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
            AYN World Simulation · {activeRT.label} Mode
          </div>
          <h2 className="text-4xl font-bold text-foreground tracking-tight">
            Simulate Any Event.<br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-violet-400">
              See How the World Reacts.
            </span>
          </h2>
          <p className="text-sm text-muted-foreground/70 max-w-xl mx-auto">
            {activeRT.agents} agents across governments, markets, religions, and real people —
            each with their own culture, age, class, and perspective.
          </p>
        </div>

        {/* ── Report Type Selector ─────────────────────────────────── */}
        <div className="space-y-2">
          <p className="text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground/50">01 · What kind of report do you need?</p>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
            {REPORT_TYPES.map(rt => {
              const Icon = rt.icon;
              const isActive = reportType === rt.id;
              return (
                <button key={rt.id} onClick={() => setReportType(rt.id)}
                  className={cn(
                    'group relative p-3 rounded-xl border transition-all duration-200 text-left',
                    isActive ? rt.active : 'bg-card/30 border-border/30 text-muted-foreground hover:border-border/60 hover:text-foreground',
                  )}>
                  <Icon className="w-4 h-4 mb-1.5" />
                  <div className="text-[11px] font-mono font-semibold">{rt.label}</div>
                  {isActive && (
                    <div className="absolute inset-0 rounded-xl bg-gradient-to-br opacity-20 pointer-events-none" />
                  )}
                </button>
              );
            })}
          </div>
          {activeRT && (
            <p className="text-[11px] text-muted-foreground/60 font-mono pl-1">
              → {activeRT.desc}
            </p>
          )}
        </div>

        {/* ── Depth Selector ───────────────────────────────────────── */}
        <div className="space-y-2">
          <p className="text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground/50">02 · Simulation depth</p>
          <div className="grid grid-cols-3 gap-2">
            {DEPTH_OPTIONS.map(d => (
              <button key={d.id} onClick={() => setDepth(d.id)}
                className={cn(
                  'p-3 rounded-xl border text-left transition-all',
                  depth === d.id
                    ? 'bg-primary/15 border-primary/50 text-foreground'
                    : 'bg-card/30 border-border/30 text-muted-foreground hover:border-border/60',
                )}>
                <div className="flex items-baseline justify-between">
                  <span className="text-[12px] font-mono font-bold">{d.label}</span>
                  <span className="text-[10px] font-mono text-muted-foreground/60">{d.cost}</span>
                </div>
                <div className="text-[10px] font-mono mt-0.5 text-muted-foreground/60">
                  {d.agents} agents · {d.time}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* ── Seed Input ───────────────────────────────────────────── */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground/50">03 · Seed the simulation</p>
            <button onClick={pullLiveSignals} disabled={loadingSignals}
              className="flex items-center gap-1.5 text-[10px] font-mono text-cyan-400 hover:text-cyan-300 transition-colors disabled:opacity-50">
              <Radio className={cn("w-3 h-3", loadingSignals && "animate-pulse")} />
              {loadingSignals ? 'loading...' : 'pull live signal'}
            </button>
          </div>

          {/* Presets */}
          <div className="flex flex-wrap gap-1.5">
            {PRESETS.map(p => (
              <button key={p.label} onClick={() => usePreset(p)}
                className="text-[10px] font-mono px-2.5 py-1 rounded-full bg-card/40 border border-border/30 text-muted-foreground hover:text-foreground hover:border-primary/30 transition-all">
                <Sparkles className="w-2.5 h-2.5 inline mr-1 opacity-60" />{p.label}
              </button>
            ))}
          </div>

          <div className="rounded-2xl border border-border/40 bg-card/20 backdrop-blur-xl p-4 space-y-3">
            <div>
              <label className="text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground/50 mb-1.5 block">Seed material</label>
              <textarea value={seed} onChange={e => setSeed(e.target.value)} rows={5}
                placeholder="Paste news, a brief, market event, product launch, geopolitical scenario…"
                className="w-full bg-background/30 border border-border/30 rounded-xl p-3 text-sm font-mono text-foreground placeholder:text-muted-foreground/30 focus:outline-none focus:border-primary/40 resize-none" />
              <div className="flex items-center justify-between mt-1">
                <label className="text-[10px] font-mono text-muted-foreground/40 cursor-pointer hover:text-foreground flex items-center gap-1">
                  <Upload className="w-3 h-3" /> upload .txt / .md
                  <input type="file" accept=".txt,.md,.csv,.json" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
                </label>
                <span className="text-[10px] font-mono text-muted-foreground/30">{seed.length} chars</span>
              </div>
            </div>

            <div>
              <label className="text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground/50 mb-1.5 block">Prediction question</label>
              <input value={question} onChange={e => setQuestion(e.target.value)}
                placeholder="What do you want 87 agents to predict?"
                className="w-full bg-background/30 border border-border/30 rounded-xl p-3 text-sm font-mono text-foreground placeholder:text-muted-foreground/30 focus:outline-none focus:border-primary/40" />
            </div>
          </div>
        </div>

        {/* ── Demographic Targeting ──────────────────────────────────── */}
        <div className="space-y-2">
          <button onClick={() => setShowFilters(f => !f)}
            className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground/50 hover:text-foreground transition-colors">
            <Users className="w-3 h-3" />
            04 · Target specific demographics (optional)
            <span className="ml-1">{showFilters ? '↑' : '↓'}</span>
          </button>

          {showFilters && (
            <div className="rounded-2xl border border-border/30 bg-card/20 backdrop-blur-xl p-4 grid grid-cols-2 sm:grid-cols-3 gap-3">
              <FilterSelect label="Region" value={region} onChange={setRegion} options={REGIONS} />
              <FilterSelect label="Religion" value={religion} onChange={setReligion} options={RELIGIONS} />
              <FilterSelect label="Income Level" value={incomeLevel} onChange={setIncomeLevel} options={INCOME_LEVELS} />
              <FilterSelect label="Gender" value={gender} onChange={setGender} options={GENDERS} />
              <div>
                <label className="text-[10px] font-mono text-muted-foreground/50 mb-1 block">Age Min</label>
                <input type="number" value={ageMin} onChange={e => setAgeMin(e.target.value)} min={15} max={90} placeholder="e.g. 18"
                  className="w-full bg-background/30 border border-border/30 rounded-lg px-2 py-1.5 text-xs font-mono text-foreground focus:outline-none focus:border-primary/40" />
              </div>
              <div>
                <label className="text-[10px] font-mono text-muted-foreground/50 mb-1 block">Age Max</label>
                <input type="number" value={ageMax} onChange={e => setAgeMax(e.target.value)} min={15} max={90} placeholder="e.g. 65"
                  className="w-full bg-background/30 border border-border/30 rounded-lg px-2 py-1.5 text-xs font-mono text-foreground focus:outline-none focus:border-primary/40" />
              </div>
              {(region || religion || incomeLevel || gender || ageMin || ageMax) && (
                <button onClick={() => { setRegion(''); setReligion(''); setIncomeLevel(''); setGender(''); setAgeMin(''); setAgeMax(''); }}
                  className="col-span-full text-[10px] font-mono text-muted-foreground/40 hover:text-foreground text-left transition-colors">
                  × clear filters
                </button>
              )}
            </div>
          )}
        </div>

        {/* ── Launch Button ─────────────────────────────────────────── */}
        <button onClick={handleStart} disabled={!canStart}
          className={cn(
            'w-full py-4 rounded-2xl font-mono text-sm font-bold tracking-widest uppercase transition-all flex items-center justify-center gap-3',
            canStart
              ? 'bg-gradient-to-r from-cyan-500 to-violet-500 text-white hover:from-cyan-400 hover:to-violet-400 shadow-xl shadow-cyan-500/20'
              : 'bg-muted/20 text-muted-foreground/30 cursor-not-allowed',
          )}>
          <ActiveIcon className="w-4 h-4" />
          {loading ? 'Building World…' : `Launch ${activeRT.label} Simulation`}
          {!loading && <ChevronRight className="w-4 h-4" />}
        </button>

        {/* Agent count indicator */}
        <div className="flex items-center justify-center gap-6 text-[10px] font-mono text-muted-foreground/40">
          <span>🏛️ 30 institutional</span>
          <span>👥 24 community</span>
          <span>🧑 33 human personas</span>
          <span>= 87 agents</span>
        </div>
      </div>
    </div>
  );
}

function FilterSelect({ label, value, onChange, options }: {
  label: string; value: string; onChange: (v: string) => void; options: string[];
}) {
  return (
    <div>
      <label className="text-[10px] font-mono text-muted-foreground/50 mb-1 block">{label}</label>
      <select value={value} onChange={e => onChange(e.target.value)}
        className="w-full bg-background/30 border border-border/30 rounded-lg px-2 py-1.5 text-xs font-mono text-foreground focus:outline-none focus:border-primary/40">
        <option value="">Any</option>
        {options.map(o => <option key={o} value={o}>{o.replace(/_/g,' ')}</option>)}
      </select>
    </div>
  );
}