/**
 * HeroScroll — Apple-style 3D object scroll storytelling.
 *
 * THE ILLUSION:
 * One canvas element. One image element. Black background #000000.
 * Frame images have black-crushed backgrounds — they are pixel-identical to
 * the page background. The object literally floats in the page with no border.
 *
 * SCROLL ARCHITECTURE:
 * ┌─────────────────────────────────────────────────────┐
 * │  600vh spacer — scroll here drives everything       │
 * │  ┌───────────────────────────────────────────────┐  │
 * │  │  sticky 100dvh viewport — object lives here  │  │
 * │  │  • img: pixel-swapped by RAF at 60fps        │  │
 * │  │  • scale/translate: CSS transform             │  │
 * │  │  • opacity: text layers                       │  │
 * │  └───────────────────────────────────────────────┘  │
 * └─────────────────────────────────────────────────────┘
 *
 * CHAPTERS (scroll progress → visual story):
 *   0%–12%   : Object fades in, centered, front-facing
 *   0%–50%   : Frames 0→60: Slow rotation reveal (front → side profile)
 *   50%–100% : Frames 60→120: Full rotation back (side → internal → front)
 *   15%–35%  : Chapter 1: World Intelligence
 *   38%–58%  : Chapter 2: Predictive AI
 *   61%–80%  : Chapter 3: AI Agents
 *   82%–96%  : CTA
 *
 * MOTION RULES:
 * - Object scale breathes: 1.0 → 1.06 → 1.0 over full scroll (subtle zoom)
 * - translateY: ±20px max — slight vertical parallax
 * - No lerp on frames (direct = responsive to finger)
 * - Slight lerp on scale/translate (0.08 factor = smooth, not laggy)
 * - All text uses CSS will-change:opacity + direct DOM writes (no React re-renders)
 */

import { useEffect, useRef, memo, useCallback } from 'react';
import { useReducedMotion } from 'framer-motion';
import { HELMET_FRAMES, FRAME_COUNT } from '@/assets/helmet-frames';
import { useLanguage } from '@/contexts/LanguageContext';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';

/* ── Types ── */
interface Layer {
  ref: React.RefObject<HTMLDivElement>;
  inStart: number;
  inEnd: number;
  outStart: number;
  outEnd: number;
}

/* ── Math helpers ── */
function clamp(v: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, v)); }
function map(v: number, a: number, b: number, c: number, d: number) {
  return c + (clamp(v, a, b) - a) / (b - a) * (d - c);
}

/* ── Chapter data ── */
const CHAPTERS = [
  {
    label: 'WORLD INTELLIGENCE',
    headline: 'See every market\nbefore it moves.',
    body: 'AYN monitors 187 countries — geopolitical shifts, commodity flows, and live market signals — in real time.',
    stat: '187', unit: 'Countries',
    inStart: 0.15, inEnd: 0.22, outStart: 0.30, outEnd: 0.37,
  },
  {
    label: 'PREDICTIVE AI',
    headline: 'Know what happens\nbefore it does.',
    body: '73 AI agents simulate how populations, governments, and markets respond — before events unfold.',
    stat: '73', unit: 'World Agents',
    inStart: 0.38, inEnd: 0.45, outStart: 0.53, outEnd: 0.60,
  },
  {
    label: 'AI AGENTS',
    headline: 'Your team.\nNever sleeps.',
    body: 'Custom agents trained on your data. Intelligence delivered 24/7, in Arabic and English.',
    stat: '24/7', unit: 'Always On',
    inStart: 0.61, inEnd: 0.68, outStart: 0.76, outEnd: 0.82,
  },
];

/* ── Preload all frames eagerly — starts immediately on import ── */
const imageCache: HTMLImageElement[] = HELMET_FRAMES.map((src, i) => {
  const img = new Image();
  img.src = src;
  img.decoding = 'async';
  return img;
});

