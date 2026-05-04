/**
 * HeroScroll — Premium redesign.
 *
 * Design system (from awesome-design-md Linear + taste-skill):
 *   DESIGN_VARIANCE: 7  MOTION_INTENSITY: 6  VISUAL_DENSITY: 3
 *   Style: Minimal, premium, futuristic, editorial, luxury-tech
 *   Fonts: Geist (display + body) — Linear's recommended substitute
 *   Colors: Pure white #fff bg, graphite #0a0a0f text, silver/charcoal accents
 *   NO orange anywhere
 *
 * 3D OBJECT BEHAVIOR:
 *   - Scroll drives frame scrubbing (0→FRAME_COUNT-1)
 *   - Pointer drives horizontal drift: mouse X → translateX ±28px
 *   - Smooth spring interpolation (lerp 0.06) for premium weight
 *   - Object breathes with subtle Y oscillation
 *   - Never touches frame edges (safe 8% inset)
 *   - Feels like a controlled virtual studio product shot
 */

import { useEffect, useRef, memo, useCallback } from 'react';
import { useReducedMotion } from 'framer-motion';
import { HELMET_FRAMES, FRAME_COUNT } from '@/assets/helmet-frames';
import { useLanguage } from '@/contexts/LanguageContext';
import { Link } from 'react-router-dom';
import { ArrowRight, Search, BarChart3, Target } from 'lucide-react';

function clamp(v: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, v)); }
function lerp(a: number, b: number, t: number) { return a + (b - a) * t; }
function mapRange(v: number, a: number, b: number, c: number, d: number) {
  return c + (clamp(v, a, b) - a) / (b - a) * (d - c);
}

/* ── Design tokens (Linear-inspired, white bg) ── */
const T = {
  bg:       '#ffffff',
  bgOff:    '#f7f7f6',      // off-white sections
  ink:      '#0a0a0f',      // graphite near-black
  inkMuted: 'rgba(10,10,15,0.50)',
  inkFaint: 'rgba(10,10,15,0.28)',
  hairline: 'rgba(10,10,15,0.08)',
  hairlineStrong: 'rgba(10,10,15,0.14)',
  // Accent: charcoal — restrained, never flashy
  accent:   '#1a1a2e',      // deep charcoal-navy
  accentMid:'rgba(26,26,46,0.60)',
  surface1: 'rgba(10,10,15,0.04)',
  surface2: 'rgba(10,10,15,0.07)',
  // Font
  font:     "'Geist', 'DM Sans', system-ui, sans-serif",
  fontMono: "'Geist Mono', monospace",
};

/* ── Chapters ── */
const CHAPTERS = [
  {
    eyebrow: 'Market Intelligence',
    headline: 'See every market\nbefore it moves.',
    body: 'AYN monitors 187 countries — geopolitical shifts, commodity flows, and live market signals — in real time.',
    stat: '187', unit: 'Countries',
    in: 0.15, out: 0.37,
  },
  {
    eyebrow: 'Predictive AI',
    headline: 'Know what happens\nbefore it does.',
    body: '73 AI agents simulate how populations, governments, and markets respond — before events unfold.',
    stat: '73', unit: 'World Agents',
    in: 0.40, out: 0.60,
  },
  {
    eyebrow: 'AI Agents',
    headline: 'Your intelligence team.\nNever sleeps.',
    body: 'Custom agents trained on your data. Intelligence delivered 24/7, in Arabic and English.',
    stat: '24/7', unit: 'Always On',
    in: 0.63, out: 0.82,
  },
];

/* ── Preload ── */
const imageCache: HTMLImageElement[] = HELMET_FRAMES.map(src => {
  const img = new Image(); img.src = src; img.decoding = 'async'; return img;
});

