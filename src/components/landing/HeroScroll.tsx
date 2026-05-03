/**
 * HeroScroll — Matches Stitch design exactly:
 * - Robot as FULL-SCREEN background (right-aligned, bleeds off screen)
 * - Text overlaid on LEFT side
 * - Two CTA buttons
 * - "SCROLL TO EXPLORE" bottom left
 * - Scroll drives chapters over the same background
 */

import { useRef, memo } from 'react';
import { useScroll, useMotionValueEvent, motion } from 'framer-motion';
import { HELMET_FRAMES, FRAME_COUNT } from '@/assets/helmet-frames';
import { useLanguage } from '@/contexts/LanguageContext';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';

function clamp(v: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, v)); }
function lerp(v: number, a: number, b: number, c: number, d: number) {
  return c + (clamp(v, a, b) - a) / (b - a) * (d - c);
}

// Preload frames
let cache: HTMLImageElement[] | null = null;
function getCache() {
  if (!cache) cache = HELMET_FRAMES.map(s => { const i = new Image(); i.src = s; return i; });
  return cache;
}

const CHAPTERS = [
  { label: 'WORLD INTELLIGENCE', title: 'See every market\nbefore it moves.', body: 'AYN monitors 187 countries — geopolitical shifts, commodity flows, and live market signals.', stat: '187', unit: 'Countries', in: 0.20, out: 0.42 },
  { label: 'PREDICTIVE AI', title: 'Know what happens\nbefore it does.', body: '73 AI agents simulate how markets respond — before events unfold.', stat: '73', unit: 'World Agents', in: 0.44, out: 0.66 },
  { label: 'AI AGENTS', title: 'Your team.\nNever sleeps.', body: 'Custom agents trained on your data. Intelligence 24/7, in Arabic and English.', stat: '24/7', unit: 'Always On', in: 0.68, out: 0.88 },
];

