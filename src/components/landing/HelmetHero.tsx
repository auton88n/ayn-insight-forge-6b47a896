/**
 * HelmetHero — pixel-perfect copy of Hero.tsx layout.
 * Helmet image replaces the eye div at exact same fixed sizes.
 * LandingChatInput renders exactly as it did before.
 */

import { useEffect, useRef, useState, useCallback, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { HELMET_FRAMES, FRAME_COUNT } from '@/assets/helmet-frames';
import { useLanguage } from '@/contexts/LanguageContext';
import { LandingChatInput } from '@/components/landing/LandingChatInput';

interface HelmetHeroProps {
  onGetStarted: (prefillMessage?: string) => void;
}

export const HelmetHero = memo(({ onGetStarted }: HelmetHeroProps) => {
  const { language } = useLanguage();
  const spacerRef    = useRef<HTMLDivElement>(null);
  const imgRef       = useRef<HTMLImageElement>(null);
  const cache        = useRef<HTMLImageElement[]>([]);
  const rafId        = useRef(0);
  const curProgress  = useRef(0);
  const tgtProgress  = useRef(0);
  const lastIdx      = useRef(-1);
  const [frameIdx, setFrameIdx] = useState(0);
  const [scrolled, setScrolled] = useState(false);
  const noop = useCallback(() => {}, []);

  useEffect(() => {
    cache.current = HELMET_FRAMES.map((src, i) => {
      const img = new Image();
      img.src = src;
      img.onload = () => { if (i === 0 && imgRef.current) imgRef.current.src = src; };
      return img;
    });
    return () => cancelAnimationFrame(rafId.current);
  }, []);

  const onScroll = useCallback(() => {
    const spacer = spacerRef.current;
    if (!spacer) return;
    const rect  = spacer.getBoundingClientRect();
    const gone  = -rect.top;
    const total = spacer.offsetHeight - window.innerHeight;
    tgtProgress.current = Math.max(0, Math.min(1, gone / total));
    setScrolled(tgtProgress.current > 0.015);
  }, []);

  useEffect(() => {
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [onScroll]);

  useEffect(() => {
    const tick = () => {
      rafId.current = requestAnimationFrame(tick);
      curProgress.current += (tgtProgress.current - curProgress.current) * 0.1;
      const idx = Math.round(curProgress.current * (FRAME_COUNT - 1));
      if (idx !== lastIdx.current) {
        lastIdx.current = idx;
        const c = cache.current[idx];
        if (c?.complete && imgRef.current) imgRef.current.src = c.src;
        setFrameIdx(idx);
      }
    };
    rafId.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId.current);
  }, []);

  const progress = frameIdx / (FRAME_COUNT - 1);

  return (
    <div ref={spacerRef} style={{ height: '600vh', position: 'relative' }}>

      {/* Sticky viewport — min-h matches original Hero, overflow-y:visible so chat input never clips */}
      <div className="sticky top-0" style={{ height: '100dvh', background: '#000', overflow: 'hidden' }}>

        {/* Progress bar */}
        <div
          className="absolute top-0 left-0 h-[2px] z-40 pointer-events-none"
          style={{
            width: `${progress * 100}%`,
            background: 'hsl(var(--primary))',
            transition: 'width 0.05s linear',
          }}
        />

        {/* ── Exact copy of Hero.tsx section ── */}
        <section
          className="relative min-h-[100dvh] flex flex-col items-center justify-between pt-20 md:pt-24 pb-6 md:pb-8 px-4 md:px-12 lg:px-24 overflow-x-hidden overflow-y-visible"
          aria-label="Hero"
        >
          {/* Headline — exact copy */}
          <div className="w-full max-w-4xl text-center mb-4 md:mb-6">
            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0, ease: [0.22, 1, 0.36, 1] }}
              className="font-display font-bold tracking-[-0.02em] text-white mb-2 md:mb-3 text-5xl sm:text-6xl md:text-7xl lg:text-8xl"
            >
              {language === 'ar' ? 'تعرّف على AYN' : language === 'fr' ? 'Découvrez AYN' : 'Meet AYN'}
            </motion.h1>
            <motion.p
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
              className="text-base md:text-lg lg:text-xl font-light max-w-2xl mx-auto"
              style={{ color: 'rgba(255,255,255,0.5)' }}
            >
              {language === 'ar'
                ? 'ذكاء أعمال حقيقي يتابع الأسواق، يحلل المخاطر، ويساعدك على القرار الصحيح.'
                : language === 'fr'
                ? "Intelligence d'affaires réelle. Marchés, risques et décisions stratégiques."
                : 'Real business intelligence. Markets, risks, and decisions that matter.'}
            </motion.p>
          </div>

          {/* Central helmet — same container as original eye */}
          <motion.div
            className="relative w-full max-w-5xl flex-1 flex items-center justify-center"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.25, ease: [0.22, 1, 0.36, 1] }}
          >
            {/* Helmet image — fixed sizes matching original eye: w-[180px] → lg:w-[360px] */}
            <div className="relative w-[180px] h-[180px] sm:w-[240px] sm:h-[240px] md:w-[300px] md:h-[300px] lg:w-[360px] lg:h-[360px]">
              <img
                ref={imgRef}
                src={HELMET_FRAMES[0]}
                alt="AYN"
                className="w-full h-full object-contain select-none pointer-events-none"
                draggable={false}
              />
            </div>

            {/* Scroll hint */}
            <AnimatePresence>
              {!scrolled && (
                <motion.div
                  key="hint"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ delay: 1, duration: 0.5 }}
                  className="absolute bottom-0 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 pointer-events-none"
                >
                  <span className="text-[9px] tracking-[0.3em] uppercase font-mono" style={{ color: 'rgba(255,255,255,0.3)' }}>
                    {language === 'ar' ? 'مرر' : 'Scroll'}
                  </span>
                  <motion.div
                    animate={{ y: [0, 6, 0] }}
                    transition={{ repeat: Infinity, duration: 1.6, ease: 'easeInOut' }}
                    style={{ width: '1px', height: '28px', background: 'linear-gradient(to bottom, rgba(255,255,255,0.3), transparent)' }}
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>

          {/* Chat input — LandingChatInput renders its own wrapper, exact same as Hero.tsx */}
          <LandingChatInput
            onSendAttempt={(message) => onGetStarted(message)}
            onPlaceholderChange={noop}
          />
        </section>
      </div>
    </div>
  );
});

HelmetHero.displayName = 'HelmetHero';
