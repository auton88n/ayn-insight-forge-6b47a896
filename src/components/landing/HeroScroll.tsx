/**
 * HeroScroll — Matches Stitch design exactly.
 * Static robot image for now (replace with 3D object later).
 * 
 * Stage 1: "Intelligence, evolved." — robot right, text left
 * Stage 2: "Your business, understood." — robot center, glass cards right
 * Stage 3: Helmet center + 3 service cards below + ASK→ANALYZE→EXECUTE
 * Stage 4: "Build with intelligence" — CTA centered
 */

import { useRef, useEffect, memo } from 'react';
import { useScroll, useMotionValueEvent, motion } from 'framer-motion';
import { useLanguage } from '@/contexts/LanguageContext';
import { Link } from 'react-router-dom';
import { Search, BarChart2, Target } from 'lucide-react';
import robotImg from '@/assets/robot-hero.png';

function clamp(v: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, v)); }
function lerp(v: number, a: number, b: number, c: number, d: number) {
  return c + (clamp(v, a, b) - a) / (b - a) * (d - c);
}

// Stage definitions matching the 4 Stitch screens
const STAGES = [
  { in: 0.00, out: 0.24 }, // Stage 1: Intelligence evolved
  { in: 0.25, out: 0.49 }, // Stage 2: Your business understood
  { in: 0.50, out: 0.74 }, // Stage 3: Helmet + cards
  { in: 0.75, out: 0.99 }, // Stage 4: Build with intelligence CTA
];

