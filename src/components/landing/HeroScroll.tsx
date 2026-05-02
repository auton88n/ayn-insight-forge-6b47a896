/**
 * HeroScroll — Simple, clean scroll-driven frame animation.
 * Plain <img> tag. Framer Motion useScroll + useSpring.
 * No WebGL, no canvas, no Three.js, no blend modes.
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
  { label: 'WORLD INTELLIGENCE', title: 'See every market\nbefore it moves.', body: 'AYN monitors 187 countries — geopolitical shifts, commodity flows, and live market signals.', stat: '187', unit: 'Countries', in: 0.35, out: 0.58 },
  { label: 'PREDICTIVE AI', title: 'Know what happens\nbefore it does.', body: '73 AI agents simulate how populations, governments, and markets respond — before events unfold.', stat: '73', unit: 'World Agents', in: 0.60, out: 0.78 },
  { label: 'AI AGENTS', title: 'Your team.\nNever sleeps.', body: 'Custom agents trained on your data. Intelligence delivered 24/7, in Arabic and English.', stat: '24/7', unit: 'Always On', in: 0.80, out: 0.94 },
];

let cachedImgs: HTMLImageElement[] | null = null;
function preload() {
  if (!cachedImgs) cachedImgs = HELMET_FRAMES.map(s => { const i = new Image(); i.src = s; return i; });
  return cachedImgs;
}

export const HeroScroll = memo(() => {
  const { language } = useLanguage();
  const isAr = language === 'ar';

  const containerRef  = useRef<HTMLDivElement>(null);
  const imgRef        = useRef<HTMLImageElement>(null);
  const headlineRef   = useRef<HTMLDivElement>(null);
  const chRefs        = useRef<(HTMLDivElement | null)[]>([]);
  const ctaRef        = useRef<HTMLDivElement>(null);
  const hintRef       = useRef<HTMLDivElement>(null);
  const currentFrame  = useRef(0);
  const lastIdx       = useRef(0);

  useEffect(() => {
    const imgs = preload();
    // Set frame 0 immediately
    if (imgRef.current && imgs[0]?.complete) imgRef.current.src = imgs[0].src;
    else if (imgs[0]) imgs[0].onload = () => { if (imgRef.current) imgRef.current.src = imgs[0].src; };

    // RAF to swap frames
    let raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const idx = clamp(Math.round(currentFrame.current), 0, FRAME_COUNT - 1);
      if (idx !== lastIdx.current) {
        lastIdx.current = idx;
        const img = imgs[idx];
        if (img?.complete && imgRef.current) imgRef.current.src = img.src;
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const { scrollYProgress } = useScroll({ target: containerRef, offset: ['start start', 'end end'] });
  const rawFrame = useTransform(scrollYProgress, [0, 0.60], [0, FRAME_COUNT - 1]);
  const smoothFrame = useSpring(rawFrame, { stiffness: 500, damping: 45, restDelta: 0.3 });

  useMotionValueEvent(smoothFrame, 'change', (v) => { currentFrame.current = clamp(v, 0, FRAME_COUNT - 1); });

  useMotionValueEvent(scrollYProgress, 'change', (p) => {
    if (headlineRef.current) {
      const op = p < 0.10 ? 1 : lerp(p, 0.10, 0.24, 1, 0);
      headlineRef.current.style.opacity = `${op}`;
      headlineRef.current.style.transform = `translateY(${lerp(p, 0.10, 0.24, 0, -40)}px)`;
      headlineRef.current.style.pointerEvents = op < 0.05 ? 'none' : 'auto';
    }
    if (hintRef.current) hintRef.current.style.opacity = `${lerp(p, 0, 0.08, 1, 0)}`;
    CHAPTERS.forEach((ch, i) => {
      const el = chRefs.current[i];
      if (!el) return;
      const peak = ch.in + (ch.out - ch.in) * 0.28;
      let op = 0, ty = 36;
      if (p >= ch.in && p <= ch.out) {
        op = p < peak ? lerp(p, ch.in, peak, 0, 1) : lerp(p, peak, ch.out, 1, 0);
        ty = p < peak ? lerp(p, ch.in, peak, 36, 0) : lerp(p, peak, ch.out, 0, -36);
      }
      el.style.opacity = `${op}`; el.style.transform = `translateY(${ty}px)`;
      el.style.pointerEvents = op < 0.05 ? 'none' : 'auto';
    });
    if (ctaRef.current) {
      const op = lerp(p, 0.92, 0.99, 0, 1);
      ctaRef.current.style.opacity = `${op}`;
      ctaRef.current.style.pointerEvents = op < 0.05 ? 'none' : 'auto';
    }
  });

  return (
    <div style={{ background: '#000' }}>
      <div ref={containerRef} style={{ height: '400vh', position: 'relative' }}>
        <div className="sticky top-0" style={{ height: '100dvh', overflow: 'hidden', background: '#000', display: 'grid', gridTemplateColumns: '1fr 1fr' }}>

          {/* LEFT — text */}
          <div style={{ display: 'flex', alignItems: 'center', padding: '80px clamp(32px,4vw,72px)', boxSizing: 'border-box' }}>
            <div style={{ position: 'relative', width: '100%', height: 'min(600px,75vh)' }}>

              {/* Headline */}
              <div ref={headlineRef} style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                <p style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 10, fontWeight: 500, letterSpacing: '0.28em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.28)', margin: '0 0 18px' }}>
                  {isAr ? 'ذكاء الأعمال' : 'World Intelligence Platform'}
                </p>
                <h1 style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 'clamp(58px,7vw,110px)', fontWeight: 400, lineHeight: 0.88, color: '#fff', margin: '0 0 24px' }}>
                  {isAr ? 'تعرّف على ' : 'Meet '}<span style={{ color: '#C9A84C' }}>{isAr ? 'عين' : 'AYN'}</span>
                </h1>
                <p style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 15, fontWeight: 300, lineHeight: 1.72, color: 'rgba(255,255,255,0.40)', maxWidth: 340, margin: '0 0 40px' }}>
                  {isAr ? 'ذكاء أعمال حقيقي. أسواق، مخاطر، وقرارات تهم.' : 'Real business intelligence. Scroll to watch AYN transform — and discover what it sees.'}
                </p>
                <div ref={hintRef} style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <div style={{ width: 28, height: 1, background: 'rgba(201,168,76,0.5)' }} />
                  <span style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 10, letterSpacing: '0.24em', color: 'rgba(255,255,255,0.20)', textTransform: 'uppercase' }}>Scroll to explore</span>
                </div>
              </div>

              {/* Chapters */}
              {CHAPTERS.map((ch, i) => (
                <div key={i} ref={el => { chRefs.current[i] = el; }} style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', opacity: 0, pointerEvents: 'none' }}>
                  <p style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 9, fontWeight: 600, letterSpacing: '0.32em', textTransform: 'uppercase', color: '#C9A84C', margin: '0 0 16px' }}>{ch.label}</p>
                  <h2 style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 'clamp(42px,5vw,78px)', fontWeight: 400, lineHeight: 0.92, color: '#fff', margin: '0 0 20px', whiteSpace: 'pre-line' }}>{ch.title}</h2>
                  <p style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 14, fontWeight: 300, lineHeight: 1.75, color: 'rgba(255,255,255,0.44)', maxWidth: 320, margin: '0 0 28px' }}>{ch.body}</p>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
                    <span style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 'clamp(46px,5.5vw,72px)', color: '#C9A84C', lineHeight: 1 }}>{ch.stat}</span>
                    <span style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 10, letterSpacing: '0.22em', color: 'rgba(255,255,255,0.25)', textTransform: 'uppercase' }}>{ch.unit}</span>
                  </div>
                </div>
              ))}

              {/* CTA */}
              <div ref={ctaRef} style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', opacity: 0, pointerEvents: 'none' }}>
                <p style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 9, letterSpacing: '0.30em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.20)', margin: '0 0 14px' }}>Ready to see the world clearly?</p>
                <h2 style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 'clamp(46px,5.8vw,86px)', fontWeight: 400, lineHeight: 0.88, color: '#fff', margin: '0 0 32px' }}>
                  Start with <span style={{ color: '#C9A84C' }}>AYN</span>
                </h2>
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                  <a href="/pricing" style={{ display: 'inline-flex', alignItems: 'center', padding: '13px 34px', background: '#C9A84C', color: '#000', fontFamily: "'DM Sans',sans-serif", fontSize: 11, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', textDecoration: 'none', transition: 'transform 0.2s' }}
                    onMouseEnter={e => (e.currentTarget.style.transform = 'scale(1.04)')}
                    onMouseLeave={e => (e.currentTarget.style.transform = 'scale(1)')}>Get Started Free →</a>
                  <a href="/features" style={{ display: 'inline-flex', alignItems: 'center', padding: '13px 30px', border: '1px solid rgba(255,255,255,0.14)', color: 'rgba(255,255,255,0.52)', fontFamily: "'DM Sans',sans-serif", fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', textDecoration: 'none', transition: 'all 0.2s' }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.4)'; e.currentTarget.style.color = '#fff'; }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.14)'; e.currentTarget.style.color = 'rgba(255,255,255,0.52)'; }}>See Features</a>
                </div>
              </div>

            </div>
          </div>

          {/* RIGHT — plain img, full height, object-fit contain */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
            <img
              ref={imgRef}
              src={HELMET_FRAMES[0]}
              alt="AYN"
              draggable={false}
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'contain',
                objectPosition: 'center',
                display: 'block',
                userSelect: 'none',
              }}
            />
          </div>

        </div>
      </div>
    </div>
  );
});

HeroScroll.displayName = 'HeroScroll';
