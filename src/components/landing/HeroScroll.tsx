/**
 * HeroScroll — Premium light-mode hero.
 *
 * Key fixes from screenshot audit:
 * 1. Robot size: min(40vw, 560px) — smaller, fully contained, never cropped
 * 2. Robot integrated: radial glow behind it, soft shadow below, no visible border
 * 3. Background: #F7F7F4 warm off-white — not harsh white
 * 4. Headline always visible on load — chapters only replace at 15%+ scroll
 * 5. CTAs show prominently below headline at all times
 * 6. Idle float: sin-based Y oscillation on the object
 * 7. Pointer parallax: subtle rotateX/Y on wrapRef (3D feel)
 * 8. Font: Space Grotesk (editorial AI-product) + system body
 * 9. Stat block: premium inline metric, not isolated number
 * 10. Nav: rgba(255,255,255,0.72) + blur(18px) refined glass
 */

import { useEffect, useRef, memo, useCallback } from 'react';
import { useReducedMotion } from 'framer-motion';
import { HELMET_FRAMES, FRAME_COUNT } from '@/assets/helmet-frames';
import { useLanguage } from '@/contexts/LanguageContext';
import { Link } from 'react-router-dom';
import { ArrowRight, Search, BarChart3, Target } from 'lucide-react';

function clamp(v: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, v)); }
function lerp(a: number, b: number, t: number) { return a + (b - a) * t; }
function map(v: number, a: number, b: number, c: number, d: number) {
  return c + (clamp(v, a, b) - a) / (b - a) * (d - c);
}

/* ── Design tokens ── */
const C = {
  bg:      '#F7F7F4',        // warm off-white — premium, not harsh
  bgAlt:   '#F0F0EC',        // slightly deeper for sections
  ink:     '#06070A',        // near-black
  inkMid:  '#3D3F45',        // secondary text
  inkSub:  '#6E7076',        // muted/tertiary
  border:  'rgba(0,0,0,0.08)',
  borderMd:'rgba(0,0,0,0.12)',
  // One controlled accent — only for the glowing eye area
  eye:     'rgba(255,120,20,0.08)',
  // Fonts
  display: "'Space Grotesk', 'Geist', system-ui, sans-serif",
  body:    "'Geist', system-ui, sans-serif",
};

const CHAPTERS = [
  { eyebrow: 'Market Intelligence',  headline: 'See every market\nbefore it moves.',        body: 'AYN monitors 187 countries — geopolitical shifts, commodity flows, and live market signals — in real time.', stat: '187', unit: 'Countries',   in: 0.15, out: 0.37 },
  { eyebrow: 'Predictive AI',        headline: 'Know what happens\nbefore it does.',         body: '73 AI agents simulate how populations, governments, and markets respond — before events unfold.',                stat: '73',  unit: 'AI Agents',   in: 0.40, out: 0.60 },
  { eyebrow: 'Always-On Agents',     headline: 'Your intelligence\nteam. 24/7.',             body: 'Custom agents trained on your data. Intelligence delivered around the clock, in Arabic and English.',            stat: '24/7',unit: 'Uptime',       in: 0.63, out: 0.82 },
];

/* Preload eagerly */
const cache: HTMLImageElement[] = HELMET_FRAMES.map(src => {
  const img = new Image(); img.src = src; img.decoding = 'async'; return img;
});