export const HeroScroll = memo(() => {
  const { language } = useLanguage();
  const isAr = language === 'ar';

  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef       = useRef<HTMLImageElement>(null);
  const lastIdx      = useRef(0);
  const headlineRef  = useRef<HTMLDivElement>(null);
  const chRefs       = useRef<(HTMLDivElement | null)[]>([]);
  const ctaRef       = useRef<HTMLDivElement>(null);
  const hintRef      = useRef<HTMLDivElement>(null);

  // Init frame 0 on mount + RAF for scrubbing
  const rafRef = useRef(0);
  const rawP   = useRef(0);

  // Set frame on mount
  const imgInitRef = useRef(false);
  if (!imgInitRef.current) {
    imgInitRef.current = true;
    const imgs = getCache();
    imgs[0].onload = () => { if (imgRef.current) imgRef.current.src = imgs[0].src; };
    if (imgs[0].complete && imgRef.current) imgRef.current.src = imgs[0].src;
  }

  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ['start start', 'end end'],
  });

  useMotionValueEvent(scrollYProgress, 'change', (p) => {
    rawP.current = p;

    // Scrub frames 0→60%
    if (p <= 0.62) {
      const idx = clamp(Math.round(lerp(p, 0, 0.60, 0, FRAME_COUNT - 1)), 0, FRAME_COUNT - 1);
      if (idx !== lastIdx.current) {
        lastIdx.current = idx;
        const imgs = getCache();
        const img = imgs[idx];
        if (img?.complete && imgRef.current) imgRef.current.src = img.src;
      }
    }

    // Headline: visible until 10%, fades 10–20%
    if (headlineRef.current) {
      const op = p < 0.10 ? 1 : lerp(p, 0.10, 0.20, 1, 0);
      headlineRef.current.style.opacity = `${op}`;
      headlineRef.current.style.transform = `translateY(${lerp(p, 0.10, 0.20, 0, -24)}px)`;
      headlineRef.current.style.pointerEvents = op < 0.05 ? 'none' : 'auto';
    }

    // Scroll hint fades immediately
    if (hintRef.current) {
      hintRef.current.style.opacity = `${lerp(p, 0, 0.08, 1, 0)}`;
    }

    // Chapters
    CHAPTERS.forEach((ch, i) => {
      const el = chRefs.current[i];
      if (!el) return;
      const peak = ch.in + (ch.out - ch.in) * 0.3;
      let op = 0, ty = 28;
      if (p >= ch.in && p <= ch.out) {
        op = p < peak ? lerp(p, ch.in, peak, 0, 1) : lerp(p, peak, ch.out, 1, 0);
        ty = p < peak ? lerp(p, ch.in, peak, 28, 0) : lerp(p, peak, ch.out, 0, -28);
      }
      el.style.opacity = `${op}`;
      el.style.transform = `translateY(${ty}px)`;
      el.style.pointerEvents = op < 0.05 ? 'none' : 'auto';
    });

    // CTA
    if (ctaRef.current) {
      const op = lerp(p, 0.88, 0.96, 0, 1);
      ctaRef.current.style.opacity = `${op}`;
      ctaRef.current.style.pointerEvents = op < 0.05 ? 'none' : 'auto';
    }
  });

  const F  = "'DM Sans', sans-serif";
  const FB = "'Bebas Neue', sans-serif";

  return (
    <div style={{ background: '#000' }}>
      <div ref={containerRef} style={{ height: '400vh', position: 'relative' }}>
        <div className="sticky top-0" style={{ height: '100dvh', overflow: 'hidden', background: '#0a0905', position: 'relative' }}>

          {/* ── FULL-SCREEN ROBOT IMAGE (background, right-aligned) ── */}
          <img
            ref={imgRef}
            src={HELMET_FRAMES[0]}
            alt=""
            draggable={false}
            style={{
              position: 'absolute',
              top: 0,
              right: '-5%',         // bleeds slightly off right edge like Stitch design
              height: '100%',
              width: 'auto',
              maxWidth: '75%',
              objectFit: 'contain',
              objectPosition: 'right center',
              zIndex: 1,
              userSelect: 'none',
              pointerEvents: 'none',
            }}
          />

          {/* Gradient: left side text readability */}
          <div style={{
            position: 'absolute', inset: 0, zIndex: 2,
            background: 'linear-gradient(to right, #0a0905 30%, rgba(10,9,5,0.7) 55%, rgba(10,9,5,0.0) 80%)',
            pointerEvents: 'none',
          }} />

          {/* Gradient: bottom fade */}
          <div style={{
            position: 'absolute', bottom: 0, left: 0, right: 0, height: '30%', zIndex: 2,
            background: 'linear-gradient(to top, #0a0905, transparent)',
            pointerEvents: 'none',
          }} />

          {/* ── TEXT OVERLAY ── */}
          <div style={{
            position: 'absolute', inset: 0, zIndex: 10,
            display: 'flex', flexDirection: 'column', justifyContent: 'center',
            padding: '80px clamp(32px, 6vw, 96px)',
          }}>

            {/* HERO HEADLINE */}
            <div ref={headlineRef} style={{ maxWidth: 560 }}>
              <h1 style={{
                fontFamily: FB,
                fontSize: 'clamp(64px, 8vw, 118px)',
                fontWeight: 400,
                lineHeight: 0.88,
                color: '#fff',
                margin: '0 0 22px',
                letterSpacing: '-0.01em',
                textShadow: '0 0 80px rgba(201,168,76,0.15)',
              }}>
                {isAr ? 'تعرّف على ' : 'Meet '}
                <span style={{ color: '#C9A84C' }}>{isAr ? 'عين' : 'AYN'}</span>
              </h1>
              <p style={{
                fontFamily: F, fontSize: 16, fontWeight: 300, lineHeight: 1.68,
                color: 'rgba(255,255,255,0.55)', maxWidth: 340, margin: '0 0 40px',
              }}>
                {isAr
                  ? 'ذكاء أعمال حقيقي. أسواق، مخاطر، وقرارات تهم.'
                  : 'Real business intelligence. Interact with AYN — and discover what it sees.'}
              </p>
              {/* CTA Buttons — always visible in headline */}
              <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center' }}>
                <Link to="/pricing"
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 8,
                    padding: '13px 30px',
                    background: '#C9A84C',
                    color: '#000',
                    fontFamily: F, fontSize: 13, fontWeight: 600,
                    borderRadius: 100,
                    textDecoration: 'none',
                    transition: 'transform 0.2s, box-shadow 0.2s',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.04)'; e.currentTarget.style.boxShadow = '0 0 32px rgba(201,168,76,0.35)'; }}
                  onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.boxShadow = 'none'; }}>
                  {isAr ? 'ابدأ مع عين' : 'Start with AYN'}
                </Link>
                <Link to="/features"
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 8,
                    padding: '13px 30px',
                    background: 'transparent',
                    border: '1px solid rgba(255,255,255,0.30)',
                    color: 'rgba(255,255,255,0.80)',
                    fontFamily: F, fontSize: 13, fontWeight: 400,
                    borderRadius: 100,
                    textDecoration: 'none',
                    transition: 'all 0.2s',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = '#C9A84C'; e.currentTarget.style.color = '#C9A84C'; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.30)'; e.currentTarget.style.color = 'rgba(255,255,255,0.80)'; }}>
                  {isAr ? 'شاهد كيف يعمل' : 'See how it works'}
                </Link>
              </div>
            </div>

            {/* CHAPTER PANELS */}
            {CHAPTERS.map((ch, i) => (
              <div key={i} ref={el => { chRefs.current[i] = el; }}
                style={{ position: 'absolute', left: 'clamp(32px, 6vw, 96px)', bottom: '20%', maxWidth: 480, opacity: 0, pointerEvents: 'none' }}>
                <p style={{ fontFamily: F, fontSize: 9, fontWeight: 600, letterSpacing: '0.32em', textTransform: 'uppercase', color: '#C9A84C', margin: '0 0 14px' }}>
                  {ch.label}
                </p>
                <h2 style={{ fontFamily: FB, fontSize: 'clamp(40px, 5vw, 72px)', fontWeight: 400, lineHeight: 0.92, color: '#fff', margin: '0 0 18px', whiteSpace: 'pre-line' }}>
                  {ch.title}
                </h2>
                <p style={{ fontFamily: F, fontSize: 15, fontWeight: 300, lineHeight: 1.72, color: 'rgba(255,255,255,0.48)', margin: '0 0 24px', maxWidth: 360 }}>
                  {ch.body}
                </p>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
                  <span style={{ fontFamily: FB, fontSize: 'clamp(44px, 5vw, 68px)', color: '#C9A84C', lineHeight: 1 }}>{ch.stat}</span>
                  <span style={{ fontFamily: F, fontSize: 10, letterSpacing: '0.22em', color: 'rgba(255,255,255,0.28)', textTransform: 'uppercase' }}>{ch.unit}</span>
                </div>
              </div>
            ))}

            {/* CTA PANEL (end of scroll) */}
            <div ref={ctaRef} style={{ position: 'absolute', left: 'clamp(32px, 6vw, 96px)', bottom: '18%', maxWidth: 480, opacity: 0, pointerEvents: 'none' }}>
              <h2 style={{ fontFamily: FB, fontSize: 'clamp(48px, 6vw, 90px)', fontWeight: 400, lineHeight: 0.88, color: '#fff', margin: '0 0 32px' }}>
                Start with <span style={{ color: '#C9A84C' }}>AYN</span>
              </h2>
              <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                <Link to="/pricing"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '14px 36px', background: '#C9A84C', color: '#000', fontFamily: F, fontSize: 12, fontWeight: 700, borderRadius: 100, textDecoration: 'none', transition: 'transform 0.2s' }}
                  onMouseEnter={e => (e.currentTarget.style.transform = 'scale(1.04)')}
                  onMouseLeave={e => (e.currentTarget.style.transform = 'scale(1)')}>
                  {isAr ? 'ابدأ مجاناً' : 'Get Started Free'}
                </Link>
                <Link to="/features"
                  style={{ display: 'inline-flex', alignItems: 'center', padding: '14px 30px', border: '1px solid rgba(255,255,255,0.18)', color: 'rgba(255,255,255,0.60)', fontFamily: F, fontSize: 12, borderRadius: 100, textDecoration: 'none', transition: 'all 0.2s' }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = '#C9A84C'; e.currentTarget.style.color = '#C9A84C'; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.18)'; e.currentTarget.style.color = 'rgba(255,255,255,0.60)'; }}>
                  {isAr ? 'استكشف المميزات' : 'See Features'}
                </Link>
              </div>
            </div>

            {/* SCROLL TO EXPLORE — bottom left */}
            <div ref={hintRef} style={{
              position: 'absolute', bottom: 36, left: 'clamp(32px, 6vw, 96px)',
              display: 'flex', alignItems: 'center', gap: 16,
            }}>
              <div style={{ width: 1, height: 40, background: 'rgba(201,168,76,0.4)' }} />
              <span style={{ fontFamily: F, fontSize: 10, letterSpacing: '0.24em', color: 'rgba(255,255,255,0.28)', textTransform: 'uppercase' }}>
                Scroll to explore
              </span>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
});

HeroScroll.displayName = 'HeroScroll';
