/**
 * HelmetHero — Premium scroll storytelling. Mobile + tablet compatible.
 *
 * Scroll phases (2400vh):
 *   0–30%    Hero:          Helmet assembles
 *   28–42%   Transition:    Helmet slides right
 *   37–57%   Feature 1:     World Intelligence
 *   57–67%   TRANSITION VID: Full-screen abstract plays (between F1 → F2)
 *   67–77%   Feature 2:     Market Signals
 *   77–87%   Feature 3:     Society Simulation
 *   87–97%   Feature 4:     AI Agents
 *   93–100%  CTA
 */

import { useEffect, useRef, useState, useCallback, memo } from 'react';
import { motion } from 'framer-motion';
import { HELMET_FRAMES, FRAME_COUNT } from '@/assets/helmet-frames';
import { TRANSITION_FRAMES, TRANSITION_FRAME_COUNT } from '@/assets/transition-frames';
import { useLanguage } from '@/contexts/LanguageContext';
import { Globe, TrendingUp, Users, Bot } from 'lucide-react';

interface HelmetHeroProps {}

const FEATURES = [
  {
    icon: Globe,
    label: 'WORLD INTELLIGENCE',
    title: ['See the world', 'before it moves.'],
    body: 'AYN monitors geopolitical events, commodity flows, and market signals in real-time — surfacing what matters before it reaches the news.',
    stat: '187', statLabel: 'countries tracked',
  },
  {
    icon: TrendingUp,
    label: 'MARKET SIGNALS',
    title: ['Every signal.', 'Zero noise.'],
    body: 'From oil prices to crypto volatility to supply chain disruptions — AYN cuts through the noise and delivers the signals that move your business.',
    stat: '24/7', statLabel: 'live monitoring',
  },
  {
    icon: Users,
    label: 'SOCIETY SIMULATION',
    title: ['Simulate reality.', 'Before it happens.'],
    body: '73 AI agents representing real demographics react to events before they unfold. AYN predicts how markets, governments, and populations will respond.',
    stat: '73', statLabel: 'world agents',
  },
  {
    icon: Bot,
    label: 'AI AGENTS',
    title: ['Your team.', 'Never sleeps.'],
    body: 'Custom AI agents trained on your business data — handling analysis, reporting, and intelligence delivery around the clock, in Arabic and English.',
    stat: '∞', statLabel: 'always on',
  },
];

function mapRange(p: number, inMin: number, inMax: number, outMin: number, outMax: number) {
  const clamped = Math.max(inMin, Math.min(inMax, p));
  return outMin + ((clamped - inMin) / (inMax - inMin)) * (outMax - outMin);
}

// Feature windows: F1 37–57%, [TRANSITION 57–67%], F2 67–77%, F3 77–87%, F4 87–97%
const FEAT_WINDOWS = [
  [0.37, 0.57], // Feature 1
  [0.67, 0.77], // Feature 2
  [0.77, 0.87], // Feature 3
  [0.87, 0.97], // Feature 4
];
const TRANS_START = 0.57;
const TRANS_END   = 0.67;

