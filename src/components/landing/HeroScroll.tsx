/**
 * HeroScroll — Exact implementation of Stitch design.
 * 5 full-screen sections, each with robot image background.
 * Matches the provided TypeScript/CSS code from Stitch exactly.
 */

import { memo } from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { ChevronRight, BarChart3, Target, Search } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import heroImg     from '@/assets/robot-hero.jpg';
import evolvedImg  from '@/assets/robot-evolved.jpg';
import businessImg from '@/assets/robot-business.jpg';
import servicesImg from '@/assets/robot-services.jpg';
import ctaImg      from '@/assets/robot-cta.jpg';

export const HeroScroll = memo(() => {
  const { language } = useLanguage();
  const isAr = language === 'ar';
  const F = "'DM Sans', sans-serif";
  const FD = "'Bebas Neue', sans-serif";

  return (
    <div style={{ background: '#000' }}>

      {/* ══════════════════════════════════════════════════════════
          SECTION 1 — MEET AYN hero
          "MEET AYN" large, robot right, two CTA buttons, scroll hint
      ══════════════════════════════════════════════════════════ */}
      <section style={{ position: 'relative', minHeight: '100dvh', display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '80px clamp(32px,6vw,96px)', overflow: 'hidden' }}>
        {/* Background */}
        <img src={heroImg} alt="" draggable={false} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', zIndex: 0, userSelect: 'none', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to right, #000 30%, rgba(0,0,0,0.45) 60%, rgba(0,0,0,0.0) 85%)', zIndex: 1 }} />

        {/* Content */}
        <div style={{ position: 'relative', zIndex: 10, maxWidth: 600 }}>
          <motion.h1
            initial={{ x: -50, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            transition={{ duration: 0.8, ease: 'easeOut' }}
            style={{ fontFamily: FD, fontSize: 'clamp(72px,10vw,130px)', fontWeight: 400, lineHeight: 0.88, letterSpacing: '-0.01em', color: '#fff', margin: '0 0 28px' }}
          >
            {isAr ? 'تعرّف على ' : 'MEET '}
            <span className="text-gold-glow">{isAr ? 'عين' : 'AYN'}</span>
          </motion.h1>

          <motion.p
            initial={{ x: -30, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            transition={{ duration: 0.8, delay: 0.2 }}
            style={{ fontFamily: F, fontSize: 18, fontWeight: 300, lineHeight: 1.65, color: 'rgba(255,255,255,0.58)', maxWidth: 400, margin: '0 0 40px' }}
          >
            {isAr ? 'ذكاء أعمال حقيقي. تفاعل مع عين واكتشف ما يراه.' : 'Real business intelligence. Interact with AYN — and discover what it sees.'}
          </motion.p>

          <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.8, delay: 0.4 }}
            style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}
          >
            <Link to="/pricing" className="gold-glow-btn" style={{ display: 'inline-flex', alignItems: 'center', padding: '14px 36px', borderRadius: 100, fontFamily: F, fontSize: 15, fontWeight: 700, color: '#000', textDecoration: 'none' }}>
              {isAr ? 'ابدأ مع عين' : 'Start with AYN'}
            </Link>
            <Link to="/features" style={{ display: 'inline-flex', alignItems: 'center', padding: '14px 36px', borderRadius: 100, fontFamily: F, fontSize: 15, fontWeight: 600, color: '#fff', border: '1px solid rgba(255,255,255,0.28)', textDecoration: 'none', transition: 'all 0.2s' }}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}>
              {isAr ? 'شاهد كيف يعمل' : 'See how it works'}
            </Link>
          </motion.div>
        </div>

        {/* Scroll hint */}
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 2 }}
          style={{ position: 'absolute', bottom: 48, left: 'clamp(32px,6vw,96px)', display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 12, zIndex: 10 }}>
          <span style={{ fontFamily: F, fontSize: 10, letterSpacing: '0.4em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.35)', fontWeight: 700 }}>Scroll to explore</span>
          <div style={{ width: 1, height: 72, background: 'linear-gradient(to bottom, rgba(255,255,255,0.35), transparent)' }} />
        </motion.div>
      </section>

      {/* ══════════════════════════════════════════════════════════
          SECTION 2 — Intelligence, evolved.
      ══════════════════════════════════════════════════════════ */}
      <section style={{ position: 'relative', minHeight: '100dvh', display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '0 clamp(32px,6vw,96px)', overflow: 'hidden' }}>
        <img src={evolvedImg} alt="" draggable={false} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', zIndex: 0, userSelect: 'none', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to right, #000 25%, rgba(0,0,0,0.20) 55%, rgba(0,0,0,0.0) 80%)', zIndex: 1 }} />

        <motion.h2
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8 }}
          style={{ position: 'relative', zIndex: 10, fontFamily: F, fontSize: 'clamp(52px,7.5vw,110px)', fontWeight: 700, lineHeight: 1.05, letterSpacing: '-0.025em', color: '#fff', maxWidth: 520, background: 'linear-gradient(135deg, #fff, rgba(255,255,255,0.35))', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}
        >
          {isAr ? 'ذكاء\nمتطوّر.' : 'Intelligence,\nevolved.'}
        </motion.h2>
      </section>

      {/* ══════════════════════════════════════════════════════════
          SECTION 3 — Your business, understood.
      ══════════════════════════════════════════════════════════ */}
      <section style={{ position: 'relative', minHeight: '100dvh', display: 'flex', alignItems: 'center', padding: '80px clamp(32px,5vw,80px)', overflow: 'hidden' }}>
        <img src={businessImg} alt="" draggable={false} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', zIndex: 0, userSelect: 'none', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.40)', zIndex: 1 }} />

        <div style={{ position: 'relative', zIndex: 10, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 48, alignItems: 'center', width: '100%', maxWidth: 1200, margin: '0 auto' }}>

          {/* Left: headline */}
          <motion.h2
            initial={{ opacity: 0, scale: 0.92 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8 }}
            style={{ fontFamily: F, fontSize: 'clamp(42px,5.5vw,80px)', fontWeight: 700, lineHeight: 1.1, color: '#fff', letterSpacing: '-0.02em', margin: 0 }}
          >
            {isAr ? 'أعمالك،\nمُفهومة.' : 'Your business,\nunderstood.'}
          </motion.h2>

          {/* Right: glass cards */}
          <div style={{ position: 'relative', height: 480 }}>
            {/* Main glass card */}
            <motion.div
              initial={{ opacity: 0, x: 50, y: 50 }}
              whileInView={{ opacity: 1, x: 0, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 1, delay: 0.2 }}
              className="stitch-glass"
              style={{ position: 'absolute', top: 20, right: 0, width: 260, borderRadius: 24, padding: '28px 28px 22px' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                <BarChart3 size={16} color="#e2b769" />
                <span style={{ fontFamily: F, fontSize: 10, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.75)' }}>Deep Analysis</span>
              </div>
              <div style={{ height: 80, display: 'flex', alignItems: 'flex-end', gap: 4 }}>
                {[40, 70, 45, 90, 65, 80, 50, 75, 60].map((h, i) => (
                  <div key={i} style={{ flex: 1, height: `${h}%`, background: `linear-gradient(to top, rgba(226,183,105,0.25), rgba(226,183,105,0.7))`, borderRadius: '3px 3px 0 0' }} />
                ))}
              </div>
            </motion.div>

            {/* Prediction card */}
            <motion.div
              initial={{ opacity: 0, x: 80, y: 100 }}
              whileInView={{ opacity: 1, x: 0, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 1, delay: 0.4 }}
              className="stitch-glass"
              style={{ position: 'absolute', bottom: 60, right: 40, width: 200, borderRadius: 24, padding: '22px' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                <Target size={14} color="#e2b769" />
                <span style={{ fontFamily: F, fontSize: 10, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.75)' }}>Prediction</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <span style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 32, color: '#fff', lineHeight: 1 }}>84.2%</span>
                <span style={{ fontFamily: F, fontSize: 10, color: '#4ade80', fontWeight: 700 }}>+12.4%</span>
              </div>
              <div style={{ width: '100%', height: 3, background: 'rgba(255,255,255,0.10)', borderRadius: 2, overflow: 'hidden' }}>
                <motion.div initial={{ width: 0 }} whileInView={{ width: '84%' }} viewport={{ once: true }} transition={{ duration: 1, delay: 0.6 }} style={{ height: '100%', background: '#e2b769', borderRadius: 2 }} />
              </div>
            </motion.div>

            {/* Clarity card */}
            <motion.div
              initial={{ opacity: 0, x: 30, y: 80 }}
              whileInView={{ opacity: 1, x: 0, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 1, delay: 0.6 }}
              className="stitch-glass"
              style={{ position: 'absolute', top: 200, left: 0, width: 160, borderRadius: 20, padding: '18px 16px' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#e2b769' }} />
                <span style={{ fontFamily: F, fontSize: 10, fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.65)' }}>Clarity</span>
              </div>
              <div style={{ display: 'flex', gap: 3, alignItems: 'flex-end', height: 40 }}>
                {[3, 6, 4, 8, 5, 7].map((h, i) => (
                  <div key={i} style={{ flex: 1, height: `${h * 5}px`, background: 'rgba(226,183,105,0.45)', borderRadius: '2px 2px 0 0' }} />
                ))}
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════
          SECTION 4 — Services + ASK→ANALYZE→EXECUTE
      ══════════════════════════════════════════════════════════ */}
      <section style={{ position: 'relative', minHeight: '100dvh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', padding: '40px clamp(24px,4vw,64px) 60px', overflow: 'hidden', background: '#050505' }}>
        <img src={servicesImg} alt="" draggable={false} style={{ position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)', height: '55%', width: 'auto', objectFit: 'contain', zIndex: 0, userSelect: 'none', pointerEvents: 'none', mixBlendMode: 'screen', opacity: 0.85 }} />

        {/* 3 service cards */}
        <div style={{ position: 'relative', zIndex: 10, display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 20, width: '100%', maxWidth: 1100, marginBottom: 48 }}>
          {[
            { icon: Search, title: isAr ? 'استشارات الذكاء الاصطناعي' : 'AI Consulting', desc: isAr ? 'تفاعل مع ذكاء الأعمال وقياس الأداء.' : 'Interact business intelligence, and business measures.', active: false },
            { icon: BarChart3, title: isAr ? 'ذكاء السوق' : 'Market Intelligence', desc: isAr ? 'ذكاء السوق لتحليل بيانات السوق.' : 'Market intelligence in scan analyzing market data.', active: false },
            { icon: Target, title: isAr ? 'استراتيجية البيانات' : 'Data Strategy', desc: isAr ? 'استراتيجية البيانات والمعرفة التحليلية.' : 'Strategy data when data and data analytic knowledge.', active: true },
          ].map((card, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 50 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1 }}
              className={card.active ? 'stitch-glass' : ''}
              style={{
                padding: '32px 28px',
                borderRadius: 32,
                background: card.active ? undefined : 'transparent',
                border: card.active ? '1px solid rgba(226,183,105,0.30)' : '1px solid rgba(255,255,255,0.06)',
                boxShadow: card.active ? '0 0 50px rgba(212,160,23,0.12)' : 'none',
                transition: 'all 0.3s',
              }}
              onMouseEnter={e => { if (!card.active) (e.currentTarget as HTMLDivElement).style.background = 'rgba(255,255,255,0.04)'; }}
              onMouseLeave={e => { if (!card.active) (e.currentTarget as HTMLDivElement).style.background = 'transparent'; }}
            >
              <div style={{ width: 52, height: 52, borderRadius: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 28, background: card.active ? '#e2b769' : 'rgba(255,255,255,0.06)' }}>
                <card.icon size={22} color={card.active ? '#000' : 'rgba(255,255,255,0.4)'} />
              </div>
              <h3 style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 24, color: '#fff', margin: '0 0 12px', letterSpacing: '0.02em' }}>{card.title}</h3>
              <p style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 14, color: 'rgba(255,255,255,0.40)', lineHeight: 1.65, margin: 0 }}>{card.desc}</p>
            </motion.div>
          ))}
        </div>

        {/* ASK → ANALYZE → EXECUTE */}
        <div style={{ position: 'relative', zIndex: 10, width: '100%', maxWidth: 720, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ position: 'absolute', top: 22, left: '15%', right: '15%', height: 1, background: 'linear-gradient(to right, transparent, rgba(255,255,255,0.18), transparent)' }} />
          {[
            { label: 'ASK', icon: Search },
            { label: 'ANALYZE', icon: BarChart3 },
            { label: 'EXECUTE', icon: Target },
          ].map((step, i) => (
            <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, position: 'relative', zIndex: 1 }}>
              <div className="stitch-glass" style={{ width: 56, height: 56, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: 'all 0.3s' }}
                onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.borderColor = '#e2b769'; (e.currentTarget as HTMLDivElement).style.color = '#e2b769'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.borderColor = ''; }}>
                <step.icon size={20} color="rgba(255,255,255,0.38)" />
              </div>
              <span style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 10, fontWeight: 700, letterSpacing: '0.3em', color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase' }}>{step.label}</span>
            </div>
          ))}
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════
          SECTION 5 — Build with intelligence (Footer CTA)
      ══════════════════════════════════════════════════════════ */}
      <section style={{ position: 'relative', minHeight: '85dvh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', overflow: 'hidden' }}>
        <img src={ctaImg} alt="" draggable={false} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', zIndex: 0, userSelect: 'none', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 1 }} />

        <div style={{ position: 'relative', zIndex: 10, maxWidth: 860, padding: '0 32px' }}>
          <motion.h2
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 'clamp(44px,7vw,110px)', fontWeight: 800, lineHeight: 1.02, letterSpacing: '-0.025em', color: '#EDE8D8', margin: '0 0 56px' }}
          >
            {isAr ? 'ابنِ بذكاء' : 'Build with\nintelligence'}
          </motion.h2>

          <motion.div initial={{ opacity: 0, scale: 0.9 }} whileInView={{ opacity: 1, scale: 1 }} viewport={{ once: true }}>
            <Link to="/pricing" className="gold-glow-btn" style={{ display: 'inline-flex', alignItems: 'center', padding: '18px 52px', borderRadius: 100, fontFamily: "'DM Sans',sans-serif", fontSize: 18, fontWeight: 800, color: '#000', textDecoration: 'none' }}>
              {isAr ? 'ابدأ مع عين' : 'Start with AYN'}
            </Link>
          </motion.div>
        </div>

        {/* Footer bar */}
        <div className="stitch-glass-dark" style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '20px clamp(24px,5vw,80px)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', zIndex: 20, borderTop: '1px solid rgba(255,255,255,0.08)' }}>
          <div style={{ display: 'flex', gap: 32 }}>
            {['Privacy Policy', 'Terms', 'Pricing', 'Contact'].map(link => (
              <a key={link} href="#" style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 11, fontWeight: 700, letterSpacing: '0.18em', color: 'rgba(255,255,255,0.35)', textDecoration: 'none', textTransform: 'uppercase', transition: 'color 0.2s' }}
                onMouseEnter={e => (e.currentTarget.style.color = '#fff')}
                onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.35)')}>
                {link}
              </a>
            ))}
          </div>
          <span style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 11, fontWeight: 700, letterSpacing: '0.15em', color: 'rgba(255,255,255,0.18)', textTransform: 'uppercase' }}>© 2026 AYN Intelligence</span>
        </div>
      </section>

    </div>
  );
});

HeroScroll.displayName = 'HeroScroll';
