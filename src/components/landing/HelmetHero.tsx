/**
 * HelmetHero — scroll-driven frame animation hero.
 * 
 * Layout: matches original Hero exactly (top headline, central visual, bottom chat input)
 * Visual: centered helmet canvas, contain-fit, full 121 frames @ 24fps enhanced
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

  // Canvas + animation refs
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef   = useRef<HTMLDivElement>(null);   // the sticky viewport
  const spacerRef = useRef<HTMLDivElement>(null);   // the 600vh scroll spacer

  const images      = useRef<(HTMLImageElement | null)[]>(new Array(FRAME_COUNT).fill(null));
  const rafId       = useRef(0);
  const curProgress = useRef(0);
  const tgtProgress = useRef(0);
  const lastIdx     = useRef(-1);

  const [frameIdx, setFrameIdx]   = useState(0);
  const [scrolled, setScrolled]   = useState(false);
  const [isBlinking, setIsBlinking] = useState(false);

  // ── Preload frames ──────────────────────────────────────────────────────────
  useEffect(() => {
    HELMET_FRAMES.forEach((src, i) => {
      const img = new Image();
      img.onload = () => {
        images.current[i] = img;
        if (i === 0) draw(0);
      };
      img.src = src;
    });
    return () => cancelAnimationFrame(rafId.current);
  }, []);

  // ── Draw: CONTAIN so full helmet is always visible, no crop ────────────────
  const draw = useCallback((idx: number) => {
    const canvas = canvasRef.current;
    const img    = images.current[idx];
    if (!canvas || !img) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const cw = canvas.width;
    const ch = canvas.height;
    const iw = img.naturalWidth  || 720;
    const ih = img.naturalHeight || 720;

    // contain: fit entire image inside canvas, centered
    const scale = Math.min(cw / iw, ch / ih);
    const dw = iw * scale;
    const dh = ih * scale;
    const dx = (cw - dw) / 2;
    const dy = (ch - dh) / 2;

    ctx.clearRect(0, 0, cw, ch);
    ctx.drawImage(img, dx, dy, dw, dh);
  }, []);

  // ── Sync canvas pixel size with CSS size ────────────────────────────────────
  const syncCanvas = useCallback(() => {
    const c = canvasRef.current;
    if (!c) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cssW = c.offsetWidth;
    const cssH = c.offsetHeight;
    if (c.width !== cssW * dpr || c.height !== cssH * dpr) {
      c.width  = cssW * dpr;
      c.height = cssH * dpr;
      const ctx = c.getContext('2d');
      if (ctx) ctx.scale(dpr, dpr);
    }
    draw(lastIdx.current >= 0 ? lastIdx.current : 0);
  }, [draw]);

  useEffect(() => {
    syncCanvas();
    const ro = new ResizeObserver(syncCanvas);
    if (canvasRef.current) ro.observe(canvasRef.current);
    return () => ro.disconnect();
  }, [syncCanvas]);

  // ── Scroll → progress ───────────────────────────────────────────────────────
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

  // ── RAF loop: lerp progress → frame ────────────────────────────────────────
  useEffect(() => {
    const tick = () => {
      rafId.current = requestAnimationFrame(tick);
      curProgress.current += (tgtProgress.current - curProgress.current) * 0.1;
      const idx = Math.round(curProgress.current * (FRAME_COUNT - 1));
      if (idx !== lastIdx.current) {
        lastIdx.current = idx;
        draw(idx);
        setFrameIdx(idx);
      }
    };
    rafId.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId.current);
  }, [draw]);

  // Blink callback for chat input
  const handlePlaceholderChange = useCallback(() => {
    setIsBlinking(true);
    setTimeout(() => setIsBlinking(false), 150);
  }, []);

  const progress = frameIdx / (FRAME_COUNT - 1);

  return (
    // 600vh spacer — provides the scroll distance
    <div ref={spacerRef} style={{ height: '600vh', position: 'relative' }}>

      {/* Sticky full-viewport panel */}
      <div
        ref={wrapRef}
        className="sticky top-0 w-full overflow-hidden"
        style={{ height: '100dvh' }}
      >
        {/* Gold progress bar */}
        <div
          className="absolute top-0 left-0 h-[2px] z-40 pointer-events-none"
          style={{
            width: `${progress * 100}%`,
            background: 'hsl(var(--primary))',
            boxShadow: '0 0 8px hsl(var(--primary)/0.5)',
            transition: 'width 0.05s linear',
          }}
        />

        {/* ── Same structure as original Hero ─────────────────────────────── */}
        <section
          className="relative w-full h-full flex flex-col items-center justify-between pt-20 md:pt-24 pb-6 md:pb-8 px-4 md:px-12 lg:px-24"
          aria-label="Hero"
        >
          {/* 1 — Headline (top, centered) — exact original copy */}
          <div className="w-full max-w-4xl text-center mb-4 md:mb-6 relative z-20">
            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
              className="font-display font-bold tracking-[-0.02em] text-foreground mb-2 md:mb-3 text-5xl sm:text-6xl md:text-7xl lg:text-8xl"
            >
              {language === 'ar'
                ? 'تعرّف على AYN'
                : language === 'fr'
                ? 'Découvrez AYN'
                : 'Meet AYN'}
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

          {/* 2 — Helmet canvas (center, replaces eye) */}
          <motion.div
            className="relative flex-1 flex items-center justify-center w-full max-w-5xl"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.25, ease: [0.22, 1, 0.36, 1] }}
          >
            {/* Subtle ambient glow behind helmet — matches old eye glow */}
            <div
              className="absolute rounded-full pointer-events-none -z-10"
              style={{
                width: 'min(70vw, 480px)',
                height: 'min(70vw, 480px)',
                background: 'radial-gradient(circle, hsl(var(--muted)/0.35) 0%, transparent 70%)',
                filter: 'blur(32px)',
              }}
            />

            {/* Canvas: square, perfectly centered, contain-fit */}
            <canvas
              ref={canvasRef}
              style={{
                width:  'min(80vw, 90vh, 520px)',
                height: 'min(80vw, 90vh, 520px)',
                display: 'block',
              }}
            />

            {/* Frame counter — bottom-right of canvas area */}
            <div className="absolute bottom-2 right-0 text-right pointer-events-none">
              <p
                style={{
                  fontFamily: 'monospace',
                  fontSize: '10px',
                  letterSpacing: '0.1em',
                  color: progress > 0.04 && progress < 0.96
                    ? 'hsl(var(--primary)/0.8)'
                    : 'hsl(var(--muted-foreground)/0.3)',
                  transition: 'color 0.4s',
                }}
              >
                {String(frameIdx + 1).padStart(3, '0')} / {String(FRAME_COUNT).padStart(3, '0')}
              </p>
            </div>
          </motion.div>

          {/* 3 — Chat input (bottom) — exact same as original Hero */}
          <LandingChatInput
            onSendAttempt={(message) => onGetStarted(message)}
            onPlaceholderChange={handlePlaceholderChange}
          />

          {/* Scroll hint (fades on scroll) */}
          <AnimatePresence>
            {!scrolled && (
              <motion.div
                key="scroll-hint"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ delay: 1, duration: 0.5 }}
                className="absolute bottom-24 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 pointer-events-none z-10"
              >
                <span
                  style={{
                    fontFamily: 'monospace',
                    fontSize: '9px',
                    letterSpacing: '0.3em',
                    textTransform: 'uppercase',
                    color: 'hsl(var(--muted-foreground)/0.5)',
                  }}
                >
                  {language === 'ar' ? 'مرر للأسفل' : 'Scroll'}
                </span>
                <motion.div
                  animate={{ y: [0, 6, 0] }}
                  transition={{ repeat: Infinity, duration: 1.6, ease: 'easeInOut' }}
                  style={{
                    width: '1px',
                    height: '32px',
                    background: 'linear-gradient(to bottom, hsl(var(--muted-foreground)/0.4), transparent)',
                  }}
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
