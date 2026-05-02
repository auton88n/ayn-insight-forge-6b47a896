/**
 * HelmetHero — True scroll scrubbing. Each phase takes real scroll distance.
 *
 * Total: 3600vh (gives plenty of room per phase)
 *
 * Phase 1  0vh–1200vh   (0–33%):  Brain video scrubs frame by frame
 * Phase 2  1200–2400vh  (33–67%): Helmet explodes then assembles, frame by frame  
 * Phase 3  2400–3600vh  (67–100%): Helmet slides right, 4 features appear, CTA
 *
 * At progress=0 (page load): brain frame 0 shown, headline visible. NOTHING moves.
 * Every pixel of scroll = one or more frames advance. Scrub back = frames go back.
 */

import { useEffect, useRef, useState, useCallback, memo } from 'react';
import { HELMET_FRAMES, FRAME_COUNT } from '@/assets/helmet-frames';
import { TRANSITION_FRAMES, TRANSITION_FRAME_COUNT } from '@/assets/transition-frames';
import { useLanguage } from '@/contexts/LanguageContext';
import { Globe, TrendingUp, Users, Bot } from 'lucide-react';

interface HelmetHeroProps {}

const FEATURES = [
  { icon: Globe,      label: 'WORLD INTELLIGENCE',  title: ['See the world',     'before it moves.'],   body: 'AYN monitors geopolitical events, commodity flows, and market signals across 187 countries in real-time.', stat: '187', statLabel: 'countries tracked' },
  { icon: TrendingUp, label: 'MARKET SIGNALS',       title: ['Every signal.',     'Zero noise.'],        body: 'From oil prices to crypto volatility — AYN cuts through the noise and delivers what moves your business.', stat: '24/7', statLabel: 'live monitoring' },
  { icon: Users,      label: 'SOCIETY SIMULATION',   title: ['Simulate reality.', 'Before it happens.'], body: '73 AI agents representing real demographics react to events before they unfold.', stat: '73', statLabel: 'world agents' },
  { icon: Bot,        label: 'AI AGENTS',            title: ['Your team.',        'Never sleeps.'],      body: 'Custom AI agents trained on your data — delivering intelligence 24/7, in Arabic and English.', stat: '∞', statLabel: 'always on' },
];

function clamp(v: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, v)); }
function mapRange(p: number, inMin: number, inMax: number, outMin: number, outMax: number) {
  return outMin + (clamp(p, inMin, inMax) - inMin) / (inMax - inMin) * (outMax - outMin);
}

// Phase 3 feature windows (within 0.67–0.97)
const FEATS = [
  { start: 0.68, end: 0.76 },
  { start: 0.76, end: 0.84 },
  { start: 0.84, end: 0.91 },
  { start: 0.91, end: 0.97 },
];

const IMG_SIZE = 'min(75vw, 70vh, 620px)';

