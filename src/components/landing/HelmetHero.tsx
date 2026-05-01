/**
 * HelmetHero — scroll to assemble the helmet.
 * Headline top-left, helmet center (smaller), chat pinned bottom. No scroll text.
 */

import { useEffect, useRef, useState, useCallback, memo } from 'react';
import { motion } from 'framer-motion';
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
  const cache       = useRef<HTMLImageElement[]>([]);
  const rafId       = useRef(0);
  const curProgress = useRef(0);
  const tgtProgress = useRef(0);
  const lastIdx     = useRef(-1);
  const [frameIdx, setFrameIdx] = useState(0);
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
      <div className="sticky top-0 w-full" style={{ height: '100dvh', background: '#000', overflow: 'hidden' }}>

        {/* Progress bar */}
        <div
          className="absolute top-0 left-0 h-[2px] z-50"
          style={{ width: `${progress * 100}%`, background: 'hsl(var(--primary))', transition: 'width 0.05s linear' }}
        />

        {/* HELMET — centered, smaller so headline has room */}
        <div
          className="absolute inset-0 flex items-center justify-center"
          style={{ top: '60px', bottom: '130px' }}
        >
          <img
            ref={imgRef}
            src={HELMET_FRAMES[0]}
            alt="AYN"
            style={{
              width:     'min(52vw, 52vh, 420px)',
              height:    'min(52vw, 52vh, 420px)',
              objectFit: 'contain',
              display:   'block',
              userSelect: 'none',
              pointerEvents: 'none',
            }}
            draggable={false}
          />
        </div>

        {/* HEADLINE — top left, doesn't overlap helmet */}
        <div
          className="absolute left-8 md:left-16 z-20"
          style={{ top: '88px' }}
        >
          <motion.div
            initial={{ opacity: 0, x: -16 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
          >
            <p
              className="text-[10px] tracking-[0.25em] uppercase mb-2 font-medium"
              style={{ color: 'rgba(255,255,255,0.35)', fontFamily: 'monospace' }}
            >
              {language === 'ar' ? 'ذكاء الأعمال' : 'World Intelligence'}
            </p>
            <h1
              className="font-display font-bold tracking-[-0.02em] text-white leading-none"
              style={{ fontSize: 'clamp(40px, 5.5vw, 80px)' }}
            >
              {language === 'ar' ? 'تعرّف على' : language === 'fr' ? 'Découvrez' : 'Meet'}
              <br />
              <span style={{ color: 'hsl(var(--primary))' }}>AYN</span>
            </h1>
            <p
              className="mt-3 text-sm md:text-base font-light max-w-[220px] md:max-w-[280px] leading-relaxed"
              style={{ color: 'rgba(255,255,255,0.4)' }}
            >
              {language === 'ar'
                ? 'ذكاء أعمال حقيقي يتابع الأسواق، يحلل المخاطر.'
                : language === 'fr'
                ? "Intelligence d'affaires réelle."
                : 'Real business intelligence. Markets, risks, and decisions that matter.'}
            </p>
          </motion.div>
        </div>

        {/* Frame counter — bottom right, subtle */}
        <div className="absolute bottom-[138px] right-6 z-20 pointer-events-none">
          <span
            className="text-[9px] tabular-nums tracking-widest font-mono"
            style={{
              color: progress > 0.04 && progress < 0.96 ? 'hsl(var(--primary)/0.5)' : 'rgba(255,255,255,0.12)',
              transition: 'color 0.4s',
            }}
          >
            {String(frameIdx + 1).padStart(3, '0')}/{String(FRAME_COUNT).padStart(3, '0')}
          </span>
        </div>

        {/* CHAT INPUT — pinned bottom, single box */}
        <div className="absolute left-0 right-0 z-20 px-4" style={{ bottom: '16px' }}>
          <motion.div
            initial={{ opacity: 0, y: 10 }}
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
      </div>
    </div>
  );
});

HelmetHero.displayName = 'HelmetHero';
