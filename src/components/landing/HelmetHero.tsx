/**
 * HelmetHero — proper full-viewport scroll hero.
 * 
 * Design:
 *  - Full black viewport, helmet fills center (large, like Apple-style)
 *  - Headline sits at top, fades in
 *  - Chat input pinned at bottom inside sticky panel
 *  - Scroll down = helmet explodes (reversed frames, starts assembled)
 *  - No flex fights, no overflow, no layout math needed
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
  const [scrolled,  setScrolled]  = useState(false);
  const noop = useCallback(() => {}, []);

  // Preload all frames
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
    setScrolled(tgtProgress.current > 0.02);
  }, []);

  useEffect(() => {
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [onScroll]);

  // RAF loop
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

      {/* ── Sticky panel: full viewport, black, everything absolutely positioned ── */}
      <div
        className="sticky top-0 w-full"
        style={{ height: '100dvh', background: '#000', overflow: 'hidden' }}
      >
        {/* Gold progress bar */}
        <div
          className="absolute top-0 left-0 right-0 h-[2px] z-50"
          style={{
            width: `${progress * 100}%`,
            background: 'hsl(var(--primary))',
            transition: 'width 0.05s linear',
          }}
        />

        {/* ── HELMET: fills the whole viewport, centered ── */}
        {/* 
          The helmet is the hero. It fills the screen like a product shot.
          We use a large fixed size capped at viewport — no flex, just absolute centering.
        */}
        <div className="absolute inset-0 flex items-center justify-center" style={{ top: '64px', bottom: '140px' }}>
          <img
            ref={imgRef}
            src={HELMET_FRAMES[0]}
            alt="AYN"
            style={{
              width:     'min(70vw, 70vh, 560px)',
              height:    'min(70vw, 70vh, 560px)',
              objectFit: 'contain',
              display:   'block',
              userSelect: 'none',
              pointerEvents: 'none',
            }}
            draggable={false}
          />
        </div>

        {/* ── HEADLINE: top, over helmet ── */}
        <div
          className="absolute left-0 right-0 flex flex-col items-center text-center z-20 px-4"
          style={{ top: '80px' }}
        >
          <motion.h1
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
            className="font-display font-bold tracking-[-0.02em] text-white text-5xl sm:text-6xl md:text-7xl lg:text-8xl"
          >
            {language === 'ar' ? 'تعرّف على AYN' : language === 'fr' ? 'Découvrez AYN' : 'Meet AYN'}
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
            className="mt-3 text-base md:text-lg font-light max-w-xl"
            style={{ color: 'rgba(255,255,255,0.45)' }}
          >
            {language === 'ar'
              ? 'ذكاء أعمال حقيقي يتابع الأسواق، يحلل المخاطر، ويساعدك على القرار الصحيح.'
              : language === 'fr'
              ? "Intelligence d'affaires réelle. Marchés, risques et décisions stratégiques."
              : 'Real business intelligence. Markets, risks, and decisions that matter.'}
          </motion.p>
        </div>

        {/* ── CHAT INPUT: pinned to bottom ── */}
        <div
          className="absolute left-0 right-0 z-20 px-4"
          style={{ bottom: '16px' }}
        >
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, delay: 0.3, ease: [0.22, 1, 0.36, 1] }}
            className="hero-chat-input"
          >
            <LandingChatInput
              onSendAttempt={(msg) => onGetStarted(msg)}
              onPlaceholderChange={noop}
            />
          </motion.div>
        </div>

        {/* ── SCROLL HINT ── */}
        <AnimatePresence>
          {!scrolled && (
            <motion.div
              key="hint"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ delay: 1.2, duration: 0.5 }}
              className="absolute left-1/2 -translate-x-1/2 z-20 flex flex-col items-center gap-2 pointer-events-none"
              style={{ bottom: '130px' }}
            >
              <span
                className="text-[9px] tracking-[0.3em] uppercase font-mono"
                style={{ color: 'rgba(255,255,255,0.25)' }}
              >
                {language === 'ar' ? 'مرر' : 'Scroll'}
              </span>
              <motion.div
                animate={{ y: [0, 5, 0] }}
                transition={{ repeat: Infinity, duration: 1.6, ease: 'easeInOut' }}
                style={{
                  width: '1px',
                  height: '24px',
                  background: 'linear-gradient(to bottom, rgba(255,255,255,0.25), transparent)',
                }}
              />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Frame counter — subtle, bottom right */}
        <div className="absolute bottom-6 right-6 z-20 pointer-events-none">
          <span
            className="text-[9px] tabular-nums tracking-widest font-mono"
            style={{
              color: progress > 0.04 && progress < 0.96
                ? 'hsl(var(--primary)/0.6)'
                : 'rgba(255,255,255,0.15)',
              transition: 'color 0.4s',
            }}
          >
            {String(frameIdx + 1).padStart(3, '0')}/{String(FRAME_COUNT).padStart(3, '0')}
          </span>
        </div>
      </div>
    </div>
  );
});

HelmetHero.displayName = 'HelmetHero';
