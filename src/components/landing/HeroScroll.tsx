/**
 * HeroScroll — Professional scroll-driven frame animation.
 * 
 * Design system (from ui-ux-pro-max skill):
 *   Style:      Modern Dark Cinema
 *   Colors:     #020203 deep black, #0a0a0f elevated, accent #C9A84C (gold)
 *   Typography: Bebas Neue (headlines) + DM Sans (body)
 *   Animation:  cubic-bezier(0.16,1,0.3,1) easing, Framer Motion useScroll
 * 
 * Architecture:
 *   - 400vh sticky container
 *   - useScroll tracks scroll progress 0→1
 *   - useTransform maps progress → frame index (0→120)
 *   - useSpring smooths frame index for organic feel
 *   - RAF reads spring value, swaps img.src every frame
 *   - 3 feature chapters revealed via opacity transforms
 */

import { useEffect, useRef, memo } from 'react';
import { useScroll, useTransform, useSpring, useMotionValueEvent } from 'framer-motion';
import { HELMET_FRAMES, FRAME_COUNT } from '@/assets/helmet-frames';
import { useLanguage } from '@/contexts/LanguageContext';

interface Chapter {
  label: string;
  title: string;
  sub: string;
  stat: string;
  statLabel: string;
  scrollStart: number;
  scrollEnd: number;
}

const CHAPTERS: Chapter[] = [
  {
    label: 'WORLD INTELLIGENCE',
    title: 'See every market\nbefore it moves.',
    sub: 'AYN monitors 187 countries — geopolitical shifts, commodity flows, and market signals — in real time.',
    stat: '187',
    statLabel: 'Countries tracked',
    scrollStart: 0.35,
    scrollEnd: 0.55,
  },
  {
    label: 'PREDICTIVE AI',
    title: 'Know what happens\nbefore it does.',
    sub: '73 AI agents simulate how populations, governments, and markets will respond — before events unfold.',
    stat: '73',
    statLabel: 'World agents',
    scrollStart: 0.55,
    scrollEnd: 0.75,
  },
  {
    label: 'AI AGENTS',
    title: 'Your team.\nNever sleeps.',
    sub: 'Custom agents trained on your data deliver intelligence 24/7. In Arabic and English.',
    stat: '24/7',
    statLabel: 'Always on',
    scrollStart: 0.75,
    scrollEnd: 0.95,
  },
];

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}
function mapTo(v: number, a: number, b: number, c: number, d: number) {
  return c + (clamp(v, a, b) - a) / (b - a) * (d - c);
}

// Preload all frames immediately — critical for smooth scrubbing
const preloaded: HTMLImageElement[] = HELMET_FRAMES.map((src) => {
  const img = new Image();
  img.src = src;
  return img;
});