export const HelmetHero = memo(({}: HelmetHeroProps) => {
  const { language } = useLanguage();
  const spacerRef   = useRef<HTMLDivElement>(null);
  const brainRef    = useRef<HTMLImageElement>(null);
  const helmetRef   = useRef<HTMLImageElement>(null);

  // Pre-decoded Image objects — avoid re-decoding on src swap
  const brainImgs  = useRef<HTMLImageElement[]>([]);
  const helmetImgs = useRef<HTMLImageElement[]>([]);

  const rafId      = useRef(0);
  const curP       = useRef(0);
  const tgtP       = useRef(0);
  const lastB      = useRef(-1);
  const lastH      = useRef(-1);

  const [p, setP]         = useState(0);
  const [isMobile, setMob] = useState(false);

  useEffect(() => {
    const chk = () => setMob(window.innerWidth < 768);
    chk(); window.addEventListener('resize', chk);
    return () => window.removeEventListener('resize', chk);
  }, []);

  // Preload brain — immediately show frame 0 (brain) on mount
  useEffect(() => {
    brainImgs.current = TRANSITION_FRAMES.map((src, i) => {
      const img = new Image();
      img.src = src;
      img.onload = () => {
        if (i === 0 && brainRef.current) {
          brainRef.current.src = src;
          lastB.current = 0;
        }
      };
      if (img.complete && i === 0 && brainRef.current) {
        brainRef.current.src = src;
        lastB.current = 0;
      }
      return img;
    });
    return () => cancelAnimationFrame(rafId.current);
  }, []);

  // Preload helmet
  useEffect(() => {
    helmetImgs.current = HELMET_FRAMES.map(src => {
      const img = new Image(); img.src = src; return img;
    });
  }, []);

  // Scroll → target progress
  const onScroll = useCallback(() => {
    const el = spacerRef.current;
    if (!el) return;
    const gone  = -el.getBoundingClientRect().top;
    const total = el.offsetHeight - window.innerHeight;
    tgtP.current = clamp(gone / total, 0, 1);
  }, []);

  useEffect(() => {
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [onScroll]);

  // RAF loop — lerp then drive frames
  useEffect(() => {
    const tick = () => {
      rafId.current = requestAnimationFrame(tick);
      curP.current += (tgtP.current - curP.current) * 0.1;
      const progress = curP.current;

      // PHASE 1 (0–33%): scrub brain frames 0 → TRANSITION_FRAME_COUNT-1
      if (progress <= 0.34) {
        const idx = Math.round(mapRange(progress, 0, 0.33, 0, TRANSITION_FRAME_COUNT - 1));
        if (idx !== lastB.current) {
          lastB.current = idx;
          const img = brainImgs.current[idx];
          if (img?.complete && brainRef.current) brainRef.current.src = img.src;
        }
      }

      // PHASE 2 (33–67%): scrub helmet frames 0 → FRAME_COUNT-1
      if (progress >= 0.32 && progress <= 0.68) {
        const idx = Math.round(clamp(mapRange(progress, 0.33, 0.67, 0, FRAME_COUNT - 1), 0, FRAME_COUNT - 1));
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

  // ── Visibility ─────────────────────────────────────────────────────────────

  // Brain: opacity 1 at rest → fades out as phase 1 ends (26–34%)
  const brainOp = p < 0.26 ? 1 : mapRange(p, 0.26, 0.34, 1, 0);

  // Helmet: fades in at phase 2 start (33–38%), stays through phase 3, fades at CTA
  const helmetOp = Math.min(
    mapRange(p, 0.33, 0.38, 0, 1),
    mapRange(p, 0.92, 0.98, 1, 0)
  );

  // Phase 3: helmet slides right + shrinks
  const helmetX = isMobile ? 0 : mapRange(p, 0.67, 0.73, 0, 28);
  const helmetS = isMobile ? mapRange(p, 0.67, 0.73, 1, 0.78) : mapRange(p, 0.67, 0.73, 1, 0.60);

  // Headline: visible at rest, fades out 24–34%
  const hOp = p < 0.24 ? 1 : mapRange(p, 0.24, 0.34, 1, 0);
  const hY  = mapRange(p, 0.24, 0.34, 0, -20);

  // Features
  const featOp = (i: number) => {
    const { start: s, end: e } = FEATS[i];
    const peak = s + (e - s) * 0.35;
    if (p < s) return 0;
    if (p < peak) return mapRange(p, s, peak, 0, 1);
    return mapRange(p, peak, e, 1, 0);
  };
  const featY = (i: number) => {
    const { start: s, end: e } = FEATS[i];
    const peak = s + (e - s) * 0.35;
    if (p < s) return 40;
    if (p < peak) return mapRange(p, s, peak, 40, 0);
    return mapRange(p, peak, e, 0, -40);
  };

  const navOp   = Math.min(mapRange(p, 0.70, 0.75, 0, 1), mapRange(p, 0.92, 0.97, 1, 0));
  const ctaOp   = mapRange(p, 0.94, 0.99, 0, 1);
  const activeF = FEATS.findIndex(({ start: s, end: e }) => p >= s && p < e);
  const curF    = clamp(activeF === -1 ? 3 : activeF, 0, 3);
  const inFeats = p >= 0.68 && p <= 0.97;

  return (
    <div ref={spacerRef} style={{ height: '3600vh', position: 'relative' }}>
      <div className="sticky top-0 w-full overflow-hidden" style={{ height: '100dvh', background: '#000' }}>

        {/* Gold progress bar */}
        <div className="absolute top-0 left-0 h-[2px] z-50"
          style={{ width: `${p * 100}%`, background: 'hsl(var(--primary))', transition: 'width 0.04s linear' }} />

        {/* ── BRAIN — visible on load, scrubbed by phase 1 scroll ── */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none"
          style={{ top: 64, opacity: brainOp, willChange: 'opacity' }}>
          <img ref={brainRef} alt="" draggable={false}
            style={{ width: IMG_SIZE, height: IMG_SIZE, objectFit: 'contain', display: 'block', userSelect: 'none' }} />
        </div>

        {/* ── HELMET — fades in at phase 2, scrubbed by scroll, slides right in phase 3 ── */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none"
          style={{ top: 64, opacity: helmetOp, willChange: 'opacity' }}>
          <div style={{ transform: `translateX(${helmetX}vw) scale(${helmetS})`, willChange: 'transform' }}>
            <img ref={helmetRef} alt="AYN" draggable={false}
              style={{ width: IMG_SIZE, height: IMG_SIZE, objectFit: 'contain', display: 'block', userSelect: 'none' }} />
          </div>
        </div>

        {/* ── HEADLINE — static on load, fades out on first scroll ── */}
        {hOp > 0.01 && (
          <div className="absolute left-0 right-0 z-20 px-6 md:px-16 pointer-events-none"
            style={{ top: 80, opacity: hOp, transform: `translateY(${hY}px)`, willChange: 'opacity, transform' }}>
            <div className="absolute pointer-events-none" style={{ inset: '-40px -60px -80px -60px', background: 'linear-gradient(to bottom, rgba(0,0,0,0.78) 0%, rgba(0,0,0,0.45) 65%, transparent 100%)', zIndex: -1 }} />
            <p className="text-[9px] md:text-[10px] tracking-[0.25em] uppercase mb-2 font-mono" style={{ color: 'rgba(255,255,255,0.35)' }}>
              {language === 'ar' ? 'ذكاء الأعمال' : 'World Intelligence'}
            </p>
            <h1 className="font-display font-bold tracking-[-0.02em] text-white leading-none" style={{ fontSize: 'clamp(36px, 5.5vw, 80px)' }}>
              {language === 'ar' ? 'تعرّف على' : language === 'fr' ? 'Découvrez' : 'Meet'}
              <br /><span style={{ color: 'hsl(var(--primary))' }}>AYN</span>
            </h1>
            <p className="mt-3 text-sm font-light max-w-[280px] md:max-w-[320px] leading-relaxed" style={{ color: 'rgba(255,255,255,0.45)' }}>
              {language === 'ar' ? 'ذكاء أعمال حقيقي يتابع الأسواق، يحلل المخاطر.' : 'Real business intelligence. Markets, risks, and decisions that matter.'}
            </p>
          </div>
        )}

        {/* ── FEATURES ── */}
        {FEATS.map((_, i) => {
          const op = featOp(i); const y = featY(i);
          const feat = FEATURES[i]; const Icon = feat.icon;
          if (op < 0.01) return null;
          return (
            <div key={i} className="absolute inset-0 z-20 pointer-events-none"
              style={{ opacity: op, transform: `translateY(${y}px)`, paddingTop: 64 }}>
              <div className={`w-full h-full flex ${isMobile ? 'flex-col justify-end pb-10' : 'items-center'}`}>
                <div className={`${isMobile ? 'w-full px-6 pb-4' : 'w-1/2 px-8 md:px-16'} flex flex-col justify-center relative`}>
                  <div className="absolute pointer-events-none" style={isMobile
                    ? { left: 0, right: 0, bottom: 0, height: '70%', background: 'linear-gradient(to top, rgba(0,0,0,0.92) 0%, rgba(0,0,0,0.6) 60%, transparent 100%)', zIndex: -1 }
                    : { left: 0, top: 0, bottom: 0, width: '110%', background: 'linear-gradient(to right, rgba(0,0,0,0.90) 0%, rgba(0,0,0,0.65) 70%, transparent 100%)', zIndex: -1 }} />
                  <div className="flex items-center gap-2 mb-3 md:mb-4">
                    <Icon className="w-4 h-4" style={{ color: 'hsl(var(--primary))' }} />
                    <span className="text-[9px] tracking-[0.3em] uppercase font-mono" style={{ color: 'rgba(255,255,255,0.4)' }}>{feat.label}</span>
                  </div>
                  <h2 className="font-display font-bold text-white leading-tight mb-3 md:mb-4" style={{ fontSize: 'clamp(26px, 3.5vw, 58px)' }}>
                    {feat.title[0]}<br /><span style={{ color: 'hsl(var(--primary))' }}>{feat.title[1]}</span>
                  </h2>
                  {!isMobile && <p className="text-sm md:text-base font-light leading-relaxed mb-5 max-w-[360px]" style={{ color: 'rgba(255,255,255,0.5)' }}>{feat.body}</p>}
                  <div className="flex items-baseline gap-2">
                    <span className="font-display font-bold text-white" style={{ fontSize: isMobile ? 'clamp(28px,8vw,48px)' : 'clamp(36px,5vw,60px)', lineHeight: 1 }}>{feat.stat}</span>
                    <span className="text-[10px] uppercase tracking-widest font-mono" style={{ color: 'rgba(255,255,255,0.35)' }}>{feat.statLabel}</span>
                  </div>
                </div>
              </div>
            </div>
          );
        })}

        {/* Dot nav */}
        {inFeats && !isMobile && (
          <div className="absolute right-8 flex flex-col gap-2 z-30" style={{ top: '50%', transform: 'translateY(-50%)', opacity: navOp }}>
            {FEATS.map((_, i) => (
              <div key={i} style={{ width: i === curF ? 20 : 6, height: 6, borderRadius: 3, background: i === curF ? 'hsl(var(--primary))' : 'rgba(255,255,255,0.2)', transition: 'all 0.4s ease' }} />
            ))}
          </div>
        )}

        {/* CTA */}
        {ctaOp > 0.01 && (
          <div className="absolute inset-0 flex flex-col items-center justify-center z-30 px-6" style={{ opacity: ctaOp, paddingTop: 64 }}>
            <p className="text-[9px] tracking-[0.3em] uppercase font-mono mb-4 text-center" style={{ color: 'rgba(255,255,255,0.3)' }}>Ready to see the world clearly?</p>
            <h2 className="font-display font-bold text-white text-center mb-8" style={{ fontSize: 'clamp(30px,5vw,72px)', lineHeight: 1.1 }}>
              Start with <span style={{ color: 'hsl(var(--primary))' }}>AYN</span>
            </h2>
            <a href="/pricing" className="pointer-events-auto inline-flex items-center gap-3 font-medium" style={{ padding: isMobile ? '12px 28px' : '14px 40px', background: 'hsl(var(--primary))', color: '#000', fontSize: 12, letterSpacing: '0.12em', textTransform: 'uppercase', textDecoration: 'none' }}>
              Get Started Free →
            </a>
          </div>
        )}
      </div>
    </div>
  );
});

HelmetHero.displayName = 'HelmetHero';
