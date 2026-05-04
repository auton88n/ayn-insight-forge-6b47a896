/**
 * HeroScroll — White background, black text, orange accents.
 * Apple-style 3D object scroll storytelling on light background.
 */

import { useEffect, useRef, memo, useCallback } from 'react';
import { useReducedMotion } from 'framer-motion';
import { HELMET_FRAMES, FRAME_COUNT } from '@/assets/helmet-frames';
import { useLanguage } from '@/contexts/LanguageContext';
import { Link } from 'react-router-dom';
import { ArrowRight, Search, BarChart3, Target } from 'lucide-react';

function clamp(v: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, v)); }
function map(v: number, a: number, b: number, c: number, d: number) {
  return c + (clamp(v, a, b) - a) / (b - a) * (d - c);
}

const CHAPTERS = [
  { label: 'WORLD INTELLIGENCE', headline: 'See every market\nbefore it moves.', body: 'AYN monitors 187 countries — geopolitical shifts, commodity flows, and live market signals — in real time.', stat: '187', unit: 'Countries', inStart: 0.15, inEnd: 0.22, outStart: 0.30, outEnd: 0.37 },
  { label: 'PREDICTIVE AI', headline: 'Know what happens\nbefore it does.', body: '73 AI agents simulate how populations, governments, and markets respond — before events unfold.', stat: '73', unit: 'World Agents', inStart: 0.38, inEnd: 0.45, outStart: 0.53, outEnd: 0.60 },
  { label: 'AI AGENTS', headline: 'Your team.\nNever sleeps.', body: 'Custom agents trained on your data. Intelligence delivered 24/7, in Arabic and English.', stat: '24/7', unit: 'Always On', inStart: 0.61, inEnd: 0.68, outStart: 0.76, outEnd: 0.82 },
];

const imageCache: HTMLImageElement[] = HELMET_FRAMES.map((src) => {
  const img = new Image(); img.src = src; img.decoding = 'async'; return img;
});

