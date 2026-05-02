/**
 * HelmetHero — Three clean scroll phases.
 *
 * ON LOAD (p=0): Brain visible, static. Nothing animating.
 *
 * PHASE 1 (0→33%): Scroll scrubs brain (VID1 reversed, frame 0=brain)
 *   - brain dissolves into abstract as you scroll
 *
 * PHASE 2 (33→67%): Scroll scrubs helmet (VID2 original, frame 0=exploded)
 *   - exploded helmet parts assemble as you scroll
 *
 * PHASE 3 (67→100%): Assembled helmet slides right, 4 features, CTA
 *
 * KEY FIX: brain <img> gets TRANSITION_FRAMES[0] as its src attribute
 * directly — no onload callback race condition, brain shows immediately.
 */

import { useEffect, useRef, useState, useCallback, memo } from 'react';
import { HELMET_FRAMES, FRAME_COUNT } from '@/assets/helmet-frames';
import { TRANSITION_FRAMES, TRANSITION_FRAME_COUNT } from '@/assets/transition-frames';
import { useLanguage } from '@/contexts/LanguageContext';
import { Globe, TrendingUp, Users, Bot } from 'lucide-react';

interface HelmetHeroProps {}

const FEATURES = [
  { icon: Globe,      label: 'WORLD INTELLIGENCE',  title: ['See the world',     'before it moves.'],   body: 'AYN monitors geopolitical events, commodity flows, and market signals across 187 countries.', stat: '187', statLabel: 'countries tracked' },
  { icon: TrendingUp, label: 'MARKET SIGNALS',       title: ['Every signal.',     'Zero noise.'],        body: 'From oil prices to crypto volatility — AYN cuts through noise and delivers what moves your business.', stat: '24/7', statLabel: 'live monitoring' },
  { icon: Users,      label: 'SOCIETY SIMULATION',   title: ['Simulate reality.', 'Before it happens.'], body: '73 AI agents representing real demographics react to events before they unfold.', stat: '73', statLabel: 'world agents' },
  { icon: Bot,        label: 'AI AGENTS',            title: ['Your team.',        'Never sleeps.'],      body: 'Custom AI agents trained on your data — delivering intelligence 24/7 in Arabic and English.', stat: '∞', statLabel: 'always on' },
];

function clamp(v: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, v)); }
function map(v: number, a: number, b: number, c: number, d: number) {
  return c + (clamp(v, a, b) - a) / (b - a) * (d - c);
}

const FEATS = [
  { s: 0.68, e: 0.76 },
  { s: 0.76, e: 0.84 },
  { s: 0.84, e: 0.91 },
  { s: 0.91, e: 0.97 },
];

const SZ = 'min(75vw, 70vh, 620px)';