export const HeroScroll = memo(() => {
  const { language } = useLanguage();
  const isAr = language === 'ar';
  const reduced = useReducedMotion();

  /* ── Refs ── */
  const spacerRef   = useRef<HTMLDivElement>(null);
  const imgRef      = useRef<HTMLImageElement>(null);
  const wrapRef     = useRef<HTMLDivElement>(null); // scale + Y
  const driftRef    = useRef<HTMLDivElement>(null); // pointer X drift
  const headRef     = useRef<HTMLDivElement>(null);
  const ctaRef      = useRef<HTMLDivElement>(null);
  const chRefs      = useRef<(HTMLDivElement | null)[]>([]);

  /* ── Animation state ── */
  const scrollP     = useRef(0);
  const mouseX      = useRef(0.5); // normalized 0–1
  const curFrame    = useRef(0);
  const lastFrame   = useRef(-1);
  const curScale    = useRef(1);
  const curY        = useRef(0);
  const curDriftX   = useRef(0);
  const time        = useRef(0);

  /* ── Scroll ── */
  const onScroll = useCallback(() => {
    const s = spacerRef.current;
    if (!s) return;
    scrollP.current = clamp(-s.getBoundingClientRect().top / (s.offsetHeight - window.innerHeight), 0, 1);
  }, []);

  /* ── Pointer ── */
  const onMouseMove = useCallback((e: MouseEvent) => {
    mouseX.current = e.clientX / window.innerWidth;
  }, []);

  useEffect(() => {
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('mousemove', onMouseMove, { passive: true });
    onScroll();
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('mousemove', onMouseMove);
    };
  }, [onScroll, onMouseMove]);

  /* ── RAF ── */
  useEffect(() => {
    // Set frame 0 immediately
    if (imageCache[0]?.complete && imgRef.current) {
      imgRef.current.src = imageCache[0].src; lastFrame.current = 0;
    } else if (imageCache[0]) {
      imageCache[0].onload = () => { if (imgRef.current) imgRef.current.src = imageCache[0].src; };
    }

    const LERP_FAST = 0.10;
    const LERP_SLOW = 0.06; // Spring weight for premium feel

    const tick = (t: number) => {
      const id = requestAnimationFrame(tick);
      time.current = t;
      const p = scrollP.current;

      /* 1. Frame scrub — direct, no lerp */
      if (!reduced) {
        const idx = clamp(Math.round(p * (FRAME_COUNT - 1)), 0, FRAME_COUNT - 1);
        if (idx !== lastFrame.current) {
          lastFrame.current = idx;
          const c = imageCache[idx];
          if (c?.complete && imgRef.current) imgRef.current.src = c.src;
        }
      }

      /* 2. Object wrapper: subtle scale breath + Y parallax */
      if (!reduced && wrapRef.current) {
        const targetScale = p < 0.5
          ? mapRange(p, 0, 0.5, 1.0, 1.04)
          : mapRange(p, 0.5, 1.0, 1.04, 1.0);
        curScale.current = lerp(curScale.current, targetScale, LERP_SLOW);

        // Y: subtle idle breathing + scroll parallax
        const breathe = Math.sin(t * 0.0006) * 5;
        const parallax = mapRange(p, 0, 1, 0, -18);
        curY.current = lerp(curY.current, parallax + breathe, LERP_SLOW);

        wrapRef.current.style.transform =
          `translateY(${curY.current.toFixed(2)}px) scale(${curScale.current.toFixed(4)})`;
      }

      /* 3. Pointer drift — horizontal, premium spring */
      if (!reduced && driftRef.current) {
        // Mouse normalized 0–1 → drift ±28px
        // Center (0.5) = 0 drift. Left = +28px, Right = -28px (object tracks cursor)
        const targetDrift = mapRange(mouseX.current, 0, 1, 22, -22);
        curDriftX.current = lerp(curDriftX.current, targetDrift, LERP_SLOW);
        driftRef.current.style.transform = `translateX(${curDriftX.current.toFixed(2)}px)`;
      }

      /* 4. Object opacity fade-in */
      if (imgRef.current) {
        imgRef.current.style.opacity = `${mapRange(p, 0, 0.07, 0, 1)}`;
      }

      /* 5. Headline */
      if (headRef.current) {
        const op = p < 0.10 ? 1 : mapRange(p, 0.10, 0.18, 1, 0);
        const ty = mapRange(p, 0.10, 0.18, 0, -24);
        headRef.current.style.opacity = `${op}`;
        headRef.current.style.transform = `translateY(${ty}px)`;
        headRef.current.style.pointerEvents = op < 0.05 ? 'none' : 'auto';
      }

      /* 6. Chapters */
      CHAPTERS.forEach((ch, i) => {
        const el = chRefs.current[i];
        if (!el) return;
        const peak = ch.in + (ch.out - ch.in) * 0.25;
        const fadeOut = ch.out - (ch.out - ch.in) * 0.18;
        let op = 0, ty = 20;
        if (p >= ch.in && p <= ch.out) {
          if (p < peak) { op = mapRange(p, ch.in, peak, 0, 1); ty = mapRange(p, ch.in, peak, 20, 0); }
          else if (p < fadeOut) { op = 1; ty = 0; }
          else { op = mapRange(p, fadeOut, ch.out, 1, 0); ty = mapRange(p, fadeOut, ch.out, 0, -20); }
        }
        el.style.opacity = `${op}`;
        el.style.transform = `translateY(${ty}px)`;
        el.style.pointerEvents = op < 0.05 ? 'none' : 'auto';
      });

      /* 7. CTA */
      if (ctaRef.current) {
        const op = mapRange(p, 0.84, 0.93, 0, 1);
        ctaRef.current.style.opacity = `${op}`;
        ctaRef.current.style.pointerEvents = op < 0.05 ? 'none' : 'auto';
      }

      return () => cancelAnimationFrame(id);
    };
    const id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
  }, [reduced]);

  return (
    <div style={{ background: T.bg, fontFamily: T.font }}>

      {/* ════════════════════════════════════════════════════════
          HERO — 600vh sticky scroll storytelling
      ════════════════════════════════════════════════════════ */}
      <div ref={spacerRef} style={{ height: '600vh', position: 'relative' }}>
        <div className="sticky top-0" style={{ height: '100dvh', overflow: 'hidden', background: T.bg }}>

          {/* 3D OBJECT ── pointer-drift wrapper → scale/Y wrapper → img */}
          <div ref={driftRef} style={{ position: 'absolute', inset: 0, willChange: 'transform' }}>
            <div ref={wrapRef} style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', paddingRight: 'clamp(32px, 4vw, 80px)', transformOrigin: 'center center', willChange: 'transform' }}>
              {/*
                WHITE CRUSH ILLUSION:
                Frame pixels > 228 are crushed to 255 = identical to #fff page.
                The object literally floats with no visible boundary.
                filter: drop-shadow creates soft studio ground shadow (not a glow box)
              */}
              <img
                ref={imgRef}
                alt="AYN"
                draggable={false}
                style={{
                  width: 'min(50vw, 660px)',
                  height: 'min(50vw, 660px)',
                  objectFit: 'contain',
                  objectPosition: 'center',
                  display: 'block',
                  userSelect: 'none',
                  pointerEvents: 'none',
                  opacity: 0,
                  willChange: 'opacity',
                  // Subtle studio ground shadow — premium product-page technique
                  filter: 'drop-shadow(0 40px 60px rgba(10,10,15,0.10)) drop-shadow(0 8px 16px rgba(10,10,15,0.06))',
                }}
              />
            </div>
          </div>

          {/* Left gradient — text readability */}
          <div style={{ position: 'absolute', inset: 0, zIndex: 2, background: 'linear-gradient(to right, rgba(255,255,255,0.97) 0%, rgba(255,255,255,0.82) 38%, rgba(255,255,255,0.0) 65%)', pointerEvents: 'none' }} />

          {/* TEXT LAYERS */}
          <div style={{ position: 'absolute', inset: 0, zIndex: 10, display: 'flex', alignItems: 'center', padding: '80px clamp(24px,6vw,96px)' }}>
            <div style={{ position: 'relative', width: '100%', maxWidth: 520, height: 'min(80vh, 560px)' }}>

              {/* ── HEADLINE ── */}
              <div ref={headRef} style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', willChange: 'opacity, transform' }}>
                {/* Eyebrow */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24 }}>
                  <div style={{ width: 20, height: 1, background: T.inkFaint }} />
                  <span style={{ fontFamily: T.font, fontSize: 11, fontWeight: 500, letterSpacing: '0.14em', color: T.inkMuted, textTransform: 'uppercase' }}>
                    {isAr ? 'منصة ذكاء الأعمال' : 'World Intelligence Platform'}
                  </span>
                </div>

                {/* Main headline — Geist, tight tracking */}
                <h1 style={{ fontFamily: T.font, fontSize: 'clamp(52px,8vw,108px)', fontWeight: 700, lineHeight: 0.92, letterSpacing: '-0.03em', color: T.ink, margin: '0 0 24px' }}>
                  {isAr ? <>تعرّف على<br /><span style={{ color: T.accentMid }}>عين</span></> : <>Meet<br /><span style={{ color: T.accentMid }}>AYN</span></>}
                </h1>

                {/* Subtitle */}
                <p style={{ fontFamily: T.font, fontSize: 17, fontWeight: 400, lineHeight: 1.65, color: T.inkMuted, maxWidth: 380, margin: '0 0 40px', letterSpacing: '-0.01em' }}>
                  {isAr ? 'ذكاء أعمال حقيقي. تفاعل مع عين واكتشف ما يراه.' : 'Real business intelligence. Scroll to explore AYN — and discover what it sees.'}
                </p>

                {/* CTAs */}
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', marginBottom: 52 }}>
                  <Link to="/pricing"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '11px 22px', background: T.ink, color: '#fff', fontFamily: T.font, fontSize: 14, fontWeight: 500, letterSpacing: '-0.01em', borderRadius: 8, textDecoration: 'none', transition: 'background 0.2s, transform 0.15s' }}
                    onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.background = '#1a1a2e'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.background = T.ink; }}
                    onMouseDown={e => { (e.currentTarget as HTMLAnchorElement).style.transform = 'scale(0.98)'; }}
                    onMouseUp={e => { (e.currentTarget as HTMLAnchorElement).style.transform = 'scale(1)'; }}>
                    {isAr ? 'ابدأ مجاناً' : 'Get Started Free'} <ArrowRight size={13} />
                  </Link>
                  <Link to="/features"
                    style={{ display: 'inline-flex', alignItems: 'center', padding: '11px 20px', background: 'transparent', color: T.ink, fontFamily: T.font, fontSize: 14, fontWeight: 400, letterSpacing: '-0.01em', borderRadius: 8, border: `1px solid ${T.hairlineStrong}`, textDecoration: 'none', transition: 'border-color 0.2s, background 0.2s' }}
                    onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.background = T.surface1; (e.currentTarget as HTMLAnchorElement).style.borderColor = 'rgba(10,10,15,0.28)'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.background = 'transparent'; (e.currentTarget as HTMLAnchorElement).style.borderColor = T.hairlineStrong; }}>
                    {isAr ? 'اكتشف المزيد' : 'See how it works'}
                  </Link>
                </div>

                {/* Stats */}
                <div style={{ display: 'flex', gap: 36, paddingTop: 24, borderTop: `1px solid ${T.hairline}` }}>
                  {[
                    { n: '187+', l: isAr ? 'دولة' : 'Countries' },
                    { n: '73',   l: isAr ? 'وكيل ذكاء' : 'AI Agents' },
                    { n: '24/7', l: isAr ? 'مراقبة' : 'Monitoring' },
                  ].map((s, i) => (
                    <div key={i}>
                      <p style={{ fontFamily: T.font, fontSize: 26, fontWeight: 600, color: T.ink, lineHeight: 1, margin: '0 0 4px', letterSpacing: '-0.03em' }}>{s.n}</p>
                      <p style={{ fontFamily: T.font, fontSize: 11, fontWeight: 400, letterSpacing: '0.06em', color: T.inkFaint, textTransform: 'uppercase', margin: 0 }}>{s.l}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* ── CHAPTERS ── */}
              {CHAPTERS.map((ch, i) => (
                <div key={i} ref={el => { chRefs.current[i] = el; }}
                  style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', opacity: 0, pointerEvents: 'none', willChange: 'opacity, transform' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
                    <div style={{ width: 20, height: 1, background: T.inkFaint }} />
                    <span style={{ fontFamily: T.font, fontSize: 11, fontWeight: 500, letterSpacing: '0.14em', color: T.inkMuted, textTransform: 'uppercase' }}>{ch.eyebrow}</span>
                  </div>
                  <h2 style={{ fontFamily: T.font, fontSize: 'clamp(38px,4.8vw,70px)', fontWeight: 700, lineHeight: 0.94, letterSpacing: '-0.03em', color: T.ink, margin: '0 0 20px', whiteSpace: 'pre-line' }}>{ch.headline}</h2>
                  <p style={{ fontFamily: T.font, fontSize: 15, fontWeight: 400, lineHeight: 1.70, color: T.inkMuted, maxWidth: 360, margin: '0 0 28px', letterSpacing: '-0.01em' }}>{ch.body}</p>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                    <span style={{ fontFamily: T.font, fontSize: 'clamp(44px,5vw,68px)', fontWeight: 700, color: T.ink, lineHeight: 1, letterSpacing: '-0.04em' }}>{ch.stat}</span>
                    <span style={{ fontFamily: T.font, fontSize: 11, fontWeight: 400, letterSpacing: '0.08em', color: T.inkFaint, textTransform: 'uppercase' }}>{ch.unit}</span>
                  </div>
                </div>
              ))}

              {/* ── CTA PANEL ── */}
              <div ref={ctaRef} style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', opacity: 0, pointerEvents: 'none', willChange: 'opacity' }}>
                <span style={{ fontFamily: T.font, fontSize: 11, fontWeight: 500, letterSpacing: '0.14em', color: T.inkFaint, textTransform: 'uppercase', marginBottom: 16 }}>Start Today</span>
                <h2 style={{ fontFamily: T.font, fontSize: 'clamp(44px,5.5vw,82px)', fontWeight: 700, lineHeight: 0.92, letterSpacing: '-0.035em', color: T.ink, margin: '0 0 32px' }}>
                  {isAr ? 'ابدأ مع عين' : <>Start with<br />AYN</>}
                </h2>
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                  <Link to="/pricing"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '12px 24px', background: T.ink, color: '#fff', fontFamily: T.font, fontSize: 14, fontWeight: 500, letterSpacing: '-0.01em', borderRadius: 8, textDecoration: 'none', transition: 'background 0.2s' }}
                    onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.background = '#1a1a2e'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.background = T.ink; }}>
                    {isAr ? 'ابدأ مجاناً' : 'Get Started Free'} <ArrowRight size={13} />
                  </Link>
                  <Link to="/features"
                    style={{ display: 'inline-flex', alignItems: 'center', padding: '12px 20px', background: 'transparent', color: T.ink, fontFamily: T.font, fontSize: 14, borderRadius: 8, border: `1px solid ${T.hairlineStrong}`, textDecoration: 'none', transition: 'background 0.2s' }}
                    onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.background = T.surface1; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.background = 'transparent'; }}>
                    {isAr ? 'استكشف' : 'See Features'}
                  </Link>
                </div>
              </div>

            </div>
          </div>

          {/* Progress dots */}
          <div style={{ position: 'absolute', right: 28, top: '50%', transform: 'translateY(-50%)', display: 'flex', flexDirection: 'column', gap: 8, zIndex: 20 }}>
            {[0,1,2].map(i => <div key={i} style={{ width: 3, height: 3, borderRadius: '50%', background: T.hairlineStrong }} />)}
          </div>

          {/* Bottom hairline */}
          <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 1, background: T.hairline, zIndex: 5 }} />
        </div>
      </div>

      {/* ════════════════════════════════════════════════════════
          SECTION 2 — Intelligence, evolved.
      ════════════════════════════════════════════════════════ */}
      <section style={{ position: 'relative', minHeight: '100dvh', display: 'flex', alignItems: 'center', padding: '96px clamp(24px,6vw,96px)', overflow: 'hidden', background: T.bgOff, borderBottom: `1px solid ${T.hairline}` }}>
        {/* Subtle large ring decoration */}
        <div className="landing-decor-lg" style={{ position: 'absolute', right: '-8%', top: '50%', transform: 'translateY(-50%)', width: 480, height: 480, borderRadius: '50%', border: `1px solid ${T.hairline}`, pointerEvents: 'none' }}>
          <div style={{ position: 'absolute', inset: 60, borderRadius: '50%', border: `1px solid ${T.hairline}` }} />
          <div style={{ position: 'absolute', inset: 140, borderRadius: '50%', border: `1px solid ${T.hairline}` }} />
          <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: 6, height: 6, borderRadius: '50%', background: T.inkFaint }} />
        </div>

        <div style={{ position: 'relative', zIndex: 2, width: '100%', maxWidth: 1280, margin: '0 auto' }}>
          <div style={{ maxWidth: 520 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24 }}>
              <div style={{ width: 20, height: 1, background: T.inkFaint }} />
              <span style={{ fontFamily: T.font, fontSize: 11, fontWeight: 500, letterSpacing: '0.14em', color: T.inkMuted, textTransform: 'uppercase' }}>About AYN</span>
            </div>
            <h2 style={{ fontFamily: T.font, fontSize: 'clamp(34px,4.5vw,64px)', fontWeight: 700, lineHeight: 1.04, letterSpacing: '-0.035em', color: T.ink, margin: '0 0 24px' }}>
              {isAr ? 'ذكاء متطوّر.' : <span>Intelligence,<br />evolved.</span>}
            </h2>
            <p style={{ fontFamily: T.font, fontSize: 16, fontWeight: 400, lineHeight: 1.72, color: T.inkMuted, maxWidth: 420, letterSpacing: '-0.01em' }}>
              {isAr ? 'عين منصة ذكاء أعمال تراقب الأسواق العالمية وتحلل المخاطر وتقدم رؤى فورية.' : 'AYN monitors global markets, analyzes geopolitical risks, and delivers real-time intelligence so you act before others react.'}
            </p>
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════
          SECTION 3 — Features / Business understood
      ════════════════════════════════════════════════════════ */}
      <section style={{ position: 'relative', minHeight: '100dvh', display: 'flex', alignItems: 'center', padding: '96px clamp(24px,5vw,80px)', background: T.bg, borderBottom: `1px solid ${T.hairline}` }}>
        <div style={{ width: '100%', maxWidth: 1280, margin: '0 auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px,1fr))', gap: 'clamp(40px,6vw,96px)', alignItems: 'center' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24 }}>
              <div style={{ width: 20, height: 1, background: T.inkFaint }} />
              <span style={{ fontFamily: T.font, fontSize: 11, fontWeight: 500, letterSpacing: '0.14em', color: T.inkMuted, textTransform: 'uppercase' }}>Capabilities</span>
            </div>
            <h2 style={{ fontFamily: T.font, fontSize: 'clamp(32px,4.2vw,60px)', fontWeight: 700, lineHeight: 1.06, letterSpacing: '-0.03em', color: T.ink, margin: '0 0 20px' }}>
              {isAr ? 'أعمالك، مُفهومة.' : <span>Your business,<br />understood.</span>}
            </h2>
            <p style={{ fontFamily: T.font, fontSize: 15, fontWeight: 400, lineHeight: 1.72, color: T.inkMuted, maxWidth: 360, letterSpacing: '-0.01em' }}>
              {isAr ? 'نحلل بيانات شركتك ونساعدك في اتخاذ القرارات الاستراتيجية.' : 'We analyze your business data and help you make strategic decisions with precision and clarity.'}
            </p>
          </div>

          {/* Feature cards — Linear-style charcoal tiles */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {[
              { label: 'Deep Analysis', val: '84.2%', sub: 'Prediction accuracy', bars: [35,65,40,88,60,78,45,70,55] },
              { label: 'Global Reach', val: '187', sub: 'Countries monitored' },
              { label: 'Response Time', val: '<2s', sub: 'Average query latency' },
            ].map((card, i) => (
              <div key={i}
                style={{ padding: '20px 22px', background: i === 0 ? T.surface2 : T.surface1, border: `1px solid ${T.hairline}`, borderRadius: 10, transition: 'background 0.2s', cursor: 'default' }}
                onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.background = T.surface2; }}
                onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = i === 0 ? T.surface2 : T.surface1; }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                  <span style={{ fontFamily: T.font, fontSize: 13, fontWeight: 500, color: T.inkMuted, letterSpacing: '-0.01em' }}>{card.label}</span>
                  <span style={{ fontFamily: T.fontMono, fontSize: 18, fontWeight: 600, color: T.ink, letterSpacing: '-0.02em', lineHeight: 1 }}>{card.val}</span>
                </div>
                {card.bars && (
                  <div style={{ height: 40, display: 'flex', alignItems: 'flex-end', gap: 2, marginBottom: 10 }}>
                    {card.bars.map((h, j) => (
                      <div key={j} style={{ flex: 1, height: `${h}%`, background: T.hairlineStrong, borderRadius: '2px 2px 0 0' }} />
                    ))}
                  </div>
                )}
                <span style={{ fontFamily: T.font, fontSize: 11, color: T.inkFaint, letterSpacing: '0.04em' }}>{card.sub}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════
          SECTION 4 — Services
      ════════════════════════════════════════════════════════ */}
      <section style={{ position: 'relative', minHeight: '100dvh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '96px clamp(24px,4vw,64px)', background: T.bgOff, borderBottom: `1px solid ${T.hairline}` }}>
        <div style={{ width: '100%', maxWidth: 1280, margin: '0 auto', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
            <div style={{ width: 20, height: 1, background: T.inkFaint }} />
            <span style={{ fontFamily: T.font, fontSize: 11, fontWeight: 500, letterSpacing: '0.14em', color: T.inkMuted, textTransform: 'uppercase' }}>Services</span>
          </div>
          <h2 style={{ fontFamily: T.font, fontSize: 'clamp(30px,4.5vw,62px)', fontWeight: 700, letterSpacing: '-0.03em', color: T.ink, margin: '0 0 56px', textAlign: 'center', lineHeight: 1.04 }}>
            {isAr ? 'ما يفعله عين' : 'What AYN does'}
          </h2>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px,1fr))', gap: 2, width: '100%' }}>
            {[
              { icon: Search,    title: isAr ? 'استشارات الذكاء الاصطناعي' : 'AI Consulting',    desc: isAr ? 'تفاعل مع ذكاء الأعمال وقياس الأداء.' : 'Interact with business intelligence and measure impact.', featured: false },
              { icon: BarChart3, title: isAr ? 'ذكاء السوق' : 'Market Intelligence',              desc: isAr ? 'ذكاء السوق لتحليل بيانات السوق.' : 'Market intelligence in analyzing and monitoring signals.',  featured: false },
              { icon: Target,    title: isAr ? 'استراتيجية البيانات' : 'Data Strategy',           desc: isAr ? 'استراتيجية البيانات والمعرفة التحليلية.' : 'Strategy data and deep analytic knowledge for growth.',    featured: true  },
            ].map((card, i) => (
              <div key={i}
                style={{ padding: '32px 28px', background: card.featured ? T.surface2 : T.bg, border: `1px solid ${T.hairline}`, borderRadius: 12, transition: 'background 0.2s', cursor: 'default' }}
                onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.background = T.surface2; }}
                onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = card.featured ? T.surface2 : T.bg; }}>
                <div style={{ width: 36, height: 36, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 20, background: T.surface2, border: `1px solid ${T.hairline}` }}>
                  <card.icon size={16} color={T.inkMuted} />
                </div>
                <h3 style={{ fontFamily: T.font, fontSize: 17, fontWeight: 600, color: T.ink, margin: '0 0 10px', letterSpacing: '-0.02em' }}>{card.title}</h3>
                <p style={{ fontFamily: T.font, fontSize: 14, color: T.inkMuted, lineHeight: 1.65, margin: 0, letterSpacing: '-0.005em' }}>{card.desc}</p>
              </div>
            ))}
          </div>

          {/* ASK → ANALYZE → EXECUTE */}
          <div style={{ width: '100%', maxWidth: 600, display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'relative', marginTop: 64 }}>
            <div style={{ position: 'absolute', top: 17, left: '18%', right: '18%', height: 1, background: T.hairline }} />
            {[{ label: 'ASK', icon: Search }, { label: 'ANALYZE', icon: BarChart3 }, { label: 'EXECUTE', icon: Target }].map((step, i) => (
              <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, position: 'relative', zIndex: 1 }}>
                <div style={{ width: 36, height: 36, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: T.bg, border: `1px solid ${T.hairlineStrong}`, transition: 'all 0.2s' }}
                  onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.background = T.surface2; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = T.bg; }}>
                  <step.icon size={14} color={T.inkMuted} />
                </div>
                <span style={{ fontFamily: T.font, fontSize: 9, fontWeight: 500, letterSpacing: '0.18em', color: T.inkFaint, textTransform: 'uppercase' }}>{step.label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════
          SECTION 5 — Final CTA
      ════════════════════════════════════════════════════════ */}
      <section style={{ position: 'relative', minHeight: '80dvh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', overflow: 'hidden', background: T.ink, padding: 'clamp(72px,8vw,120px) 32px 140px' }}>
        {/* Hairline rings on dark bg */}
        {[500, 360, 240].map((size, i) => (
          <div key={i} style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: `min(85vw,${size}px)`, height: `min(85vw,${size}px)`, borderRadius: '50%', border: `1px solid rgba(255,255,255,${0.06 - i * 0.015})`, pointerEvents: 'none' }} />
        ))}

        <div style={{ position: 'relative', zIndex: 10, maxWidth: 720, width: '100%', paddingBottom: 100 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginBottom: 28 }}>
            <div style={{ width: 20, height: 1, background: 'rgba(255,255,255,0.20)' }} />
            <span style={{ fontFamily: T.font, fontSize: 11, fontWeight: 500, letterSpacing: '0.14em', color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase' }}>Start Today</span>
            <div style={{ width: 20, height: 1, background: 'rgba(255,255,255,0.20)' }} />
          </div>
          <h2 style={{ fontFamily: T.font, fontSize: 'clamp(40px,7.5vw,100px)', fontWeight: 700, lineHeight: 1.0, letterSpacing: '-0.04em', color: '#fff', margin: '0 0 48px' }}>
            {isAr ? <span>ابنِ<br />بذكاء</span> : <span>Build with<br />intelligence</span>}
          </h2>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link to="/pricing"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '13px 28px', background: '#fff', color: T.ink, fontFamily: T.font, fontSize: 14, fontWeight: 600, letterSpacing: '-0.01em', borderRadius: 8, textDecoration: 'none', transition: 'opacity 0.2s, transform 0.15s' }}
              onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.opacity = '0.90'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.opacity = '1'; }}
              onMouseDown={e => { (e.currentTarget as HTMLAnchorElement).style.transform = 'scale(0.98)'; }}
              onMouseUp={e => { (e.currentTarget as HTMLAnchorElement).style.transform = 'scale(1)'; }}>
              {isAr ? 'ابدأ مجاناً' : 'Get Started Free'} <ArrowRight size={13} />
            </Link>
            <Link to="/features"
              style={{ display: 'inline-flex', alignItems: 'center', padding: '13px 22px', background: 'transparent', color: 'rgba(255,255,255,0.65)', fontFamily: T.font, fontSize: 14, fontWeight: 400, borderRadius: 8, border: '1px solid rgba(255,255,255,0.18)', textDecoration: 'none', transition: 'border-color 0.2s, color 0.2s' }}
              onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.borderColor = 'rgba(255,255,255,0.45)'; (e.currentTarget as HTMLAnchorElement).style.color = '#fff'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.borderColor = 'rgba(255,255,255,0.18)'; (e.currentTarget as HTMLAnchorElement).style.color = 'rgba(255,255,255,0.65)'; }}>
              {isAr ? 'استكشف' : 'See Features'}
            </Link>
          </div>
        </div>

        {/* Footer bar */}
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '18px clamp(24px,5vw,80px)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, zIndex: 20, borderTop: '1px solid rgba(255,255,255,0.08)' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 24px' }}>
            {[{ label: 'Privacy Policy', href: '/privacy' }, { label: 'Terms', href: '/terms' }, { label: 'Pricing', href: '/pricing' }, { label: 'Contact', href: '/contact' }].map(link => (
              <Link key={link.label} to={link.href} style={{ fontFamily: T.font, fontSize: 11, fontWeight: 400, letterSpacing: '0.04em', color: 'rgba(255,255,255,0.32)', textDecoration: 'none', transition: 'color 0.2s' }}
                onMouseEnter={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.70)')}
                onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.32)')}>
                {link.label}
              </Link>
            ))}
          </div>
          <span style={{ fontFamily: T.font, fontSize: 11, fontWeight: 400, color: 'rgba(255,255,255,0.18)' }}>© 2026 AYN Intelligence</span>
        </div>
      </section>
    </div>
  );
});

HeroScroll.displayName = 'HeroScroll';