export const HeroScroll = memo(() => {
  const { language } = useLanguage();
  const isAr = language === 'ar';
  const containerRef = useRef<HTMLDivElement>(null);
  const stageRefs = useRef<(HTMLDivElement | null)[]>([]);
  const hintRef = useRef<HTMLDivElement>(null);

  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ['start start', 'end end'],
  });

  useMotionValueEvent(scrollYProgress, 'change', (p) => {
    // Scroll hint fades out quickly
    if (hintRef.current) {
      hintRef.current.style.opacity = `${lerp(p, 0, 0.06, 1, 0)}`;
    }

    // Drive each stage in/out
    STAGES.forEach((st, i) => {
      const el = stageRefs.current[i];
      if (!el) return;
      const peak = st.in + (st.out - st.in) * 0.2;
      const fadeOut = st.out - (st.out - st.in) * 0.15;
      let op = 0;
      if (p >= st.in && p <= st.out) {
        if (p < peak) op = lerp(p, st.in, peak, 0, 1);
        else if (p < fadeOut) op = 1;
        else op = lerp(p, fadeOut, st.out, 1, 0);
      }
      // Stage 0 starts fully visible
      if (i === 0) op = p < peak ? 1 : lerp(p, peak, st.out, 1, 0);
      el.style.opacity = `${op}`;
      el.style.pointerEvents = op < 0.05 ? 'none' : 'auto';
    });
  });

  const F  = "'DM Sans', sans-serif";
  const FB = "'Bebas Neue', sans-serif";
  const gold = '#C9A84C';

  return (
    <div style={{ background: '#0a0905' }}>
      <div ref={containerRef} style={{ height: '500vh', position: 'relative' }}>
        <div className="sticky top-0" style={{ height: '100dvh', overflow: 'hidden', background: '#0a0905', position: 'relative' }}>

          {/* ── ROBOT IMAGE — always present, slight position shifts per stage ── */}
          <img
            src={robotImg}
            alt="AYN Robot"
            draggable={false}
            style={{
              position: 'absolute',
              top: 0, right: 0,
              height: '100%',
              width: 'auto',
              maxWidth: '72%',
              objectFit: 'contain',
              objectPosition: 'right bottom',
              zIndex: 1,
              userSelect: 'none',
              pointerEvents: 'none',
            }}
          />

          {/* Left fade gradient */}
          <div style={{ position: 'absolute', inset: 0, zIndex: 2, background: 'linear-gradient(to right, #0a0905 28%, rgba(10,9,5,0.75) 52%, rgba(10,9,5,0.0) 75%)', pointerEvents: 'none' }} />
          {/* Bottom fade */}
          <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '28%', zIndex: 2, background: 'linear-gradient(to top, #0a0905, transparent)', pointerEvents: 'none' }} />

          {/* ═══════════════════════════════════════════════════════
              STAGE 1 — "Intelligence, evolved."
          ═══════════════════════════════════════════════════════ */}
          <div ref={el => { stageRefs.current[0] = el; }}
            style={{ position: 'absolute', inset: 0, zIndex: 10, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '0 clamp(32px,6vw,96px)', pointerEvents: 'none' }}>
            <h1 style={{
              fontFamily: F,
              fontSize: 'clamp(48px,6.5vw,96px)',
              fontWeight: 300,
              lineHeight: 1.05,
              color: gold,
              margin: '0 0 32px',
              maxWidth: 480,
              letterSpacing: '-0.02em',
            }}>
              {isAr ? 'ذكاء\nمتطوّر.' : 'Intelligence,\nevolved.'}
            </h1>
          </div>

          {/* ═══════════════════════════════════════════════════════
              STAGE 2 — "Your business, understood." + glass cards
          ═══════════════════════════════════════════════════════ */}
          <div ref={el => { stageRefs.current[1] = el; }}
            style={{ position: 'absolute', inset: 0, zIndex: 10, opacity: 0, display: 'flex', alignItems: 'center', padding: '80px clamp(32px,5vw,80px)', gap: 32, pointerEvents: 'none' }}>

            {/* Spacer — robot takes left-center */}
            <div style={{ flex: 1 }} />

            {/* Glass cards — right side */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* Main card */}
              <div style={{
                background: 'rgba(255,255,255,0.08)',
                backdropFilter: 'blur(20px)',
                border: '1px solid rgba(255,255,255,0.12)',
                borderRadius: 20,
                padding: '32px 36px',
              }}>
                <h2 style={{ fontFamily: F, fontSize: 'clamp(28px,3.5vw,52px)', fontWeight: 500, color: '#fff', lineHeight: 1.1, margin: 0 }}>
                  {isAr ? 'أعمالك،\nمُفهومة.' : 'Your business,\nunderstood.'}
                </h2>
              </div>

              {/* Sub cards row */}
              <div style={{ display: 'flex', gap: 12 }}>
                {[
                  { icon: '📊', label: 'Deep Analysis' },
                  { icon: '🎯', label: 'Prediction' },
                  { icon: '💎', label: 'Clarity' },
                ].map((c, i) => (
                  <div key={i} style={{
                    flex: 1,
                    background: 'rgba(255,255,255,0.07)',
                    backdropFilter: 'blur(16px)',
                    border: '1px solid rgba(255,255,255,0.10)',
                    borderRadius: 16,
                    padding: '18px 16px',
                    display: 'flex', flexDirection: 'column', gap: 8,
                  }}>
                    {/* Mini chart decoration */}
                    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 28, marginBottom: 4 }}>
                      {[4, 7, 5, 9, 6, 8, 11].map((h, j) => (
                        <div key={j} style={{ width: 4, height: `${h * 2.2}px`, background: i === 0 ? 'rgba(255,255,255,0.25)' : gold, borderRadius: 2, opacity: 0.7 }} />
                      ))}
                    </div>
                    <span style={{ fontFamily: F, fontSize: 13, color: 'rgba(255,255,255,0.70)', fontWeight: 400 }}>{c.label}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Scroll hint for stage 2 */}
          <div style={{ position: 'absolute', bottom: 32, left: 'clamp(32px,6vw,96px)', zIndex: 15, display: 'flex', alignItems: 'center', gap: 14 }}
            ref={el => { /* handled separately */ }}>
          </div>

          {/* ═══════════════════════════════════════════════════════
              STAGE 3 — Helmet centered + 3 service cards + pipeline
          ═══════════════════════════════════════════════════════ */}
          <div ref={el => { stageRefs.current[2] = el; }}
            style={{ position: 'absolute', inset: 0, zIndex: 10, opacity: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', padding: '0 clamp(24px,4vw,64px) 40px', pointerEvents: 'none' }}>

            {/* 3 service cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 16, width: '100%', maxWidth: 1000, marginBottom: 32 }}>
              {[
                { icon: Search, title: isAr ? 'استشارات الذكاء الاصطناعي' : 'AI Consulting', desc: isAr ? 'تفاعل مع ذكاء الأعمال وقياس الأداء.' : 'Interact business intelligence, and business measures.' },
                { icon: BarChart2, title: isAr ? 'ذكاء السوق' : 'Market Intelligence', desc: isAr ? 'ذكاء السوق لتحليل البيانات.' : 'Market intelligence to analyzing market data.' },
                { icon: Target, title: isAr ? 'استراتيجية البيانات' : 'Data Strategy', desc: isAr ? 'استراتيجية البيانات ومعرفة متعمقة.' : 'Strategy data when data and systic knowledge.' },
              ].map((card, i) => {
                const Icon = card.icon;
                return (
                  <div key={i} style={{
                    background: i === 2 ? 'rgba(201,168,76,0.12)' : 'rgba(30,25,15,0.85)',
                    backdropFilter: 'blur(16px)',
                    border: `1px solid ${i === 2 ? 'rgba(201,168,76,0.35)' : 'rgba(255,255,255,0.08)'}`,
                    borderRadius: 16,
                    padding: '24px 22px',
                  }}>
                    <div style={{ width: 40, height: 40, borderRadius: 12, background: 'rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
                      <Icon size={18} color={gold} />
                    </div>
                    <h3 style={{ fontFamily: F, fontSize: 17, fontWeight: 600, color: '#fff', margin: '0 0 8px' }}>{card.title}</h3>
                    <p style={{ fontFamily: F, fontSize: 13, color: 'rgba(255,255,255,0.45)', lineHeight: 1.6, margin: 0 }}>{card.desc}</p>
                  </div>
                );
              })}
            </div>

            {/* ASK → ANALYZE → EXECUTE pipeline */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 0, width: '100%', maxWidth: 700 }}>
              {['ASK', 'ANALYZE', 'EXECUTE'].map((step, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', flex: 1 }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, flex: 1 }}>
                    <div style={{ width: 36, height: 36, borderRadius: '50%', border: `1px solid ${i === 0 ? gold : 'rgba(255,255,255,0.25)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {i === 0 && <Search size={14} color={gold} />}
                      {i === 1 && <BarChart2 size={14} color="rgba(255,255,255,0.5)" />}
                      {i === 2 && <Target size={14} color="rgba(255,255,255,0.5)" />}
                    </div>
                    <span style={{ fontFamily: F, fontSize: 10, letterSpacing: '0.22em', color: i === 0 ? gold : 'rgba(255,255,255,0.35)', textTransform: 'uppercase' }}>{step}</span>
                  </div>
                  {i < 2 && (
                    <div style={{ flex: 2, display: 'flex', alignItems: 'center', gap: 4, marginBottom: 24 }}>
                      <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.15)' }} />
                      <div style={{ width: 6, height: 6, borderRadius: '50%', background: i === 0 ? gold : 'rgba(255,255,255,0.2)' }} />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* ═══════════════════════════════════════════════════════
              STAGE 4 — "Build with intelligence" CTA
          ═══════════════════════════════════════════════════════ */}
          <div ref={el => { stageRefs.current[3] = el; }}
            style={{ position: 'absolute', inset: 0, zIndex: 10, opacity: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'space-between', padding: '80px clamp(24px,4vw,64px) 0', pointerEvents: 'none' }}>

            <h2 style={{
              fontFamily: F,
              fontSize: 'clamp(36px,6vw,96px)',
              fontWeight: 300,
              color: '#EDE8D8',
              textAlign: 'center',
              letterSpacing: '-0.02em',
              lineHeight: 1.05,
              margin: 0,
            }}>
              {isAr ? 'ابنِ بذكاء' : 'Build with intelligence'}
            </h2>

            {/* Robot image centered (already in background) — just the button */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 80 }}>
              <Link to="/pricing"
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 0,
                  padding: '16px 48px',
                  background: 'linear-gradient(135deg, #C9A84C 0%, #a07830 100%)',
                  color: '#0a0905',
                  fontFamily: F, fontSize: 15, fontWeight: 600,
                  borderRadius: 100,
                  textDecoration: 'none',
                  boxShadow: '0 0 40px rgba(201,168,76,0.35)',
                  pointerEvents: 'auto',
                }}>
                {isAr ? 'ابدأ مع عين' : 'Start with AYN'}
              </Link>
            </div>
          </div>

          {/* ── SCROLL TO EXPLORE — always bottom left ── */}
          <div ref={hintRef} style={{
            position: 'absolute', bottom: 32, left: 'clamp(32px,6vw,96px)',
            zIndex: 20, display: 'flex', alignItems: 'center', gap: 14,
          }}>
            <div style={{ width: 1, height: 40, background: 'rgba(201,168,76,0.4)' }} />
            <span style={{ fontFamily: F, fontSize: 10, letterSpacing: '0.24em', color: 'rgba(255,255,255,0.30)', textTransform: 'uppercase' }}>
              Scroll to explore
            </span>
          </div>

        </div>
      </div>
    </div>
  );
});

HeroScroll.displayName = 'HeroScroll';