export const HelmetHero = memo(({}: HelmetHeroProps) => {
  const { language }   = useLanguage();
  const spacerRef      = useRef<HTMLDivElement>(null);
  const imgRef         = useRef<HTMLImageElement>(null);
  const transImgRef    = useRef<HTMLImageElement>(null);
  const helmetCache    = useRef<HTMLImageElement[]>([]);
  const transCache     = useRef<HTMLImageElement[]>([]);
  const rafId          = useRef(0);
  const curProgress    = useRef(0);
  const tgtProgress    = useRef(0);
  const lastHelmIdx    = useRef(-1);
  const lastTransIdx   = useRef(-1);
  const isMobileRef    = useRef(false);

  const [progress, setProgress] = useState(0);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const check = () => {
      const m = window.innerWidth < 768;
      isMobileRef.current = m;
      setIsMobile(m);
    };
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  // Preload helmet frames
  useEffect(() => {
    helmetCache.current = HELMET_FRAMES.map((src, i) => {
      const img = new Image();
      img.src = src;
      img.onload = () => { if (i === 0 && imgRef.current) imgRef.current.src = src; };
      return img;
    });
    return () => cancelAnimationFrame(rafId.current);
  }, []);

  // Preload transition frames
  useEffect(() => {
    transCache.current = TRANSITION_FRAMES.map((src) => {
      const img = new Image();
      img.src = src;
      return img;
    });
  }, []);

  const onScroll = useCallback(() => {
    const spacer = spacerRef.current;
    if (!spacer) return;
    const rect  = spacer.getBoundingClientRect();
    const gone  = -rect.top;
    const total = spacer.offsetHeight - window.innerHeight;
    tgtProgress.current = Math.max(0, Math.min(1, gone / total));
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

      // Helmet frame: 0→30% only. After that, freeze on last frame (assembled)
      const frameProgress = Math.min(mapRange(p, 0, 0.30, 0, 1), 1);
      const hIdx = Math.round(frameProgress * (FRAME_COUNT - 1));
      if (hIdx !== lastHelmIdx.current) {
        lastHelmIdx.current = hIdx;
        const c = helmetCache.current[hIdx];
        if (c?.complete && imgRef.current) imgRef.current.src = c.src;
      }

      // Transition frame: drive during 57–67%, then freeze on last frame
      if (p >= TRANS_START) {
        const tProgress = Math.min(mapRange(p, TRANS_START, TRANS_END, 0, 1), 1);
        const tIdx = Math.round(tProgress * (TRANSITION_FRAME_COUNT - 1));
        if (tIdx !== lastTransIdx.current) {
          lastTransIdx.current = tIdx;
          const c = transCache.current[tIdx];
          if (c?.complete && transImgRef.current) transImgRef.current.src = c.src;
        }
      }

      setProgress(p);
    };
    rafId.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId.current);
  }, []);

  // ── Derived values ─────────────────────────────────────────────────────────
  const headlineOpacity = mapRange(progress, 0.22, 0.30, 1, 0);
  const headlineY       = mapRange(progress, 0.22, 0.32, 0, -30);

  const helmetXvw   = isMobile ? 0 : mapRange(progress, 0.28, 0.42, 0, 28);
  const helmetScale = isMobile
    ? mapRange(progress, 0.28, 0.42, 1, 0.75)
    : mapRange(progress, 0.28, 0.42, 1, 0.60);
  const helmetOpacity = progress >= TRANS_START
    ? 0  // hidden once transition starts — brain takes over
    : mapRange(progress, 0.90, 0.98, 1, 0);

  // Transition video opacity:
  // 57–59%: fade in, 59–65%: fully visible (playing), 65–67%: fade out
  // AFTER 67%: keep showing last frame at full opacity (replaces helmet)
  const transOpacity = progress < TRANS_START
    ? 0
    : progress < TRANS_START + 0.02
      ? mapRange(progress, TRANS_START, TRANS_START + 0.02, 0, 1)
      : progress <= TRANS_END
        ? 1
        : mapRange(progress, 0.90, 0.98, 1, 0); // fade out with helmet at CTA

  const getFeatureOpacity = (i: number) => {
    const [start, end] = FEAT_WINDOWS[i];
    const peak = start + (end - start) * 0.3;
    const fadeEnd = end;
    if (progress < start) return 0;
    if (progress < peak)  return mapRange(progress, start, peak, 0, 1);
    if (progress < fadeEnd) return mapRange(progress, peak, fadeEnd, 1, 0);
    return 0;
  };

  const getFeatureY = (i: number) => {
    const [start, end] = FEAT_WINDOWS[i];
    const peak = start + (end - start) * 0.3;
    if (progress < start) return 40;
    if (progress < peak)  return mapRange(progress, start, peak, 40, 0);
    return mapRange(progress, peak, end, 0, -40);
  };

  const featLabelOpacity = Math.min(
    mapRange(progress, 0.32, 0.42, 0, 1),
    mapRange(progress, 0.90, 0.97, 1, 0)
  );

  const ctaOpacity    = mapRange(progress, 0.93, 0.99, 0, 1);
  const inFeatures    = progress >= 0.37 && progress <= 0.97 && (progress < TRANS_START || progress > TRANS_END);
  const activeFeature = progress < FEAT_WINDOWS[0][1] ? 0
    : progress < FEAT_WINDOWS[1][1] ? 1
    : progress < FEAT_WINDOWS[2][1] ? 2 : 3;

  return (
    <div ref={spacerRef} style={{ height: '2400vh', position: 'relative' }}>
      <div className="sticky top-0 w-full overflow-hidden" style={{ height: '100dvh', background: '#000' }}>

        {/* Progress bar */}
        <div
          className="absolute top-0 left-0 h-[2px] z-50"
          style={{ width: `${progress * 100}%`, background: 'hsl(var(--primary))', transition: 'width 0.05s linear' }}
        />

        {/* ── HELMET ── */}
        <div
          className="absolute inset-0 flex items-center justify-center pointer-events-none"
          style={{ top: '64px' }}
        >
          <div style={{ transform: `translateX(${helmetXvw}vw) scale(${helmetScale})`, opacity: helmetOpacity, willChange: 'transform, opacity' }}>
            <img
              ref={imgRef}
              src={HELMET_FRAMES[0]}
              alt="AYN"
              style={{ width: 'min(75vw, 70vh, 620px)', height: 'min(75vw, 70vh, 620px)', objectFit: 'contain', display: 'block', userSelect: 'none' }}
              draggable={false}
            />
          </div>
        </div>

        {/* ── TRANSITION VIDEO — same size/position as helmet on the right ── */}
        {transOpacity > 0.01 && (
          <div
            className="absolute inset-0 z-30 pointer-events-none flex items-center justify-center"
            style={{ top: '64px', opacity: transOpacity, willChange: 'opacity' }}
          >
            <div style={{ transform: `translateX(${isMobile ? 0 : 28}vw) scale(${isMobile ? 0.75 : 0.60})` }}>
              <img
                ref={transImgRef}
                src={TRANSITION_FRAMES[0]}
                alt=""
                style={{
                  width:  'min(75vw, 70vh, 620px)',
                  height: 'min(75vw, 70vh, 620px)',
                  objectFit: 'contain',
                  display: 'block',
                  userSelect: 'none',
                }}
                draggable={false}
              />
            </div>
          </div>
        )}

        {/* ── HERO HEADLINE ── */}
        <div
          className="absolute left-0 right-0 z-20 px-6 md:px-16"
          style={{ top: '80px', opacity: headlineOpacity, transform: `translateY(${headlineY}px)`, willChange: 'opacity, transform', pointerEvents: headlineOpacity < 0.05 ? 'none' : 'auto' }}
        >
          <div
            className="absolute pointer-events-none"
            style={{ inset: '-40px -60px -80px -60px', background: 'linear-gradient(to bottom, rgba(0,0,0,0.78) 0%, rgba(0,0,0,0.45) 65%, transparent 100%)', zIndex: -1 }}
          />
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

        {/* ── FEATURE PANELS ── */}
        {FEATURES.map((feat, i) => {
          const opacity = getFeatureOpacity(i);
          const y       = getFeatureY(i);
          const Icon    = feat.icon;
          if (opacity < 0.01) return null;

          return (
            <div
              key={i}
              className="absolute inset-0 z-20 pointer-events-none"
              style={{ opacity, transform: `translateY(${y}px)`, willChange: 'opacity, transform', paddingTop: '64px' }}
            >
              <div className={`w-full h-full flex ${isMobile ? 'flex-col justify-end pb-10' : 'flex-row items-center'}`}>
                <div className={`${isMobile ? 'w-full px-6 pb-4' : 'w-1/2 px-8 md:px-16'} flex flex-col justify-center relative`}>
                  <div
                    className="absolute pointer-events-none"
                    style={isMobile ? {
                      left: 0, right: 0, bottom: 0, height: '70%',
                      background: 'linear-gradient(to top, rgba(0,0,0,0.9) 0%, rgba(0,0,0,0.6) 60%, transparent 100%)',
                      zIndex: -1,
                    } : {
                      left: 0, top: 0, bottom: 0, width: '110%',
                      background: 'linear-gradient(to right, rgba(0,0,0,0.88) 0%, rgba(0,0,0,0.65) 70%, transparent 100%)',
                      zIndex: -1,
                    }}
                  />
                  <div className="flex items-center gap-2 mb-3 md:mb-4">
                    <Icon className="w-3.5 h-3.5 md:w-4 md:h-4" style={{ color: 'hsl(var(--primary))' }} />
                    <span className="text-[8px] md:text-[9px] tracking-[0.3em] uppercase font-mono" style={{ color: 'rgba(255,255,255,0.4)' }}>
                      {feat.label}
                    </span>
                  </div>
                  <h2 className="font-display font-bold text-white leading-tight mb-3 md:mb-4" style={{ fontSize: 'clamp(24px, 3.5vw, 58px)' }}>
                    {feat.title[0]}<br />
                    <span style={{ color: 'hsl(var(--primary))' }}>{feat.title[1]}</span>
                  </h2>
                  {!isMobile && (
                    <p className="text-sm md:text-base font-light leading-relaxed mb-5 max-w-[360px]" style={{ color: 'rgba(255,255,255,0.5)' }}>
                      {feat.body}
                    </p>
                  )}
                  <div className="flex items-baseline gap-2">
                    <span className="font-display font-bold text-white" style={{ fontSize: isMobile ? 'clamp(28px, 8vw, 48px)' : 'clamp(36px, 5vw, 60px)', lineHeight: 1 }}>
                      {feat.stat}
                    </span>
                    <span className="text-[10px] uppercase tracking-widest font-mono" style={{ color: 'rgba(255,255,255,0.35)' }}>
                      {feat.statLabel}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          );
        })}

        {/* ── DOT NAV ── */}
        {inFeatures && !isMobile && (
          <div
            className="absolute right-6 md:right-10 flex flex-col gap-2 z-30"
            style={{ top: '50%', transform: 'translateY(-50%)', opacity: featLabelOpacity }}
          >
            {FEATURES.map((_, i) => (
              <div
                key={i}
                style={{
                  width: i === activeFeature ? '20px' : '6px',
                  height: '6px',
                  borderRadius: '3px',
                  background: i === activeFeature ? 'hsl(var(--primary))' : 'rgba(255,255,255,0.2)',
                  transition: 'all 0.4s ease',
                }}
              />
            ))}
          </div>
        )}

        {/* ── CTA ── */}
        {ctaOpacity > 0.01 && (
          <div
            className="absolute inset-0 flex flex-col items-center justify-center z-30 px-6"
            style={{ opacity: ctaOpacity, paddingTop: '64px' }}
          >
            <p className="text-[9px] md:text-[10px] tracking-[0.3em] uppercase font-mono mb-4 text-center" style={{ color: 'rgba(255,255,255,0.3)' }}>
              Ready to see the world clearly?
            </p>
            <h2 className="font-display font-bold text-white text-center mb-8" style={{ fontSize: 'clamp(30px, 5vw, 72px)', lineHeight: 1.1 }}>
              Start with <span style={{ color: 'hsl(var(--primary))' }}>AYN</span>
            </h2>
            <a
              href="/pricing"
              className="pointer-events-auto inline-flex items-center gap-3 font-medium"
              style={{
                padding: isMobile ? '12px 28px' : '14px 40px',
                background: 'hsl(var(--primary))',
                color: '#000',
                fontSize: '12px',
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                textDecoration: 'none',
              }}
            >
              Get Started Free →
            </a>
          </div>
        )}
      </div>
    </div>
  );
});

HelmetHero.displayName = 'HelmetHero';
