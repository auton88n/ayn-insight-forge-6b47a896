/**
 * HelmetHero — Scroll storytelling. Reversed: brain → exploded helmet → assembled.
 *
 * Scroll phases (2400vh):
 *   0–25%    Brain (transition video) fades in + plays
 *   22–35%   Headline fades in over brain
 *   25–50%   Helmet explodes outward (frame 0→60 of helmet frames)
 *   50–75%   Helmet assembles (frame 60→120)
 *   70–80%   Helmet slides right, headline fades out
 *   37–97%   Feature chapters (start after helmet positions right)
 *   57–67%   [no extra transition needed — brain already played]
 *   93–100%  CTA
 */

import { useEffect, useRef, useState, useCallback, memo } from 'react';
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

const FEAT_WINDOWS = [
  [0.38, 0.55],
  [0.55, 0.70],
  [0.70, 0.84],
  [0.84, 0.97],
];

export const HelmetHero = memo(({}: HelmetHeroProps) => {
  const { language }  = useLanguage();
  const spacerRef     = useRef<HTMLDivElement>(null);
  const helmetImgRef  = useRef<HTMLImageElement>(null);
  const brainImgRef   = useRef<HTMLImageElement>(null);
  const helmetCache   = useRef<HTMLImageElement[]>([]);
  const brainCache    = useRef<HTMLImageElement[]>([]);
  const rafId         = useRef(0);
  const curProgress   = useRef(0);
  const tgtProgress   = useRef(0);
  const lastHelmIdx   = useRef(-1);
  const lastBrainIdx  = useRef(-1);
  const isMobileRef   = useRef(false);

  const [progress, setProgress] = useState(0);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const check = () => { const m = window.innerWidth < 768; isMobileRef.current = m; setIsMobile(m); };
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  // Preload brain (transition) frames first — show first frame immediately
  useEffect(() => {
    brainCache.current = TRANSITION_FRAMES.map((src, i) => {
      const img = new Image();
      img.src = src;
      img.onload = () => { if (i === 0 && brainImgRef.current) brainImgRef.current.src = src; };
      return img;
    });
    return () => cancelAnimationFrame(rafId.current);
  }, []);

  // Preload helmet frames
  useEffect(() => {
    helmetCache.current = HELMET_FRAMES.map((src) => {
      const img = new Image();
      img.src = src;
      return img;
    });
  }, []);

  const onScroll = useCallback(() => {
    const spacer = spacerRef.current;
    if (!spacer) return;
    const rect  = spacer.getBoundingClientRect();
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

      // Brain: plays 0→28%
      const bIdx = Math.round(Math.min(mapRange(p, 0, 0.28, 0, 1), 1) * (TRANSITION_FRAME_COUNT - 1));
      if (bIdx !== lastBrainIdx.current) {
        lastBrainIdx.current = bIdx;
        const c = brainCache.current[bIdx];
        if (c?.complete && brainImgRef.current) brainImgRef.current.src = c.src;
      }

      // Helmet: plays 0.25→0.70% (0→120 frames = explode then assemble)
      const hIdx = Math.round(Math.min(Math.max(mapRange(p, 0.25, 0.70, 0, 1), 0), 1) * (FRAME_COUNT - 1));
      if (hIdx !== lastHelmIdx.current) {
        lastHelmIdx.current = hIdx;
        const c = helmetCache.current[hIdx];
        if (c?.complete && helmetImgRef.current) helmetImgRef.current.src = c.src;
      }

      setProgress(p);
    };
    rafId.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId.current);
  }, []);

  // ── Derived values ──────────────────────────────────────────────────────────

  // Brain: full opacity 0→22%, starts fading at 22%, gone by 30%
  const brainOpacity = mapRange(progress, 0.22, 0.30, 1, 0);

  // Helmet: fades in at 25%, slides right at 32–42%, fades out at CTA
  const helmetFadeIn  = mapRange(progress, 0.25, 0.32, 0, 1);
  const helmetXvw     = isMobile ? 0 : mapRange(progress, 0.32, 0.44, 0, 28);
  const helmetScale   = isMobile
    ? mapRange(progress, 0.32, 0.44, 1, 0.75)
    : mapRange(progress, 0.32, 0.44, 1, 0.60);
  const helmetOpacity = Math.min(helmetFadeIn, mapRange(progress, 0.90, 0.98, 1, 0));

  // Headline: fades in with brain (20%), stays, fades out before helmet moves
  const headlineOpacity = Math.min(
    mapRange(progress, 0.20, 0.27, 0, 1),
    mapRange(progress, 0.28, 0.36, 1, 0)
  );
  const headlineY = mapRange(progress, 0.28, 0.38, 0, -30);

  const getFeatureOpacity = (i: number) => {
    const [start, end] = FEAT_WINDOWS[i];
    const peak = start + (end - start) * 0.28;
    if (progress < start) return 0;
    if (progress < peak)  return mapRange(progress, start, peak, 0, 1);
    if (progress < end)   return mapRange(progress, peak, end, 1, 0);
    return 0;
  };

  const getFeatureY = (i: number) => {
    const [start, end] = FEAT_WINDOWS[i];
    const peak = start + (end - start) * 0.28;
    if (progress < start) return 40;
    if (progress < peak)  return mapRange(progress, start, peak, 40, 0);
    return mapRange(progress, peak, end, 0, -40);
  };

  const featLabelOpacity = Math.min(
    mapRange(progress, 0.35, 0.44, 0, 1),
    mapRange(progress, 0.90, 0.97, 1, 0)
  );
  const ctaOpacity    = mapRange(progress, 0.93, 0.99, 0, 1);
  const inFeatures    = progress >= 0.38 && progress <= 0.97;
  const activeFeature = FEAT_WINDOWS.findIndex(([s, e]) => progress >= s && progress < e);
  const clampedActive = Math.max(0, activeFeature === -1 ? 3 : activeFeature);

  const SIZE = 'min(75vw, 70vh, 620px)';

  return (
    <div ref={spacerRef} style={{ height: '2400vh', position: 'relative' }}>
      <div className="sticky top-0 w-full overflow-hidden" style={{ height: '100dvh', background: '#000' }}>

        {/* Progress bar */}
        <div
          className="absolute top-0 left-0 h-[2px] z-50"
          style={{ width: `${progress * 100}%`, background: 'hsl(var(--primary))', transition: 'width 0.05s linear' }}
        />

        {/* ── BRAIN (transition video) — center, fades out ── */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none" style={{ top: '64px', opacity: brainOpacity, willChange: 'opacity' }}>
          <img
            ref={brainImgRef}
            src={TRANSITION_FRAMES[0]}
            alt=""
            style={{ width: SIZE, height: SIZE, objectFit: 'contain', display: 'block', userSelect: 'none' }}
            draggable={false}
          />
        </div>

        {/* ── HELMET — fades in, explodes, assembles, slides right ── */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none" style={{ top: '64px' }}>
          <div style={{ transform: `translateX(${helmetXvw}vw) scale(${helmetScale})`, opacity: helmetOpacity, willChange: 'transform, opacity' }}>
            <img
              ref={helmetImgRef}
              src={HELMET_FRAMES[0]}
              alt="AYN"
              style={{ width: SIZE, height: SIZE, objectFit: 'contain', display: 'block', userSelect: 'none' }}
              draggable={false}
            />
          </div>
        </div>

        {/* ── HEADLINE ── */}
        <div
          className="absolute left-0 right-0 z-20 px-6 md:px-16"
          style={{ top: '80px', opacity: headlineOpacity, transform: `translateY(${headlineY}px)`, willChange: 'opacity, transform', pointerEvents: headlineOpacity < 0.05 ? 'none' : 'auto' }}
        >
          <div className="absolute pointer-events-none" style={{ inset: '-40px -60px -80px -60px', background: 'linear-gradient(to bottom, rgba(0,0,0,0.78) 0%, rgba(0,0,0,0.45) 65%, transparent 100%)', zIndex: -1 }} />
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
            <div key={i} className="absolute inset-0 z-20 pointer-events-none" style={{ opacity, transform: `translateY(${y}px)`, willChange: 'opacity, transform', paddingTop: '64px' }}>
              <div className={`w-full h-full flex ${isMobile ? 'flex-col justify-end pb-10' : 'flex-row items-center'}`}>
                <div className={`${isMobile ? 'w-full px-6 pb-4' : 'w-1/2 px-8 md:px-16'} flex flex-col justify-center relative`}>
                  <div className="absolute pointer-events-none" style={isMobile ? { left: 0, right: 0, bottom: 0, height: '70%', background: 'linear-gradient(to top, rgba(0,0,0,0.9) 0%, rgba(0,0,0,0.6) 60%, transparent 100%)', zIndex: -1 } : { left: 0, top: 0, bottom: 0, width: '110%', background: 'linear-gradient(to right, rgba(0,0,0,0.88) 0%, rgba(0,0,0,0.65) 70%, transparent 100%)', zIndex: -1 }} />
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
          <div className="absolute right-6 md:right-10 flex flex-col gap-2 z-30" style={{ top: '50%', transform: 'translateY(-50%)', opacity: featLabelOpacity }}>
            {FEATURES.map((_, i) => (
              <div key={i} style={{ width: i === clampedActive ? '20px' : '6px', height: '6px', borderRadius: '3px', background: i === clampedActive ? 'hsl(var(--primary))' : 'rgba(255,255,255,0.2)', transition: 'all 0.4s ease' }} />
            ))}
          </div>
        )}

        {/* ── CTA ── */}
        {ctaOpacity > 0.01 && (
          <div className="absolute inset-0 flex flex-col items-center justify-center z-30 px-6" style={{ opacity: ctaOpacity, paddingTop: '64px' }}>
            <p className="text-[9px] md:text-[10px] tracking-[0.3em] uppercase font-mono mb-4 text-center" style={{ color: 'rgba(255,255,255,0.3)' }}>
              Ready to see the world clearly?
            </p>
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
