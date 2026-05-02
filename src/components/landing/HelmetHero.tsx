/**
 * HelmetHero — Brain static on load. Scroll scrubs each phase.
 *
 * ON LOAD: Brain (frame 0) visible. Headline visible. Nothing moves.
 *
 * PHASE 1 (0–33%):  Scroll scrubs brain transition frames 0→120
 * PHASE 2 (33–67%): Brain fades out, helmet fades in, scroll assembles helmet 0→120
 * PHASE 3 (67–100%): Helmet (assembled, frozen) slides right, features appear
 */

import { useEffect, useRef, useState, useCallback, memo } from 'react';
import { HELMET_FRAMES, FRAME_COUNT } from '@/assets/helmet-frames';
import { TRANSITION_FRAMES, TRANSITION_FRAME_COUNT } from '@/assets/transition-frames';
import { useLanguage } from '@/contexts/LanguageContext';
import { Globe, TrendingUp, Users, Bot } from 'lucide-react';

interface HelmetHeroProps {}

const FEATURES = [
  { icon: Globe,      label: 'WORLD INTELLIGENCE',  title: ['See the world',     'before it moves.'],   body: 'AYN monitors geopolitical events, commodity flows, and market signals in real-time.', stat: '187', statLabel: 'countries tracked' },
  { icon: TrendingUp, label: 'MARKET SIGNALS',       title: ['Every signal.',     'Zero noise.'],        body: 'From oil prices to crypto volatility — AYN cuts through the noise.', stat: '24/7', statLabel: 'live monitoring' },
  { icon: Users,      label: 'SOCIETY SIMULATION',   title: ['Simulate reality.', 'Before it happens.'], body: '73 AI agents react to events before they unfold.', stat: '73', statLabel: 'world agents' },
  { icon: Bot,        label: 'AI AGENTS',            title: ['Your team.',        'Never sleeps.'],      body: 'Custom AI agents trained on your data — 24/7 intelligence delivery.', stat: '∞', statLabel: 'always on' },
];

function mapRange(p: number, inMin: number, inMax: number, outMin: number, outMax: number) {
  const clamped = Math.max(inMin, Math.min(inMax, p));
  return outMin + ((clamped - inMin) / (inMax - inMin)) * (outMax - outMin);
}

const FEAT_WINDOWS = [
  [0.68, 0.76],
  [0.76, 0.84],
  [0.84, 0.91],
  [0.91, 0.97],
];

const SIZE = 'min(75vw, 70vh, 620px)';