export const HelmetHero = memo(({}: HelmetHeroProps) => {
  const { language } = useLanguage();
  const spacerRef  = useRef<HTMLDivElement>(null);

  // Two separate img elements — brain stays in DOM always (opacity controls visibility)
  // helmet fades in at phase 2
  const brainRef   = useRef<HTMLImageElement>(null);
  const helmetRef  = useRef<HTMLImageElement>(null);

  // Pre-decoded Image caches
  const brainImgs  = useRef<HTMLImageElement[]>([]);
  const helmetImgs = useRef<HTMLImageElement[]>([]);

  const rafId      = useRef(0);
  const rawP       = useRef(0);  // direct scroll progress, NO lerp
  const lastB      = useRef(0);  // start at 0 (brain frame)
  const lastH      = useRef(-1);

  const [p, setP]   = useState(0);
  const [mob, setMob] = useState(false);

  useEffect(() => {
    const chk = () => setMob(window.innerWidth < 768);
    chk(); window.addEventListener('resize', chk);
    return () => window.removeEventListener('resize', chk);
  }, []);

  // Preload brain frames — frame 0 is already set via src attribute on the <img>
  useEffect(() => {
    brainImgs.current = TRANSITION_FRAMES.map((src) => {
      const img = new Image();
      img.src = src;
      return img;
    });
    return () => cancelAnimationFrame(rafId.current);
  }, []);

  // Preload helmet frames
  useEffect(() => {
    helmetImgs.current = HELMET_FRAMES.map((src) => {
      const img = new Image();
      img.src = src;
      return img;
    });
  }, []);

  // Direct scroll → progress, NO lerp
  const onScroll = useCallback(() => {
    const el = spacerRef.current;
    if (!el) return;
    rawP.current = clamp(-el.getBoundingClientRect().top / (el.offsetHeight - window.innerHeight), 0, 1);
  }, []);

  useEffect(() => {
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [onScroll]);

  // RAF — maps scroll directly to frames
  useEffect(() => {
    const tick = () => {
      rafId.current = requestAnimationFrame(tick);
      const progress = rawP.current;

      // Phase 1 (0–33%): scrub brain frames
      if (progress <= 0.34) {
        const idx = clamp(Math.round(map(progress, 0, 0.33, 0, TRANSITION_FRAME_COUNT - 1)), 0, TRANSITION_FRAME_COUNT - 1);
        if (idx !== lastB.current) {
          lastB.current = idx;
          const img = brainImgs.current[idx];
          if (img?.complete && brainRef.current) brainRef.current.src = img.src;
        }
      }

      // Phase 2 (33–67%): scrub helmet frames
      if (progress >= 0.32 && progress <= 0.68) {
        const idx = clamp(Math.round(map(progress, 0.33, 0.67, 0, FRAME_COUNT - 1)), 0, FRAME_COUNT - 1);
        if (idx !== lastH.current) {
          lastH.current = idx;
          const img = helmetImgs.current[idx];
          if (img?.complete && helmetRef.current) helmetRef.current.src = img.src;
        }
      }

      setP(progress);
    };
    rafId.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId.current);
  }, []);

  // ── Opacity / transforms ──────────────────────────────────────────────────

  // Brain: full opacity until 24%, fades out 24–34%
  const brainOp = p < 0.24 ? 1 : map(p, 0.24, 0.34, 1, 0);

  // Helmet: fades in 33–38%, fades out at CTA (92–98%)
  const helmOp  = Math.min(map(p, 0.33, 0.38, 0, 1), map(p, 0.92, 0.98, 1, 0));

  // Phase 3: helmet slides right + shrinks
  const helmX = mob ? 0 : map(p, 0.67, 0.73, 0, 28);
  const helmS = mob ? map(p, 0.67, 0.73, 1, 0.78) : map(p, 0.67, 0.73, 1, 0.60);

  // Headline: visible from load (p=0), fades out 24–34%
  const hOp = p < 0.24 ? 1 : map(p, 0.24, 0.34, 1, 0);
  const hY  = map(p, 0.24, 0.34, 0, -20);

  const fOp = (i: number) => {
    const { s, e } = FEATS[i]; const pk = s + (e - s) * 0.35;
    if (p < s) return 0;
    if (p < pk) return map(p, s, pk, 0, 1);
    return map(p, pk, e, 1, 0);
  };
  const fY = (i: number) => {
    const { s, e } = FEATS[i]; const pk = s + (e - s) * 0.35;
    if (p < s) return 40;
    if (p < pk) return map(p, s, pk, 40, 0);
    return map(p, pk, e, 0, -40);
  };

  const navOp  = Math.min(map(p, 0.70, 0.75, 0, 1), map(p, 0.92, 0.97, 1, 0));
  const ctaOp  = map(p, 0.94, 0.99, 0, 1);
  const activeF = FEATS.findIndex(({ s, e }) => p >= s && p < e);
  const curF   = clamp(activeF === -1 ? 3 : activeF, 0, 3);
  const inF    = p >= 0.68 && p <= 0.97;

  return (
    <div ref={spacerRef} style={{ height: '3600vh', position: 'relative' }}>
      <div className="sticky top-0 w-full overflow-hidden" style={{ height: '100dvh', background: '#000' }}>

        {/* Progress bar */}
        <div className="absolute top-0 left-0 h-[2px] z-50"
          style={{ width: `${p * 100}%`, background: 'hsl(var(--primary))' }} />

        {/* ── PHASE 1: BRAIN ─────────────────────────────────────────────────
            src={TRANSITION_FRAMES[0]} sets the brain on mount — no race condition.
            brainRef.current.src is then updated by RAF as scroll advances.
        */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none"
          style={{ top: 64, opacity: brainOp, willChange: 'opacity' }}>
          <img
            ref={brainRef}
            src={TRANSITION_FRAMES[0]}
            alt=""
            draggable={false}
            style={{ width: SZ, height: SZ, objectFit: 'contain', display: 'block', userSelect: 'none' }}
          />
        </div>

        {/* ── PHASE 2 + 3: HELMET ────────────────────────────────────────────
            No default src — appears only when phase 2 starts (33%+)
            In phase 3, same element slides right via transform
        */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none"
          style={{ top: 64, opacity: helmOp, willChange: 'opacity' }}>
          <div style={{ transform: `translateX(${helmX}vw) scale(${helmS})`, willChange: 'transform' }}>
            <img
              ref={helmetRef}
              alt="AYN"
              draggable={false}
              style={{ width: SZ, height: SZ, objectFit: 'contain', display: 'block', userSelect: 'none' }}
            />
          </div>
        </div>

        {/* ── HEADLINE ── visible on load, fades on scroll */}
        {hOp > 0.01 && (
          <div className="absolute left-0 right-0 z-20 px-6 md:px-16 pointer-events-none"
            style={{ top: 80, opacity: hOp, transform: `translateY(${hY}px)` }}>
            <div className="absolute" style={{ inset: '-40px -60px -80px -60px', background: 'linear-gradient(to bottom,rgba(0,0,0,0.78) 0%,rgba(0,0,0,0.45) 65%,transparent 100%)', zIndex: -1 }} />
            <p className="text-[9px] md:text-[10px] tracking-[0.25em] uppercase mb-2 font-mono" style={{ color: 'rgba(255,255,255,0.35)' }}>
              {language === 'ar' ? 'ذكاء الأعمال' : 'World Intelligence'}
            </p>
            <h1 className="font-display font-bold tracking-[-0.02em] text-white leading-none" style={{ fontSize: 'clamp(36px,5.5vw,80px)' }}>
              {language === 'ar' ? 'تعرّف على' : 'Meet'}<br />
              <span style={{ color: 'hsl(var(--primary))' }}>AYN</span>
            </h1>
            <p className="mt-3 text-sm font-light max-w-xs leading-relaxed" style={{ color: 'rgba(255,255,255,0.45)' }}>
              {language === 'ar' ? 'ذكاء أعمال حقيقي.' : 'Real business intelligence. Markets, risks, and decisions that matter.'}
            </p>
          </div>
        )}

        {/* ── FEATURES ── */}
        {FEATS.map(({ s, e }, i) => {
          const op = fOp(i); const y = fY(i);
          if (op < 0.01) return null;
          const feat = FEATURES[i]; const Icon = feat.icon;
          return (
            <div key={i} className="absolute inset-0 z-20 pointer-events-none"
              style={{ opacity: op, transform: `translateY(${y}px)`, paddingTop: 64 }}>
              <div className={`w-full h-full flex ${mob ? 'flex-col justify-end pb-10' : 'items-center'}`}>
                <div className={`${mob ? 'w-full px-6 pb-4' : 'w-1/2 px-8 md:px-16'} flex flex-col justify-center relative`}>
                  <div className="absolute" style={mob
                    ? { left:0, right:0, bottom:0, height:'70%', background:'linear-gradient(to top,rgba(0,0,0,0.92) 0%,rgba(0,0,0,0.6) 60%,transparent 100%)', zIndex:-1 }
                    : { left:0, top:0, bottom:0, width:'110%', background:'linear-gradient(to right,rgba(0,0,0,0.90) 0%,rgba(0,0,0,0.65) 70%,transparent 100%)', zIndex:-1 }} />
                  <div className="flex items-center gap-2 mb-3">
                    <Icon className="w-4 h-4" style={{ color:'hsl(var(--primary))' }} />
                    <span className="text-[9px] tracking-[0.3em] uppercase font-mono" style={{ color:'rgba(255,255,255,0.4)' }}>{feat.label}</span>
                  </div>
                  <h2 className="font-display font-bold text-white leading-tight mb-3" style={{ fontSize:'clamp(26px,3.5vw,58px)' }}>
                    {feat.title[0]}<br /><span style={{ color:'hsl(var(--primary))' }}>{feat.title[1]}</span>
                  </h2>
                  {!mob && <p className="text-sm font-light leading-relaxed mb-5 max-w-sm" style={{ color:'rgba(255,255,255,0.5)' }}>{feat.body}</p>}
                  <div className="flex items-baseline gap-2">
                    <span className="font-display font-bold text-white" style={{ fontSize:mob?'clamp(28px,8vw,48px)':'clamp(36px,5vw,60px)', lineHeight:1 }}>{feat.stat}</span>
                    <span className="text-[10px] uppercase tracking-widest font-mono" style={{ color:'rgba(255,255,255,0.35)' }}>{feat.statLabel}</span>
                  </div>
                </div>
              </div>
            </div>
          );
        })}

        {/* Dot nav */}
        {inF && !mob && (
          <div className="absolute right-8 flex flex-col gap-2 z-30" style={{ top:'50%', transform:'translateY(-50%)', opacity:navOp }}>
            {FEATS.map((_,i) => (
              <div key={i} style={{ width:i===curF?20:6, height:6, borderRadius:3, background:i===curF?'hsl(var(--primary))':'rgba(255,255,255,0.2)', transition:'all 0.4s' }} />
            ))}
          </div>
        )}

        {/* CTA */}
        {ctaOp > 0.01 && (
          <div className="absolute inset-0 flex flex-col items-center justify-center z-30 px-6" style={{ opacity:ctaOp, paddingTop:64 }}>
            <p className="text-[9px] tracking-[0.3em] uppercase font-mono mb-4" style={{ color:'rgba(255,255,255,0.3)' }}>Ready to see the world clearly?</p>
            <h2 className="font-display font-bold text-white text-center mb-8" style={{ fontSize:'clamp(30px,5vw,72px)', lineHeight:1.1 }}>
              Start with <span style={{ color:'hsl(var(--primary))' }}>AYN</span>
            </h2>
            <a href="/pricing" className="pointer-events-auto inline-flex items-center gap-3 font-medium"
              style={{ padding:mob?'12px 28px':'14px 40px', background:'hsl(var(--primary))', color:'#000', fontSize:12, letterSpacing:'0.12em', textTransform:'uppercase', textDecoration:'none' }}>
              Get Started Free →
            </a>
          </div>
        )}
      </div>
    </div>
  );
});

HelmetHero.displayName = 'HelmetHero';