export const HeroScroll = memo(() => {
  const { language } = useLanguage();
  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const lastIdx = useRef(0);

  // Chapter refs for direct DOM opacity (no re-renders)
  const chapterRefs = useRef<(HTMLDivElement | null)[]>([]);
  const headlineRef = useRef<HTMLDivElement>(null);
  const ctaRef = useRef<HTMLDivElement>(null);

  // Framer Motion scroll tracking
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ['start start', 'end end'],
  });

  // Map scroll 0→0.5 to frames 0→120 (first half assembles the helmet)
  const rawFrame = useTransform(scrollYProgress, [0, 0.50], [0, FRAME_COUNT - 1]);

  // Spring for organic, weighted feel — stiffness/damping tuned for frame scrubbing
  const smoothFrame = useSpring(rawFrame, {
    stiffness: 400,
    damping: 40,
    restDelta: 0.5,
  });

  // Drive img.src from spring value — no React re-renders
  useMotionValueEvent(smoothFrame, 'change', (latest) => {
    const idx = clamp(Math.round(latest), 0, FRAME_COUNT - 1);
    if (idx !== lastIdx.current) {
      lastIdx.current = idx;
      const cached = preloaded[idx];
      if (cached?.complete && imgRef.current) {
        imgRef.current.src = cached.src;
      }
    }
  });

  // Drive chapter opacity/transform from scroll — direct DOM, no React re-renders
  useMotionValueEvent(scrollYProgress, 'change', (p) => {
    // Headline fades out as scroll begins
    if (headlineRef.current) {
      const op = p < 0.12 ? 1 : mapTo(p, 0.12, 0.28, 1, 0);
      const ty = mapTo(p, 0.12, 0.28, 0, -40);
      headlineRef.current.style.opacity = String(op);
      headlineRef.current.style.transform = `translateY(${ty}px)`;
    }

    // Each chapter panel
    CHAPTERS.forEach((ch, i) => {
      const el = chapterRefs.current[i];
      if (!el) return;
      const { scrollStart: s, scrollEnd: e } = ch;
      const peak = s + (e - s) * 0.3;
      let op = 0;
      let ty = 30;
      if (p >= s && p <= e) {
        if (p < peak) {
          op = mapTo(p, s, peak, 0, 1);
          ty = mapTo(p, s, peak, 30, 0);
        } else {
          op = mapTo(p, peak, e, 1, 0);
          ty = mapTo(p, peak, e, 0, -30);
        }
      }
      el.style.opacity = String(op);
      el.style.transform = `translateY(${ty}px)`;
    });

    // CTA fades in at the end
    if (ctaRef.current) {
      const op = mapTo(p, 0.88, 0.98, 0, 1);
      ctaRef.current.style.opacity = String(op);
      ctaRef.current.style.pointerEvents = op > 0.1 ? 'auto' : 'none';
    }
  });

  const isAr = language === 'ar';

  return (
    <>
      {/* Ambient background blobs — positioned fixed behind everything */}
      <div aria-hidden className="fixed inset-0 pointer-events-none z-0" style={{ background: '#020203' }}>
        <div style={{
          position: 'absolute', top: '20%', left: '15%',
          width: 600, height: 600, borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(201,168,76,0.06) 0%, transparent 70%)',
          animation: 'blob1 18s ease-in-out infinite alternate',
        }} />
        <div style={{
          position: 'absolute', bottom: '10%', right: '10%',
          width: 500, height: 500, borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(94,106,210,0.05) 0%, transparent 70%)',
          animation: 'blob2 22s ease-in-out infinite alternate',
        }} />
        <style>{`
          @keyframes blob1 { from { transform: translate(0,0) scale(1); } to { transform: translate(60px,40px) scale(1.15); } }
          @keyframes blob2 { from { transform: translate(0,0) scale(1); } to { transform: translate(-50px,60px) scale(1.1); } }
        `}</style>
      </div>

      {/* ── SCROLL CONTAINER — 400vh gives ample scroll per chapter ── */}
      <div
        ref={containerRef}
        style={{ height: '400vh', position: 'relative', zIndex: 1 }}
      >
        {/* Sticky viewport */}
        <div
          className="sticky top-0 overflow-hidden"
          style={{ height: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          {/* Grid: left text | right image */}
          <div style={{
            width: '100%', maxWidth: 1280,
            padding: '0 48px',
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            alignItems: 'center',
            gap: 64,
            position: 'relative',
          }}>

            {/* ── LEFT COLUMN ── */}
            <div style={{ position: 'relative', minHeight: '60vh', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>

              {/* Hero headline — visible on load, fades out on scroll */}
              <div
                ref={headlineRef}
                style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', transition: 'none' }}
              >
                <p style={{
                  fontFamily: "'DM Sans', sans-serif",
                  fontSize: 11, fontWeight: 500,
                  letterSpacing: '0.25em', textTransform: 'uppercase',
                  color: 'rgba(255,255,255,0.35)', marginBottom: 20,
                }}>
                  {isAr ? 'ذكاء الأعمال' : 'World Intelligence Platform'}
                </p>
                <h1 style={{
                  fontFamily: "'Bebas Neue', sans-serif",
                  fontSize: 'clamp(64px, 7vw, 112px)',
                  fontWeight: 400,
                  lineHeight: 0.92,
                  letterSpacing: '-0.01em',
                  color: '#EDEDEF',
                  margin: 0,
                }}>
                  {isAr ? 'تعرّف\nعلى' : 'Meet\n'}
                  <span style={{ color: '#C9A84C' }}>
                    {isAr ? ' عين' : 'AYN'}
                  </span>
                </h1>
                <p style={{
                  fontFamily: "'DM Sans', sans-serif",
                  fontSize: 16, fontWeight: 300, lineHeight: 1.7,
                  color: 'rgba(255,255,255,0.45)',
                  marginTop: 24, maxWidth: 380,
                }}>
                  {isAr
                    ? 'ذكاء أعمال حقيقي. أسواق، مخاطر، وقرارات تهم.'
                    : 'Real business intelligence. Scroll to see AYN assemble — and understand what it can do.'}
                </p>
                <div style={{ marginTop: 40, display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ width: 32, height: 1, background: '#C9A84C', opacity: 0.6 }} />
                  <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, letterSpacing: '0.2em', color: 'rgba(255,255,255,0.25)', textTransform: 'uppercase' }}>
                    Scroll to explore
                  </span>
                </div>
              </div>

              {/* Chapter panels — stacked, opacity-driven */}
              {CHAPTERS.map((ch, i) => (
                <div
                  key={i}
                  ref={(el) => { chapterRefs.current[i] = el; }}
                  style={{
                    position: 'absolute', inset: 0,
                    display: 'flex', flexDirection: 'column', justifyContent: 'center',
                    opacity: 0, pointerEvents: 'none',
                  }}
                >
                  <p style={{
                    fontFamily: "'DM Sans', sans-serif",
                    fontSize: 10, fontWeight: 600,
                    letterSpacing: '0.3em', textTransform: 'uppercase',
                    color: '#C9A84C', marginBottom: 16,
                  }}>
                    {ch.label}
                  </p>
                  <h2 style={{
                    fontFamily: "'Bebas Neue', sans-serif",
                    fontSize: 'clamp(48px, 5.5vw, 82px)',
                    fontWeight: 400, lineHeight: 0.95,
                    color: '#EDEDEF', margin: 0,
                    whiteSpace: 'pre-line',
                  }}>
                    {ch.title}
                  </h2>
                  <p style={{
                    fontFamily: "'DM Sans', sans-serif",
                    fontSize: 15, fontWeight: 300, lineHeight: 1.7,
                    color: 'rgba(255,255,255,0.5)',
                    marginTop: 20, maxWidth: 360,
                  }}>
                    {ch.sub}
                  </p>
                  <div style={{ marginTop: 32, display: 'flex', alignItems: 'baseline', gap: 10 }}>
                    <span style={{
                      fontFamily: "'Bebas Neue', sans-serif",
                      fontSize: 'clamp(52px,6vw,80px)', fontWeight: 400,
                      color: '#C9A84C', lineHeight: 1,
                    }}>{ch.stat}</span>
                    <span style={{
                      fontFamily: "'DM Sans', sans-serif",
                      fontSize: 11, letterSpacing: '0.2em',
                      color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase',
                    }}>{ch.statLabel}</span>
                  </div>
                </div>
              ))}

              {/* CTA — fades in at end */}
              <div
                ref={ctaRef}
                style={{
                  position: 'absolute', inset: 0,
                  display: 'flex', flexDirection: 'column', justifyContent: 'center',
                  opacity: 0, pointerEvents: 'none',
                }}
              >
                <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 10, letterSpacing: '0.3em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.25)', marginBottom: 16 }}>
                  Ready to see the world clearly?
                </p>
                <h2 style={{
                  fontFamily: "'Bebas Neue', sans-serif",
                  fontSize: 'clamp(52px,6vw,88px)', fontWeight: 400,
                  lineHeight: 0.92, color: '#EDEDEF', margin: 0,
                }}>
                  Start with <span style={{ color: '#C9A84C' }}>AYN</span>
                </h2>
                <div style={{ marginTop: 36, display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                  <a
                    href="/pricing"
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 10,
                      padding: '14px 36px',
                      background: '#C9A84C',
                      color: '#020203',
                      fontFamily: "'DM Sans', sans-serif",
                      fontSize: 12, fontWeight: 600,
                      letterSpacing: '0.12em', textTransform: 'uppercase',
                      textDecoration: 'none',
                      transition: 'transform 0.2s cubic-bezier(0.16,1,0.3,1), opacity 0.2s',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.transform = 'scale(1.03)')}
                    onMouseLeave={e => (e.currentTarget.style.transform = 'scale(1)')}
                  >
                    Get Started Free →
                  </a>
                  <a
                    href="/features"
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 10,
                      padding: '14px 36px',
                      background: 'transparent',
                      border: '1px solid rgba(255,255,255,0.15)',
                      color: 'rgba(255,255,255,0.6)',
                      fontFamily: "'DM Sans', sans-serif",
                      fontSize: 12, fontWeight: 400,
                      letterSpacing: '0.12em', textTransform: 'uppercase',
                      textDecoration: 'none',
                      transition: 'border-color 0.2s, color 0.2s',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.4)'; e.currentTarget.style.color = '#fff'; }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.15)'; e.currentTarget.style.color = 'rgba(255,255,255,0.6)'; }}
                  >
                    See Features
                  </a>
                </div>
              </div>
            </div>

            {/* ── RIGHT COLUMN — helmet image ── */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {/* Subtle gold glow behind helmet */}
              <div style={{
                position: 'absolute',
                width: '55vw', height: '55vw', maxWidth: 640, maxHeight: 640,
                borderRadius: '50%',
                background: 'radial-gradient(circle, rgba(201,168,76,0.08) 0%, transparent 65%)',
                pointerEvents: 'none',
              }} />
              <img
                ref={imgRef}
                src={HELMET_FRAMES[0]}
                alt="AYN"
                draggable={false}
                fetchPriority="high"
                style={{
                  width: 'min(52vw, 620px)',
                  height: 'min(52vw, 620px)',
                  objectFit: 'contain',
                  display: 'block',
                  userSelect: 'none',
                  position: 'relative',
                  zIndex: 1,
                  filter: 'drop-shadow(0 0 60px rgba(201,168,76,0.12))',
                }}
              />
            </div>
          </div>

          {/* Scroll progress dots */}
          <div style={{
            position: 'absolute', right: 32, top: '50%',
            transform: 'translateY(-50%)',
            display: 'flex', flexDirection: 'column', gap: 10,
            zIndex: 10,
          }}>
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                style={{
                  width: 5, height: 5, borderRadius: '50%',
                  background: 'rgba(201,168,76,0.3)',
                  border: '1px solid rgba(201,168,76,0.5)',
                }}
              />
            ))}
          </div>

          {/* Thin gold bottom border */}
          <div style={{
            position: 'absolute', bottom: 0, left: '10%', right: '10%',
            height: 1,
            background: 'linear-gradient(to right, transparent, rgba(201,168,76,0.15), transparent)',
          }} />
        </div>
      </div>
    </>
  );
});

HeroScroll.displayName = 'HeroScroll';