export const HeroScroll = memo(() => {
  const { language } = useLanguage();
  const isAr = language === 'ar';
  const reduced = useReducedMotion();

  const spacerRef   = useRef<HTMLDivElement>(null);
  const imgRef      = useRef<HTMLImageElement>(null);
  const objectRef   = useRef<HTMLDivElement>(null);
  const headlineRef = useRef<HTMLDivElement>(null);
  const ctaRef      = useRef<HTMLDivElement>(null);
  const chapterRefs = useRef<(HTMLDivElement | null)[]>([]);
  const rawProgress = useRef(0);
  const curScale    = useRef(1);
  const curY        = useRef(0);
  const lastFrame   = useRef(-1);

  const onScroll = useCallback(() => {
    const s = spacerRef.current;
    if (!s) return;
    rawProgress.current = clamp(-s.getBoundingClientRect().top / (s.offsetHeight - window.innerHeight), 0, 1);
  }, []);

  useEffect(() => {
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
  }, [onScroll]);

  useEffect(() => {
    if (imgRef.current && imageCache[0]?.complete) {
      imgRef.current.src = imageCache[0].src; lastFrame.current = 0;
    } else if (imageCache[0]) {
      imageCache[0].onload = () => { if (imgRef.current) { imgRef.current.src = imageCache[0].src; } };
    }

    const tick = () => {
      requestAnimationFrame(tick);
      const p = rawProgress.current;

      // Frame scrub
      if (!reduced) {
        const idx = clamp(Math.round(p * (FRAME_COUNT - 1)), 0, FRAME_COUNT - 1);
        if (idx !== lastFrame.current) {
          lastFrame.current = idx;
          const c = imageCache[idx];
          if (c?.complete && imgRef.current) imgRef.current.src = c.src;
        }
      }

      // Object transform
      if (!reduced && objectRef.current) {
        const LERP = 0.08;
        const ts = p < 0.5 ? map(p, 0, 0.5, 1.0, 1.05) : map(p, 0.5, 1.0, 1.05, 1.0);
        curScale.current += (ts - curScale.current) * LERP;
        const ty = map(p, 0, 1, 0, -20);
        curY.current += (ty - curY.current) * LERP;
        objectRef.current.style.transform = `translateY(${curY.current.toFixed(2)}px) scale(${curScale.current.toFixed(4)})`;
      }

      // Object fade in
      if (imgRef.current) imgRef.current.style.opacity = `${map(p, 0, 0.08, 0, 1)}`;

      // Headline
      if (headlineRef.current) {
        const op = p < 0.12 ? 1 : map(p, 0.12, 0.20, 1, 0);
        headlineRef.current.style.opacity = `${op}`;
        headlineRef.current.style.transform = `translateY(${map(p, 0.12, 0.20, 0, -28)}px)`;
        headlineRef.current.style.pointerEvents = op < 0.05 ? 'none' : 'auto';
      }

      // Chapters
      CHAPTERS.forEach((ch, i) => {
        const el = chapterRefs.current[i];
        if (!el) return;
        let op = 0, ty = 24;
        if (p >= ch.inStart && p <= ch.outEnd) {
          if (p < ch.inEnd) { op = map(p, ch.inStart, ch.inEnd, 0, 1); ty = map(p, ch.inStart, ch.inEnd, 24, 0); }
          else if (p < ch.outStart) { op = 1; ty = 0; }
          else { op = map(p, ch.outStart, ch.outEnd, 1, 0); ty = map(p, ch.outStart, ch.outEnd, 0, -24); }
        }
        el.style.opacity = `${op}`; el.style.transform = `translateY(${ty}px)`; el.style.pointerEvents = op < 0.05 ? 'none' : 'auto';
      });

      // CTA
      if (ctaRef.current) {
        const op = map(p, 0.84, 0.92, 0, 1);
        ctaRef.current.style.opacity = `${op}`; ctaRef.current.style.pointerEvents = op < 0.05 ? 'none' : 'auto';
      }
    };
    const id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
  }, [reduced]);

  const F  = "'DM Sans', sans-serif";
  const FB = "'Bebas Neue', sans-serif";
  const O  = '#FB923C'; // orange accent
  const BG = '#ffffff';
  const TX = '#0a0a0a'; // near-black text

  return (
    <div style={{ background: BG }}>

      {/* ── 600vh SCROLL SPACER ── */}
      <div ref={spacerRef} style={{ height: '600vh', position: 'relative' }}>
        <div className="sticky top-0" style={{ height: '100dvh', overflow: 'hidden', background: BG }}>

          {/* Subtle warm tint behind object */}
          <div style={{ position: 'absolute', top: '50%', right: '10%', transform: 'translateY(-50%)', width: 700, height: 700, borderRadius: '50%', background: 'radial-gradient(circle, rgba(251,146,60,0.07) 0%, rgba(251,146,60,0.02) 50%, transparent 70%)', pointerEvents: 'none', zIndex: 0 }} />

          {/* Object */}
          <div ref={objectRef} style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', paddingRight: 'clamp(0px, 2vw, 48px)', transformOrigin: 'center center', willChange: 'transform', zIndex: 1 }}>
            <img ref={imgRef} alt="AYN" draggable={false}
              style={{ width: 'min(52vw, 680px)', height: 'min(52vw, 680px)', objectFit: 'contain', objectPosition: 'center', display: 'block', userSelect: 'none', pointerEvents: 'none', opacity: 0, willChange: 'opacity' }}
            />
          </div>

          {/* Text gradient — left */}
          <div style={{ position: 'absolute', inset: 0, zIndex: 2, background: 'linear-gradient(to right, rgba(255,255,255,0.95) 0%, rgba(255,255,255,0.75) 42%, rgba(255,255,255,0.0) 70%)', pointerEvents: 'none' }} />

          {/* Text layers */}
          <div style={{ position: 'absolute', inset: 0, zIndex: 10, display: 'flex', alignItems: 'center', padding: '80px clamp(24px,6vw,96px)' }}>
            <div style={{ position: 'relative', width: '100%', maxWidth: 520, height: 'min(80vh, 520px)' }}>

              {/* Headline */}
              <div ref={headlineRef} style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', willChange: 'opacity, transform' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
                  <div style={{ width: 24, height: 2, background: O }} />
                  <span style={{ fontFamily: F, fontSize: 11, fontWeight: 600, letterSpacing: '0.22em', color: O, textTransform: 'uppercase' }}>
                    {isAr ? 'ذكاء الأعمال' : 'World Intelligence Platform'}
                  </span>
                </div>
                <h1 style={{ fontFamily: FB, fontSize: 'clamp(56px,9vw,118px)', fontWeight: 400, lineHeight: 0.88, letterSpacing: '-0.01em', color: TX, margin: '0 0 28px' }}>
                  {isAr ? 'تعرّف على ' : 'MEET '}
                  <span style={{ color: O }}>{isAr ? 'عين' : 'AYN'}</span>
                </h1>
                <p style={{ fontFamily: F, fontSize: 16, fontWeight: 400, lineHeight: 1.72, color: 'rgba(10,10,10,0.55)', maxWidth: 380, margin: '0 0 40px' }}>
                  {isAr ? 'ذكاء أعمال حقيقي. تفاعل مع عين واكتشف ما يراه.' : 'Real business intelligence. Scroll to explore AYN — and discover what it sees.'}
                </p>
                <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center' }}>
                  <Link to="/pricing" className="gold-glow-btn" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '13px 28px', borderRadius: 100, fontFamily: F, fontSize: 14, fontWeight: 700, color: '#fff', textDecoration: 'none' }}>
                    {isAr ? 'ابدأ مع عين' : 'Start with AYN'} <ArrowRight size={14} />
                  </Link>
                  <Link to="/features" style={{ display: 'inline-flex', alignItems: 'center', padding: '13px 24px', borderRadius: 100, fontFamily: F, fontSize: 14, fontWeight: 500, color: TX, border: '1.5px solid rgba(10,10,10,0.20)', textDecoration: 'none', transition: 'all 0.2s' }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = O; e.currentTarget.style.color = O; }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(10,10,10,0.20)'; e.currentTarget.style.color = TX; }}>
                    {isAr ? 'شاهد كيف يعمل' : 'See how it works'}
                  </Link>
                </div>
                <div style={{ display: 'flex', gap: 40, marginTop: 48, paddingTop: 28, borderTop: '1px solid rgba(10,10,10,0.08)' }}>
                  {[{ n: '187+', l: isAr ? 'دولة' : 'Countries' }, { n: '73', l: isAr ? 'وكيل' : 'AI Agents' }, { n: '24/7', l: isAr ? 'مراقبة' : 'Monitoring' }].map((s, i) => (
                    <div key={i}>
                      <p style={{ fontFamily: FB, fontSize: 32, color: O, lineHeight: 1, margin: '0 0 4px' }}>{s.n}</p>
                      <p style={{ fontFamily: F, fontSize: 10, letterSpacing: '0.18em', color: 'rgba(10,10,10,0.45)', textTransform: 'uppercase', margin: 0 }}>{s.l}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Chapters */}
              {CHAPTERS.map((ch, i) => (
                <div key={i} ref={el => { chapterRefs.current[i] = el; }} style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', opacity: 0, pointerEvents: 'none', willChange: 'opacity, transform' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
                    <div style={{ width: 24, height: 2, background: O }} />
                    <span style={{ fontFamily: F, fontSize: 9, fontWeight: 600, letterSpacing: '0.30em', textTransform: 'uppercase', color: O }}>{ch.label}</span>
                  </div>
                  <h2 style={{ fontFamily: FB, fontSize: 'clamp(42px,5.2vw,78px)', fontWeight: 400, lineHeight: 0.92, color: TX, margin: '0 0 20px', whiteSpace: 'pre-line' }}>{ch.headline}</h2>
                  <p style={{ fontFamily: F, fontSize: 15, fontWeight: 400, lineHeight: 1.75, color: 'rgba(10,10,10,0.55)', maxWidth: 360, margin: '0 0 28px' }}>{ch.body}</p>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
                    <span style={{ fontFamily: FB, fontSize: 'clamp(48px,5.5vw,72px)', color: O, lineHeight: 1 }}>{ch.stat}</span>
                    <span style={{ fontFamily: F, fontSize: 10, letterSpacing: '0.22em', color: 'rgba(10,10,10,0.40)', textTransform: 'uppercase' }}>{ch.unit}</span>
                  </div>
                </div>
              ))}

              {/* CTA panel */}
              <div ref={ctaRef} style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', opacity: 0, pointerEvents: 'none', willChange: 'opacity' }}>
                <p style={{ fontFamily: F, fontSize: 9, letterSpacing: '0.28em', textTransform: 'uppercase', color: 'rgba(10,10,10,0.38)', margin: '0 0 16px' }}>Ready to see the world clearly?</p>
                <h2 style={{ fontFamily: FB, fontSize: 'clamp(48px,6vw,88px)', fontWeight: 400, lineHeight: 0.88, color: TX, margin: '0 0 36px' }}>
                  Start with <span style={{ color: O }}>AYN</span>
                </h2>
                <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                  <Link to="/pricing" className="gold-glow-btn" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '14px 32px', borderRadius: 100, fontFamily: F, fontSize: 14, fontWeight: 700, color: '#fff', textDecoration: 'none' }}>
                    {isAr ? 'ابدأ مجاناً' : 'Get Started Free'} <ArrowRight size={14} />
                  </Link>
                  <Link to="/features" style={{ display: 'inline-flex', alignItems: 'center', padding: '14px 24px', borderRadius: 100, fontFamily: F, fontSize: 14, color: TX, border: '1.5px solid rgba(10,10,10,0.20)', textDecoration: 'none', transition: 'all 0.2s' }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = O; e.currentTarget.style.color = O; }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(10,10,10,0.20)'; e.currentTarget.style.color = TX; }}>
                    {isAr ? 'استكشف' : 'See Features'}
                  </Link>
                </div>
              </div>
            </div>
          </div>

          {/* Scroll indicator */}
          <div style={{ position: 'absolute', bottom: 32, left: '50%', transform: 'translateX(-50%)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, zIndex: 20 }}>
            <div style={{ width: 24, height: 36, borderRadius: 12, border: '1.5px solid rgba(10,10,10,0.20)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '4px' }}>
              <div style={{ width: 3, height: 8, borderRadius: 2, background: O }} />
            </div>
            <span style={{ fontFamily: F, fontSize: 9, letterSpacing: '0.30em', textTransform: 'uppercase', color: 'rgba(10,10,10,0.35)' }}>Scroll to explore</span>
          </div>
        </div>
      </div>

      {/* ── INTELLIGENCE SECTION ── */}
      <section style={{ position: 'relative', minHeight: '100dvh', display: 'flex', alignItems: 'center', padding: '80px clamp(24px,6vw,96px)', overflow: 'hidden', background: '#f8f8f6' }}>
        <div className="landing-decor-lg" style={{ position: 'absolute', right: '-4%', top: '50%', transform: 'translateY(-50%)', width: 520, height: 520, pointerEvents: 'none' }}>
          {[0, 60, 120, 180, 240, 300].map((deg, i) => {
            const r = 240, cx = 260, cy = 260;
            const x = cx + r * Math.cos(deg * Math.PI / 180) - 4;
            const y = cy + r * Math.sin(deg * Math.PI / 180) - 4;
            return <div key={i} style={{ position: 'absolute', width: 8, height: 8, borderRadius: '50%', background: O, left: x, top: y, opacity: 0.4, boxShadow: `0 0 8px ${O}` }} />;
          })}
          <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: '1px solid rgba(251,146,60,0.15)' }} />
          <div style={{ position: 'absolute', inset: 80, borderRadius: '50%', border: '1px solid rgba(251,146,60,0.10)' }} />
          <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: 200, height: 200, borderRadius: '50%', background: 'radial-gradient(circle, rgba(251,146,60,0.12) 0%, transparent 70%)' }} />
        </div>
        <div style={{ position: 'relative', zIndex: 10, width: '100%', maxWidth: 1280, margin: '0 auto' }}>
          <div style={{ maxWidth: 540 }}>
            <p style={{ fontFamily: F, fontSize: 10, fontWeight: 600, letterSpacing: '0.30em', textTransform: 'uppercase', color: O, margin: '0 0 20px' }}>About AYN</p>
            <h2 style={{ fontFamily: F, fontSize: 'clamp(36px,4.5vw,68px)', fontWeight: 800, lineHeight: 1.06, letterSpacing: '-0.03em', color: TX, margin: '0 0 28px' }}>
              {isAr ? 'ذكاء متطوّر.' : <span>Intelligence,<br />evolved.</span>}
            </h2>
            <p style={{ fontFamily: F, fontSize: 16, fontWeight: 400, lineHeight: 1.75, color: 'rgba(10,10,10,0.55)', maxWidth: 420 }}>
              {isAr ? 'عين منصة ذكاء أعمال تراقب الأسواق العالمية وتحلل المخاطر.' : 'AYN monitors global markets, analyzes geopolitical risks, and delivers real-time intelligence so you act before others react.'}
            </p>
          </div>
        </div>
      </section>

      {/* ── SERVICES SECTION ── */}
      <section style={{ position: 'relative', minHeight: '100dvh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '80px clamp(24px,4vw,64px)', overflow: 'hidden', background: BG }}>
        <div style={{ position: 'relative', zIndex: 2, width: '100%', maxWidth: 1280, margin: '0 auto', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <p style={{ fontFamily: F, fontSize: 10, fontWeight: 600, letterSpacing: '0.30em', textTransform: 'uppercase', color: O, margin: '0 0 14px', textAlign: 'center' }}>Services</p>
          <h2 style={{ fontFamily: FB, fontSize: 'clamp(32px,5vw,68px)', color: TX, margin: '0 0 56px', textAlign: 'center', fontWeight: 400 }}>
            {isAr ? 'ما يفعله عين' : 'What AYN Does'}
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 18, width: '100%', marginBottom: 64 }}>
            {[
              { icon: Search,    title: isAr ? 'استشارات الذكاء الاصطناعي' : 'AI Consulting',    desc: isAr ? 'تفاعل مع ذكاء الأعمال وقياس الأداء.' : 'Interact with business intelligence and measure performance.', active: false },
              { icon: BarChart3, title: isAr ? 'ذكاء السوق' : 'Market Intelligence',              desc: isAr ? 'ذكاء السوق لتحليل بيانات السوق.' : 'Market intelligence in analyzing and monitoring market data.',  active: false },
              { icon: Target,    title: isAr ? 'استراتيجية البيانات' : 'Data Strategy',           desc: isAr ? 'استراتيجية البيانات والمعرفة التحليلية.' : 'Strategy data and deep analytic knowledge for growth.',        active: true  },
            ].map((card, i) => (
              <div key={i}
                style={{ padding: '32px 26px', borderRadius: 20, border: card.active ? `1.5px solid ${O}` : '1.5px solid rgba(10,10,10,0.08)', background: card.active ? 'rgba(251,146,60,0.04)' : BG, boxShadow: card.active ? '0 4px 24px rgba(251,146,60,0.12)' : '0 2px 12px rgba(0,0,0,0.04)', transition: 'all 0.25s' }}
                onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.boxShadow = '0 8px 32px rgba(251,146,60,0.15)'; (e.currentTarget as HTMLDivElement).style.borderColor = O; }}
                onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.boxShadow = card.active ? '0 4px 24px rgba(251,146,60,0.12)' : '0 2px 12px rgba(0,0,0,0.04)'; (e.currentTarget as HTMLDivElement).style.borderColor = card.active ? O : 'rgba(10,10,10,0.08)'; }}>
                <div style={{ width: 48, height: 48, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 24, background: card.active ? O : 'rgba(251,146,60,0.10)' }}>
                  <card.icon size={20} color={card.active ? '#fff' : O} />
                </div>
                <h3 style={{ fontFamily: FB, fontSize: 22, color: TX, margin: '0 0 10px' }}>{card.title}</h3>
                <p style={{ fontFamily: F, fontSize: 14, color: 'rgba(10,10,10,0.55)', lineHeight: 1.65, margin: 0 }}>{card.desc}</p>
              </div>
            ))}
          </div>
          <div style={{ width: '100%', maxWidth: 640, display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'relative' }}>
            <div style={{ position: 'absolute', top: 22, left: '18%', right: '18%', height: 1, background: 'rgba(10,10,10,0.10)' }} />
            {[{ label: 'ASK', icon: Search }, { label: 'ANALYZE', icon: BarChart3 }, { label: 'EXECUTE', icon: Target }].map((step, i) => (
              <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, position: 'relative', zIndex: 1 }}>
                <div style={{ width: 48, height: 48, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: BG, border: '1.5px solid rgba(10,10,10,0.12)', transition: 'all 0.2s' }}
                  onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.borderColor = O; (e.currentTarget as HTMLDivElement).style.background = 'rgba(251,146,60,0.06)'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(10,10,10,0.12)'; (e.currentTarget as HTMLDivElement).style.background = BG; }}>
                  <step.icon size={17} color="rgba(10,10,10,0.45)" />
                </div>
                <span style={{ fontFamily: F, fontSize: 9, fontWeight: 700, letterSpacing: '0.28em', color: 'rgba(10,10,10,0.40)', textTransform: 'uppercase' }}>{step.label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FINAL CTA SECTION ── */}
      <section style={{ position: 'relative', minHeight: '80dvh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', overflow: 'hidden', background: '#0a0a0a', padding: 'clamp(72px,8vw,120px) 32px 140px' }}>
        <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: 'min(90vw,800px)', height: 'min(90vw,800px)', borderRadius: '50%', background: 'radial-gradient(circle, rgba(251,146,60,0.10) 0%, transparent 65%)', pointerEvents: 'none' }} />
        {[560, 420, 300].map((size, i) => (
          <div key={i} style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: `min(85vw,${size}px)`, height: `min(85vw,${size}px)`, borderRadius: '50%', border: `1px solid rgba(251,146,60,${0.08 - i * 0.02})`, pointerEvents: 'none' }} />
        ))}
        <div style={{ position: 'relative', zIndex: 10, maxWidth: 860, width: '100%', paddingBottom: 100 }}>
          <p style={{ fontFamily: F, fontSize: 10, fontWeight: 600, letterSpacing: '0.30em', textTransform: 'uppercase', color: O, margin: '0 0 24px' }}>Start Today</p>
          <h2 style={{ fontFamily: F, fontSize: 'clamp(40px,8vw,104px)', fontWeight: 800, lineHeight: 1.02, letterSpacing: '-0.025em', color: '#fff', margin: '0 0 52px' }}>
            {isAr ? <span>ابنِ<br />بذكاء</span> : <span>Build with<br />intelligence</span>}
          </h2>
          <Link to="/pricing" className="gold-glow-btn" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '17px 50px', borderRadius: 100, fontFamily: F, fontSize: 17, fontWeight: 800, color: '#fff', textDecoration: 'none' }}>
            {isAr ? 'ابدأ مع عين' : 'Start with AYN'} <ArrowRight size={16} />
          </Link>
        </div>
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '20px clamp(24px,5vw,80px)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, zIndex: 20, borderTop: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.03)' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 24px' }}>
            {[{ label: 'Privacy Policy', href: '/privacy' }, { label: 'Terms', href: '/terms' }, { label: 'Pricing', href: '/pricing' }, { label: 'Contact', href: '/contact' }].map(link => (
              <Link key={link.label} to={link.href} style={{ fontFamily: F, fontSize: 11, fontWeight: 600, letterSpacing: '0.14em', color: 'rgba(255,255,255,0.40)', textDecoration: 'none', textTransform: 'uppercase', transition: 'color 0.2s' }}
                onMouseEnter={e => (e.currentTarget.style.color = '#fff')}
                onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.40)')}>
                {link.label}
              </Link>
            ))}
          </div>
          <span style={{ fontFamily: F, fontSize: 11, fontWeight: 500, letterSpacing: '0.12em', color: 'rgba(255,255,255,0.20)', textTransform: 'uppercase' }}>© 2026 AYN Intelligence</span>
        </div>
      </section>
    </div>
  );
});

HeroScroll.displayName = 'HeroScroll';
