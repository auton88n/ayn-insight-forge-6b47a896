/**
 * HelmetHero — scroll-driven frame animation replacing the CSS eye.
 * Canvas is centered (not full-bleed). Original AYN wording restored.
 */

import { useEffect, useRef, useState, useCallback, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { HELMET_FRAMES, FRAME_COUNT } from '@/assets/helmet-frames';
import { useLanguage } from '@/contexts/LanguageContext';

interface HelmetHeroProps {
  onGetStarted: (prefillMessage?: string) => void;
}

export const HelmetHero = memo(({ onGetStarted }: HelmetHeroProps) => {
  const { language } = useLanguage();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const imagesRef = useRef<(HTMLImageElement | null)[]>(new Array(FRAME_COUNT).fill(null));
  const rafRef = useRef<number>(0);
  const currentProgressRef = useRef(0);
  const targetProgressRef = useRef(0);
  const lastFrameRef = useRef(-1);
  const [frameIndex, setFrameIndex] = useState(0);
  const [scrolled, setScrolled] = useState(false);

  // ── Preload all frames ──────────────────────────────────────────────────────
  useEffect(() => {
    imagesRef.current = new Array(FRAME_COUNT).fill(null);

    HELMET_FRAMES.forEach((src, i) => {
      const img = new Image();
      img.onload = () => {
        imagesRef.current[i] = img;
        if (i === 0) drawFrame(0);
      };
      img.src = src;
    });

    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  // ── Draw frame — contain (not cover) so full helmet is always visible ───────
  const drawFrame = useCallback((idx: number) => {
    const canvas = canvasRef.current;
    const img = imagesRef.current[idx];
    if (!canvas || !img) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const cw = canvas.width;
    const ch = canvas.height;
    const iw = img.naturalWidth;
    const ih = img.naturalHeight;

    ctx.clearRect(0, 0, cw, ch);

    // CONTAIN: scale down to fit, center — helmet always fully visible
    const scale = Math.min(cw / iw, ch / ih);
    const sw = iw * scale;
    const sh = ih * scale;
    const sx = (cw - sw) / 2;
    const sy = (ch - sh) / 2;

    ctx.drawImage(img, sx, sy, sw, sh);
  }, []);

  // ── Resize canvas — fixed square centered in viewport ──────────────────────
  const resizeCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    // Use CSS size set by the element itself
    const cssW = canvas.offsetWidth;
    const cssH = canvas.offsetHeight;
    canvas.width = cssW * dpr;
    canvas.height = cssH * dpr;
    const ctx = canvas.getContext('2d');
    if (ctx) ctx.scale(dpr, dpr);
    drawFrame(lastFrameRef.current >= 0 ? lastFrameRef.current : 0);
  }, [drawFrame]);

  useEffect(() => {
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    return () => window.removeEventListener('resize', resizeCanvas);
  }, [resizeCanvas]);

  // ── Scroll handler ──────────────────────────────────────────────────────────
  const onScroll = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const scrolled = -rect.top;
    const total = container.offsetHeight - window.innerHeight;
    const p = Math.max(0, Math.min(1, scrolled / total));
    targetProgressRef.current = p;
    setScrolled(p > 0.02);
  }, []);

  useEffect(() => {
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [onScroll]);

  // ── Animation loop ──────────────────────────────────────────────────────────
  useEffect(() => {
    const animate = () => {
      rafRef.current = requestAnimationFrame(animate);
      currentProgressRef.current += (targetProgressRef.current - currentProgressRef.current) * 0.1;
      const idx = Math.round(currentProgressRef.current * (FRAME_COUNT - 1));
      if (idx !== lastFrameRef.current) {
        lastFrameRef.current = idx;
        drawFrame(idx);
        setFrameIndex(idx);
      }
    };
    rafRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafRef.current);
  }, [drawFrame]);

  const progressPct = frameIndex / (FRAME_COUNT - 1);

  return (
    <div ref={containerRef} style={{ height: '600vh', position: 'relative' }}>
      {/* Sticky viewport */}
      <div
        className="sticky top-0 w-full overflow-hidden flex flex-col items-center justify-between"
        style={{ height: '100dvh', paddingTop: '80px', paddingBottom: '32px' }}
      >
        {/* ── Background — match site's existing bg */}
        <div className="absolute inset-0 z-0 bg-background" />

        {/* Subtle radial glow behind helmet */}
        <div
          className="absolute inset-0 z-0 pointer-events-none"
          style={{
            background: 'radial-gradient(ellipse 60% 60% at 50% 55%, hsl(var(--muted)/0.4) 0%, transparent 70%)',
          }}
        />

        {/* Gold progress bar */}
        <div
          className="absolute top-0 left-0 h-[2px] z-30"
          style={{
            width: `${progressPct * 100}%`,
            background: 'hsl(var(--primary))',
            boxShadow: '0 0 8px hsl(var(--primary)/0.6)',
            transition: 'width 0.06s linear',
          }}
        />

        {/* ── Headline — top center, original wording */}
        <div className="relative z-20 w-full max-w-4xl text-center px-4">
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

        {/* ── Helmet canvas — centered square, contained */}
        <motion.div
          className="relative z-10 flex items-center justify-center"
          style={{ flex: 1, width: '100%', maxWidth: '640px', padding: '16px 0' }}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.25, ease: [0.22, 1, 0.36, 1] }}
        >
          {/* Subtle glow ring */}
          <div
            className="absolute rounded-full pointer-events-none"
            style={{
              width: 'min(70vw, 480px)',
              height: 'min(70vw, 480px)',
              background: 'radial-gradient(circle, hsl(var(--muted)/0.3) 0%, transparent 70%)',
              filter: 'blur(24px)',
            }}
          />

          <canvas
            ref={canvasRef}
            style={{
              width: 'min(80vw, 520px)',
              height: 'min(80vw, 520px)',
              display: 'block',
              position: 'relative',
              zIndex: 1,
            }}
          />

          {/* Frame counter — bottom right of canvas */}
          <div
            className="absolute bottom-0 right-4 text-right"
            style={{ zIndex: 2 }}
          >
            <p
              className="text-[10px] tabular-nums"
              style={{
                color: progressPct > 0.05 && progressPct < 0.95
                  ? 'hsl(var(--primary))'
                  : 'hsl(var(--muted-foreground)/0.4)',
                fontFamily: 'monospace',
                letterSpacing: '0.1em',
                transition: 'color 0.3s',
              }}
            >
              {String(frameIndex + 1).padStart(3, '0')} / {String(FRAME_COUNT).padStart(3, '0')}
            </p>
          </div>
        </motion.div>

        {/* ── Scroll hint — bottom center */}
        <AnimatePresence>
          {!scrolled && (
            <motion.div
              key="hint"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ delay: 0.9, duration: 0.4 }}
              className="relative z-20 flex flex-col items-center gap-2 pb-2"
            >
              <span
                className="text-[9px] tracking-[0.3em] uppercase text-muted-foreground"
                style={{ fontFamily: 'monospace' }}
              >
                {language === 'ar' ? 'مرر' : 'Scroll'}
              </span>
              <motion.div
                animate={{ y: [0, 6, 0] }}
                transition={{ repeat: Infinity, duration: 1.6, ease: 'easeInOut' }}
                style={{
                  width: '1px',
                  height: '32px',
                  background: 'linear-gradient(to bottom, hsl(var(--muted-foreground)/0.5), transparent)',
                }}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
});

HelmetHero.displayName = 'HelmetHero';
