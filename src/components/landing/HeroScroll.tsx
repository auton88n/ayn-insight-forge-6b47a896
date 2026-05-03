/**
 * HeroScroll — Stage 1 of the Stitch design.
 * Left: headline + scroll-driven chapters.
 * Right: 3D object zone (your Spline/Three.js scene goes here).
 * Pure black. No frames. No old animation. Clean slate.
 */

import { useRef, memo } from 'react';
import { useScroll, useMotionValueEvent } from 'framer-motion';
import { useLanguage } from '@/contexts/LanguageContext';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';

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
    in: 0.20, out: 0.42,
  },
  {
    label: 'PREDICTIVE AI',
    title: 'Know what happens\nbefore it does.',
    body: '73 AI agents simulate how populations, governments, and markets respond — before events unfold.',
    stat: '73', unit: 'World Agents',
    in: 0.44, out: 0.66,
  },
  {
    label: 'AI AGENTS',
    title: 'Your team.\nNever sleeps.',
    body: 'Custom agents trained on your data. Intelligence delivered 24/7, in Arabic and English.',
    stat: '24/7', unit: 'Always On',
    in: 0.68, out: 0.88,
  },
];

export const HeroScroll = memo(() => {
  const { language } = useLanguage();
  const isAr = language === 'ar';

  const containerRef  = useRef<HTMLDivElement>(null);
  const headlineRef   = useRef<HTMLDivElement>(null);
  const chRefs        = useRef<(HTMLDivElement | null)[]>([]);
  const ctaRef        = useRef<HTMLDivElement>(null);
  const hintRef       = useRef<HTMLDivElement>(null);

  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ['start start', 'end end'],
  });

  useMotionValueEvent(scrollYProgress, 'change', (p) => {
    // Headline fades out at 10–20%
    if (headlineRef.current) {
      const op = p < 0.10 ? 1 : lerp(p, 0.10, 0.20, 1, 0);
      headlineRef.current.style.opacity = `${op}`;
      headlineRef.current.style.transform = `translateY(${lerp(p, 0.10, 0.20, 0, -32)}px)`;
      headlineRef.current.style.pointerEvents = op < 0.05 ? 'none' : 'auto';
    }

    // Scroll hint
    if (hintRef.current) {
      hintRef.current.style.opacity = `${lerp(p, 0, 0.08, 1, 0)}`;
    }

    // Chapters
    CHAPTERS.forEach((ch, i) => {
      const el = chRefs.current[i];
      if (!el) return;
      const peak = ch.in + (ch.out - ch.in) * 0.3;
      let op = 0, ty = 32;
      if (p >= ch.in && p <= ch.out) {
        op = p < peak ? lerp(p, ch.in, peak, 0, 1) : lerp(p, peak, ch.out, 1, 0);
        ty = p < peak ? lerp(p, ch.in, peak, 32, 0) : lerp(p, peak, ch.out, 0, -32);
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

  const F = "'DM Sans',sans-serif";
  const FB = "'Bebas Neue',sans-serif";

  return (
    <div style={{ background: '#000' }}>
      {/* 400vh scroll container */}
      <div ref={containerRef} style={{ height: '400vh', position: 'relative' }}>
        <div className="sticky top-0" style={{
          height: '100dvh',
          background: '#000',
          display: 'grid',
          gridTemplateColumns: '45% 55%',
          overflow: 'hidden',
        }}>

          {/* ── LEFT: text layers ── */}
          <div style={{ display: 'flex', alignItems: 'center', padding: '0 clamp(32px,5vw,80px)', position: 'relative', zIndex: 10 }}>
            <div style={{ position: 'relative', width: '100%', height: '70vh' }}>

              {/* HERO HEADLINE */}
              <div ref={headlineRef} style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                <p style={{ fontFamily: F, fontSize: 10, fontWeight: 500, letterSpacing: '0.28em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.28)', margin: '0 0 20px' }}>
                  {isAr ? 'ذكاء الأعمال' : 'World Intelligence Platform'}
                </p>
                <h1 style={{ fontFamily: FB, fontSize: 'clamp(64px,7.5vw,116px)', fontWeight: 400, lineHeight: 0.88, color: '#fff', margin: '0 0 28px', letterSpacing: '-0.01em' }}>
                  {isAr ? 'تعرّف على ' : 'Meet '}
                  <span style={{ color: '#C9A84C' }}>{isAr ? 'عين' : 'AYN'}</span>
                </h1>
                <p style={{ fontFamily: F, fontSize: 16, fontWeight: 300, lineHeight: 1.72, color: 'rgba(255,255,255,0.42)', maxWidth: 360, margin: '0 0 44px' }}>
                  {isAr
                    ? 'ذكاء أعمال حقيقي. أسواق، مخاطر، وقرارات تهم.'
                    : 'Real business intelligence. Scroll to see AYN in action — and discover what it sees.'}
                </p>
                <div ref={hintRef} style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <div style={{ width: 32, height: 1, background: 'rgba(201,168,76,0.5)' }} />
                  <span style={{ fontFamily: F, fontSize: 10, letterSpacing: '0.24em', color: 'rgba(255,255,255,0.20)', textTransform: 'uppercase' }}>
                    Scroll to explore
                  </span>
                </div>
              </div>

              {/* CHAPTER PANELS */}
              {CHAPTERS.map((ch, i) => (
                <div key={i} ref={el => { chRefs.current[i] = el; }}
                  style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', opacity: 0, pointerEvents: 'none' }}>
                  <p style={{ fontFamily: F, fontSize: 9, fontWeight: 600, letterSpacing: '0.32em', textTransform: 'uppercase', color: '#C9A84C', margin: '0 0 16px' }}>
                    {ch.label}
                  </p>
                  <h2 style={{ fontFamily: FB, fontSize: 'clamp(44px,5.2vw,80px)', fontWeight: 400, lineHeight: 0.92, color: '#fff', margin: '0 0 22px', whiteSpace: 'pre-line' }}>
                    {ch.title}
                  </h2>
                  <p style={{ fontFamily: F, fontSize: 15, fontWeight: 300, lineHeight: 1.75, color: 'rgba(255,255,255,0.44)', maxWidth: 340, margin: '0 0 30px' }}>
                    {ch.body}
                  </p>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
                    <span style={{ fontFamily: FB, fontSize: 'clamp(48px,5.5vw,76px)', color: '#C9A84C', lineHeight: 1 }}>{ch.stat}</span>
                    <span style={{ fontFamily: F, fontSize: 10, letterSpacing: '0.22em', color: 'rgba(255,255,255,0.28)', textTransform: 'uppercase' }}>{ch.unit}</span>
                  </div>
                </div>
              ))}

              {/* CTA PANEL */}
              <div ref={ctaRef} style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', opacity: 0, pointerEvents: 'none' }}>
                <p style={{ fontFamily: F, fontSize: 9, letterSpacing: '0.30em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.22)', margin: '0 0 14px' }}>
                  Ready to see the world clearly?
                </p>
                <h2 style={{ fontFamily: FB, fontSize: 'clamp(48px,5.8vw,88px)', fontWeight: 400, lineHeight: 0.88, color: '#fff', margin: '0 0 34px' }}>
                  Start with <span style={{ color: '#C9A84C' }}>AYN</span>
                </h2>
                <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center' }}>
                  <Link to="/pricing"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 10, padding: '14px 36px', background: '#C9A84C', color: '#000', fontFamily: F, fontSize: 11, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', textDecoration: 'none', transition: 'transform 0.2s' }}
                    onMouseEnter={e => (e.currentTarget.style.transform = 'scale(1.04)')}
                    onMouseLeave={e => (e.currentTarget.style.transform = 'scale(1)')}>
                    {isAr ? 'ابدأ مجاناً' : 'Get Started Free'} <ArrowRight size={13} />
                  </Link>
                  <Link to="/features"
                    style={{ display: 'inline-flex', alignItems: 'center', padding: '14px 30px', border: '1px solid rgba(255,255,255,0.14)', color: 'rgba(255,255,255,0.52)', fontFamily: F, fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', textDecoration: 'none', transition: 'all 0.2s' }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.4)'; e.currentTarget.style.color = '#fff'; }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.14)'; e.currentTarget.style.color = 'rgba(255,255,255,0.52)'; }}>
                    {isAr ? 'استكشف المميزات' : 'See Features'}
                  </Link>
                </div>
              </div>

            </div>
          </div>

          {/* ── RIGHT: 3D object zone ──────────────────────────────────────
              👉 THIS IS WHERE YOUR 3D OBJECT GOES.
              Replace the placeholder div below with your Spline scene
              or Three.js canvas. The scrollYProgress value (0→1) is
              available from useScroll above — pass it to your scene
              to drive the animation.

              Example:
                import { SplineScene } from '@/components/ui/spline';
                <SplineScene scene="your-spline-url" className="w-full h-full" />

              Or for Three.js:
                <YourThreeCanvas scrollProgress={scrollYProgress} />
          ─────────────────────────────────────────────────────────────── */}
          <div style={{ position: 'relative', background: '#000', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {/* Placeholder — remove this when you add your 3D object */}
            <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.06)', fontFamily: "'DM Sans',sans-serif", fontSize: 12, letterSpacing: '0.2em', textTransform: 'uppercase' }}>
              3D Object Here
            </div>
          </div>

          {/* Bottom hairline */}
          <div style={{ position: 'absolute', bottom: 0, left: '5%', right: '5%', height: 1, background: 'linear-gradient(to right, transparent, rgba(201,168,76,0.10), transparent)' }} />

        </div>
      </div>
    </div>
  );
});

HeroScroll.displayName = 'HeroScroll';
