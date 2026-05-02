/**
 * HeroScroll — Apple-style scroll-driven frame animation.
 *
 * Frame order: 0 = full robot body (start), 120 = helmet close-up (end)
 * Never reversed. Forward only. Scroll back = rewinds naturally.
 *
 * Architecture:
 *   - 400vh sticky container
 *   - useScroll → scrollYProgress 0→1
 *   - useTransform maps 0→60% scroll to frames 0→120
 *   - useSpring smooths it (stiffness:600 damping:50) — cinematic feel
 *   - useMotionValueEvent drives img.src — zero React re-renders
 *   - Text chapters driven by direct DOM style writes
 *
 * Stages:
 *   0–15%   Hero intro: robot centered, headline visible
 *   15–60%  Transformation: frames scrub robot→helmet
 *   35–60%  Chapter 1: World Intelligence
 *   60–75%  Chapter 2: Predictive AI  
 *   75–90%  Chapter 3: AI Agents
 *   90–100% CTA
 */

import { useEffect, useRef, memo } from 'react';
import { useScroll, useTransform, useSpring, useMotionValueEvent } from 'framer-motion';
import { HELMET_FRAMES, FRAME_COUNT } from '@/assets/helmet-frames';
import { useLanguage } from '@/contexts/LanguageContext';

function clamp(v: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, v)); }
function lerp(v: number, a: number, b: number, c: number, d: number) {
  return c + (clamp(v, a, b) - a) / (b - a) * (d - c);
}

const CHAPTERS = [
  {
    label: 'WORLD INTELLIGENCE',
    title: 'See every market\nbefore it moves.',
    body: 'AYN monitors 187 countries — geopolitical shifts, commodity flows, and live market signals.',
    stat: '187', unit: 'Countries',
    in: 0.35, out: 0.58,
  },
  {
    label: 'PREDICTIVE AI',
    title: 'Know what happens\nbefore it does.',
    body: '73 AI agents simulate how populations, governments, and markets respond — before events unfold.',
    stat: '73', unit: 'World Agents',
    in: 0.60, out: 0.78,
  },
  {
    label: 'AI AGENTS',
    title: 'Your team.\nNever sleeps.',
    body: 'Custom agents trained on your data. Intelligence delivered 24/7, in Arabic and English.',
    stat: '24/7', unit: 'Always On',
    in: 0.80, out: 0.94,
  },
];

