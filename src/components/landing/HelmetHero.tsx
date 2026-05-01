/**
 * HelmetHero — scroll to assemble the helmet.
 * Headline top-left, helmet center (smaller), chat pinned bottom. No scroll text.
 */

import { useEffect, useRef, useState, useCallback, memo } from 'react';
import { motion } from 'framer-motion';
import { HELMET_FRAMES, FRAME_COUNT } from '@/assets/helmet-frames';
import { useLanguage } from '@/contexts/LanguageContext';


interface HelmetHeroProps {}

export const HelmetHero = memo(({}: HelmetHeroProps) => {
  const { language } = useLanguage();
  const spacerRef   = useRef<HTMLDivElement>(null);
  const imgRef      = useRef<HTMLImageElement>(null);
  const cache       = useRef<HTMLImageElement[]>([]);
  const rafId       = useRef(0);
  const curProgress = useRef(0);
  const tgtProgress = useRef(0);
  const lastIdx     = useRef(-1);
  const [frameIdx, setFrameIdx] = useState(0);

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
      curProgress.current += (tgtProgress.current - curProgress.current) * 0.06;
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
              width:     'min(75vw, 75vh, 620px)',
              height:    'min(75vw, 75vh, 620px)',
              objectFit: 'contain',
              display:   'block',
              userSelect: 'none',
              pointerEvents: 'none',
            }}
            draggable={false}
          />
        </div>

        {/* HEADLINE — centered, left-aligned text, dark gradient bg */}
        <div
          className="absolute left-0 right-0 z-20 px-8 md:px-16"
          style={{ top: '88px' }}
        >
          {/* Dark gradient so text always readable over video */}
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background: 'linear-gradient(to bottom, rgba(0,0,0,0.72) 0%, rgba(0,0,0,0.4) 60%, transparent 100%)',
              zIndex: -1,
            }}
          />
          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
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
              className="mt-3 text-sm md:text-base font-light max-w-[320px] leading-relaxed"
              style={{ color: 'rgba(255,255,255,0.45)' }}
            >
              {language === 'ar'
                ? 'ذكاء أعمال حقيقي يتابع الأسواق، يحلل المخاطر.'
                : language === 'fr'
                ? "Intelligence d'affaires réelle."
                : 'Real business intelligence. Markets, risks, and decisions that matter.'}
            </p>
          </motion.div>
        </div>




      </div>
    </div>
  );
});

HelmetHero.displayName = 'HelmetHero';
