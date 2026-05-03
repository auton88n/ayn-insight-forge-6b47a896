/**
 * HeroScroll — Stitch design, no 3D images.
 * Pure CSS: black backgrounds, orange gradients, ambient glows, geometric elements.
 */

import { memo } from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { BarChart3, Target, Search, Globe } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';

export const HeroScroll = memo(() => {
  const { language } = useLanguage();
  const isAr = language === 'ar';
  const F  = "'DM Sans', sans-serif";
  const FB = "'Bebas Neue', sans-serif";
  const G  = '#FB923C';        // dashboard orange-400
  const GD = '#F97316';        // dashboard orange-500 (deeper)

  return (
    <div style={{ background: '#000' }}>

      {/* ══════════════════════════════════════════════════════════
          SECTION 1 — MEET AYN
      ══════════════════════════════════════════════════════════ */}
      <section style={{ position: 'relative', minHeight: '100dvh', display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: 'clamp(72px,9vw,96px) clamp(20px,5vw,96px)', overflow: 'hidden', background: '#000' }}>

        {/* Ambient orange glow — right side */}
        <div className="landing-decor-lg" style={{ position: 'absolute', top: '50%', right: '10%', transform: 'translateY(-50%)', width: 640, height: 640, borderRadius: '50%', background: 'radial-gradient(circle, rgba(251,146,60,0.10) 0%, rgba(251,146,60,0.04) 45%, transparent 70%)', pointerEvents: 'none', zIndex: 0 }} />
        {/* Subtle grid */}
        <div style={{ position: 'absolute', inset: 0, backgroundImage: 'linear-gradient(rgba(255,255,255,0.015) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.015) 1px, transparent 1px)', backgroundSize: '80px 80px', zIndex: 0 }} />
        {/* Bottom fade */}
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '35%', background: 'linear-gradient(to top, #000, transparent)', zIndex: 1 }} />

        {/* Floating geometric rings — desktop only to avoid overlap */}
        <div className="landing-decor-lg" style={{ position: 'absolute', right: '15%', top: '50%', transform: 'translateY(-50%)', zIndex: 1, pointerEvents: 'none' }}>
          {[400, 300, 200, 120].map((size, i) => (
            <div key={i} style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: size, height: size, borderRadius: '50%', border: `1px solid rgba(251,146,60,${0.04 + i * 0.03})`, }} />
          ))}
          <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: 8, height: 8, borderRadius: '50%', background: G, boxShadow: `0 0 20px ${G}` }} />
          <motion.div animate={{ rotate: 360 }} transition={{ duration: 12, repeat: Infinity, ease: 'linear' }} style={{ position: 'absolute', top: '50%', left: '50%', width: 300, height: 300, transform: 'translate(-50%, -50%)' }}>
            <div style={{ position: 'absolute', top: 0, left: '50%', width: 6, height: 6, borderRadius: '50%', background: G, transform: 'translate(-50%, -50%)', boxShadow: `0 0 12px ${G}` }} />
          </motion.div>
        </div>

        {/* Content */}
        <div style={{ position: 'relative', zIndex: 10, maxWidth: 580, width: '100%' }}>
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '6px 16px', borderRadius: 100, border: `1px solid rgba(251,146,60,0.28)`, background: 'rgba(251,146,60,0.06)', marginBottom: 28 }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: G }} />
            <span style={{ fontFamily: F, fontSize: 11, fontWeight: 500, letterSpacing: '0.18em', color: G, textTransform: 'uppercase' }}>World Intelligence Platform</span>
          </motion.div>

          <motion.h1 initial={{ x: -50, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ duration: 0.8, ease: 'easeOut' }}
            style={{ fontFamily: FB, fontSize: 'clamp(56px,12vw,130px)', fontWeight: 400, lineHeight: 0.92, letterSpacing: '-0.01em', color: '#fff', margin: '0 0 28px', wordBreak: 'break-word' }}>
            {isAr ? 'تعرّف على ' : 'MEET '}
            <span className="text-gold-glow">{isAr ? 'عين' : 'AYN'}</span>
          </motion.h1>

          <motion.p initial={{ x: -30, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ duration: 0.8, delay: 0.2 }}
            style={{ fontFamily: F, fontSize: 17, fontWeight: 300, lineHeight: 1.7, color: 'rgba(255,255,255,0.55)', maxWidth: 440, margin: '0 0 44px' }}>
            {isAr ? 'ذكاء أعمال حقيقي. تفاعل مع عين واكتشف ما يراه.' : 'Real business intelligence. Interact with AYN — and discover what it sees.'}
          </motion.p>

          <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ duration: 0.8, delay: 0.4 }}
            style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center' }}>
            <Link to="/pricing" className="gold-glow-btn" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '14px 36px', borderRadius: 100, fontFamily: F, fontSize: 15, fontWeight: 700, color: '#000', textDecoration: 'none', flex: '1 1 200px', minWidth: 0, textAlign: 'center' }}>
              {isAr ? 'ابدأ مع عين' : 'Start with AYN'}
            </Link>
            <Link to="/features" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '14px 36px', borderRadius: 100, fontFamily: F, fontSize: 15, fontWeight: 500, color: '#fff', border: '1px solid rgba(255,255,255,0.22)', textDecoration: 'none', transition: 'all 0.2s', flex: '1 1 200px', minWidth: 0, textAlign: 'center' }}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.4)'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.22)'; }}>
              {isAr ? 'شاهد كيف يعمل' : 'See how it works'}
            </Link>
          </motion.div>

          {/* Stats row */}
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.8, duration: 0.8 }}
            style={{ display: 'flex', flexWrap: 'wrap', gap: '24px 40px', marginTop: 64, paddingTop: 40, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
            {[{ n: '187+', l: 'Countries' }, { n: '73', l: 'AI Agents' }, { n: '24/7', l: 'Monitoring' }].map((s, i) => (
              <div key={i}>
                <p style={{ fontFamily: FB, fontSize: 36, color: G, lineHeight: 1, margin: '0 0 4px' }}>{s.n}</p>
                <p style={{ fontFamily: F, fontSize: 11, letterSpacing: '0.18em', color: 'rgba(255,255,255,0.32)', textTransform: 'uppercase', margin: 0 }}>{s.l}</p>
              </div>
            ))}
          </motion.div>
        </div>

        {/* Scroll hint — desktop/tablet only */}
        <motion.div className="hidden md:flex" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 2 }}
          style={{ position: 'absolute', bottom: 48, left: 'clamp(20px,5vw,96px)', flexDirection: 'column', alignItems: 'flex-start', gap: 12, zIndex: 10 }}>
          <span style={{ fontFamily: F, fontSize: 10, letterSpacing: '0.4em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.30)', fontWeight: 600 }}>Scroll to explore</span>
          <div style={{ width: 1, height: 64, background: 'linear-gradient(to bottom, rgba(251,146,60,0.55), transparent)' }} />
        </motion.div>
      </section>

      {/* ══════════════════════════════════════════════════════════
          SECTION 2 — Intelligence, evolved.
      ══════════════════════════════════════════════════════════ */}
      <section style={{ position: 'relative', minHeight: '100dvh', display: 'flex', alignItems: 'center', padding: 'clamp(72px,8vw,120px) clamp(20px,5vw,96px)', overflow: 'hidden', background: '#030200' }}>
        <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse 80% 60% at 70% 50%, rgba(251,146,60,0.07) 0%, transparent 70%)', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', inset: 0, background: 'repeating-linear-gradient(135deg, transparent, transparent 60px, rgba(251,146,60,0.015) 60px, rgba(251,146,60,0.015) 61px)', pointerEvents: 'none' }} />

        {/* Right: abstract geometry — desktop only */}
        <div className="landing-decor-lg" style={{ position: 'absolute', right: '8%', top: '50%', transform: 'translateY(-50%)', width: 480, height: 480, pointerEvents: 'none' }}>
          <motion.div animate={{ rotate: [0, 360] }} transition={{ duration: 30, repeat: Infinity, ease: 'linear' }}
            style={{ position: 'absolute', inset: 0, border: '1px solid rgba(251,146,60,0.14)', borderRadius: '30% 70% 70% 30% / 30% 30% 70% 70%' }} />
          <motion.div animate={{ rotate: [360, 0] }} transition={{ duration: 20, repeat: Infinity, ease: 'linear' }}
            style={{ position: 'absolute', inset: 40, border: '1px solid rgba(251,146,60,0.10)', borderRadius: '70% 30% 30% 70% / 70% 70% 30% 30%' }} />
          <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: 160, height: 160, borderRadius: '50%', background: 'radial-gradient(circle, rgba(251,146,60,0.20) 0%, transparent 70%)' }} />
          {[0,60,120,180,240,300].map((deg, i) => {
            const r = 200, x = 240 + r * Math.cos(deg * Math.PI/180), y = 240 + r * Math.sin(deg * Math.PI/180);
            return <motion.div key={i} animate={{ opacity: [0.3, 1, 0.3] }} transition={{ duration: 2, delay: i * 0.3, repeat: Infinity }}
              style={{ position: 'absolute', width: 6, height: 6, borderRadius: '50%', background: G, left: x, top: y, boxShadow: `0 0 8px ${G}` }} />;
          })}
        </div>

        <div style={{ position: 'relative', zIndex: 10, maxWidth: 520, width: '100%' }}>
          <motion.p initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }}
            style={{ fontFamily: F, fontSize: 10, fontWeight: 600, letterSpacing: '0.30em', textTransform: 'uppercase', color: G, margin: '0 0 20px' }}>About AYN</motion.p>
          <motion.h2 initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.8 }}
            style={{ fontFamily: F, fontSize: 'clamp(40px,7vw,100px)', fontWeight: 700, lineHeight: 1.04, letterSpacing: '-0.025em', color: '#fff', margin: '0 0 28px', wordBreak: 'break-word', whiteSpace: 'pre-line' }}>
            {isAr ? 'ذكاء\nمتطوّر.' : 'Intelligence,\nevolved.'}
          </motion.h2>
          <motion.p initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: 0.2, duration: 0.8 }}
            style={{ fontFamily: F, fontSize: 16, fontWeight: 300, lineHeight: 1.75, color: 'rgba(255,255,255,0.48)', maxWidth: 460 }}>
            {isAr ? 'عين منصة ذكاء أعمال تراقب الأسواق العالمية وتحلل المخاطر وتقدم رؤى فورية.' : 'AYN monitors global markets, analyzes geopolitical risks, and delivers real-time intelligence so you act before others react.'}
          </motion.p>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════
          SECTION 3 — Your business, understood.
      ══════════════════════════════════════════════════════════ */}
      <section style={{ position: 'relative', minHeight: '100dvh', display: 'flex', alignItems: 'center', padding: 'clamp(72px,8vw,96px) clamp(20px,5vw,80px)', overflow: 'hidden', background: '#020201' }}>
        <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse 60% 60% at 30% 50%, rgba(251,146,60,0.06) 0%, transparent 65%)', pointerEvents: 'none' }} />

        <div className="landing-two-col" style={{ position: 'relative', zIndex: 10 }}>

          {/* Left: headline */}
          <div>
            <motion.p initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }}
              style={{ fontFamily: F, fontSize: 10, fontWeight: 600, letterSpacing: '0.30em', textTransform: 'uppercase', color: G, margin: '0 0 20px' }}>Features</motion.p>
            <motion.h2 initial={{ opacity: 0, scale: 0.92 }} whileInView={{ opacity: 1, scale: 1 }} viewport={{ once: true }} transition={{ duration: 0.8 }}
              style={{ fontFamily: F, fontSize: 'clamp(36px,5vw,72px)', fontWeight: 700, lineHeight: 1.1, color: '#fff', letterSpacing: '-0.02em', margin: '0 0 24px', whiteSpace: 'pre-line' }}>
              {isAr ? 'أعمالك،\nمُفهومة.' : 'Your business,\nunderstood.'}
            </motion.h2>
            <motion.p initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} transition={{ delay: 0.2 }}
              style={{ fontFamily: F, fontSize: 15, fontWeight: 300, lineHeight: 1.75, color: 'rgba(255,255,255,0.45)', maxWidth: 420 }}>
              {isAr ? 'نحلل بيانات شركتك ونساعدك في اتخاذ القرارات الاستراتيجية.' : 'We analyze your company data and help you make strategic decisions with precision and clarity.'}
            </motion.p>
          </div>

          {/* Right: glass data cards (absolute on ≥md, stacked on phone) */}
          <div className="landing-glass-stack" style={{ height: 440 }}>
            {/* Deep Analysis */}
            <motion.div initial={{ opacity: 0, x: 40, y: 30 }} whileInView={{ opacity: 1, x: 0, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.8, delay: 0.2 }}
              className="stitch-glass" style={{ position: 'absolute', top: 0, right: 0, width: 260, borderRadius: 20, padding: '24px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                <BarChart3 size={15} color={G} />
                <span style={{ fontFamily: F, fontSize: 10, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.65)' }}>Deep Analysis</span>
              </div>
              <div style={{ height: 72, display: 'flex', alignItems: 'flex-end', gap: 3 }}>
                {[35, 65, 40, 88, 60, 78, 45, 70, 55].map((h, i) => (
                  <div key={i} style={{ flex: 1, height: `${h}%`, background: `linear-gradient(to top, rgba(251,146,60,0.22), rgba(251,146,60,0.7))`, borderRadius: '3px 3px 0 0' }} />
                ))}
              </div>
            </motion.div>

            {/* Prediction */}
            <motion.div initial={{ opacity: 0, x: 60, y: 80 }} whileInView={{ opacity: 1, x: 0, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.8, delay: 0.4 }}
              className="stitch-glass" style={{ position: 'absolute', bottom: 40, right: 20, width: 210, borderRadius: 20, padding: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                <Target size={14} color={G} />
                <span style={{ fontFamily: F, fontSize: 10, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.65)' }}>Prediction</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <span style={{ fontFamily: FB, fontSize: 34, color: '#fff', lineHeight: 1 }}>84.2%</span>
                <span style={{ fontFamily: F, fontSize: 10, color: '#4ade80', fontWeight: 700 }}>+12.4%</span>
              </div>
              <div style={{ width: '100%', height: 3, background: 'rgba(255,255,255,0.08)', borderRadius: 2, overflow: 'hidden' }}>
                <motion.div initial={{ width: 0 }} whileInView={{ width: '84%' }} viewport={{ once: true }} transition={{ duration: 1.2, delay: 0.6 }}
                  style={{ height: '100%', background: `linear-gradient(to right, ${G}, ${GD})`, borderRadius: 2 }} />
              </div>
            </motion.div>

            {/* Market clarity */}
            <motion.div initial={{ opacity: 0, x: -20, y: 60 }} whileInView={{ opacity: 1, x: 0, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.8, delay: 0.55 }}
              className="stitch-glass" style={{ position: 'absolute', top: 160, left: 0, width: 170, borderRadius: 18, padding: '18px' }}>
              <Globe size={14} color={G} style={{ marginBottom: 10 }} />
              <p style={{ fontFamily: FB, fontSize: 28, color: '#fff', margin: '0 0 4px', lineHeight: 1 }}>187</p>
              <p style={{ fontFamily: F, fontSize: 10, color: 'rgba(255,255,255,0.42)', letterSpacing: '0.16em', textTransform: 'uppercase', margin: 0 }}>Countries</p>
              <div style={{ marginTop: 12, display: 'flex', gap: 3 }}>
                {[1,1,1,0,1,1,0,1].map((on, i) => (
                  <div key={i} style={{ width: 6, height: 6, borderRadius: 1, background: on ? G : 'rgba(255,255,255,0.10)' }} />
                ))}
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════
          SECTION 4 — Services + ASK→ANALYZE→EXECUTE
      ══════════════════════════════════════════════════════════ */}
      <section style={{ position: 'relative', minHeight: '100dvh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 'clamp(72px,8vw,96px) clamp(20px,4vw,64px)', overflow: 'hidden', background: '#050505' }}>
        <div style={{ position: 'absolute', top: '30%', left: '50%', transform: 'translate(-50%,-50%)', width: 'min(80vw, 500px)', height: 'min(80vw, 500px)', borderRadius: '50%', background: 'radial-gradient(circle, rgba(251,146,60,0.08) 0%, transparent 65%)', pointerEvents: 'none' }} />

        <motion.p initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }}
          style={{ fontFamily: F, fontSize: 10, fontWeight: 600, letterSpacing: '0.30em', textTransform: 'uppercase', color: G, margin: '0 0 16px', textAlign: 'center', position: 'relative', zIndex: 2 }}>Services</motion.p>
        <motion.h2 initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
          style={{ fontFamily: FB, fontSize: 'clamp(36px,5vw,72px)', color: '#fff', margin: '0 0 64px', textAlign: 'center', fontWeight: 400, position: 'relative', zIndex: 2 }}>
          {isAr ? 'ما يفعله عين' : 'What AYN Does'}
        </motion.h2>

        {/* Services grid — auto-fit responsive */}
        <div className="landing-services-grid" style={{ position: 'relative', zIndex: 2 }}>
          {[
            { icon: Search,    title: isAr ? 'استشارات الذكاء الاصطناعي' : 'AI Consulting',     desc: isAr ? 'تفاعل مع ذكاء الأعمال وقياس الأداء.' : 'Interact business intelligence, and business measures.', active: false },
            { icon: BarChart3, title: isAr ? 'ذكاء السوق' : 'Market Intelligence',              desc: isAr ? 'ذكاء السوق لتحليل بيانات السوق.' : 'Market intelligence in scan analyzing market data.',     active: false },
            { icon: Target,    title: isAr ? 'استراتيجية البيانات' : 'Data Strategy',           desc: isAr ? 'استراتيجية البيانات والمعرفة التحليلية.' : 'Strategy data when data and data analytic knowledge.',  active: true  },
          ].map((card, i) => (
            <motion.div key={i} initial={{ opacity: 0, y: 50 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.1 }}
              className={card.active ? 'stitch-glass' : ''}
              style={{ padding: '32px 28px', borderRadius: 32, border: card.active ? '1px solid rgba(251,146,60,0.30)' : '1px solid rgba(255,255,255,0.06)', background: card.active ? undefined : 'transparent', boxShadow: card.active ? '0 0 50px rgba(251,146,60,0.12)' : 'none', transition: 'all 0.3s', cursor: 'default' }}
              onMouseEnter={e => { if (!card.active)(e.currentTarget as HTMLDivElement).style.background = 'rgba(255,255,255,0.03)'; }}
              onMouseLeave={e => { if (!card.active)(e.currentTarget as HTMLDivElement).style.background = 'transparent'; }}>
              <div style={{ width: 52, height: 52, borderRadius: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 28, background: card.active ? G : 'rgba(255,255,255,0.06)' }}>
                <card.icon size={22} color={card.active ? '#000' : 'rgba(255,255,255,0.42)'} />
              </div>
              <h3 style={{ fontFamily: FB, fontSize: 24, color: '#fff', margin: '0 0 12px', letterSpacing: '0.02em' }}>{card.title}</h3>
              <p style={{ fontFamily: F, fontSize: 14, color: 'rgba(255,255,255,0.42)', lineHeight: 1.65, margin: 0 }}>{card.desc}</p>
            </motion.div>
          ))}
        </div>

        {/* ASK → ANALYZE → EXECUTE */}
        <div style={{ width: '100%', maxWidth: 680, display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'relative', flexWrap: 'wrap', gap: 24, zIndex: 2 }}>
          <div className="hidden sm:block" style={{ position: 'absolute', top: 22, left: '15%', right: '15%', height: 1, background: 'linear-gradient(to right, transparent, rgba(255,255,255,0.15), transparent)' }} />
          {[{ label: 'ASK', icon: Search }, { label: 'ANALYZE', icon: BarChart3 }, { label: 'EXECUTE', icon: Target }].map((step, i) => (
            <motion.div key={i} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.15 }}
              style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, position: 'relative', zIndex: 1, flex: '1 1 120px' }}>
              <div className="stitch-glass" style={{ width: 52, height: 52, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: 'all 0.3s' }}
                onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.borderColor = G; (e.currentTarget as HTMLDivElement).style.boxShadow = `0 0 20px rgba(251,146,60,0.25)`; }}
                onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.borderColor = ''; (e.currentTarget as HTMLDivElement).style.boxShadow = ''; }}>
                <step.icon size={18} color="rgba(255,255,255,0.42)" />
              </div>
              <span style={{ fontFamily: F, fontSize: 10, fontWeight: 700, letterSpacing: '0.3em', color: 'rgba(255,255,255,0.36)', textTransform: 'uppercase' }}>{step.label}</span>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════
          SECTION 5 — Build with intelligence
      ══════════════════════════════════════════════════════════ */}
      <section style={{ position: 'relative', minHeight: '85dvh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', overflow: 'hidden', background: '#000', padding: 'clamp(72px,8vw,120px) clamp(20px,5vw,64px) 140px' }}>
        {/* Center glow */}
        <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: 'min(90vw, 800px)', height: 'min(90vw, 800px)', borderRadius: '50%', background: 'radial-gradient(circle, rgba(251,146,60,0.10) 0%, rgba(251,146,60,0.03) 40%, transparent 70%)', pointerEvents: 'none' }} />
        {/* Rings — clamped to viewport */}
        {[600, 450, 320].map((size, i) => (
          <div key={i} style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: `min(85vw, ${size}px)`, height: `min(85vw, ${size}px)`, borderRadius: '50%', border: `1px solid rgba(251,146,60,${0.05 - i * 0.012})`, pointerEvents: 'none' }} />
        ))}

        <div style={{ position: 'relative', zIndex: 10, maxWidth: 860, padding: '0 4px' }}>
          <motion.p initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }}
            style={{ fontFamily: F, fontSize: 10, fontWeight: 600, letterSpacing: '0.30em', textTransform: 'uppercase', color: G, margin: '0 0 24px' }}>Start Today</motion.p>
          <motion.h2 initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
            style={{ fontFamily: F, fontSize: 'clamp(40px,9vw,110px)', fontWeight: 800, lineHeight: 1.04, letterSpacing: '-0.025em', color: '#EDE8D8', margin: '0 0 52px', whiteSpace: 'pre-line', wordBreak: 'break-word' }}>
            {isAr ? 'ابنِ\nبذكاء' : 'Build with\nintelligence'}
          </motion.h2>
          <motion.div initial={{ opacity: 0, scale: 0.9 }} whileInView={{ opacity: 1, scale: 1 }} viewport={{ once: true }}>
            <Link to="/pricing" className="gold-glow-btn" style={{ display: 'inline-flex', alignItems: 'center', padding: '18px 52px', borderRadius: 100, fontFamily: F, fontSize: 18, fontWeight: 800, color: '#000', textDecoration: 'none' }}>
              {isAr ? 'ابدأ مع عين' : 'Start with AYN'}
            </Link>
          </motion.div>
        </div>

        {/* Footer bar */}
        <div className="stitch-glass-dark landing-footer-bar" style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '20px clamp(20px,5vw,80px)', zIndex: 20, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 24px', justifyContent: 'center' }}>
            {[
              { label: 'Privacy Policy', href: '/privacy' },
              { label: 'Terms', href: '/terms' },
              { label: 'Pricing', href: '/pricing' },
              { label: 'Contact', href: '/contact' },
            ].map(link => (
              <Link key={link.label} to={link.href} style={{ fontFamily: F, fontSize: 11, fontWeight: 600, letterSpacing: '0.16em', color: 'rgba(255,255,255,0.32)', textDecoration: 'none', textTransform: 'uppercase', transition: 'color 0.2s' }}
                onMouseEnter={e => (e.currentTarget.style.color = '#fff')}
                onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.32)')}>
                {link.label}
              </Link>
            ))}
          </div>
          <span style={{ fontFamily: F, fontSize: 11, fontWeight: 600, letterSpacing: '0.14em', color: 'rgba(255,255,255,0.20)', textTransform: 'uppercase' }}>© 2026 AYN Intelligence</span>
        </div>
      </section>

    </div>
  );
});

HeroScroll.displayName = 'HeroScroll';