export const HelmetHero = memo(({}: HelmetHeroProps) => {
  const { language } = useLanguage();
  const spacerRef    = useRef<HTMLDivElement>(null);
  // One img per video — persistent in DOM, src swapped by RAF
  const brainImgRef  = useRef<HTMLImageElement>(null);
  const helmetImgRef = useRef<HTMLImageElement>(null);
  // Caches
  const brainCache   = useRef<HTMLImageElement[]>([]);
  const helmetCache  = useRef<HTMLImageElement[]>([]);
  // Animation state
  const rafId        = useRef(0);
  const curProgress  = useRef(0);
  const tgtProgress  = useRef(0);
  const lastBIdx     = useRef(0);
  const lastHIdx     = useRef(0);

  const [progress, setProgress] = useState(0);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  // Preload brain — show frame 0 immediately (static brain on load)
  useEffect(() => {
    brainCache.current = TRANSITION_FRAMES.map((src, i) => {
      const img = new Image();
      img.src = src;
      if (i === 0) {
        // Set synchronously if cached, else on load
        img.onload = () => { if (brainImgRef.current) brainImgRef.current.src = src; };
        if (img.complete && brainImgRef.current) brainImgRef.current.src = src;
      }
      return img;
    });
    return () => cancelAnimationFrame(rafId.current);
  }, []);

  // Preload helmet frames
  useEffect(() => {
    helmetCache.current = HELMET_FRAMES.map((src) => {
      const img = new Image(); img.src = src; return img;
    });
  }, []);

  const onScroll = useCallback(() => {
    const spacer = spacerRef.current;
    if (!spacer) return;
    const rect = spacer.getBoundingClientRect();
    tgtProgress.current = Math.max(0, Math.min(1, -rect.top / (spacer.offsetHeight - window.innerHeight)));
  }, []);

  useEffect(() => {
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [onScroll]);

  useEffect(() => {
    const tick = () => {
      rafId.current = requestAnimationFrame(tick);
      curProgress.current += (tgtProgress.current - curProgress.current) * 0.1;
      const p = curProgress.current;

      // Phase 1 (0–33%): scroll scrubs brain frames 0→120
      {
        const bIdx = Math.round(Math.min(mapRange(p, 0, 0.33, 0, 1), 1) * (TRANSITION_FRAME_COUNT - 1));
        if (bIdx !== lastBIdx.current) {
          lastBIdx.current = bIdx;
          const c = brainCache.current[bIdx];
          if (c?.complete && brainImgRef.current) brainImgRef.current.src = c.src;
        }
      }

      // Phase 2 (33–67%): scroll scrubs helmet frames 0→120
      if (p >= 0.30) {
        const hIdx = Math.round(Math.min(Math.max(mapRange(p, 0.33, 0.67, 0, 1), 0), 1) * (FRAME_COUNT - 1));
        if (hIdx !== lastHIdx.current) {
          lastHIdx.current = hIdx;
          const c = helmetCache.current[hIdx];
          if (c?.complete && helmetImgRef.current) helmetImgRef.current.src = c.src;
        }
      }

      setProgress(p);
    };
    rafId.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId.current);
  }, []);

  // ── Opacity per layer ─────────────────────────────────────────────────────

  // Brain: fully visible 0–24%, fades out 24–34%
  const brainOp = progress < 0.24 ? 1 : mapRange(progress, 0.24, 0.34, 1, 0);

  // Helmet: fades in 33–38%, stays through phase 2
  // In phase 3 it slides right — same element, transform applied
  const helmetFadeIn  = mapRange(progress, 0.33, 0.38, 0, 1);
  const helmetFadeOut = mapRange(progress, 0.92, 0.98, 1, 0);
  const helmetOp      = Math.min(helmetFadeIn, helmetFadeOut);

  // Phase 3 transform: slides right + shrinks after 67%
  const helmetXvw   = isMobile ? 0 : mapRange(progress, 0.67, 0.73, 0, 28);
  const helmetScale = isMobile
    ? mapRange(progress, 0.67, 0.73, 1, 0.75)
    : mapRange(progress, 0.67, 0.73, 1, 0.60);

  // Headline: visible from 0, fades out 24–34%
  const headlineOp = progress < 0.24 ? 1 : mapRange(progress, 0.24, 0.34, 1, 0);
  const headlineY  = mapRange(progress, 0.24, 0.34, 0, -24);

  // Features
  const getFeatureOp = (i: number) => {
    const [s, e] = FEAT_WINDOWS[i];
    const peak = s + (e - s) * 0.35;
    if (progress < s) return 0;
    if (progress < peak) return mapRange(progress, s, peak, 0, 1);
    return mapRange(progress, peak, e, 1, 0);
  };
  const getFeatureY = (i: number) => {
    const [s, e] = FEAT_WINDOWS[i];
    const peak = s + (e - s) * 0.35;
    if (progress < s)    return 40;
    if (progress < peak) return mapRange(progress, s, peak, 40, 0);
    return mapRange(progress, peak, e, 0, -40);
  };

  const featNavOp  = Math.min(mapRange(progress, 0.70, 0.75, 0, 1), mapRange(progress, 0.92, 0.97, 1, 0));
  const ctaOp      = mapRange(progress, 0.94, 0.99, 0, 1);
  const activeF    = FEAT_WINDOWS.findIndex(([s, e]) => progress >= s && progress < e);
  const clampedF   = Math.max(0, Math.min(3, activeF === -1 ? 3 : activeF));
  const inFeatures = progress >= 0.68 && progress <= 0.97;

  return (
    <div ref={spacerRef} style={{ height: '2400vh', position: 'relative' }}>
      <div className="sticky top-0 w-full overflow-hidden" style={{ height: '100dvh', background: '#000' }}>

        {/* Progress bar */}
        <div className="absolute top-0 left-0 h-[2px] z-50" style={{ width: `${progress * 100}%`, background: 'hsl(var(--primary))', transition: 'width 0.05s linear' }} />

        {/* ── BRAIN — always in DOM, opacity controlled ── */}
        <div
          className="absolute inset-0 flex items-center justify-center pointer-events-none"
          style={{ top: '64px', opacity: brainOp, willChange: 'opacity' }}
        >
          <img
            ref={brainImgRef}
            src={TRANSITION_FRAMES[0]}
            alt=""
            style={{ width: SIZE, height: SIZE, objectFit: 'contain', display: 'block', userSelect: 'none' }}
            draggable={false}
          />
        </div>

        {/* ── HELMET — always in DOM after phase 2, opacity + transform controlled ── */}
        <div
          className="absolute inset-0 flex items-center justify-center pointer-events-none"
          style={{ top: '64px', opacity: helmetOp, willChange: 'opacity' }}
        >
          <div style={{ transform: `translateX(${helmetXvw}vw) scale(${helmetScale})`, willChange: 'transform' }}>
            <img
              ref={helmetImgRef}
              src={HELMET_FRAMES[0]}
              alt="AYN"
              style={{ width: SIZE, height: SIZE, objectFit: 'contain', display: 'block', userSelect: 'none' }}
              draggable={false}
            />
          </div>
        </div>

        {/* ── HEADLINE — visible on load, fades out on scroll ── */}
        <div
          className="absolute left-0 right-0 z-20 px-6 md:px-16"
          style={{ top: '80px', opacity: headlineOp, transform: `translateY(${headlineY}px)`, pointerEvents: headlineOp < 0.05 ? 'none' : 'auto', willChange: 'opacity, transform' }}
        >
          <div className="absolute pointer-events-none" style={{ inset: '-40px -60px -80px -60px', background: 'linear-gradient(to bottom, rgba(0,0,0,0.75) 0%, rgba(0,0,0,0.4) 65%, transparent 100%)', zIndex: -1 }} />
          <p className="text-[9px] md:text-[10px] tracking-[0.25em] uppercase mb-2 font-medium font-mono" style={{ color: 'rgba(255,255,255,0.35)' }}>
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

        {/* ── FEATURES ── */}
        {FEATURES.map((feat, i) => {
          const op = getFeatureOp(i);
          const y  = getFeatureY(i);
          const Icon = feat.icon;
          if (op < 0.01) return null;
          return (
            <div key={i} className="absolute inset-0 z-20 pointer-events-none" style={{ opacity: op, transform: `translateY(${y}px)`, paddingTop: '64px' }}>
              <div className={`w-full h-full flex ${isMobile ? 'flex-col justify-end pb-10' : 'flex-row items-center'}`}>
                <div className={`${isMobile ? 'w-full px-6 pb-4' : 'w-1/2 px-8 md:px-16'} flex flex-col justify-center relative`}>
                  <div className="absolute pointer-events-none" style={isMobile
                    ? { left: 0, right: 0, bottom: 0, height: '70%', background: 'linear-gradient(to top, rgba(0,0,0,0.9) 0%, rgba(0,0,0,0.6) 60%, transparent 100%)', zIndex: -1 }
                    : { left: 0, top: 0, bottom: 0, width: '110%', background: 'linear-gradient(to right, rgba(0,0,0,0.88) 0%, rgba(0,0,0,0.65) 70%, transparent 100%)', zIndex: -1 }} />
                  <div className="flex items-center gap-2 mb-3 md:mb-4">
                    <Icon className="w-3.5 h-3.5 md:w-4 md:h-4" style={{ color: 'hsl(var(--primary))' }} />
                    <span className="text-[8px] md:text-[9px] tracking-[0.3em] uppercase font-mono" style={{ color: 'rgba(255,255,255,0.4)' }}>{feat.label}</span>
                  </div>
                  <h2 className="font-display font-bold text-white leading-tight mb-3 md:mb-4" style={{ fontSize: 'clamp(24px, 3.5vw, 58px)' }}>
                    {feat.title[0]}<br /><span style={{ color: 'hsl(var(--primary))' }}>{feat.title[1]}</span>
                  </h2>
                  {!isMobile && <p className="text-sm md:text-base font-light leading-relaxed mb-5 max-w-[360px]" style={{ color: 'rgba(255,255,255,0.5)' }}>{feat.body}</p>}
                  <div className="flex items-baseline gap-2">
                    <span className="font-display font-bold text-white" style={{ fontSize: isMobile ? 'clamp(28px, 8vw, 48px)' : 'clamp(36px, 5vw, 60px)', lineHeight: 1 }}>{feat.stat}</span>
                    <span className="text-[10px] uppercase tracking-widest font-mono" style={{ color: 'rgba(255,255,255,0.35)' }}>{feat.statLabel}</span>
                  </div>
                </div>
              </div>
            </div>
          );
        })}

        {/* ── DOT NAV ── */}
        {inFeatures && !isMobile && (
          <div className="absolute right-6 md:right-10 flex flex-col gap-2 z-30" style={{ top: '50%', transform: 'translateY(-50%)', opacity: featNavOp }}>
            {FEATURES.map((_, i) => (
              <div key={i} style={{ width: i === clampedF ? '20px' : '6px', height: '6px', borderRadius: '3px', background: i === clampedF ? 'hsl(var(--primary))' : 'rgba(255,255,255,0.2)', transition: 'all 0.4s ease' }} />
            ))}
          </div>
        )}

        {/* ── CTA ── */}
        {ctaOp > 0.01 && (
          <div className="absolute inset-0 flex flex-col items-center justify-center z-30 px-6" style={{ opacity: ctaOp, paddingTop: '64px' }}>
            <p className="text-[9px] md:text-[10px] tracking-[0.3em] uppercase font-mono mb-4 text-center" style={{ color: 'rgba(255,255,255,0.3)' }}>Ready to see the world clearly?</p>
            <h2 className="font-display font-bold text-white text-center mb-8" style={{ fontSize: 'clamp(30px, 5vw, 72px)', lineHeight: 1.1 }}>
              Start with <span style={{ color: 'hsl(var(--primary))' }}>AYN</span>
            </h2>
            <a href="/pricing" className="pointer-events-auto inline-flex items-center gap-3 font-medium" style={{ padding: isMobile ? '12px 28px' : '14px 40px', background: 'hsl(var(--primary))', color: '#000', fontSize: '12px', letterSpacing: '0.12em', textTransform: 'uppercase', textDecoration: 'none' }}>
              Get Started Free →
            </a>
          </div>
        )}
      </div>
    </div>
  );
});

HelmetHero.displayName = 'HelmetHero';
