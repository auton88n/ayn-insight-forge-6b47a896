/**
 * HelmetHero — Premium scroll storytelling. Mobile + tablet compatible.
 *
 * Scroll phases (2000vh desktop, 1400vh mobile):
 *   0–30%   Hero:       Helmet assembles, headline visible
 *   28–42%  Transition: Helmet slides right (desktop) / stays center (mobile)
 *   37–97%  Features:   4 chapters fade in/out
 *   93–100% CTA:        Helmet out, call to action
 */

import { useEffect, useRef, useState, useCallback, memo } from 'react';
import { motion } from 'framer-motion';
import { HELMET_FRAMES, FRAME_COUNT } from '@/assets/helmet-frames';
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

export const HelmetHero = memo(({}: HelmetHeroProps) => {
  const { language } = useLanguage();
  const spacerRef    = useRef<HTMLDivElement>(null);
  const imgRef       = useRef<HTMLImageElement>(null);
  const cache        = useRef<HTMLImageElement[]>([]);
  const rafId        = useRef(0);
  const curProgress  = useRef(0);
  const tgtProgress  = useRef(0);
  const lastFrameIdx = useRef(-1);
  const isMobileRef  = useRef(false);

  const [frameIdx, setFrameIdx] = useState(0);
  const [progress, setProgress] = useState(0);
  const [isMobile, setIsMobile] = useState(false);

  // Detect mobile/tablet
  useEffect(() => {
    const check = () => {
      const mobile = window.innerWidth < 768;
      isMobileRef.current = mobile;
      setIsMobile(mobile);
    };
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  // Preload frames
  useEffect(() => {
    cache.current = HELMET_FRAMES.map((src, i) => {
      const img = new Image();
      img.src = src;
      img.onload = () => { if (i === 0 && imgRef.current) imgRef.current.src = src; };
      return img;
    });
    return () => cancelAnimationFrame(rafId.current);
  }, []);

  // Scroll → progress
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

  // RAF loop — full speed (0.1)
  useEffect(() => {
    const tick = () => {
      rafId.current = requestAnimationFrame(tick);
      curProgress.current += (tgtProgress.current - curProgress.current) * 0.1;
      const p = curProgress.current;

      // Frame driven 0→30%
      const frameProgress = mapRange(p, 0, 0.30, 0, 1);
      const idx = Math.round(frameProgress * (FRAME_COUNT - 1));
      if (idx !== lastFrameIdx.current) {
        lastFrameIdx.current = idx;
        const c = cache.current[idx];
        if (c?.complete && imgRef.current) imgRef.current.src = c.src;
        setFrameIdx(idx);
      }

      setProgress(p);
    };
    rafId.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId.current);
  }, []);

  // ── Derived values ──────────────────────────────────────────────────────────

  const headlineOpacity = mapRange(progress, 0.22, 0.30, 1, 0);
  const headlineY       = mapRange(progress, 0.22, 0.32, 0, -30);

  // On mobile: helmet stays centered, just shrinks a bit
  // On desktop: slides right
  const helmetXvw   = isMobile ? 0 : mapRange(progress, 0.28, 0.42, 0, 28);
  const helmetScale = isMobile
    ? mapRange(progress, 0.28, 0.42, 1, 0.75)
    : mapRange(progress, 0.28, 0.42, 1, 0.60);
  const helmetOpacity = mapRange(progress, 0.90, 0.98, 1, 0);

  const featStart = 0.37;
  const featEnd   = 0.97;
  const featRange = (featEnd - featStart) / 4;

  const getFeatureOpacity = (i: number) => {
    const start = featStart + i * featRange;
    const peak  = start + featRange * 0.25;
    const end   = start + featRange;
    if (progress < start) return 0;
    if (progress < peak)  return mapRange(progress, start, peak, 0, 1);
    if (progress < end)   return mapRange(progress, peak, end, 1, 0);
    return 0;
  };

  const getFeatureY = (i: number) => {
    const start = featStart + i * featRange;
    const peak  = start + featRange * 0.25;
    if (progress < start) return 40;
    if (progress < peak)  return mapRange(progress, start, peak, 40, 0);
    return mapRange(progress, peak, start + featRange, 0, -40);
  };

  const featLabelOpacity = Math.min(
    mapRange(progress, 0.32, 0.42, 0, 1),
    mapRange(progress, 0.90, 0.97, 1, 0)
  );

  const ctaOpacity   = mapRange(progress, 0.93, 0.99, 0, 1);
  const activeFeature = Math.max(0, Math.min(3, Math.floor(mapRange(progress, featStart, featEnd, 0, 4))));
  const inFeatures    = progress >= featStart && progress <= 0.97;

  return (
    <div ref={spacerRef} style={{ height: '2000vh', position: 'relative' }}>
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
          <div
            style={{
              transform: `translateX(${helmetXvw}vw) scale(${helmetScale})`,
              opacity: helmetOpacity,
              willChange: 'transform, opacity',
            }}
          >
            <img
              ref={imgRef}
              src={HELMET_FRAMES[0]}
              alt="AYN"
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
          <h1
            className="font-display font-bold tracking-[-0.02em] text-white leading-none"
            style={{ fontSize: 'clamp(36px, 5.5vw, 80px)' }}
          >
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
              {/* On mobile: text at bottom, helmet above */}
              {/* On desktop: text left column, helmet right */}
              <div className={`w-full h-full flex ${isMobile ? 'flex-col justify-end pb-10' : 'flex-row items-center'}`}>
                <div className={`${isMobile ? 'w-full px-6 pb-4' : 'w-1/2 px-8 md:px-16'} flex flex-col justify-center relative`}>

                  {/* Gradient: left on desktop, bottom on mobile */}
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

                  <h2
                    className="font-display font-bold text-white leading-tight mb-3 md:mb-4"
                    style={{ fontSize: 'clamp(24px, 3.5vw, 58px)' }}
                  >
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

        {/* ── DOT NAV ── hidden on mobile to avoid clutter */}
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
            <h2
              className="font-display font-bold text-white text-center mb-8"
              style={{ fontSize: 'clamp(30px, 5vw, 72px)', lineHeight: 1.1 }}
            >
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
