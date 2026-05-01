/**
 * HelmetHero — scroll-driven frame animation replacing the CSS eye.
 *
 * Architecture:
 *  - Renders a sticky scroll-scrubber section (600vh tall)
 *  - Preloads all 61 frames into Image objects on mount
 *  - Uses requestAnimationFrame for smooth lerp between scroll position → frame index
 *  - Canvas rendering via native 2D context (no Three.js dependency needed in React)
 *  - Chromatic aberration pulse shader effect via CSS filter on canvas
 *  - After scroll section ends, the rest of the page continues normally
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
  const loadedRef = useRef(0);
  const rafRef = useRef<number>(0);
  const currentProgressRef = useRef(0);
  const targetProgressRef = useRef(0);
  const lastFrameRef = useRef(-1);
  const [frameIndex, setFrameIndex] = useState(0);
  const [scrolled, setScrolled] = useState(false);
  const [allLoaded, setAllLoaded] = useState(false);

  // ── Preload all frames ──────────────────────────────────────────────────────
  useEffect(() => {
    imagesRef.current = new Array(FRAME_COUNT).fill(null);
    loadedRef.current = 0;

    HELMET_FRAMES.forEach((src, i) => {
      const img = new Image();
      img.onload = () => {
        imagesRef.current[i] = img;
        loadedRef.current += 1;
        if (i === 0) drawFrame(0); // show first frame immediately
        if (loadedRef.current === FRAME_COUNT) setAllLoaded(true);
      };
      img.src = src;
    });

    return () => {
      cancelAnimationFrame(rafRef.current);
    };
  }, []);

  // ── Draw a specific frame onto the canvas ───────────────────────────────────
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

    // Cover-fit: maintain aspect, center-crop
    const scale = Math.max(cw / iw, ch / ih);
    const sw = iw * scale;
    const sh = ih * scale;
    const sx = (cw - sw) / 2;
    const sy = (ch - sh) / 2;

    ctx.clearRect(0, 0, cw, ch);
    ctx.drawImage(img, sx, sy, sw, sh);
  }, []);

  // ── Resize canvas to match container ───────────────────────────────────────
  const resizeCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = canvas.offsetWidth * dpr;
    canvas.height = canvas.offsetHeight * dpr;
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

  // ── Animation loop with lerp ────────────────────────────────────────────────
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

  // Progress percentage for bar
  const progressPct = frameIndex / (FRAME_COUNT - 1);

  return (
    <div ref={containerRef} style={{ height: '600vh', position: 'relative' }}>
      {/* Sticky viewport */}
      <div
        className="sticky top-0 w-full overflow-hidden"
        style={{ height: '100vh' }}
      >
        {/* ── Background gradient */}
        <div
          className="absolute inset-0 z-0"
          style={{
            background: `
              radial-gradient(ellipse 80% 55% at 50% 110%, rgba(255,140,60,0.07) 0%, transparent 65%),
              radial-gradient(ellipse 50% 70% at 85% -5%, rgba(60,80,255,0.04) 0%, transparent 60%),
              linear-gradient(165deg, #08080f 0%, #020203 55%, #0a0608 100%)
            `,
          }}
        />

        {/* Grain overlay */}
        <div
          className="absolute inset-0 z-0 pointer-events-none opacity-20"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='1'/%3E%3C/svg%3E")`,
          }}
        />

        {/* Progress bar */}
        <div
          className="absolute top-0 left-0 h-[2px] z-30 transition-all duration-75"
          style={{
            width: `${progressPct * 100}%`,
            background: 'linear-gradient(90deg, #ff8c00, #ffd700)',
            boxShadow: '0 0 12px rgba(255,180,0,0.8), 0 0 4px rgba(255,200,0,0.6)',
          }}
        />

        {/* ── Main canvas — helmet frames */}
        <canvas
          ref={canvasRef}
          className="absolute inset-0 w-full h-full z-10"
          style={{
            filter: scrolled
              ? `brightness(1.05) contrast(1.02)`
              : 'brightness(1)',
            transition: 'filter 0.3s ease',
          }}
        />

        {/* Radial vignette */}
        <div
          className="absolute inset-0 z-20 pointer-events-none"
          style={{
            background: 'radial-gradient(ellipse at center, transparent 35%, rgba(2,2,3,0.75) 100%)',
          }}
        />

        {/* ── Headline — top left */}
        <div className="absolute top-24 left-6 md:left-12 z-30">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
          >
            <p
              className="text-[10px] tracking-[0.3em] uppercase mb-2 font-medium"
              style={{ color: '#ffd700', fontFamily: 'DM Mono, monospace' }}
            >
              {language === 'ar' ? 'مرحبًا بك في عين' : 'World Intelligence'}
            </p>
            <h1
              className="font-bold leading-[0.88] text-white"
              style={{
                fontFamily: "'Bebas Neue', 'Arial Black', sans-serif",
                fontSize: 'clamp(52px, 8vw, 108px)',
                letterSpacing: '-0.01em',
              }}
            >
              {language === 'ar' ? (
                <>
                  <span>عين</span><br />
                  <span style={{ color: '#ffd700' }}>يرى</span>
                </>
              ) : (
                <>
                  SEE<br />
                  <span style={{ color: '#ffd700' }}>BEYOND</span>
                </>
              )}
            </h1>
          </motion.div>
        </div>

        {/* ── Subheadline — bottom left */}
        <div className="absolute bottom-20 left-6 md:left-12 z-30 max-w-xs">
          <motion.p
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.35, ease: [0.22, 1, 0.36, 1] }}
            className="text-sm md:text-base font-light leading-relaxed"
            style={{ color: 'rgba(255,255,255,0.55)' }}
          >
            {language === 'ar'
              ? 'ذكاء أعمال حقيقي. أسواق، مخاطر، وقرارات.'
              : 'Real business intelligence. Markets, risks, and decisions that matter.'}
          </motion.p>

          <motion.button
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.5 }}
            onClick={() => onGetStarted()}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className="mt-5 inline-flex items-center gap-3 text-xs font-medium tracking-[0.2em] uppercase"
            style={{
              padding: '12px 28px',
              background: '#ffd700',
              color: '#020203',
              letterSpacing: '0.2em',
            }}
          >
            {language === 'ar' ? 'ابدأ الآن' : 'Get Started'}
            <span style={{ fontSize: '14px' }}>→</span>
          </motion.button>
        </div>

        {/* ── Frame counter — bottom right */}
        <div className="absolute bottom-20 right-6 md:right-12 z-30 text-right">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.6 }}
          >
            <p
              className="text-[11px] tracking-[0.15em] tabular-nums"
              style={{
                color: progressPct > 0.05 && progressPct < 0.95 ? '#ffd700' : 'rgba(255,255,255,0.3)',
                fontFamily: 'DM Mono, monospace',
                transition: 'color 0.3s',
              }}
            >
              {String(frameIndex + 1).padStart(3, '0')} / {String(FRAME_COUNT).padStart(3, '0')}
            </p>
            <p
              className="text-[9px] tracking-[0.2em] uppercase mt-1"
              style={{ color: 'rgba(255,255,255,0.2)', fontFamily: 'DM Mono, monospace' }}
            >
              {language === 'ar' ? 'مرر للأسفل' : 'Scroll to explore'}
            </p>
          </motion.div>
        </div>

        {/* ── Scroll hint arrow — bottom center */}
        <AnimatePresence>
          {!scrolled && (
            <motion.div
              key="scroll-hint"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ delay: 0.8, duration: 0.4 }}
              className="absolute bottom-8 left-1/2 -translate-x-1/2 z-30 flex flex-col items-center gap-2"
            >
              <span
                className="text-[9px] tracking-[0.3em] uppercase"
                style={{ color: 'rgba(255,255,255,0.3)', fontFamily: 'DM Mono, monospace' }}
              >
                {language === 'ar' ? 'مرر' : 'Scroll'}
              </span>
              <motion.div
                animate={{ y: [0, 6, 0] }}
                transition={{ repeat: Infinity, duration: 1.6, ease: 'easeInOut' }}
                style={{
                  width: '1px',
                  height: '36px',
                  background: 'linear-gradient(to bottom, rgba(255,255,255,0.4), transparent)',
                }}
              />
            </motion.div>
          )}
        </AnimatePresence>

        {/* AYN wordmark — top right */}
        <motion.div
          className="absolute top-6 right-6 md:right-12 z-30"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
        >
          <span
            className="text-white font-bold tracking-[0.08em]"
            style={{
              fontFamily: "'Bebas Neue', sans-serif",
              fontSize: '22px',
              opacity: 0.6,
            }}
          >
            AYN
          </span>
        </motion.div>
      </div>
    </div>
  );
});

HelmetHero.displayName = 'HelmetHero';