/* ── Component ── */
export const HeroScroll = memo(() => {
  const { language } = useLanguage();
  const isAr = language === 'ar';
  const reduced = useReducedMotion();

  /* ── Refs ── */
  const spacerRef    = useRef<HTMLDivElement>(null);
  const imgRef       = useRef<HTMLImageElement>(null);
  const objectRef    = useRef<HTMLDivElement>(null); // wrapper for scale/translate
  const headlineRef  = useRef<HTMLDivElement>(null);
  const ctaRef       = useRef<HTMLDivElement>(null);
  const chapterRefs  = useRef<(HTMLDivElement | null)[]>([]);

  /* ── Animation state (no React state — pure refs) ── */
  const rawProgress  = useRef(0);
  const curScale     = useRef(1);
  const curY         = useRef(0);
  const lastFrameIdx = useRef(-1);
  const rafId        = useRef(0);

  /* ── Scroll handler — direct, no throttle ── */
  const onScroll = useCallback(() => {
    const spacer = spacerRef.current;
    if (!spacer) return;
    const rect  = spacer.getBoundingClientRect();
    const total = spacer.offsetHeight - window.innerHeight;
    rawProgress.current = clamp(-rect.top / total, 0, 1);
  }, []);

  useEffect(() => {
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
  }, [onScroll]);

  /* ── RAF loop ── */
  useEffect(() => {
    // Set first frame immediately
    if (imgRef.current && imageCache[0]?.complete) {
      imgRef.current.src = imageCache[0].src;
      lastFrameIdx.current = 0;
    } else if (imageCache[0]) {
      imageCache[0].onload = () => {
        if (imgRef.current) imgRef.current.src = imageCache[0].src;
      };
    }

    const tick = () => {
      rafId.current = requestAnimationFrame(tick);
      const p = rawProgress.current;

      /* ── 1. Frame scrubbing — direct mapping, no lerp ── */
      if (!reduced) {
        const frameIdx = clamp(Math.round(p * (FRAME_COUNT - 1)), 0, FRAME_COUNT - 1);
        if (frameIdx !== lastFrameIdx.current) {
          lastFrameIdx.current = frameIdx;
          const cached = imageCache[frameIdx];
          if (cached?.complete && imgRef.current) {
            imgRef.current.src = cached.src;
          }
        }
      }

      /* ── 2. Object transform — slight lerp for smoothness ── */
      if (!reduced && objectRef.current) {
        const LERP = 0.08;

        // Scale: breathes in then out — peak at 50% scroll
        const targetScale = p < 0.5
          ? map(p, 0, 0.5, 1.0, 1.06)
          : map(p, 0.5, 1.0, 1.06, 1.0);
        curScale.current += (targetScale - curScale.current) * LERP;

        // Y: gentle parallax — rises slightly as page scrolls
        const targetY = map(p, 0, 1, 0, -24);
        curY.current += (targetY - curY.current) * LERP;

        objectRef.current.style.transform =
          `translateY(${curY.current.toFixed(2)}px) scale(${curScale.current.toFixed(4)})`;
      }

      /* ── 3. Object opacity — fades in at start ── */
      if (imgRef.current) {
        const fadeIn = map(p, 0, 0.08, 0, 1);
        imgRef.current.style.opacity = `${fadeIn}`;
      }

      /* ── 4. Headline — visible 0–12%, fades 12–20% ── */
      if (headlineRef.current) {
        const op = p < 0.12 ? 1 : map(p, 0.12, 0.20, 1, 0);
        const ty = map(p, 0.12, 0.20, 0, -32);
        headlineRef.current.style.opacity  = `${op}`;
        headlineRef.current.style.transform = `translateY(${ty}px)`;
        headlineRef.current.style.pointerEvents = op < 0.05 ? 'none' : 'auto';
      }

      /* ── 5. Chapters ── */
      CHAPTERS.forEach((ch, i) => {
        const el = chapterRefs.current[i];
        if (!el) return;
        let op = 0, ty = 28;
        if (p >= ch.inStart && p <= ch.outEnd) {
          if (p < ch.inEnd) {
            op = map(p, ch.inStart, ch.inEnd, 0, 1);
            ty = map(p, ch.inStart, ch.inEnd, 28, 0);
          } else if (p < ch.outStart) {
            op = 1; ty = 0;
          } else {
            op = map(p, ch.outStart, ch.outEnd, 1, 0);
            ty = map(p, ch.outStart, ch.outEnd, 0, -28);
          }
        }
        el.style.opacity   = `${op}`;
        el.style.transform = `translateY(${ty}px)`;
        el.style.pointerEvents = op < 0.05 ? 'none' : 'auto';
      });

      /* ── 6. CTA ── */
      if (ctaRef.current) {
        const op = map(p, 0.84, 0.92, 0, 1);
        ctaRef.current.style.opacity = `${op}`;
        ctaRef.current.style.pointerEvents = op < 0.05 ? 'none' : 'auto';
      }
    };

    rafId.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId.current);
  }, [reduced]);

  /* ── Fonts & colors ── */
  const F  = "'DM Sans', sans-serif";
  const FB = "'Bebas Neue', sans-serif";
  const G  = '#FB923C';

  return (
    <div style={{ background: '#000' }}>

      {/* ════════════════════════════════════════════════════════
          600vh SCROLL SPACER — everything pinned inside sticky
      ════════════════════════════════════════════════════════ */}
      <div ref={spacerRef} style={{ height: '600vh', position: 'relative' }}>

        {/* Sticky viewport */}
        <div
          className="sticky top-0"
          style={{
            height: '100dvh',
            overflow: 'hidden',
            background: '#000',
          }}
        >

          {/* ══════════════════════════════════════════════════
              THE 3D OBJECT — centered, scale-animated wrapper
          ══════════════════════════════════════════════════ */}
          <div
            ref={objectRef}
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'flex-end',
              paddingRight: 'clamp(0px, 2vw, 48px)',
              transformOrigin: 'center center',
              willChange: 'transform',
              zIndex: 1,
            }}
          >
            {/*
              KEY TO ILLUSION:
              - background: transparent (page is #000)
              - img background pixels are black-crushed to #000
              - objectFit: contain — object never clips
              - No border, no shadow, no container
              - mixBlendMode: NOT used (would tint the image)
              - The object simply IS the page — no seam possible
            */}
            <img
              ref={imgRef}
              alt="AYN"
              draggable={false}
              style={{
                width: 'min(52vw, 680px)',
                height: 'min(52vw, 680px)',
                objectFit: 'contain',
                objectPosition: 'center center',
                display: 'block',
                userSelect: 'none',
                pointerEvents: 'none',
                opacity: 0, // fades in via RAF
                willChange: 'opacity',
                // The magic: filter adds subtle studio-quality glow to the object only
                filter: 'drop-shadow(0 0 80px rgba(251,146,60,0.06))',
              }}
            />
          </div>

          {/* Subtle left gradient — helps text readability */}
          <div
            style={{
              position: 'absolute', inset: 0, zIndex: 2,
              background: 'linear-gradient(to right, rgba(0,0,0,0.80) 0%, rgba(0,0,0,0.50) 40%, rgba(0,0,0,0.0) 68%)',
              pointerEvents: 'none',
            }}
          />

          {/* ══════════════════════════════════════════════════
              TEXT LAYERS — absolutely stacked, opacity-driven
          ══════════════════════════════════════════════════ */}
          <div
            style={{
              position: 'absolute',
              inset: 0,
              zIndex: 10,
              display: 'flex',
              alignItems: 'center',
              padding: '80px clamp(24px,6vw,96px)',
            }}
          >
            <div style={{ position: 'relative', width: '100%', maxWidth: 520, height: 'min(80vh, 520px)' }}>

              {/* ── HEADLINE (visible on load) ── */}
              <div
                ref={headlineRef}
                style={{
                  position: 'absolute', inset: 0,
                  display: 'flex', flexDirection: 'column', justifyContent: 'center',
                  willChange: 'opacity, transform',
                }}
              >
                {/* Eyebrow */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
                  <div style={{ width: 24, height: 1, background: G, opacity: 0.7 }} />
                  <span style={{ fontFamily: F, fontSize: 10, fontWeight: 600, letterSpacing: '0.28em', color: G, textTransform: 'uppercase' }}>
                    {isAr ? 'ذكاء الأعمال' : 'World Intelligence Platform'}
                  </span>
                </div>

                {/* Main headline */}
                <h1 style={{
                  fontFamily: FB,
                  fontSize: 'clamp(56px, 9vw, 118px)',
                  fontWeight: 400,
                  lineHeight: 0.88,
                  letterSpacing: '-0.01em',
                  color: '#fff',
                  margin: '0 0 28px',
                }}>
                  {isAr ? 'تعرّف على ' : 'MEET '}
                  <span style={{
                    background: 'linear-gradient(135deg, #FB923C, #f97316)',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    filter: 'drop-shadow(0 0 24px rgba(251,146,60,0.4))',
                  }}>
                    {isAr ? 'عين' : 'AYN'}
                  </span>
                </h1>

                {/* Subtitle */}
                <p style={{
                  fontFamily: F, fontSize: 16, fontWeight: 300,
                  lineHeight: 1.72, color: 'rgba(255,255,255,0.60)',
                  maxWidth: 380, margin: '0 0 44px',
                }}>
                  {isAr
                    ? 'ذكاء أعمال حقيقي. تفاعل مع عين واكتشف ما يراه.'
                    : 'Real business intelligence. Scroll to explore AYN — and discover what it sees.'}
                </p>

                {/* CTAs */}
                <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center' }}>
                  <Link to="/pricing" className="gold-glow-btn"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '13px 32px', borderRadius: 100, fontFamily: F, fontSize: 14, fontWeight: 700, color: '#000', textDecoration: 'none' }}>
                    {isAr ? 'ابدأ مع عين' : 'Start with AYN'}
                    <ArrowRight size={14} />
                  </Link>
                  <Link to="/features"
                    style={{ display: 'inline-flex', alignItems: 'center', padding: '13px 28px', borderRadius: 100, fontFamily: F, fontSize: 14, fontWeight: 500, color: 'rgba(255,255,255,0.75)', border: '1px solid rgba(255,255,255,0.25)', textDecoration: 'none', transition: 'all 0.2s' }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.5)'; e.currentTarget.style.color = '#fff'; }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.25)'; e.currentTarget.style.color = 'rgba(255,255,255,0.75)'; }}>
                    {isAr ? 'شاهد كيف يعمل' : 'See how it works'}
                  </Link>
                </div>

                {/* Stats */}
                <div style={{ display: 'flex', gap: 40, marginTop: 52, paddingTop: 28, borderTop: '1px solid rgba(255,255,255,0.07)' }}>
                  {[
                    { n: '187+', l: isAr ? 'دولة' : 'Countries' },
                    { n: '73',   l: isAr ? 'وكيل' : 'AI Agents' },
                    { n: '24/7', l: isAr ? 'مراقبة' : 'Monitoring' },
                  ].map((s, i) => (
                    <div key={i}>
                      <p style={{ fontFamily: FB, fontSize: 32, color: G, lineHeight: 1, margin: '0 0 4px' }}>{s.n}</p>
                      <p style={{ fontFamily: F, fontSize: 10, letterSpacing: '0.18em', color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', margin: 0 }}>{s.l}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* ── CHAPTER PANELS ── */}
              {CHAPTERS.map((ch, i) => (
                <div
                  key={i}
                  ref={el => { chapterRefs.current[i] = el; }}
                  style={{
                    position: 'absolute', inset: 0,
                    display: 'flex', flexDirection: 'column', justifyContent: 'center',
                    opacity: 0, pointerEvents: 'none',
                    willChange: 'opacity, transform',
                  }}
                >
                  {/* Label */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
                    <div style={{ width: 24, height: 1, background: G, opacity: 0.7 }} />
                    <span style={{ fontFamily: F, fontSize: 9, fontWeight: 600, letterSpacing: '0.32em', textTransform: 'uppercase', color: G }}>
                      {ch.label}
                    </span>
                  </div>

                  {/* Headline */}
                  <h2 style={{
                    fontFamily: FB,
                    fontSize: 'clamp(42px, 5.2vw, 78px)',
                    fontWeight: 400, lineHeight: 0.92,
                    color: '#fff', margin: '0 0 20px',
                    whiteSpace: 'pre-line',
                  }}>
                    {ch.headline}
                  </h2>

                  {/* Body */}
                  <p style={{
                    fontFamily: F, fontSize: 15, fontWeight: 300,
                    lineHeight: 1.75, color: 'rgba(255,255,255,0.58)',
                    maxWidth: 360, margin: '0 0 28px',
                  }}>
                    {ch.body}
                  </p>

                  {/* Stat */}
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
                    <span style={{ fontFamily: FB, fontSize: 'clamp(48px,5.5vw,72px)', color: G, lineHeight: 1 }}>
                      {ch.stat}
                    </span>
                    <span style={{ fontFamily: F, fontSize: 10, letterSpacing: '0.22em', color: 'rgba(255,255,255,0.40)', textTransform: 'uppercase' }}>
                      {ch.unit}
                    </span>
                  </div>
                </div>
              ))}

              {/* ── CTA PANEL ── */}
              <div
                ref={ctaRef}
                style={{
                  position: 'absolute', inset: 0,
                  display: 'flex', flexDirection: 'column', justifyContent: 'center',
                  opacity: 0, pointerEvents: 'none',
                  willChange: 'opacity',
                }}
              >
                <p style={{ fontFamily: F, fontSize: 9, letterSpacing: '0.30em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.28)', margin: '0 0 16px' }}>
                  {isAr ? 'ابدأ اليوم' : 'Ready to see the world clearly?'}
                </p>
                <h2 style={{ fontFamily: FB, fontSize: 'clamp(48px,6vw,88px)', fontWeight: 400, lineHeight: 0.88, color: '#fff', margin: '0 0 36px' }}>
                  {isAr ? 'ابدأ مع ' : 'Start with '}
                  <span style={{ color: G }}>AYN</span>
                </h2>
                <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                  <Link to="/pricing" className="gold-glow-btn"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '14px 36px', borderRadius: 100, fontFamily: F, fontSize: 14, fontWeight: 700, color: '#000', textDecoration: 'none' }}>
                    {isAr ? 'ابدأ مجاناً' : 'Get Started Free'}
                    <ArrowRight size={14} />
                  </Link>
                  <Link to="/features"
                    style={{ display: 'inline-flex', alignItems: 'center', padding: '14px 28px', borderRadius: 100, fontFamily: F, fontSize: 14, color: 'rgba(255,255,255,0.70)', border: '1px solid rgba(255,255,255,0.22)', textDecoration: 'none', transition: 'all 0.2s' }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.5)'; e.currentTarget.style.color = '#fff'; }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.22)'; e.currentTarget.style.color = 'rgba(255,255,255,0.70)'; }}>
                    {isAr ? 'استكشف' : 'See Features'}
                  </Link>
                </div>
              </div>

            </div>
          </div>

          {/* Chapter progress dots — right edge */}
          <div style={{
            position: 'absolute', right: 28, top: '50%', transform: 'translateY(-50%)',
            display: 'flex', flexDirection: 'column', gap: 10,
            zIndex: 20,
          }}>
            {CHAPTERS.map((_, i) => (
              <div key={i} style={{ width: 4, height: 4, borderRadius: '50%', background: 'rgba(251,146,60,0.35)' }} />
            ))}
          </div>

          {/* Bottom hairline */}
          <div style={{
            position: 'absolute', bottom: 0, left: '5%', right: '5%', height: 1,
            background: 'linear-gradient(to right, transparent, rgba(251,146,60,0.08), transparent)',
            zIndex: 5,
          }} />

        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════
          SECTIONS 2–4 (About / Services / CTA) below the hero
      ══════════════════════════════════════════════════════════ */}

      {/* Intelligence section */}
      <section style={{ position: 'relative', minHeight: '100dvh', display: 'flex', alignItems: 'center', padding: '80px clamp(24px,6vw,96px)', overflow: 'hidden', background: '#030201' }}>
        <div className="landing-decor-lg" style={{ position: 'absolute', right: '-4%', top: '50%', transform: 'translateY(-50%)', width: 520, height: 520, pointerEvents: 'none' }}>
          <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: '1px solid rgba(251,146,60,0.12)' }} />
          <div style={{ position: 'absolute', inset: 80, borderRadius: '50%', border: '1px solid rgba(251,146,60,0.07)' }} />
          <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: 200, height: 200, borderRadius: '50%', background: 'radial-gradient(circle, rgba(251,146,60,0.15) 0%, transparent 70%)' }} />
          {[0, 60, 120, 180, 240, 300].map((deg, i) => {
            const r = 240, cx = 260, cy = 260;
            const x = cx + r * Math.cos(deg * Math.PI / 180) - 4;
            const y = cy + r * Math.sin(deg * Math.PI / 180) - 4;
            return <div key={i} style={{ position: 'absolute', width: 8, height: 8, borderRadius: '50%', background: G, left: x, top: y, opacity: 0.5, boxShadow: `0 0 8px ${G}` }} />;
          })}
        </div>
        <div style={{ position: 'relative', zIndex: 10, width: '100%', maxWidth: 1280, margin: '0 auto' }}>
          <div style={{ maxWidth: 540 }}>
            <p style={{ fontFamily: F, fontSize: 10, fontWeight: 600, letterSpacing: '0.30em', textTransform: 'uppercase', color: G, margin: '0 0 20px' }}>About AYN</p>
            <h2 style={{ fontFamily: F, fontSize: 'clamp(36px,4.5vw,68px)', fontWeight: 800, lineHeight: 1.06, letterSpacing: '-0.03em', color: '#fff', margin: '0 0 28px' }}>
              {isAr ? 'ذكاء متطوّر.' : <span>Intelligence,<br />evolved.</span>}
            </h2>
            <p style={{ fontFamily: F, fontSize: 16, fontWeight: 300, lineHeight: 1.75, color: 'rgba(255,255,255,0.58)', maxWidth: 420 }}>
              {isAr ? 'عين منصة ذكاء أعمال تراقب الأسواق العالمية وتحلل المخاطر.' : 'AYN monitors global markets, analyzes geopolitical risks, and delivers real-time intelligence so you act before others react.'}
            </p>
          </div>
        </div>
      </section>

      {/* Services section */}
      <section style={{ position: 'relative', minHeight: '100dvh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '80px clamp(24px,4vw,64px)', overflow: 'hidden', background: '#050505' }}>
        <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: 500, height: 500, borderRadius: '50%', background: 'radial-gradient(circle, rgba(251,146,60,0.06) 0%, transparent 65%)', pointerEvents: 'none' }} />
        <div style={{ position: 'relative', zIndex: 2, width: '100%', maxWidth: 1280, margin: '0 auto', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <p style={{ fontFamily: F, fontSize: 10, fontWeight: 600, letterSpacing: '0.30em', textTransform: 'uppercase', color: G, margin: '0 0 14px', textAlign: 'center' }}>Services</p>
          <h2 style={{ fontFamily: FB, fontSize: 'clamp(32px,5vw,68px)', color: '#fff', margin: '0 0 56px', textAlign: 'center', fontWeight: 400 }}>
            {isAr ? 'ما يفعله عين' : 'What AYN Does'}
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 18, width: '100%', marginBottom: 64 }}>
            {[
              { title: isAr ? 'استشارات الذكاء الاصطناعي' : 'AI Consulting',   desc: isAr ? 'تفاعل مع ذكاء الأعمال وقياس الأداء.' : 'Interact with business intelligence and measure performance.',  active: false },
              { title: isAr ? 'ذكاء السوق' : 'Market Intelligence',            desc: isAr ? 'ذكاء السوق لتحليل بيانات السوق.' : 'Market intelligence in analyzing and monitoring market data.',     active: false },
              { title: isAr ? 'استراتيجية البيانات' : 'Data Strategy',         desc: isAr ? 'استراتيجية البيانات والمعرفة التحليلية.' : 'Strategy data and deep analytic knowledge for growth.',         active: true  },
            ].map((card, i) => (
              <div key={i}
                className={card.active ? 'stitch-glass' : ''}
                style={{ padding: '32px 26px', borderRadius: 28, border: card.active ? '1px solid rgba(251,146,60,0.25)' : '1px solid rgba(255,255,255,0.07)', background: card.active ? undefined : 'transparent', boxShadow: card.active ? '0 0 40px rgba(251,146,60,0.09)' : 'none', transition: 'background 0.25s' }}
                onMouseEnter={e => { if (!card.active)(e.currentTarget as HTMLDivElement).style.background = 'rgba(255,255,255,0.03)'; }}
                onMouseLeave={e => { if (!card.active)(e.currentTarget as HTMLDivElement).style.background = 'transparent'; }}>
                <div style={{ width: 50, height: 50, borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 24, background: card.active ? G : 'rgba(255,255,255,0.07)' }}>
                  <div style={{ width: 20, height: 20, borderRadius: '50%', background: card.active ? '#000' : 'rgba(255,255,255,0.4)' }} />
                </div>
                <h3 style={{ fontFamily: FB, fontSize: 22, color: '#fff', margin: '0 0 10px' }}>{card.title}</h3>
                <p style={{ fontFamily: F, fontSize: 14, color: 'rgba(255,255,255,0.55)', lineHeight: 1.65, margin: 0 }}>{card.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA section */}
      <section style={{ position: 'relative', minHeight: '80dvh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', overflow: 'hidden', background: '#000', padding: 'clamp(72px,8vw,120px) 32px 140px' }}>
        <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: 'min(90vw,800px)', height: 'min(90vw,800px)', borderRadius: '50%', background: 'radial-gradient(circle, rgba(251,146,60,0.09) 0%, rgba(251,146,60,0.03) 40%, transparent 65%)', pointerEvents: 'none' }} />
        {[560, 420, 300].map((size, i) => (
          <div key={i} style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: `min(85vw,${size}px)`, height: `min(85vw,${size}px)`, borderRadius: '50%', border: `1px solid rgba(251,146,60,${0.06 - i * 0.015})`, pointerEvents: 'none' }} />
        ))}
        <div style={{ position: 'relative', zIndex: 10, maxWidth: 860, width: '100%', paddingBottom: 100 }}>
          <p style={{ fontFamily: F, fontSize: 10, fontWeight: 600, letterSpacing: '0.30em', textTransform: 'uppercase', color: G, margin: '0 0 24px' }}>Start Today</p>
          <h2 style={{ fontFamily: F, fontSize: 'clamp(40px,8vw,104px)', fontWeight: 800, lineHeight: 1.02, letterSpacing: '-0.025em', color: '#EDE8D8', margin: '0 0 52px' }}>
            {isAr ? <span>ابنِ<br />بذكاء</span> : <span>Build with<br />intelligence</span>}
          </h2>
          <Link to="/pricing" className="gold-glow-btn"
            style={{ display: 'inline-flex', alignItems: 'center', padding: '17px 50px', borderRadius: 100, fontFamily: F, fontSize: 17, fontWeight: 800, color: '#000', textDecoration: 'none' }}>
            {isAr ? 'ابدأ مع عين' : 'Start with AYN'}
          </Link>
        </div>
        <div className="stitch-glass-dark" style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '18px clamp(24px,5vw,80px)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, zIndex: 20, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 24px' }}>
            {[{ label: 'Privacy Policy', href: '/privacy' }, { label: 'Terms', href: '/terms' }, { label: 'Pricing', href: '/pricing' }, { label: 'Contact', href: '/contact' }].map(link => (
              <Link key={link.label} to={link.href} style={{ fontFamily: F, fontSize: 11, fontWeight: 600, letterSpacing: '0.14em', color: 'rgba(255,255,255,0.38)', textDecoration: 'none', textTransform: 'uppercase', transition: 'color 0.2s' }}
                onMouseEnter={e => (e.currentTarget.style.color = '#fff')}
                onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.38)')}>
                {link.label}
              </Link>
            ))}
          </div>
          <span style={{ fontFamily: F, fontSize: 11, fontWeight: 500, letterSpacing: '0.12em', color: 'rgba(255,255,255,0.18)', textTransform: 'uppercase' }}>© 2026 AYN Intelligence</span>
        </div>
      </section>

    </div>
  );
});

HeroScroll.displayName = 'HeroScroll';