export const HeroScroll = memo(() => {
  const { language } = useLanguage();
  const isAr = language === 'ar';
  const reduced = useReducedMotion();

  const spacerRef  = useRef<HTMLDivElement>(null);
  const imgRef     = useRef<HTMLImageElement>(null);
  const floatRef   = useRef<HTMLDivElement>(null);  // idle float + pointer tilt
  const driftRef   = useRef<HTMLDivElement>(null);  // scroll drift
  const glowRef    = useRef<HTMLDivElement>(null);  // radial glow behind object
  const headRef    = useRef<HTMLDivElement>(null);
  const ctaRef2    = useRef<HTMLDivElement>(null);  // final CTA
  const chRefs     = useRef<(HTMLDivElement | null)[]>([]);

  const scrollP    = useRef(0);
  const mouseX     = useRef(0.5);
  const mouseY     = useRef(0.5);
  const lastFrame  = useRef(-1);
  const curDriftX  = useRef(0);
  const curFloatY  = useRef(0);
  const curTiltX   = useRef(0);
  const curTiltY   = useRef(0);

  const onScroll = useCallback(() => {
    const s = spacerRef.current;
    if (!s) return;
    scrollP.current = clamp(-s.getBoundingClientRect().top / (s.offsetHeight - window.innerHeight), 0, 1);
  }, []);

  const onMouse = useCallback((e: MouseEvent) => {
    mouseX.current = e.clientX / window.innerWidth;
    mouseY.current = e.clientY / window.innerHeight;
  }, []);

  useEffect(() => {
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('mousemove', onMouse, { passive: true });
    onScroll();
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('mousemove', onMouse);
    };
  }, [onScroll, onMouse]);

  useEffect(() => {
    // Set frame 0 immediately
    if (cache[0]?.complete && imgRef.current) { imgRef.current.src = cache[0].src; lastFrame.current = 0; }
    else if (cache[0]) cache[0].onload = () => { if (imgRef.current) imgRef.current.src = cache[0].src; };

    const SLOW = 0.055; // spring weight — heavy/premium

    const tick = (t: number) => {
      const id = requestAnimationFrame(tick);

      const p = scrollP.current;

      /* 1. Frame scrub */
      if (!reduced) {
        const idx = clamp(Math.round(p * (FRAME_COUNT - 1)), 0, FRAME_COUNT - 1);
        if (idx !== lastFrame.current) {
          lastFrame.current = idx;
          const c = cache[idx];
          if (c?.complete && imgRef.current) imgRef.current.src = c.src;
        }
      }

      /* 2. Idle float — slow sinusoidal Y */
      const floatTarget = Math.sin(t * 0.00055) * 8; // ±8px, very slow
      curFloatY.current = lerp(curFloatY.current, floatTarget, SLOW);

      /* 3. Pointer tilt — subtle 3D rotation */
      // Map mouse 0–1 → ±4deg tilt
      const tiltY = map(mouseX.current, 0, 1, 3.5, -3.5);
      const tiltX = map(mouseY.current, 0, 1, -2.5, 2.5);
      curTiltX.current = lerp(curTiltX.current, tiltX, SLOW);
      curTiltY.current = lerp(curTiltY.current, tiltY, SLOW);

      if (!reduced && floatRef.current) {
        floatRef.current.style.transform =
          `translateY(${curFloatY.current.toFixed(2)}px) ` +
          `perspective(900px) rotateX(${curTiltX.current.toFixed(3)}deg) rotateY(${curTiltY.current.toFixed(3)}deg)`;
      }

      /* 4. Scroll drift — object shifts slightly left as user scrolls */
      const driftTarget = map(p, 0, 0.5, 0, -32);
      curDriftX.current = lerp(curDriftX.current, driftTarget, SLOW);
      if (!reduced && driftRef.current) {
        driftRef.current.style.transform = `translateX(${curDriftX.current.toFixed(2)}px)`;
      }

      /* 5. Glow intensity follows scroll slightly */
      if (glowRef.current) {
        const intensity = map(p, 0, 0.3, 0.08, 0.04);
        glowRef.current.style.opacity = `${intensity / 0.08}`;
      }

      /* 6. Object opacity on load */
      if (imgRef.current) imgRef.current.style.opacity = `${map(p, 0, 0.06, 0, 1)}`;

      /* 7. Headline: visible 0→12%, fades 12→20% */
      if (headRef.current) {
        const op = p < 0.12 ? 1 : map(p, 0.12, 0.20, 1, 0);
        headRef.current.style.opacity = `${op}`;
        headRef.current.style.transform = `translateY(${map(p, 0.12, 0.20, 0, -20)}px)`;
        headRef.current.style.pointerEvents = op < 0.05 ? 'none' : 'auto';
      }

      /* 8. Chapters */
      CHAPTERS.forEach((ch, i) => {
        const el = chRefs.current[i];
        if (!el) return;
        const peak = ch.in + (ch.out - ch.in) * 0.25;
        const fadeOut = ch.out - (ch.out - ch.in) * 0.18;
        let op = 0, ty = 18;
        if (p >= ch.in && p <= ch.out) {
          if (p < peak)    { op = map(p, ch.in, peak, 0, 1); ty = map(p, ch.in, peak, 18, 0); }
          else if (p < fadeOut) { op = 1; ty = 0; }
          else             { op = map(p, fadeOut, ch.out, 1, 0); ty = map(p, fadeOut, ch.out, 0, -18); }
        }
        el.style.opacity = `${op}`;
        el.style.transform = `translateY(${ty}px)`;
        el.style.pointerEvents = op < 0.05 ? 'none' : 'auto';
      });

      /* 9. Final CTA */
      if (ctaRef2.current) {
        const op = map(p, 0.84, 0.93, 0, 1);
        ctaRef2.current.style.opacity = `${op}`;
        ctaRef2.current.style.pointerEvents = op < 0.05 ? 'none' : 'auto';
      }

      return () => cancelAnimationFrame(id);
    };
    const id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
  }, [reduced]);

  /* ── Shared text styles ── */
  const eyebrowStyle: React.CSSProperties = {
    fontFamily: C.body, fontSize: 11, fontWeight: 500,
    letterSpacing: '0.12em', textTransform: 'uppercase',
    color: C.inkSub, display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20,
  };
  const h1Style: React.CSSProperties = {
    fontFamily: C.display, fontSize: 'clamp(44px,5.5vw,80px)', fontWeight: 700,
    lineHeight: 1.06, letterSpacing: '-0.03em', color: C.ink,
    margin: '0 0 20px',
  };
  const bodyStyle: React.CSSProperties = {
    fontFamily: C.body, fontSize: 16, fontWeight: 400,
    lineHeight: 1.68, color: C.inkSub, maxWidth: 380,
    margin: '0 0 32px', letterSpacing: '-0.005em',
  };

  return (
    <div style={{ background: C.bg, fontFamily: C.body }}>

      {/* ════════════════════════════════════════════════════════
          600vh HERO — sticky scroll storytelling
      ════════════════════════════════════════════════════════ */}
      <div ref={spacerRef} style={{ height: '600vh', position: 'relative' }}>
        <div className="sticky top-0" style={{ height: '100dvh', overflow: 'hidden', background: C.bg, position: 'relative' }}>

          {/* ── 3D OBJECT — right side ── */}
          {/* Layer 1: scroll drift */}
          <div ref={driftRef} style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', willChange: 'transform' }}>
            {/* Layer 2: idle float + pointer tilt */}
            <div ref={floatRef} style={{ position: 'relative', marginRight: 'clamp(24px,5vw,72px)', willChange: 'transform', transformStyle: 'preserve-3d' }}>

              {/* Radial glow — sits BEHIND the object */}
              <div ref={glowRef} style={{
                position: 'absolute',
                top: '50%', left: '50%',
                transform: 'translate(-50%, -50%)',
                width: '130%', height: '130%',
                borderRadius: '50%',
                // Warm glow near eye center, very subtle
                background: 'radial-gradient(circle at 50% 42%, rgba(255,120,20,0.10) 0%, rgba(0,0,0,0.05) 38%, transparent 65%)',
                pointerEvents: 'none',
                zIndex: 0,
              }} />

              {/* Subtle ground shadow */}
              <div style={{
                position: 'absolute',
                bottom: '-6%', left: '10%', right: '10%',
                height: '12%',
                background: 'radial-gradient(ellipse, rgba(0,0,0,0.12) 0%, transparent 70%)',
                borderRadius: '50%',
                filter: 'blur(8px)',
                pointerEvents: 'none',
                zIndex: 0,
              }} />

              {/*
                THE OBJECT:
                - White-crushed frames: pixel ≥228 → 255 = same as page bg
                - No border, no background, no box-shadow
                - Fully contained, safe margins
                - drop-shadow: soft studio shadow on object only
              */}
              <img
                ref={imgRef}
                alt="AYN"
                draggable={false}
                style={{
                  // Key: 40vw max — smaller, balanced, never cropped
                  width: 'min(40vw, 560px)',
                  height: 'min(40vw, 560px)',
                  objectFit: 'contain',
                  objectPosition: 'center',
                  display: 'block',
                  userSelect: 'none',
                  pointerEvents: 'none',
                  position: 'relative',
                  zIndex: 1,
                  opacity: 0,
                  willChange: 'opacity',
                  filter: 'drop-shadow(0 32px 48px rgba(0,0,0,0.09)) drop-shadow(0 6px 12px rgba(0,0,0,0.05))',
                }}
              />
            </div>
          </div>

          {/* Very subtle page texture — orbital lines behind object */}
          <div style={{
            position: 'absolute', top: '50%', right: '12%',
            transform: 'translateY(-50%)',
            width: 'min(52vw, 680px)', height: 'min(52vw, 680px)',
            borderRadius: '50%',
            border: '1px solid rgba(0,0,0,0.03)',
            pointerEvents: 'none', zIndex: 0,
          }}>
            <div style={{ position: 'absolute', inset: 48, borderRadius: '50%', border: '1px solid rgba(0,0,0,0.02)' }} />
          </div>

          {/* Left gradient — prevents object bleeding into text */}
          <div style={{ position: 'absolute', inset: 0, background: `linear-gradient(to right, ${C.bg} 0%, ${C.bg} 36%, rgba(247,247,244,0.85) 50%, transparent 64%)`, pointerEvents: 'none', zIndex: 2 }} />

          {/* ── TEXT LAYERS ── */}
          <div style={{ position: 'absolute', inset: 0, zIndex: 10, display: 'flex', alignItems: 'center', padding: '80px clamp(32px,6vw,96px)' }}>
            <div style={{ position: 'relative', width: '100%', maxWidth: 560, height: 'min(80vh, 580px)' }}>

              {/* ── HERO HEADLINE (0–12% scroll) ── */}
              <div ref={headRef} style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', willChange: 'opacity, transform' }}>

                <div style={eyebrowStyle}>
                  <span style={{ display: 'inline-block', width: 18, height: 1, background: C.inkSub, flexShrink: 0 }} />
                  {isAr ? 'منصة ذكاء الأعمال' : 'World Intelligence Platform'}
                </div>

                <h1 style={{ ...h1Style }}>
                  {isAr
                    ? <><span style={{ color: C.inkMid }}>تعرّف على </span>AYN</>
                    : <>Meet <span style={{ color: C.inkMid }}>AYN</span></>}
                </h1>

                <p style={bodyStyle}>
                  {isAr
                    ? 'ذكاء أعمال حقيقي. اكتشف الأسواق والمخاطر قبل أن يراها الآخرون.'
                    : 'Real business intelligence. See markets, risks, and opportunities before anyone else does.'}
                </p>

                {/* CTAs */}
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 44 }}>
                  <Link to="/pricing"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '11px 22px', background: C.ink, color: '#fff', fontFamily: C.body, fontSize: 14, fontWeight: 500, letterSpacing: '-0.01em', borderRadius: 100, textDecoration: 'none', transition: 'opacity 0.2s, transform 0.15s' }}
                    onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.opacity = '0.88'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.opacity = '1'; }}
                    onMouseDown={e => { (e.currentTarget as HTMLAnchorElement).style.transform = 'scale(0.97)'; }}
                    onMouseUp={e => { (e.currentTarget as HTMLAnchorElement).style.transform = 'scale(1)'; }}>
                    {isAr ? 'ابدأ مجاناً' : 'Get Started Free'} <ArrowRight size={13} />
                  </Link>
                  <Link to="/features"
                    style={{ display: 'inline-flex', alignItems: 'center', padding: '11px 18px', background: 'transparent', color: C.inkMid, fontFamily: C.body, fontSize: 14, fontWeight: 400, letterSpacing: '-0.01em', borderRadius: 100, border: `1px solid ${C.borderMd}`, textDecoration: 'none', transition: 'background 0.2s, border-color 0.2s' }}
                    onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.background = 'rgba(0,0,0,0.04)'; (e.currentTarget as HTMLAnchorElement).style.borderColor = 'rgba(0,0,0,0.20)'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.background = 'transparent'; (e.currentTarget as HTMLAnchorElement).style.borderColor = C.borderMd; }}>
                    {isAr ? 'اكتشف المزيد' : 'See how it works'}
                  </Link>
                </div>

                {/* Stat block — premium inline metric */}
                <div style={{ display: 'flex', gap: 32, paddingTop: 20, borderTop: `1px solid ${C.border}` }}>
                  {[
                    { n: '187+', l: isAr ? 'دولة' : 'Countries', sub: isAr ? 'مُراقَبة' : 'monitored' },
                    { n: '73',   l: isAr ? 'وكيل ذكاء' : 'AI Agents', sub: isAr ? 'في الوقت الفعلي' : 'real-time' },
                    { n: '<2s',  l: isAr ? 'استجابة' : 'Response', sub: isAr ? 'متوسط' : 'average' },
                  ].map((s, i) => (
                    <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <span style={{ fontFamily: C.display, fontSize: 24, fontWeight: 700, color: C.ink, lineHeight: 1, letterSpacing: '-0.04em' }}>{s.n}</span>
                      <span style={{ fontFamily: C.body, fontSize: 11, color: C.inkSub, letterSpacing: '0.04em' }}>{s.l} <span style={{ opacity: 0.6 }}>{s.sub}</span></span>
                    </div>
                  ))}
                </div>
              </div>

              {/* ── CHAPTER PANELS (15%–82% scroll) ── */}
              {CHAPTERS.map((ch, i) => (
                <div key={i} ref={el => { chRefs.current[i] = el; }}
                  style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', opacity: 0, pointerEvents: 'none', willChange: 'opacity, transform' }}>
                  <div style={eyebrowStyle}>
                    <span style={{ display: 'inline-block', width: 18, height: 1, background: C.inkSub, flexShrink: 0 }} />
                    {ch.eyebrow}
                  </div>
                  <h2 style={{ fontFamily: C.display, fontSize: 'clamp(36px,4.6vw,66px)', fontWeight: 700, lineHeight: 1.06, letterSpacing: '-0.03em', color: C.ink, margin: '0 0 18px', whiteSpace: 'pre-line' }}>{ch.headline}</h2>
                  <p style={{ ...bodyStyle, marginBottom: 28 }}>{ch.body}</p>
                  {/* Chapter stat */}
                  <div style={{ display: 'inline-flex', alignItems: 'baseline', gap: 8, padding: '14px 20px', background: 'rgba(0,0,0,0.04)', border: `1px solid ${C.border}`, borderRadius: 10 }}>
                    <span style={{ fontFamily: C.display, fontSize: 32, fontWeight: 700, color: C.ink, lineHeight: 1, letterSpacing: '-0.04em' }}>{ch.stat}</span>
                    <span style={{ fontFamily: C.body, fontSize: 12, color: C.inkSub, letterSpacing: '0.06em', textTransform: 'uppercase' }}>{ch.unit}</span>
                  </div>
                </div>
              ))}

              {/* ── FINAL CTA PANEL (84%+) ── */}
              <div ref={ctaRef2} style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', opacity: 0, pointerEvents: 'none', willChange: 'opacity' }}>
                <p style={{ fontFamily: C.body, fontSize: 11, fontWeight: 500, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.inkSub, margin: '0 0 16px' }}>Start Today</p>
                <h2 style={{ fontFamily: C.display, fontSize: 'clamp(40px,5.2vw,76px)', fontWeight: 700, lineHeight: 1.04, letterSpacing: '-0.035em', color: C.ink, margin: '0 0 28px' }}>
                  {isAr ? 'ابدأ مع عين' : <>Build with<br />intelligence</>}
                </h2>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  <Link to="/pricing" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '12px 24px', background: C.ink, color: '#fff', fontFamily: C.body, fontSize: 14, fontWeight: 500, borderRadius: 100, textDecoration: 'none', transition: 'opacity 0.2s' }}
                    onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.opacity = '0.85'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.opacity = '1'; }}>
                    {isAr ? 'ابدأ مجاناً' : 'Get Started Free'} <ArrowRight size={13} />
                  </Link>
                  <Link to="/features" style={{ display: 'inline-flex', alignItems: 'center', padding: '12px 18px', background: 'transparent', color: C.inkMid, fontFamily: C.body, fontSize: 14, borderRadius: 100, border: `1px solid ${C.borderMd}`, textDecoration: 'none', transition: 'background 0.2s' }}
                    onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.background = 'rgba(0,0,0,0.04)'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.background = 'transparent'; }}>
                    {isAr ? 'استكشف' : 'Explore Features'}
                  </Link>
                </div>
              </div>

            </div>
          </div>

          {/* Bottom separator */}
          <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 1, background: C.border, zIndex: 5 }} />
        </div>
      </div>

      {/* ════════════════════════════════════════════════════════
          SECTION 2 — Intelligence, evolved.
      ════════════════════════════════════════════════════════ */}
      <section style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', padding: '96px clamp(32px,6vw,96px)', background: C.bgAlt, borderBottom: `1px solid ${C.border}` }}>
        <div style={{ width: '100%', maxWidth: 1280, margin: '0 auto' }}>
          <div style={{ maxWidth: 560 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 24 }}>
              <span style={{ display: 'inline-block', width: 18, height: 1, background: C.inkSub }} />
              <span style={{ fontFamily: C.body, fontSize: 11, fontWeight: 500, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.inkSub }}>About AYN</span>
            </div>
            <h2 style={{ fontFamily: C.display, fontSize: 'clamp(32px,4.2vw,60px)', fontWeight: 700, lineHeight: 1.06, letterSpacing: '-0.03em', color: C.ink, margin: '0 0 20px' }}>
              {isAr ? 'ذكاء متطوّر.' : <span>Intelligence,<br />evolved.</span>}
            </h2>
            <p style={{ fontFamily: C.body, fontSize: 16, fontWeight: 400, lineHeight: 1.72, color: C.inkSub, maxWidth: 420 }}>
              {isAr ? 'عين منصة ذكاء أعمال تراقب الأسواق العالمية وتحلل المخاطر.' : 'AYN monitors global markets, analyzes geopolitical risks, and delivers real-time intelligence so you act before others react.'}
            </p>
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════
          SECTION 3 — Features
      ════════════════════════════════════════════════════════ */}
      <section style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', padding: '96px clamp(32px,5vw,80px)', background: C.bg, borderBottom: `1px solid ${C.border}` }}>
        <div style={{ width: '100%', maxWidth: 1280, margin: '0 auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px,1fr))', gap: 'clamp(40px,6vw,96px)', alignItems: 'center' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 24 }}>
              <span style={{ display: 'inline-block', width: 18, height: 1, background: C.inkSub }} />
              <span style={{ fontFamily: C.body, fontSize: 11, fontWeight: 500, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.inkSub }}>Capabilities</span>
            </div>
            <h2 style={{ fontFamily: C.display, fontSize: 'clamp(30px,4vw,56px)', fontWeight: 700, lineHeight: 1.06, letterSpacing: '-0.03em', color: C.ink, margin: '0 0 18px' }}>
              {isAr ? 'أعمالك، مُفهومة.' : <span>Your business,<br />understood.</span>}
            </h2>
            <p style={{ fontFamily: C.body, fontSize: 15, fontWeight: 400, lineHeight: 1.70, color: C.inkSub, maxWidth: 340 }}>
              {isAr ? 'نحلل بيانات شركتك ونساعدك في اتخاذ القرارات الاستراتيجية.' : 'We analyze your business data and help you make strategic decisions with precision and clarity.'}
            </p>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {[
              { label: 'Prediction Accuracy', val: '84.2%', bars: [35,65,40,88,60,78,45,70,55] },
              { label: 'Countries Monitored', val: '187+' },
              { label: 'Query Response',      val: '<2s' },
            ].map((card, i) => (
              <div key={i}
                style={{ padding: '18px 20px', background: i === 0 ? 'rgba(0,0,0,0.05)' : 'rgba(0,0,0,0.02)', border: `1px solid ${C.border}`, borderRadius: 10, transition: 'background 0.2s', cursor: 'default' }}
                onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.background = 'rgba(0,0,0,0.06)'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = i === 0 ? 'rgba(0,0,0,0.05)' : 'rgba(0,0,0,0.02)'; }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: card.bars ? 12 : 0 }}>
                  <span style={{ fontFamily: C.body, fontSize: 13, fontWeight: 400, color: C.inkSub }}>{card.label}</span>
                  <span style={{ fontFamily: C.display, fontSize: 20, fontWeight: 700, color: C.ink, letterSpacing: '-0.03em' }}>{card.val}</span>
                </div>
                {card.bars && (
                  <div style={{ height: 32, display: 'flex', alignItems: 'flex-end', gap: 2 }}>
                    {card.bars.map((h, j) => (
                      <div key={j} style={{ flex: 1, height: `${h}%`, background: 'rgba(0,0,0,0.15)', borderRadius: '2px 2px 0 0' }} />
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════
          SECTION 4 — Services
      ════════════════════════════════════════════════════════ */}
      <section style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '96px clamp(24px,4vw,64px)', background: C.bgAlt, borderBottom: `1px solid ${C.border}` }}>
        <div style={{ width: '100%', maxWidth: 1280, margin: '0 auto', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
            <span style={{ display: 'inline-block', width: 18, height: 1, background: C.inkSub }} />
            <span style={{ fontFamily: C.body, fontSize: 11, fontWeight: 500, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.inkSub }}>Services</span>
          </div>
          <h2 style={{ fontFamily: C.display, fontSize: 'clamp(28px,4vw,56px)', fontWeight: 700, letterSpacing: '-0.03em', color: C.ink, margin: '0 0 52px', textAlign: 'center', lineHeight: 1.04 }}>
            {isAr ? 'ما يفعله عين' : 'What AYN does'}
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px,1fr))', gap: 2, width: '100%' }}>
            {[
              { icon: Search,    title: isAr ? 'استشارات الذكاء الاصطناعي' : 'AI Consulting',    desc: isAr ? 'تفاعل مع ذكاء الأعمال وقياس الأداء.' : 'Interact with business intelligence and measure impact.', featured: false },
              { icon: BarChart3, title: isAr ? 'ذكاء السوق' : 'Market Intelligence',              desc: isAr ? 'ذكاء السوق لتحليل بيانات السوق.' : 'Market intelligence in analyzing and monitoring signals.',  featured: false },
              { icon: Target,    title: isAr ? 'استراتيجية البيانات' : 'Data Strategy',           desc: isAr ? 'استراتيجية البيانات والمعرفة التحليلية.' : 'Strategy and deep analytic knowledge for growth.',         featured: true  },
            ].map((card, i) => (
              <div key={i}
                style={{ padding: '28px 24px', background: card.featured ? 'rgba(0,0,0,0.05)' : C.bg, border: `1px solid ${C.border}`, borderRadius: 12, transition: 'background 0.2s', cursor: 'default' }}
                onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.background = 'rgba(0,0,0,0.05)'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = card.featured ? 'rgba(0,0,0,0.05)' : C.bg; }}>
                <div style={{ width: 32, height: 32, borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 18, background: 'rgba(0,0,0,0.06)', border: `1px solid ${C.border}` }}>
                  <card.icon size={14} color={C.inkMid} />
                </div>
                <h3 style={{ fontFamily: C.display, fontSize: 16, fontWeight: 600, color: C.ink, margin: '0 0 8px', letterSpacing: '-0.02em' }}>{card.title}</h3>
                <p style={{ fontFamily: C.body, fontSize: 14, color: C.inkSub, lineHeight: 1.65, margin: 0 }}>{card.desc}</p>
              </div>
            ))}
          </div>
          {/* Pipeline */}
          <div style={{ width: '100%', maxWidth: 560, display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'relative', marginTop: 56 }}>
            <div style={{ position: 'absolute', top: 15, left: '18%', right: '18%', height: 1, background: C.border }} />
            {[{ label: 'ASK', icon: Search }, { label: 'ANALYZE', icon: BarChart3 }, { label: 'EXECUTE', icon: Target }].map((step, i) => (
              <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, position: 'relative', zIndex: 1 }}>
                <div style={{ width: 32, height: 32, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: C.bg, border: `1px solid ${C.borderMd}`, transition: 'background 0.2s' }}
                  onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.background = 'rgba(0,0,0,0.06)'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = C.bg; }}>
                  <step.icon size={12} color={C.inkMid} />
                </div>
                <span style={{ fontFamily: C.body, fontSize: 9, fontWeight: 500, letterSpacing: '0.16em', color: C.inkSub, textTransform: 'uppercase' }}>{step.label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════
          SECTION 5 — Final CTA (dark inversion)
      ════════════════════════════════════════════════════════ */}
      <section style={{ minHeight: '80dvh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', overflow: 'hidden', background: C.ink, padding: 'clamp(72px,8vw,120px) 32px 140px', position: 'relative' }}>
        {[480, 340, 220].map((size, i) => (
          <div key={i} style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: `min(85vw,${size}px)`, height: `min(85vw,${size}px)`, borderRadius: '50%', border: `1px solid rgba(255,255,255,${0.06 - i * 0.015})`, pointerEvents: 'none' }} />
        ))}
        <div style={{ position: 'relative', zIndex: 10, maxWidth: 680, width: '100%', paddingBottom: 100 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 24 }}>
            <span style={{ display: 'inline-block', width: 18, height: 1, background: 'rgba(255,255,255,0.25)' }} />
            <span style={{ fontFamily: C.body, fontSize: 11, fontWeight: 500, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.45)' }}>Start Today</span>
            <span style={{ display: 'inline-block', width: 18, height: 1, background: 'rgba(255,255,255,0.25)' }} />
          </div>
          <h2 style={{ fontFamily: C.display, fontSize: 'clamp(38px,7vw,96px)', fontWeight: 700, lineHeight: 1.02, letterSpacing: '-0.04em', color: '#fff', margin: '0 0 44px' }}>
            {isAr ? <span>ابنِ<br />بذكاء</span> : <span>Build with<br />intelligence</span>}
          </h2>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link to="/pricing"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '12px 24px', background: '#fff', color: C.ink, fontFamily: C.body, fontSize: 14, fontWeight: 600, letterSpacing: '-0.01em', borderRadius: 100, textDecoration: 'none', transition: 'opacity 0.2s, transform 0.15s' }}
              onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.opacity = '0.88'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.opacity = '1'; }}
              onMouseDown={e => { (e.currentTarget as HTMLAnchorElement).style.transform = 'scale(0.97)'; }}
              onMouseUp={e => { (e.currentTarget as HTMLAnchorElement).style.transform = 'scale(1)'; }}>
              {isAr ? 'ابدأ مجاناً' : 'Get Started Free'} <ArrowRight size={13} />
            </Link>
            <Link to="/features"
              style={{ display: 'inline-flex', alignItems: 'center', padding: '12px 18px', background: 'transparent', color: 'rgba(255,255,255,0.65)', fontFamily: C.body, fontSize: 14, borderRadius: 100, border: '1px solid rgba(255,255,255,0.20)', textDecoration: 'none', transition: 'border-color 0.2s, color 0.2s' }}
              onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.borderColor = 'rgba(255,255,255,0.45)'; (e.currentTarget as HTMLAnchorElement).style.color = '#fff'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.borderColor = 'rgba(255,255,255,0.20)'; (e.currentTarget as HTMLAnchorElement).style.color = 'rgba(255,255,255,0.65)'; }}>
              {isAr ? 'استكشف' : 'Explore Features'}
            </Link>
          </div>
        </div>
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '16px clamp(24px,5vw,80px)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, zIndex: 20, borderTop: '1px solid rgba(255,255,255,0.07)' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 20px' }}>
            {[{ label: 'Privacy', href: '/privacy' }, { label: 'Terms', href: '/terms' }, { label: 'Pricing', href: '/pricing' }, { label: 'Contact', href: '/contact' }].map(l => (
              <Link key={l.label} to={l.href} style={{ fontFamily: C.body, fontSize: 11, color: 'rgba(255,255,255,0.30)', textDecoration: 'none', transition: 'color 0.2s' }}
                onMouseEnter={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.65)')}
                onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.30)')}>
                {l.label}
              </Link>
            ))}
          </div>
          <span style={{ fontFamily: C.body, fontSize: 11, color: 'rgba(255,255,255,0.18)' }}>© 2026 AYN Intelligence</span>
        </div>
      </section>
    </div>
  );
});

HeroScroll.displayName = 'HeroScroll';
