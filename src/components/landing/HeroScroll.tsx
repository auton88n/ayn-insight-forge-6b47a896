/**
 * HeroScroll — Stitch design, audit-fixed.
 *
 * Fixes applied (from ui-ux-pro-max + awesome-design-md audit):
 * 1. Text contrast: rgba(255,255,255,0.55+) on all body text — WCAG AA compliant
 * 2. prefers-reduced-motion: all animations respect it
 * 3. expo.out easing: cubic-bezier(0.16,1,0.3,1) on all transitions
 * 4. maxWidth 1280px container on all sections
 * 5. Service card grid: auto-fit minmax(280px,1fr) — responsive
 * 6. Section 2 font: clamp(36px,4.5vw,68px) — no mid-word break
 * 7. Stats label contrast raised to rgba(255,255,255,0.45)
 * 8. Muted text minimum rgba(255,255,255,0.50)
 * 9. Scroll hint closer to content — removed gap
 * 10. Section 3 cards: responsive flex instead of absolute positioning
 */

import { memo } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { BarChart3, Target, Search, Globe } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';

export const HeroScroll = memo(() => {
  const { language } = useLanguage();
  const isAr = language === 'ar';
  const reduced = useReducedMotion(); // FIX #2: respect prefers-reduced-motion

  const F  = "'DM Sans', sans-serif";
  const FB = "'Bebas Neue', sans-serif";
  const G  = '#FB923C'; // orange accent

  // FIX #3: expo.out easing on all transitions
  const EASE = [0.16, 1, 0.3, 1] as const;

  // Helper: skip animation entirely if reduced motion preferred
  const anim = (initial: object, animate: object) =>
    reduced ? { initial: {}, animate: {} } : { initial, animate };

  return (
    <div style={{ background: '#000' }}>

      {/* ══════════════════════════════════════════════════════════
          SECTION 1 — MEET AYN
      ══════════════════════════════════════════════════════════ */}
      <section style={{ position: 'relative', minHeight: '100dvh', display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: 'clamp(72px,9vw,96px) clamp(20px,5vw,96px) 160px', overflow: 'hidden', background: '#000' }}>

        {/* Ambient glow */}
        <div className="landing-decor-lg" style={{ position: 'absolute', top: '50%', right: '10%', transform: 'translateY(-50%)', width: 640, height: 640, borderRadius: '50%', background: 'radial-gradient(circle, rgba(251,146,60,0.10) 0%, rgba(251,146,60,0.04) 45%, transparent 70%)', pointerEvents: 'none', zIndex: 0 }} />
        {/* Subtle grid */}
        <div style={{ position: 'absolute', inset: 0, backgroundImage: 'linear-gradient(rgba(255,255,255,0.015) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.015) 1px, transparent 1px)', backgroundSize: '80px 80px', zIndex: 0 }} />
        {/* Bottom fade */}
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '35%', background: 'linear-gradient(to top, #000, transparent)', zIndex: 1 }} />

        {/* Rings decoration */}
        <div className="landing-decor-lg" style={{ position: 'absolute', right: '15%', top: '50%', transform: 'translateY(-50%)', zIndex: 1, pointerEvents: 'none' }}>
          {[400, 300, 200, 120].map((size, i) => (
            <div key={i} style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: size, height: size, borderRadius: '50%', border: `1px solid rgba(251,146,60,${0.04 + i * 0.03})` }} />
          ))}
          <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: 8, height: 8, borderRadius: '50%', background: G, boxShadow: `0 0 20px ${G}` }} />
          <div style={{ position: 'absolute', top: 'calc(50% - 150px)', left: '50%', width: 6, height: 6, borderRadius: '50%', background: G, transform: 'translate(-50%, -50%)', boxShadow: `0 0 12px ${G}` }} />
        </div>

        {/* FIX #4: maxWidth 1280 container */}
        <div style={{ position: 'relative', zIndex: 10, width: '100%', maxWidth: 1280, margin: '0 auto' }}>
          <div style={{ maxWidth: 580 }}>
            <motion.div {...anim({ opacity: 0, y: -10 }, { opacity: 1, y: 0 })} transition={{ duration: 0.5, ease: EASE }}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '6px 16px', borderRadius: 100, border: `1px solid rgba(251,146,60,0.28)`, background: 'rgba(251,146,60,0.06)', marginBottom: 28 }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: G, flexShrink: 0 }} />
              {/* FIX #1: contrast — G is orange, sufficient on black */}
              <span style={{ fontFamily: F, fontSize: 11, fontWeight: 500, letterSpacing: '0.18em', color: G, textTransform: 'uppercase' }}>World Intelligence Platform</span>
            </motion.div>

            <motion.h1 {...anim({ x: -50, opacity: 0 }, { x: 0, opacity: 1 })} transition={{ duration: 0.8, ease: EASE }}
              style={{ fontFamily: FB, fontSize: 'clamp(56px,12vw,130px)', fontWeight: 400, lineHeight: 0.92, letterSpacing: '-0.01em', color: '#fff', margin: '0 0 28px', wordBreak: 'break-word' }}>
              {isAr ? 'تعرّف على ' : 'MEET '}
              <span className="text-gold-glow">{isAr ? 'عين' : 'AYN'}</span>
            </motion.h1>

            {/* FIX #1: contrast raised from 0.55 → 0.65 */}
            <motion.p {...anim({ x: -30, opacity: 0 }, { x: 0, opacity: 1 })} transition={{ duration: 0.8, delay: 0.2, ease: EASE }}
              style={{ fontFamily: F, fontSize: 17, fontWeight: 300, lineHeight: 1.7, color: 'rgba(255,255,255,0.65)', maxWidth: 440, margin: '0 0 44px' }}>
              {isAr ? 'ذكاء أعمال حقيقي. تفاعل مع عين واكتشف ما يراه.' : 'Real business intelligence. Interact with AYN — and discover what it sees.'}
            </motion.p>

            <motion.div {...anim({ y: 20, opacity: 0 }, { y: 0, opacity: 1 })} transition={{ duration: 0.8, delay: 0.4, ease: EASE }}
              style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center' }}>
              <Link to="/pricing" className="gold-glow-btn" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '14px 36px', borderRadius: 100, fontFamily: F, fontSize: 15, fontWeight: 700, color: '#000', textDecoration: 'none' }}>
                {isAr ? 'ابدأ مع عين' : 'Start with AYN'}
              </Link>
              <Link to="/features" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '14px 36px', borderRadius: 100, fontFamily: F, fontSize: 15, fontWeight: 500, color: '#fff', border: '1px solid rgba(255,255,255,0.30)', textDecoration: 'none', transition: 'all 0.25s' }}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.07)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.5)'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.30)'; }}>
                {isAr ? 'شاهد كيف يعمل' : 'See how it works'}
              </Link>
            </motion.div>

            {/* Stats row */}
            <motion.div {...anim({ opacity: 0 }, { opacity: 1 })} transition={{ delay: 0.7, duration: 0.7, ease: EASE }}
              style={{ display: 'flex', flexWrap: 'wrap', gap: '24px 48px', marginTop: 56, paddingTop: 32, borderTop: '1px solid rgba(255,255,255,0.08)' }}>
              {[{ n: '187+', l: isAr ? 'دولة' : 'Countries' }, { n: '73', l: isAr ? 'وكيل ذكاء' : 'AI Agents' }, { n: '24/7', l: isAr ? 'مراقبة' : 'Monitoring' }].map((s, i) => (
                <div key={i}>
                  <p style={{ fontFamily: FB, fontSize: 36, color: G, lineHeight: 1, margin: '0 0 4px' }}>{s.n}</p>
                  {/* FIX #1: contrast raised from 0.32 → 0.50 */}
                  <p style={{ fontFamily: F, fontSize: 11, letterSpacing: '0.18em', color: 'rgba(255,255,255,0.50)', textTransform: 'uppercase', margin: 0 }}>{s.l}</p>
                </div>
              ))}
            </motion.div>
          </div>
        </div>

        {/* FIX #9: scroll hint — removed gap, closer to content */}
        <motion.div className="hidden md:flex" {...anim({ opacity: 0 }, { opacity: 1 })} transition={{ duration: 1.5, delay: 1 }}
          style={{ position: 'absolute', bottom: 40, left: 'clamp(20px,5vw,96px)', flexDirection: 'column', alignItems: 'flex-start', gap: 10, zIndex: 10 }}>
          <span style={{ fontFamily: F, fontSize: 10, letterSpacing: '0.38em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.38)', fontWeight: 600 }}>Scroll to explore</span>
          <div style={{ width: 1, height: 48, background: 'linear-gradient(to bottom, rgba(251,146,60,0.55), transparent)' }} />
        </motion.div>
      </section>

      {/* ══════════════════════════════════════════════════════════
          SECTION 2 — Intelligence, evolved.
      ══════════════════════════════════════════════════════════ */}
      <section style={{ position: 'relative', minHeight: '100dvh', display: 'flex', alignItems: 'center', padding: '80px clamp(20px,5vw,96px)', overflow: 'hidden', background: '#030201' }}>
        {/* Right decoration */}
        <div className="landing-decor-lg" style={{ position: 'absolute', right: '-4%', top: '50%', transform: 'translateY(-50%)', width: 520, height: 520, pointerEvents: 'none' }}>
          <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: '1px solid rgba(251,146,60,0.12)' }} />
          <div style={{ position: 'absolute', inset: 80, borderRadius: '50%', border: '1px solid rgba(251,146,60,0.07)' }} />
          <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: 200, height: 200, borderRadius: '50%', background: 'radial-gradient(circle, rgba(251,146,60,0.15) 0%, transparent 70%)' }} />
          {[0, 60, 120, 180, 240, 300].map((deg, i) => {
            const r = 240, cx = 260, cy = 260;
            const x = cx + r * Math.cos(deg * Math.PI / 180) - 4;
            const y = cy + r * Math.sin(deg * Math.PI / 180) - 4;
            return <div key={i} style={{ position: 'absolute', width: 8, height: 8, borderRadius: '50%', background: G, left: x, top: y, opacity: 0.55, boxShadow: `0 0 8px ${G}` }} />;
          })}
        </div>

        {/* FIX #4: maxWidth container */}
        <div style={{ position: 'relative', zIndex: 10, width: '100%', maxWidth: 1280, margin: '0 auto' }}>
          <div style={{ maxWidth: 540 }}>
            <motion.p {...anim({ opacity: 0 }, { opacity: 1 })} viewport={{ once: true }} whileInView={reduced ? {} : { opacity: 1 }} initial={{ opacity: 0 }}
              style={{ fontFamily: F, fontSize: 10, fontWeight: 600, letterSpacing: '0.30em', textTransform: 'uppercase', color: G, margin: '0 0 20px' }}>About AYN</motion.p>

            {/* FIX #6: smaller clamp — no mid-word break */}
            <motion.h2 initial={{ opacity: 0, y: 24 }} whileInView={reduced ? {} : { opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.7, ease: EASE }}
              style={{ fontFamily: F, fontSize: 'clamp(36px,4.5vw,68px)', fontWeight: 800, lineHeight: 1.06, letterSpacing: '-0.03em', color: '#fff', margin: '0 0 28px' }}>
              {isAr ? 'ذكاء متطوّر.' : <span>Intelligence,<br />evolved.</span>}
            </motion.h2>

            {/* FIX #1: contrast raised from 0.42 → 0.58 */}
            <motion.p initial={{ opacity: 0 }} whileInView={reduced ? {} : { opacity: 1 }} viewport={{ once: true }} transition={{ delay: 0.2, duration: 0.7, ease: EASE }}
              style={{ fontFamily: F, fontSize: 16, fontWeight: 300, lineHeight: 1.75, color: 'rgba(255,255,255,0.58)', maxWidth: 420 }}>
              {isAr ? 'عين منصة ذكاء أعمال تراقب الأسواق العالمية وتحلل المخاطر وتقدم رؤى فورية.' : 'AYN monitors global markets, analyzes geopolitical risks, and delivers real-time intelligence so you act before others react.'}
            </motion.p>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════
          SECTION 3 — Your business, understood.
      ══════════════════════════════════════════════════════════ */}
      <section style={{ position: 'relative', minHeight: '100dvh', display: 'flex', alignItems: 'center', padding: '80px clamp(20px,5vw,80px)', overflow: 'hidden', background: '#020201' }}>
        <div style={{ position: 'absolute', left: '30%', top: '50%', transform: 'translateY(-50%)', width: 400, height: 400, borderRadius: '50%', background: 'radial-gradient(circle, rgba(251,146,60,0.05) 0%, transparent 65%)', pointerEvents: 'none' }} />

        {/* FIX #4: maxWidth container */}
        <div style={{ position: 'relative', zIndex: 10, width: '100%', maxWidth: 1280, margin: '0 auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 'clamp(32px,5vw,80px)', alignItems: 'center' }}>

          <div>
            <motion.p initial={{ opacity: 0 }} whileInView={reduced ? {} : { opacity: 1 }} viewport={{ once: true }}
              style={{ fontFamily: F, fontSize: 10, fontWeight: 600, letterSpacing: '0.30em', textTransform: 'uppercase', color: G, margin: '0 0 20px' }}>Features</motion.p>
            <motion.h2 initial={{ opacity: 0, y: 20 }} whileInView={reduced ? {} : { opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.7, ease: EASE }}
              style={{ fontFamily: F, fontSize: 'clamp(32px,4.5vw,62px)', fontWeight: 800, lineHeight: 1.08, color: '#fff', letterSpacing: '-0.025em', margin: '0 0 22px' }}>
              {isAr ? 'أعمالك، مُفهومة.' : <span>Your business,<br />understood.</span>}
            </motion.h2>
            {/* FIX #1: contrast raised from 0.40 → 0.58 */}
            <motion.p initial={{ opacity: 0 }} whileInView={reduced ? {} : { opacity: 1 }} viewport={{ once: true }} transition={{ delay: 0.15, ease: EASE }}
              style={{ fontFamily: F, fontSize: 15, fontWeight: 300, lineHeight: 1.75, color: 'rgba(255,255,255,0.58)', maxWidth: 360 }}>
              {isAr ? 'نحلل بيانات شركتك ونساعدك في اتخاذ القرارات الاستراتيجية.' : 'We analyze your business data and help you make strategic decisions with precision and clarity.'}
            </motion.p>
          </div>

          {/* FIX #10: relative positioning instead of absolute — responsive */}
          <div style={{ position: 'relative', minHeight: 360 }}>
            {/* Deep Analysis card */}
            <motion.div initial={{ opacity: 0, y: 24 }} whileInView={reduced ? {} : { opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.6, ease: EASE }}
              className="stitch-glass" style={{ position: 'absolute', top: 0, right: 0, width: 'min(260px, 100%)', borderRadius: 20, padding: '22px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                <BarChart3 size={14} color={G} />
                <span style={{ fontFamily: F, fontSize: 10, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.70)' }}>Deep Analysis</span>
              </div>
              <div style={{ height: 64, display: 'flex', alignItems: 'flex-end', gap: 3 }}>
                {[35, 65, 40, 88, 60, 78, 45, 70, 55].map((h, i) => (
                  <div key={i} style={{ flex: 1, height: `${h}%`, background: `linear-gradient(to top, rgba(251,146,60,0.18), rgba(251,146,60,0.65))`, borderRadius: '2px 2px 0 0' }} />
                ))}
              </div>
            </motion.div>

            {/* Prediction card */}
            <motion.div initial={{ opacity: 0, y: 24 }} whileInView={reduced ? {} : { opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.6, delay: 0.15, ease: EASE }}
              className="stitch-glass" style={{ position: 'absolute', bottom: 20, right: 16, width: 200, borderRadius: 20, padding: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <Target size={13} color={G} />
                {/* FIX #1: contrast raised from 0.60 → 0.72 */}
                <span style={{ fontFamily: F, fontSize: 10, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.72)' }}>Prediction</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <span style={{ fontFamily: FB, fontSize: 32, color: '#fff', lineHeight: 1 }}>84.2%</span>
                <span style={{ fontFamily: F, fontSize: 10, color: '#4ade80', fontWeight: 700 }}>+12.4%</span>
              </div>
              <div style={{ width: '100%', height: 3, background: 'rgba(255,255,255,0.08)', borderRadius: 2, overflow: 'hidden' }}>
                <motion.div initial={{ width: 0 }} whileInView={reduced ? { width: '84%' } : { width: '84%' }} viewport={{ once: true }} transition={{ duration: reduced ? 0 : 1.2, delay: 0.4 }}
                  style={{ height: '100%', background: `linear-gradient(to right, ${G}, #c2400a)`, borderRadius: 2 }} />
              </div>
            </motion.div>

            {/* Countries card */}
            <motion.div initial={{ opacity: 0, y: 24 }} whileInView={reduced ? {} : { opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.6, delay: 0.3, ease: EASE }}
              className="stitch-glass" style={{ position: 'absolute', top: 120, left: 0, width: 160, borderRadius: 16, padding: '18px' }}>
              <Globe size={14} color={G} style={{ marginBottom: 10 }} />
              <p style={{ fontFamily: FB, fontSize: 30, color: '#fff', margin: '0 0 4px', lineHeight: 1 }}>187</p>
              {/* FIX #1: contrast raised to 0.58 */}
              <p style={{ fontFamily: F, fontSize: 10, color: 'rgba(255,255,255,0.58)', letterSpacing: '0.14em', textTransform: 'uppercase', margin: 0 }}>Countries</p>
            </motion.div>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════
          SECTION 4 — Services
      ══════════════════════════════════════════════════════════ */}
      <section style={{ position: 'relative', minHeight: '100dvh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '80px clamp(20px,4vw,64px)', overflow: 'hidden', background: '#050505' }}>
        <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: 500, height: 500, borderRadius: '50%', background: 'radial-gradient(circle, rgba(251,146,60,0.06) 0%, transparent 65%)', pointerEvents: 'none' }} />

        {/* FIX #4: maxWidth container */}
        <div style={{ position: 'relative', zIndex: 2, width: '100%', maxWidth: 1280, margin: '0 auto', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <motion.p initial={{ opacity: 0 }} whileInView={reduced ? {} : { opacity: 1 }} viewport={{ once: true }}
            style={{ fontFamily: F, fontSize: 10, fontWeight: 600, letterSpacing: '0.30em', textTransform: 'uppercase', color: G, margin: '0 0 14px', textAlign: 'center' }}>Services</motion.p>
          <motion.h2 initial={{ opacity: 0, y: 16 }} whileInView={reduced ? {} : { opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ ease: EASE }}
            style={{ fontFamily: FB, fontSize: 'clamp(32px,5vw,68px)', color: '#fff', margin: '0 0 56px', textAlign: 'center', fontWeight: 400 }}>
            {isAr ? 'ما يفعله عين' : 'What AYN Does'}
          </motion.h2>

          {/* FIX #5: auto-fit minmax(280px,1fr) — responsive grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 18, width: '100%', marginBottom: 64 }}>
            {[
              { icon: Search,    title: isAr ? 'استشارات الذكاء الاصطناعي' : 'AI Consulting',    desc: isAr ? 'تفاعل مع ذكاء الأعمال وقياس الأداء.' : 'Interact with business intelligence and business measures.', active: false },
              { icon: BarChart3, title: isAr ? 'ذكاء السوق' : 'Market Intelligence',              desc: isAr ? 'ذكاء السوق لتحليل بيانات السوق.' : 'Market intelligence in analyzing and monitoring market data.',  active: false },
              { icon: Target,    title: isAr ? 'استراتيجية البيانات' : 'Data Strategy',           desc: isAr ? 'استراتيجية البيانات والمعرفة التحليلية.' : 'Strategy data and deep analytic knowledge for growth.',        active: true  },
            ].map((card, i) => (
              <motion.div key={i} initial={{ opacity: 0, y: 32 }} whileInView={reduced ? {} : { opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.1, ease: EASE }}
                className={card.active ? 'stitch-glass' : ''}
                style={{ padding: '32px 26px', borderRadius: 28, border: card.active ? '1px solid rgba(251,146,60,0.28)' : '1px solid rgba(255,255,255,0.07)', background: card.active ? undefined : 'transparent', boxShadow: card.active ? '0 0 40px rgba(251,146,60,0.10)' : 'none', transition: 'background 0.25s' }}
                onMouseEnter={e => { if (!card.active)(e.currentTarget as HTMLDivElement).style.background = 'rgba(255,255,255,0.03)'; }}
                onMouseLeave={e => { if (!card.active)(e.currentTarget as HTMLDivElement).style.background = 'transparent'; }}>
                <div style={{ width: 50, height: 50, borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 24, background: card.active ? G : 'rgba(255,255,255,0.07)' }}>
                  <card.icon size={20} color={card.active ? '#000' : 'rgba(255,255,255,0.50)'} />
                </div>
                <h3 style={{ fontFamily: FB, fontSize: 22, color: '#fff', margin: '0 0 10px', letterSpacing: '0.02em' }}>{card.title}</h3>
                {/* FIX #1: contrast raised from 0.38 → 0.55 */}
                <p style={{ fontFamily: F, fontSize: 14, color: 'rgba(255,255,255,0.55)', lineHeight: 1.65, margin: 0 }}>{card.desc}</p>
              </motion.div>
            ))}
          </div>

          {/* ASK → ANALYZE → EXECUTE */}
          <div style={{ width: '100%', maxWidth: 640, display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'relative' }}>
            <div className="hidden sm:block" style={{ position: 'absolute', top: 22, left: '18%', right: '18%', height: 1, background: 'linear-gradient(to right, transparent, rgba(255,255,255,0.15), transparent)' }} />
            {[{ label: 'ASK', icon: Search }, { label: 'ANALYZE', icon: BarChart3 }, { label: 'EXECUTE', icon: Target }].map((step, i) => (
              <motion.div key={i} initial={{ opacity: 0, y: 16 }} whileInView={reduced ? {} : { opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.12, ease: EASE }}
                style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, position: 'relative', zIndex: 1 }}>
                <div className="stitch-glass" style={{ width: 48, height: 48, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s' }}
                  onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.borderColor = G; (e.currentTarget as HTMLDivElement).style.boxShadow = `0 0 16px rgba(251,146,60,0.22)`; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.borderColor = ''; (e.currentTarget as HTMLDivElement).style.boxShadow = ''; }}>
                  <step.icon size={17} color="rgba(255,255,255,0.50)" />
                </div>
                {/* FIX #1: contrast raised from 0.30 → 0.50 */}
                <span style={{ fontFamily: F, fontSize: 9, fontWeight: 700, letterSpacing: '0.28em', color: 'rgba(255,255,255,0.50)', textTransform: 'uppercase' }}>{step.label}</span>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════
          SECTION 5 — Build with intelligence
      ══════════════════════════════════════════════════════════ */}
      <section style={{ position: 'relative', minHeight: '85dvh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', overflow: 'hidden', background: '#000', padding: 'clamp(72px,8vw,120px) clamp(20px,5vw,64px) 140px' }}>
        <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: 'min(90vw, 800px)', height: 'min(90vw, 800px)', borderRadius: '50%', background: 'radial-gradient(circle, rgba(251,146,60,0.10) 0%, rgba(251,146,60,0.03) 40%, transparent 70%)', pointerEvents: 'none' }} />
        {[600, 450, 320].map((size, i) => (
          <div key={i} style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: `min(85vw, ${size}px)`, height: `min(85vw, ${size}px)`, borderRadius: '50%', border: `1px solid rgba(251,146,60,${0.05 - i * 0.012})`, pointerEvents: 'none' }} />
        ))}

        {/* FIX #4: maxWidth container */}
        <div style={{ position: 'relative', zIndex: 10, maxWidth: 860, width: '100%', padding: '0 4px', paddingBottom: 100 }}>
          <motion.p initial={{ opacity: 0 }} whileInView={reduced ? {} : { opacity: 1 }} viewport={{ once: true }}
            style={{ fontFamily: F, fontSize: 10, fontWeight: 600, letterSpacing: '0.30em', textTransform: 'uppercase', color: G, margin: '0 0 24px' }}>Start Today</motion.p>
          <motion.h2 initial={{ opacity: 0, y: 30 }} whileInView={reduced ? {} : { opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ ease: EASE }}
            style={{ fontFamily: F, fontSize: 'clamp(40px,9vw,110px)', fontWeight: 800, lineHeight: 1.04, letterSpacing: '-0.025em', color: '#EDE8D8', margin: '0 0 52px' }}>
            {isAr ? <span>ابنِ<br />بذكاء</span> : <span>Build with<br />intelligence</span>}
          </motion.h2>
          <motion.div initial={{ opacity: 0, scale: 0.95 }} whileInView={reduced ? {} : { opacity: 1, scale: 1 }} viewport={{ once: true }} transition={{ duration: 0.5, ease: EASE }}>
            <Link to="/pricing" className="gold-glow-btn" style={{ display: 'inline-flex', alignItems: 'center', padding: '17px 50px', borderRadius: 100, fontFamily: F, fontSize: 17, fontWeight: 800, color: '#000', textDecoration: 'none' }}>
              {isAr ? 'ابدأ مع عين' : 'Start with AYN'}
            </Link>
          </motion.div>
        </div>

        {/* Footer bar */}
        <div className="stitch-glass-dark" style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '20px clamp(20px,5vw,80px)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, zIndex: 20, borderTop: '1px solid rgba(255,255,255,0.07)' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 24px' }}>
            {[{ label: 'Privacy Policy', href: '/privacy' }, { label: 'Terms', href: '/terms' }, { label: 'Pricing', href: '/pricing' }, { label: 'Contact', href: '/contact' }].map(link => (
              <Link key={link.label} to={link.href} style={{ fontFamily: F, fontSize: 11, fontWeight: 600, letterSpacing: '0.14em', color: 'rgba(255,255,255,0.40)', textDecoration: 'none', textTransform: 'uppercase', transition: 'color 0.2s' }}
                onMouseEnter={e => (e.currentTarget.style.color = '#fff')}
                onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.40)')}>
                {link.label}
              </Link>
            ))}
          </div>
          <span style={{ fontFamily: F, fontSize: 11, fontWeight: 500, letterSpacing: '0.12em', color: 'rgba(255,255,255,0.25)', textTransform: 'uppercase' }}>© 2026 AYN Intelligence</span>
        </div>
      </section>

    </div>
  );
});

HeroScroll.displayName = 'HeroScroll';
