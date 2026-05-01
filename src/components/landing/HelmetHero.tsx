/**
 * HelmetHero — scroll-driven frame animation.
 * Uses <img> tag (not canvas) — zero sizing bugs, works exactly like the original eye.
 * Layout is pixel-for-pixel identical to Hero.tsx.
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
  const spacerRef   = useRef<HTMLDivElement>(null);
  const imgRef      = useRef<HTMLImageElement>(null);

  const rafId       = useRef(0);
  const curProgress = useRef(0);
  const tgtProgress = useRef(0);
  const lastIdx     = useRef(-1);

  const [frameIdx,  setFrameIdx]  = useState(0);
  const [scrolled,  setScrolled]  = useState(false);
  const [isBlinking, setIsBlinking] = useState(false);

  // Preload images into an off-screen cache
  const cache = useRef<HTMLImageElement[]>([]);

  useEffect(() => {
    cache.current = HELMET_FRAMES.map((src, i) => {
      const img = new Image();
      img.src = src;
      // Show first frame immediately once loaded
      img.onload = () => {
        if (i === 0 && imgRef.current) {
          imgRef.current.src = src;
        }
      };
      return img;
    });
    return () => cancelAnimationFrame(rafId.current);
  }, []);

  // Scroll → target progress
  const onScroll = useCallback(() => {
    const spacer = spacerRef.current;
    if (!spacer) return;
    const rect  = spacer.getBoundingClientRect();
    const gone  = -rect.top;
    const total = spacer.offsetHeight - window.innerHeight;
    const p     = Math.max(0, Math.min(1, gone / total));
    tgtProgress.current = p;
    setScrolled(p > 0.015);
  }, []);

  useEffect(() => {
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [onScroll]);

  // RAF: lerp progress, swap img.src to drive frame
  useEffect(() => {
    const tick = () => {
      rafId.current = requestAnimationFrame(tick);
      curProgress.current += (tgtProgress.current - curProgress.current) * 0.1;
      const idx = Math.round(curProgress.current * (FRAME_COUNT - 1));
      if (idx !== lastIdx.current) {
        lastIdx.current = idx;
        const cached = cache.current[idx];
        if (cached?.complete && imgRef.current) {
          imgRef.current.src = cached.src;
        }
        setFrameIdx(idx);
      }
    };
    rafId.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId.current);
  }, []);

  const handlePlaceholderChange = useCallback(() => {
    setIsBlinking(true);
    setTimeout(() => setIsBlinking(false), 150);
  }, []);

  const progress = frameIdx / (FRAME_COUNT - 1);

  return (
    <div ref={spacerRef} style={{ height: '600vh', position: 'relative' }}>

      {/* Sticky panel — exact same classes as original Hero section */}
      <div className="sticky top-0 overflow-hidden" style={{ height: '100dvh' }}>

        {/* Gold scrub progress bar */}
        <div
          className="absolute top-0 left-0 h-[2px] z-40 pointer-events-none transition-all duration-75"
          style={{
            width: `${progress * 100}%`,
            background: 'hsl(var(--primary))',
            boxShadow: '0 0 8px hsl(var(--primary)/0.4)',
          }}
        />

        {/* ── Replicate Hero section layout exactly ── */}
        <section
          className="relative min-h-[100dvh] flex flex-col items-center justify-between pt-20 md:pt-24 pb-6 md:pb-8 px-4 md:px-12 lg:px-24 overflow-x-hidden overflow-y-visible"
          aria-label="Hero"
        >
          {/* TOP: Headline — original copy */}
          <div className="w-full max-w-4xl text-center mb-4 md:mb-6">
            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0, ease: [0.22, 1, 0.36, 1] }}
              className="font-display font-bold tracking-[-0.02em] text-foreground mb-2 md:mb-3 text-5xl sm:text-6xl md:text-7xl lg:text-8xl"
            >
              {language === 'ar' ? 'تعرّف على AYN' : language === 'fr' ? 'Découvrez AYN' : 'Meet AYN'}
            </motion.h1>
            <motion.p
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
              className="text-base md:text-lg lg:text-xl text-muted-foreground font-light max-w-2xl mx-auto"
            >
              {language === 'ar'
                ? 'ذكاء أعمال حقيقي يتابع الأسواق، يحلل المخاطر، ويساعدك على القرار الصحيح.'
                : language === 'fr'
                ? "Intelligence d'affaires réelle. Marchés, risques et décisions stratégiques."
                : 'Real business intelligence. Markets, risks, and decisions that matter.'}
            </motion.p>
          </div>

          {/* MIDDLE: Helmet — same container as original eye */}
          <motion.div
            className="relative w-full max-w-5xl flex-1 flex items-center justify-center"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.25, ease: [0.22, 1, 0.36, 1] }}
          >
            {/* Ambient glow — matches old eye glow div */}
            <div className="absolute w-[200px] h-[200px] sm:w-[280px] sm:h-[280px] md:w-[360px] md:h-[360px] lg:w-[480px] lg:h-[480px] rounded-full -z-10 pointer-events-none bg-gradient-to-b from-transparent via-muted/30 to-transparent" />

            {/* Helmet image — same size brackets as the old eye div */}
            <div className="relative w-[220px] h-[220px] sm:w-[280px] sm:h-[280px] md:w-[340px] md:h-[340px] lg:w-[420px] lg:h-[420px] flex items-center justify-center">
              <motion.img
                ref={imgRef}
                src={HELMET_FRAMES[0]}
                alt="AYN Helmet"
                animate={{ scaleY: isBlinking ? 0.05 : 1, opacity: isBlinking ? 0.7 : 1 }}
                transition={{ duration: isBlinking ? 0.08 : 0.12 }}
                className="w-full h-full object-contain select-none pointer-events-none"
                draggable={false}
              />

              {/* Frame counter */}
              <div className="absolute -bottom-6 right-0 pointer-events-none">
                <span
                  className="text-[9px] tabular-nums tracking-widest transition-colors duration-300"
                  style={{
                    fontFamily: 'monospace',
                    color: progress > 0.04 && progress < 0.96
                      ? 'hsl(var(--primary)/0.7)'
                      : 'hsl(var(--muted-foreground)/0.3)',
                  }}
                >
                  {String(frameIdx + 1).padStart(3, '0')}/{String(FRAME_COUNT).padStart(3, '0')}
                </span>
              </div>
            </div>
          </motion.div>

          {/* BOTTOM: Chat input — exactly same as original */}
          <LandingChatInput
            onSendAttempt={(message) => onGetStarted(message)}
            onPlaceholderChange={handlePlaceholderChange}
          />

          {/* Scroll hint */}
          <AnimatePresence>
            {!scrolled && (
              <motion.div
                key="hint"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ delay: 1, duration: 0.5 }}
                className="absolute bottom-24 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 pointer-events-none z-10"
              >
                <span className="text-[9px] tracking-[0.3em] uppercase text-muted-foreground font-mono">
                  {language === 'ar' ? 'مرر' : 'Scroll'}
                </span>
                <motion.div
                  animate={{ y: [0, 6, 0] }}
                  transition={{ repeat: Infinity, duration: 1.6, ease: 'easeInOut' }}
                  className="w-px h-8 bg-gradient-to-b from-muted-foreground/40 to-transparent"
                />
              </motion.div>
            )}
          </AnimatePresence>
        </section>
      </div>
    </div>
  );
});

HelmetHero.displayName = 'HelmetHero';