export const HeroScroll = memo(() => {
  const { language } = useLanguage();
  const isAr = language === 'ar';

  const containerRef  = useRef<HTMLDivElement>(null);
  const imgRef        = useRef<HTMLImageElement>(null);
  const imgCache      = useRef<HTMLImageElement[]>([]);
  const lastIdx       = useRef(0);

  // DOM refs for direct style writes — no re-renders
  const headlineRef   = useRef<HTMLDivElement>(null);
  const chRefs        = useRef<(HTMLDivElement | null)[]>([]);
  const ctaRef        = useRef<HTMLDivElement>(null);
  const scrollHintRef = useRef<HTMLDivElement>(null);

  // Preload all frames
  useEffect(() => {
    imgCache.current = HELMET_FRAMES.map((src) => {
      const img = new Image();
      img.src = src;
      return img;
    });
    // Immediately set frame 0 (robot) — no waiting
    if (imgRef.current) imgRef.current.src = HELMET_FRAMES[0];
    return () => { imgCache.current = []; };
  }, []);

  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ['start start', 'end end'],
  });

  // Map scroll 0→60% to frames 0→120
  const rawFrame = useTransform(scrollYProgress, [0, 0.60], [0, FRAME_COUNT - 1]);
  
  // Spring: high stiffness = responsive, damping = no overshoot
  const frame = useSpring(rawFrame, { stiffness: 600, damping: 50, restDelta: 0.3 });

  // Drive image from spring — pure DOM, 60fps
  useMotionValueEvent(frame, 'change', (v) => {
    const idx = clamp(Math.round(v), 0, FRAME_COUNT - 1);
    if (idx === lastIdx.current) return;
    lastIdx.current = idx;
    const cached = imgCache.current[idx];
    if (cached?.complete && imgRef.current) imgRef.current.src = cached.src;
  });

  // Drive all text layers from scroll progress — pure DOM
  useMotionValueEvent(scrollYProgress, 'change', (p) => {

    // Headline: visible at start, fades at 10–20%
    if (headlineRef.current) {
      const op = p < 0.10 ? 1 : lerp(p, 0.10, 0.22, 1, 0);
      const ty = lerp(p, 0.10, 0.22, 0, -48);
      headlineRef.current.style.opacity = `${op}`;
      headlineRef.current.style.transform = `translateY(${ty}px)`;
      headlineRef.current.style.pointerEvents = op < 0.05 ? 'none' : 'auto';
    }

    // Scroll hint: fades out immediately
    if (scrollHintRef.current) {
      scrollHintRef.current.style.opacity = `${lerp(p, 0, 0.06, 1, 0)}`;
    }

    // Chapter panels
    CHAPTERS.forEach((ch, i) => {
      const el = chRefs.current[i];
      if (!el) return;
      const peak = ch.in + (ch.out - ch.in) * 0.28;
      let op = 0, ty = 36;
      if (p >= ch.in && p <= ch.out) {
        op = p < peak ? lerp(p, ch.in, peak, 0, 1) : lerp(p, peak, ch.out, 1, 0);
        ty = p < peak ? lerp(p, ch.in, peak, 36, 0) : lerp(p, peak, ch.out, 0, -36);
      }
      el.style.opacity = `${op}`;
      el.style.transform = `translateY(${ty}px)`;
      el.style.pointerEvents = op < 0.05 ? 'none' : 'auto';
    });

    // CTA
    if (ctaRef.current) {
      const op = lerp(p, 0.92, 0.99, 0, 1);
      ctaRef.current.style.opacity = `${op}`;
      ctaRef.current.style.pointerEvents = op < 0.05 ? 'none' : 'auto';
    }
  });

  return (
    <div
      style={{ background: '#000', position: 'relative' }}
      aria-label="AYN scroll experience"
    >
      {/* 400vh scroll spacer */}
      <div ref={containerRef} style={{ height: '400vh', position: 'relative' }}>

        {/* Sticky viewport — stays pinned while spacer scrolls */}
        <div
          className="sticky top-0"
          style={{ height: '100dvh', overflow: 'hidden', background: '#000' }}
        >
          {/* Grid: left text | right image */}
          <div style={{
            position: 'absolute', inset: 0,
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            alignItems: 'center',
            padding: '80px clamp(32px, 5vw, 80px) 0',
            gap: 'clamp(24px, 4vw, 64px)',
          }}>

            {/* ── LEFT: text layers, all absolutely stacked ── */}
            <div style={{ position: 'relative', height: '100%', display: 'flex', alignItems: 'center' }}>
              <div style={{ position: 'relative', width: '100%', height: 'min(600px, 70vh)' }}>

                {/* HEADLINE */}
                <div
                  ref={headlineRef}
                  style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}
                >
                  <p style={{
                    fontFamily: "'DM Sans', sans-serif",
                    fontSize: 10, fontWeight: 500,
                    letterSpacing: '0.28em',
                    textTransform: 'uppercase',
                    color: 'rgba(255,255,255,0.28)',
                    margin: '0 0 18px',
                  }}>
                    {isAr ? 'ذكاء الأعمال' : 'World Intelligence Platform'}
                  </p>
                  <h1 style={{
                    fontFamily: "'Bebas Neue', sans-serif",
                    fontSize: 'clamp(60px, 7.5vw, 118px)',
                    fontWeight: 400,
                    lineHeight: 0.88,
                    color: '#fff',
                    margin: '0 0 24px',
                    letterSpacing: '-0.01em',
                  }}>
                    {isAr ? 'تعرّف على ' : 'Meet '}
                    <span style={{ color: '#C9A84C' }}>{isAr ? 'عين' : 'AYN'}</span>
                  </h1>
                  <p style={{
                    fontFamily: "'DM Sans', sans-serif",
                    fontSize: 15, fontWeight: 300, lineHeight: 1.72,
                    color: 'rgba(255,255,255,0.40)',
                    maxWidth: 360, margin: '0 0 40px',
                  }}>
                    {isAr
                      ? 'ذكاء أعمال حقيقي. أسواق، مخاطر، وقرارات تهم.'
                      : 'Real business intelligence. Watch AYN transform as you scroll — and discover what it sees.'}
                  </p>
                  {/* Scroll hint */}
                  <div ref={scrollHintRef} style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                    <div style={{ width: 32, height: 1, background: 'rgba(201,168,76,0.5)' }} />
                    <span style={{
                      fontFamily: "'DM Sans', sans-serif",
                      fontSize: 10, letterSpacing: '0.24em',
                      color: 'rgba(255,255,255,0.20)',
                      textTransform: 'uppercase',
                    }}>
                      Scroll to explore
                    </span>
                  </div>
                </div>

                {/* CHAPTERS */}
                {CHAPTERS.map((ch, i) => (
                  <div
                    key={i}
                    ref={el => { chRefs.current[i] = el; }}
                    style={{
                      position: 'absolute', inset: 0,
                      display: 'flex', flexDirection: 'column', justifyContent: 'center',
                      opacity: 0, pointerEvents: 'none',
                    }}
                  >
                    <p style={{
                      fontFamily: "'DM Sans', sans-serif",
                      fontSize: 9, fontWeight: 600,
                      letterSpacing: '0.32em', textTransform: 'uppercase',
                      color: '#C9A84C', margin: '0 0 16px',
                    }}>
                      {ch.label}
                    </p>
                    <h2 style={{
                      fontFamily: "'Bebas Neue', sans-serif",
                      fontSize: 'clamp(44px, 5.2vw, 82px)',
                      fontWeight: 400, lineHeight: 0.92,
                      color: '#fff', margin: '0 0 22px',
                      whiteSpace: 'pre-line',
                    }}>
                      {ch.title}
                    </h2>
                    <p style={{
                      fontFamily: "'DM Sans', sans-serif",
                      fontSize: 14, fontWeight: 300, lineHeight: 1.75,
                      color: 'rgba(255,255,255,0.44)',
                      maxWidth: 340, margin: '0 0 30px',
                    }}>
                      {ch.body}
                    </p>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
                      <span style={{
                        fontFamily: "'Bebas Neue', sans-serif",
                        fontSize: 'clamp(48px, 5.5vw, 76px)',
                        color: '#C9A84C', lineHeight: 1,
                      }}>
                        {ch.stat}
                      </span>
                      <span style={{
                        fontFamily: "'DM Sans', sans-serif",
                        fontSize: 10, letterSpacing: '0.22em',
                        color: 'rgba(255,255,255,0.25)',
                        textTransform: 'uppercase',
                      }}>
                        {ch.unit}
                      </span>
                    </div>
                  </div>
                ))}

                {/* CTA */}
                <div
                  ref={ctaRef}
                  style={{
                    position: 'absolute', inset: 0,
                    display: 'flex', flexDirection: 'column', justifyContent: 'center',
                    opacity: 0, pointerEvents: 'none',
                  }}
                >
                  <p style={{
                    fontFamily: "'DM Sans', sans-serif",
                    fontSize: 9, letterSpacing: '0.30em',
                    textTransform: 'uppercase',
                    color: 'rgba(255,255,255,0.20)', margin: '0 0 14px',
                  }}>
                    Ready to see the world clearly?
                  </p>
                  <h2 style={{
                    fontFamily: "'Bebas Neue', sans-serif",
                    fontSize: 'clamp(48px, 5.8vw, 90px)',
                    fontWeight: 400, lineHeight: 0.88,
                    color: '#fff', margin: '0 0 34px',
                  }}>
                    Start with <span style={{ color: '#C9A84C' }}>AYN</span>
                  </h2>
                  <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                    <a
                      href="/pricing"
                      style={{
                        display: 'inline-flex', alignItems: 'center',
                        padding: '13px 36px',
                        background: '#C9A84C', color: '#000',
                        fontFamily: "'DM Sans', sans-serif",
                        fontSize: 11, fontWeight: 700,
                        letterSpacing: '0.14em', textTransform: 'uppercase',
                        textDecoration: 'none',
                        transition: 'transform 0.25s cubic-bezier(0.16,1,0.3,1)',
                      }}
                      onMouseEnter={e => (e.currentTarget.style.transform = 'scale(1.04)')}
                      onMouseLeave={e => (e.currentTarget.style.transform = 'scale(1)')}
                    >
                      Get Started Free →
                    </a>
                    <a
                      href="/features"
                      style={{
                        display: 'inline-flex', alignItems: 'center',
                        padding: '13px 32px',
                        border: '1px solid rgba(255,255,255,0.14)',
                        color: 'rgba(255,255,255,0.52)',
                        fontFamily: "'DM Sans', sans-serif",
                        fontSize: 11, fontWeight: 400,
                        letterSpacing: '0.14em', textTransform: 'uppercase',
                        textDecoration: 'none',
                        transition: 'all 0.2s',
                      }}
                      onMouseEnter={e => {
                        e.currentTarget.style.borderColor = 'rgba(255,255,255,0.4)';
                        e.currentTarget.style.color = '#fff';
                      }}
                      onMouseLeave={e => {
                        e.currentTarget.style.borderColor = 'rgba(255,255,255,0.14)';
                        e.currentTarget.style.color = 'rgba(255,255,255,0.52)';
                      }}
                    >
                      See Features
                    </a>
                  </div>
                </div>

              </div>
            </div>

            {/* ── RIGHT: image — seamless black blend ── */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
              position: 'relative',
            }}>
              <img
                ref={imgRef}
                alt="AYN"
                draggable={false}
                style={{
                  width: '100%',
                  maxWidth: 'min(50vw, 720px)',
                  height: 'calc(100dvh - 80px)',
                  objectFit: 'contain',
                  objectPosition: 'center center',
                  display: 'block',
                  userSelect: 'none',
                  position: 'relative', zIndex: 1,
                  mixBlendMode: 'lighten',
                }}
              />
            </div>

          </div>

          {/* Bottom hairline */}
          <div style={{
            position: 'absolute', bottom: 0,
            left: '8%', right: '8%', height: 1,
            background: 'linear-gradient(to right, transparent, rgba(201,168,76,0.10), transparent)',
          }} />

        </div>
      </div>
    </div>
  );
});

HeroScroll.displayName = 'HeroScroll';
