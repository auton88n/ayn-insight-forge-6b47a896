/**
 * HeroScroll — Professional scroll-driven frame animation.
 * Framer Motion useScroll + useSpring for Apple-style scrubbing.
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
    stat: '187', statLabel: 'Countries tracked',
    scrollStart: 0.35, scrollEnd: 0.55,
  },
  {
    label: 'PREDICTIVE AI',
    title: 'Know what happens\nbefore it does.',
    sub: '73 AI agents simulate how populations, governments, and markets will respond — before events unfold.',
    stat: '73', statLabel: 'World agents',
    scrollStart: 0.55, scrollEnd: 0.75,
  },
  {
    label: 'AI AGENTS',
    title: 'Your team.\nNever sleeps.',
    sub: 'Custom agents trained on your data deliver intelligence 24/7. In Arabic and English.',
    stat: '24/7', statLabel: 'Always on',
    scrollStart: 0.75, scrollEnd: 0.95,
  },
];

function clamp(v: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, v)); }
function mapTo(v: number, a: number, b: number, c: number, d: number) {
  return c + (clamp(v, a, b) - a) / (b - a) * (d - c);
}

export const HeroScroll = memo(() => {
  const { language } = useLanguage();
  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const lastIdx = useRef(0);
  const chapterRefs = useRef<(HTMLDivElement | null)[]>([]);
  const headlineRef = useRef<HTMLDivElement>(null);
  const ctaRef = useRef<HTMLDivElement>(null);

  // Preload frames inside effect — not at module level
  const imgCache = useRef<HTMLImageElement[]>([]);
  useEffect(() => {
    imgCache.current = HELMET_FRAMES.map((src) => {
      const img = new Image();
      img.src = src;
      return img;
    });
  }, []);

  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ['start start', 'end end'],
  });

  const rawFrame = useTransform(scrollYProgress, [0, 0.50], [0, FRAME_COUNT - 1]);
  const smoothFrame = useSpring(rawFrame, { stiffness: 400, damping: 40, restDelta: 0.5 });

  // Drive image frame from spring
  useMotionValueEvent(smoothFrame, 'change', (latest) => {
    const idx = clamp(Math.round(latest), 0, FRAME_COUNT - 1);
    if (idx !== lastIdx.current) {
      lastIdx.current = idx;
      const cached = imgCache.current[idx];
      if (cached?.complete && imgRef.current) imgRef.current.src = cached.src;
    }
  });

  // Drive text layers from scroll — direct DOM, no re-renders
  useMotionValueEvent(scrollYProgress, 'change', (p) => {
    if (headlineRef.current) {
      const op = p < 0.12 ? 1 : mapTo(p, 0.12, 0.28, 1, 0);
      const ty = mapTo(p, 0.12, 0.28, 0, -40);
      headlineRef.current.style.opacity = String(op);
      headlineRef.current.style.transform = `translateY(${ty}px)`;
    }
    CHAPTERS.forEach((ch, i) => {
      const el = chapterRefs.current[i];
      if (!el) return;
      const { scrollStart: s, scrollEnd: e } = ch;
      const peak = s + (e - s) * 0.3;
      let op = 0, ty = 30;
      if (p >= s && p <= e) {
        op = p < peak ? mapTo(p, s, peak, 0, 1) : mapTo(p, peak, e, 1, 0);
        ty = p < peak ? mapTo(p, s, peak, 30, 0) : mapTo(p, peak, e, 0, -30);
      }
      el.style.opacity = String(op);
      el.style.transform = `translateY(${ty}px)`;
    });
    if (ctaRef.current) {
      const op = mapTo(p, 0.88, 0.98, 0, 1);
      ctaRef.current.style.opacity = String(op);
      ctaRef.current.style.pointerEvents = op > 0.1 ? 'auto' : 'none';
    }
  });

  const isAr = language === 'ar';

  return (
    <div style={{ background: '#020203', position: 'relative', overflow: 'hidden' }}>

      {/* Ambient blobs — absolute, NOT fixed */}
      <div aria-hidden style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 0 }}>
        <div style={{
          position: 'absolute', top: '15%', left: '10%',
          width: 700, height: 700, borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(201,168,76,0.055) 0%, transparent 65%)',
          animation: 'ayn-blob1 20s ease-in-out infinite alternate',
        }} />
        <div style={{
          position: 'absolute', bottom: '5%', right: '5%',
          width: 600, height: 600, borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(94,106,210,0.045) 0%, transparent 65%)',
          animation: 'ayn-blob2 25s ease-in-out infinite alternate',
        }} />
      </div>

      <style>{`
        @keyframes ayn-blob1 { from { transform: translate(0,0) scale(1); } to { transform: translate(60px,50px) scale(1.18); } }
        @keyframes ayn-blob2 { from { transform: translate(0,0) scale(1); } to { transform: translate(-60px,70px) scale(1.12); } }
      `}</style>

      {/* 400vh scroll container */}
      <div ref={containerRef} style={{ height: '400vh', position: 'relative', zIndex: 1 }}>

        {/* Sticky viewport */}
        <div className="sticky top-0 overflow-hidden" style={{ height: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>

          <div style={{
            width: '100%', maxWidth: 1280, padding: '0 clamp(24px,5vw,64px)',
            display: 'grid', gridTemplateColumns: '1fr 1fr',
            alignItems: 'center', gap: 'clamp(32px,5vw,80px)',
          }}>

            {/* ── LEFT: text layers ── */}
            <div style={{ position: 'relative', minHeight: '60vh', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>

              {/* Hero headline */}
              <div ref={headlineRef} style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, fontWeight: 500, letterSpacing: '0.25em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.32)', marginBottom: 20, margin: '0 0 20px' }}>
                  {isAr ? 'ذكاء الأعمال' : 'World Intelligence Platform'}
                </p>
                <h1 style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 'clamp(64px, 7.5vw, 116px)', fontWeight: 400, lineHeight: 0.9, letterSpacing: '-0.01em', color: '#EDEDEF', margin: '0 0 24px' }}>
                  {isAr ? 'تعرّف على' : 'Meet'}{' '}
                  <span style={{ color: '#C9A84C' }}>{isAr ? 'عين' : 'AYN'}</span>
                </h1>
                <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 16, fontWeight: 300, lineHeight: 1.7, color: 'rgba(255,255,255,0.42)', maxWidth: 380, margin: '0 0 36px' }}>
                  {isAr ? 'ذكاء أعمال حقيقي. أسواق، مخاطر، وقرارات تهم.' : 'Real business intelligence. Scroll to watch AYN assemble — and discover what it sees.'}
                </p>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <div style={{ width: 28, height: 1, background: '#C9A84C', opacity: 0.5 }} />
                  <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 10, letterSpacing: '0.22em', color: 'rgba(255,255,255,0.22)', textTransform: 'uppercase' }}>
                    Scroll to explore
                  </span>
                </div>
              </div>

              {/* Chapter panels */}
              {CHAPTERS.map((ch, i) => (
                <div key={i} ref={(el) => { chapterRefs.current[i] = el; }}
                  style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', opacity: 0, pointerEvents: 'none' }}>
                  <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 10, fontWeight: 600, letterSpacing: '0.3em', textTransform: 'uppercase', color: '#C9A84C', margin: '0 0 16px' }}>
                    {ch.label}
                  </p>
                  <h2 style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 'clamp(46px, 5.5vw, 84px)', fontWeight: 400, lineHeight: 0.93, color: '#EDEDEF', margin: '0 0 20px', whiteSpace: 'pre-line' }}>
                    {ch.title}
                  </h2>
                  <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 15, fontWeight: 300, lineHeight: 1.7, color: 'rgba(255,255,255,0.48)', maxWidth: 360, margin: '0 0 28px' }}>
                    {ch.sub}
                  </p>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
                    <span style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 'clamp(52px,6vw,80px)', fontWeight: 400, color: '#C9A84C', lineHeight: 1 }}>{ch.stat}</span>
                    <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 10, letterSpacing: '0.22em', color: 'rgba(255,255,255,0.28)', textTransform: 'uppercase' }}>{ch.statLabel}</span>
                  </div>
                </div>
              ))}

              {/* CTA */}
              <div ref={ctaRef} style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', opacity: 0, pointerEvents: 'none' }}>
                <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 10, letterSpacing: '0.28em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.22)', margin: '0 0 14px' }}>
                  Ready to see the world clearly?
                </p>
                <h2 style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 'clamp(50px,6vw,88px)', fontWeight: 400, lineHeight: 0.9, color: '#EDEDEF', margin: '0 0 32px' }}>
                  Start with <span style={{ color: '#C9A84C' }}>AYN</span>
                </h2>
                <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                  <a href="/pricing" style={{ display: 'inline-flex', alignItems: 'center', padding: '13px 34px', background: '#C9A84C', color: '#020203', fontFamily: "'DM Sans', sans-serif", fontSize: 11, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', textDecoration: 'none', transition: 'transform 0.2s' }}
                    onMouseEnter={e => (e.currentTarget.style.transform = 'scale(1.03)')}
                    onMouseLeave={e => (e.currentTarget.style.transform = 'scale(1)')}>
                    Get Started Free →
                  </a>
                  <a href="/features" style={{ display: 'inline-flex', alignItems: 'center', padding: '13px 34px', background: 'transparent', border: '1px solid rgba(255,255,255,0.14)', color: 'rgba(255,255,255,0.55)', fontFamily: "'DM Sans', sans-serif", fontSize: 11, fontWeight: 400, letterSpacing: '0.14em', textTransform: 'uppercase', textDecoration: 'none', transition: 'all 0.2s' }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.4)'; e.currentTarget.style.color = '#fff'; }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.14)'; e.currentTarget.style.color = 'rgba(255,255,255,0.55)'; }}>
                    See Features
                  </a>
                </div>
              </div>
            </div>

            {/* ── RIGHT: helmet image ── */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
              <div style={{ position: 'absolute', width: '90%', height: '90%', borderRadius: '50%', background: 'radial-gradient(circle, rgba(201,168,76,0.07) 0%, transparent 65%)', pointerEvents: 'none' }} />
              <img
                ref={imgRef}
                src={HELMET_FRAMES[0]}
                alt="AYN"
                draggable={false}
                style={{ width: 'min(52vw, 620px)', height: 'min(52vw, 620px)', objectFit: 'contain', display: 'block', userSelect: 'none', position: 'relative', zIndex: 1, filter: 'drop-shadow(0 0 80px rgba(201,168,76,0.10))' }}
              />
            </div>
          </div>

          {/* Bottom separator */}
          <div style={{ position: 'absolute', bottom: 0, left: '8%', right: '8%', height: 1, background: 'linear-gradient(to right, transparent, rgba(201,168,76,0.12), transparent)' }} />
        </div>
      </div>
    </div>
  );
});

HeroScroll.displayName = 'HeroScroll';
