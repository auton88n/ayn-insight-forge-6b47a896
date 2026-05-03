import { useState, useRef, useEffect, memo } from 'react';
import { motion, useScroll, useTransform, useMotionValueEvent } from 'framer-motion';
import { Link } from 'react-router-dom';
import { Brain, Globe, TrendingUp, Shield, Zap, Bot, BarChart3, Eye, AlertTriangle, ArrowRight, ChevronDown } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import { SEO, organizationSchema, websiteSchema, softwareApplicationSchema, createFAQSchema } from '@/components/shared/SEO';
import { Header } from '@/components/shared/Header';
import { Footer } from '@/components/shared/Footer';
import { AuthModal } from './auth/AuthModal';
import { HeroScroll } from '@/components/landing/HeroScroll';
import featureBusinessImg from '@/assets/feature-business.jpg';
import featureMarketImg from '@/assets/feature-market.jpg';
import featurePredictImg from '@/assets/feature-predict.jpg';

/* ─── Fonts ──────────────────────────────────────────────────────────────── */
// Bebas Neue + DM Sans already loaded in index.html

/* ─── Helpers ────────────────────────────────────────────────────────────── */
function useInView(threshold = 0.15) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) setVisible(true); }, { threshold });
    obs.observe(el);
    return () => obs.disconnect();
  }, [threshold]);
  return [ref, visible] as const;
}

/* ─── Reveal wrapper ─────────────────────────────────────────────────────── */
const Reveal = ({ children, delay = 0, direction = 'up' }: { children: React.ReactNode; delay?: number; direction?: 'up' | 'left' | 'right' | 'none' }) => {
  const [ref, visible] = useInView();
  const initial = direction === 'up' ? { opacity: 0, y: 48 } : direction === 'left' ? { opacity: 0, x: -48 } : direction === 'right' ? { opacity: 0, x: 48 } : { opacity: 0 };
  return (
    <motion.div ref={ref} initial={initial} animate={visible ? { opacity: 1, x: 0, y: 0 } : initial} transition={{ duration: 0.75, delay, ease: [0.16, 1, 0.3, 1] }}>
      {children}
    </motion.div>
  );
};

/* ─── Counter animation ──────────────────────────────────────────────────── */
const Counter = ({ target, suffix = '' }: { target: number; suffix?: string }) => {
  const [ref, visible] = useInView();
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!visible) return;
    let start = 0;
    const step = target / 60;
    const timer = setInterval(() => {
      start += step;
      if (start >= target) { setCount(target); clearInterval(timer); }
      else setCount(Math.floor(start));
    }, 16);
    return () => clearInterval(timer);
  }, [visible, target]);
  return <span ref={ref}>{count}{suffix}</span>;
};

/* ─── Divider ────────────────────────────────────────────────────────────── */
const GoldLine = ({ className = '' }: { className?: string }) => (
  <div className={`w-12 h-px bg-[#C9A84C] opacity-60 ${className}`} />
);

/* ─── Landing Page ───────────────────────────────────────────────────────── */
const LandingPage = memo(() => {
  const [showAuthModal, setShowAuthModal] = useState(false);
  const { language, direction } = useLanguage();
  const isAr = language === 'ar';

  const faqSchema = createFAQSchema([
    { question: 'What is AYN AI?', answer: 'AYN (عين) is a business intelligence AI that monitors global markets, analyzes geopolitical risks, and delivers real-time insights.' },
    { question: 'Does AYN support Arabic?', answer: 'Yes. AYN is fully bilingual in Arabic and English, built for the MENA market and beyond.' },
    { question: 'Is AYN free to try?', answer: 'Absolutely. AYN has a free tier with no credit card required.' },
  ]);

  /* ── Ticker items ── */
  const tickerItems = ['187 Countries', 'Real-Time Intelligence', '73 AI Agents', 'Market Signals', 'Geopolitical Risk', 'Supply Chain', 'Predictive AI', '24/7 Monitoring'];

  return (
    <>
      <SEO
        title="AYN AI | Business Intelligence & Market Analysis | Real-Time AI"
        description="AYN monitors global markets, analyzes geopolitical risks, and delivers instant business intelligence."
        canonical="/"
        keywords="AYN AI, business intelligence AI, market analysis AI, geopolitical risk"
        jsonLd={{ '@graph': [organizationSchema, websiteSchema, softwareApplicationSchema, faqSchema] }}
      />

      <div dir={direction} className="min-h-screen" style={{ background: '#000', color: '#EDEDEF', fontFamily: "'DM Sans', sans-serif" }}>
        <Header />

        {/* ════════════════════════════════════════════════════════════════
            STAGE 1 — HERO (3D object here, scroll-driven)
            The HeroScroll component owns this section.
            👉 3D OBJECT PLACEMENT: Replace SplineScene inside HeroScroll.tsx
               with your Spline/Three.js scene. It occupies the RIGHT half
               of the sticky grid. Scroll progress (0→60%) should drive
               your object's rotation/assembly animation.
        ════════════════════════════════════════════════════════════════ */}
        <HeroScroll />

        {/* ════════════════════════════════════════════════════════════════
            SCROLLING TICKER — between hero and stats
        ════════════════════════════════════════════════════════════════ */}
        <div style={{ borderTop: '1px solid rgba(201,168,76,0.12)', borderBottom: '1px solid rgba(201,168,76,0.12)', overflow: 'hidden', padding: '14px 0' }}>
          <motion.div
            style={{ display: 'flex', gap: 64, width: 'max-content' }}
            animate={{ x: ['0%', '-50%'] }}
            transition={{ duration: 30, repeat: Infinity, ease: 'linear' }}
          >
            {[...tickerItems, ...tickerItems].map((item, i) => (
              <span key={i} style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 11, fontWeight: 500, letterSpacing: '0.28em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.28)', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 24 }}>
                <span style={{ color: '#C9A84C', fontSize: 8 }}>◆</span>
                {item}
              </span>
            ))}
          </motion.div>
        </div>

        {/* ════════════════════════════════════════════════════════════════
            STAGE 2 — STATS ROW
        ════════════════════════════════════════════════════════════════ */}
        <section style={{ padding: '96px clamp(24px,6vw,96px)', maxWidth: 1280, margin: '0 auto' }}>
          <Reveal>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 2, background: 'rgba(201,168,76,0.08)', border: '1px solid rgba(201,168,76,0.12)' }}>
              {[
                { n: 187, suf: '+', label: isAr ? 'دولة مُراقَبة' : 'Countries Tracked' },
                { n: 73, suf: '', label: isAr ? 'عميل ذكاء اصطناعي' : 'AI World Agents' },
                { n: 24, suf: '/7', label: isAr ? 'مراقبة مستمرة' : 'Live Monitoring' },
                { n: 99, suf: '%', label: isAr ? 'دقة التنبؤات' : 'Prediction Accuracy' },
              ].map((s, i) => (
                <div key={i} style={{ padding: '48px 32px', textAlign: 'center', background: '#000', borderRight: i < 3 ? '1px solid rgba(201,168,76,0.10)' : 'none' }}>
                  <p style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 'clamp(52px,5vw,80px)', color: '#C9A84C', lineHeight: 1, margin: '0 0 8px' }}>
                    <Counter target={s.n} suffix={s.suf} />
                  </p>
                  <p style={{ fontSize: 11, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.35)', margin: 0 }}>{s.label}</p>
                </div>
              ))}
            </div>
          </Reveal>
        </section>

        {/* ════════════════════════════════════════════════════════════════
            STAGE 3 — ABOUT / VALUE PROPOSITION
        ════════════════════════════════════════════════════════════════ */}
        <section id="about" style={{ padding: '96px clamp(24px,6vw,96px)', maxWidth: 1280, margin: '0 auto' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'clamp(48px,8vw,120px)', alignItems: 'center' }}>
            <div>
              <Reveal>
                <GoldLine className="mb-6" />
                <p style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.28em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.30)', marginBottom: 20 }}>
                  {isAr ? 'من نحن' : 'About AYN'}
                </p>
                <h2 style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 'clamp(44px,5.5vw,84px)', fontWeight: 400, lineHeight: 0.92, color: '#fff', margin: '0 0 28px' }}>
                  {isAr ? 'ذكاء أعمال\nلا يتوقف' : 'Business\nIntelligence\nThat Never Sleeps'}
                </h2>
                <p style={{ fontSize: 16, fontWeight: 300, lineHeight: 1.75, color: 'rgba(255,255,255,0.50)', maxWidth: 440, marginBottom: 40 }}>
                  {isAr
                    ? 'عين (AYN) منصة ذكاء أعمال تراقب الأسواق العالمية، تحلل المخاطر الجيوسياسية، وتقدم رؤى فورية لمساعدتك على اتخاذ قرارات أفضل.'
                    : 'AYN monitors global markets, analyzes geopolitical risks, and delivers real-time intelligence so you can act before others react.'}
                </p>
                <Link to="/pricing" style={{ display: 'inline-flex', alignItems: 'center', gap: 12, padding: '14px 36px', background: '#C9A84C', color: '#000', fontWeight: 700, fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', textDecoration: 'none', transition: 'transform 0.2s' }}
                  onMouseEnter={e => (e.currentTarget.style.transform = 'scale(1.03)')}
                  onMouseLeave={e => (e.currentTarget.style.transform = 'scale(1)')}>
                  {isAr ? 'ابدأ مجاناً' : 'Get Started Free'} <ArrowRight size={14} />
                </Link>
              </Reveal>
            </div>

            {/* Right: 6-grid capability icons */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
              {[
                { icon: Brain, label: isAr ? 'يتكيّف معك' : 'Adaptive AI', desc: isAr ? 'يتعلم أسلوبك وتفضيلاتك.' : 'Learns your style and needs.' },
                { icon: Globe, label: isAr ? '١٨٧ دولة' : '187 Countries', desc: isAr ? 'رصد عالمي شامل.' : 'Global coverage, real-time.' },
                { icon: Shield, label: isAr ? 'خصوصية محمية' : 'Encrypted', desc: isAr ? 'بياناتك مشفرة دائماً.' : 'End-to-end secure.' },
                { icon: Zap, label: isAr ? 'أتمتة ذكية' : 'Automation', desc: isAr ? 'توفير الوقت والموارد.' : 'Save time and resources.' },
                { icon: Bot, label: isAr ? 'وكلاء مخصصون' : 'Custom Agents', desc: isAr ? 'مدربون على بياناتك.' : 'Trained on your data.' },
                { icon: BarChart3, label: isAr ? 'تحليلات عميقة' : 'Deep Analytics', desc: isAr ? 'قرارات مبنية على البيانات.' : 'Data-driven decisions.' },
              ].map(({ icon: Icon, label, desc }, i) => (
                <Reveal key={i} delay={i * 0.06}>
                  <motion.div whileHover={{ background: 'rgba(201,168,76,0.06)' }}
                    style={{ padding: '28px 24px', background: '#000', border: '1px solid rgba(201,168,76,0.10)', transition: 'background 0.3s', cursor: 'default' }}>
                    <Icon size={20} color="#C9A84C" style={{ marginBottom: 14 }} />
                    <p style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 20, color: '#fff', margin: '0 0 6px', letterSpacing: '0.02em' }}>{label}</p>
                    <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)', lineHeight: 1.6, margin: 0 }}>{desc}</p>
                  </motion.div>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* ════════════════════════════════════════════════════════════════
            STAGE 4 — THREE FEATURE DEEP-DIVES
        ════════════════════════════════════════════════════════════════ */}
        <section id="features" style={{ padding: '96px clamp(24px,6vw,96px)', maxWidth: 1280, margin: '0 auto' }}>
          <Reveal>
            <div style={{ marginBottom: 72, textAlign: 'center' }}>
              <GoldLine className="mx-auto mb-6" />
              <p style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.28em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.28)', marginBottom: 16 }}>
                {isAr ? 'قدرات عين' : 'AYN Capabilities'}
              </p>
              <h2 style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 'clamp(40px,5vw,76px)', fontWeight: 400, lineHeight: 0.92, color: '#fff', margin: 0 }}>
                {isAr ? 'ثلاث قوى في منصة واحدة' : 'Three Powers,\nOne Platform'}
              </h2>
            </div>
          </Reveal>

          {/* Feature 1 */}
          <Reveal>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2, marginBottom: 2, border: '1px solid rgba(201,168,76,0.10)' }}>
              <div style={{ overflow: 'hidden', aspectRatio: '16/10' }}>
                <motion.img src={featureBusinessImg} alt="Business Intelligence" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                  whileHover={{ scale: 1.04 }} transition={{ duration: 0.6 }} />
              </div>
              <div style={{ padding: 'clamp(32px,4vw,64px)', display: 'flex', flexDirection: 'column', justifyContent: 'center', background: '#050505' }}>
                <TrendingUp size={20} color="#C9A84C" style={{ marginBottom: 20 }} />
                <p style={{ fontSize: 9, fontWeight: 600, letterSpacing: '0.30em', textTransform: 'uppercase', color: '#C9A84C', margin: '0 0 12px' }}>Business Intelligence</p>
                <h3 style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 'clamp(32px,3.5vw,52px)', fontWeight: 400, lineHeight: 0.92, color: '#fff', margin: '0 0 20px' }}>
                  {isAr ? 'بناء ودراسة الأعمال' : 'Build & Study\nBusiness'}
                </h3>
                <p style={{ fontSize: 14, fontWeight: 300, lineHeight: 1.75, color: 'rgba(255,255,255,0.44)', maxWidth: 360, margin: '0 0 28px' }}>
                  {isAr ? 'عين يحلل بيانات شركتك ويساعدك في اتخاذ القرارات الاستراتيجية.' : 'AYN analyzes your company data and helps you make strategic decisions. From competitor research to growth strategy.'}
                </p>
                {['Competitor & market analysis', 'Data-driven growth strategies', 'Intelligent performance reports'].map((item, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                    <div style={{ width: 4, height: 4, borderRadius: '50%', background: '#C9A84C', flexShrink: 0 }} />
                    <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.40)' }}>{item}</span>
                  </div>
                ))}
              </div>
            </div>
          </Reveal>

          {/* Feature 2 */}
          <Reveal>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2, marginBottom: 2, border: '1px solid rgba(201,168,76,0.10)' }}>
              <div style={{ padding: 'clamp(32px,4vw,64px)', display: 'flex', flexDirection: 'column', justifyContent: 'center', background: '#050505' }}>
                <Eye size={20} color="#C9A84C" style={{ marginBottom: 20 }} />
                <p style={{ fontSize: 9, fontWeight: 600, letterSpacing: '0.30em', textTransform: 'uppercase', color: '#C9A84C', margin: '0 0 12px' }}>Market Intelligence</p>
                <h3 style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 'clamp(32px,3.5vw,52px)', fontWeight: 400, lineHeight: 0.92, color: '#fff', margin: '0 0 20px' }}>
                  {isAr ? 'رصد الأسواق والتحولات' : 'Market Shifts\n& Intelligence'}
                </h3>
                <p style={{ fontSize: 14, fontWeight: 300, lineHeight: 1.75, color: 'rgba(255,255,255,0.44)', maxWidth: 360, margin: '0 0 28px' }}>
                  {isAr ? 'عين يراقب الأسواق العالمية في الوقت الفعلي ويكشف التحولات قبل أن تصبح واضحة.' : 'AYN monitors global markets in real-time and detects shifts before they become obvious. From oil to crypto.'}
                </p>
                {['Real-time market tracking', 'Sector analysis & trend detection', 'Investment opportunity alerts'].map((item, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                    <div style={{ width: 4, height: 4, borderRadius: '50%', background: '#C9A84C', flexShrink: 0 }} />
                    <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.40)' }}>{item}</span>
                  </div>
                ))}
              </div>
              <div style={{ overflow: 'hidden', aspectRatio: '16/10' }}>
                <motion.img src={featureMarketImg} alt="Market Intelligence" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                  whileHover={{ scale: 1.04 }} transition={{ duration: 0.6 }} />
              </div>
            </div>
          </Reveal>

          {/* Feature 3 */}
          <Reveal>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2, border: '1px solid rgba(201,168,76,0.10)' }}>
              <div style={{ overflow: 'hidden', aspectRatio: '16/10' }}>
                <motion.img src={featurePredictImg} alt="Predictive Intelligence" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                  whileHover={{ scale: 1.04 }} transition={{ duration: 0.6 }} />
              </div>
              <div style={{ padding: 'clamp(32px,4vw,64px)', display: 'flex', flexDirection: 'column', justifyContent: 'center', background: '#050505' }}>
                <AlertTriangle size={20} color="#C9A84C" style={{ marginBottom: 20 }} />
                <p style={{ fontSize: 9, fontWeight: 600, letterSpacing: '0.30em', textTransform: 'uppercase', color: '#C9A84C', margin: '0 0 12px' }}>Predictive AI</p>
                <h3 style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 'clamp(32px,3.5vw,52px)', fontWeight: 400, lineHeight: 0.92, color: '#fff', margin: '0 0 20px' }}>
                  {isAr ? 'التنبؤ بالأحداث العالمية' : 'World Event\nPredictions'}
                </h3>
                <p style={{ fontSize: 14, fontWeight: 300, lineHeight: 1.75, color: 'rgba(255,255,255,0.44)', maxWidth: 360, margin: '0 0 28px' }}>
                  {isAr ? 'عين يحلل الأحداث الجيوسياسية وسلاسل الإمداد ليتنبأ بتأثيرها على أعمالك.' : 'AYN analyzes geopolitical events and supply chains to predict their impact. Prepare before it arrives.'}
                </p>
                {['Geopolitical risk analysis', 'Supply chain disruption alerts', 'Business impact scenarios'].map((item, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                    <div style={{ width: 4, height: 4, borderRadius: '50%', background: '#C9A84C', flexShrink: 0 }} />
                    <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.40)' }}>{item}</span>
                  </div>
                ))}
              </div>
            </div>
          </Reveal>
        </section>

        {/* ════════════════════════════════════════════════════════════════
            STAGE 5 — CTA + FINAL SECTION
        ════════════════════════════════════════════════════════════════ */}
        <section style={{ padding: '120px clamp(24px,6vw,96px)', textAlign: 'center', borderTop: '1px solid rgba(201,168,76,0.10)', position: 'relative', overflow: 'hidden' }}>
          {/* Ambient glow */}
          <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: 600, height: 600, borderRadius: '50%', background: 'radial-gradient(circle, rgba(201,168,76,0.05) 0%, transparent 65%)', pointerEvents: 'none' }} />

          <Reveal>
            <GoldLine className="mx-auto mb-8" />
            <p style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.28em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.28)', marginBottom: 24 }}>
              {isAr ? 'ابدأ اليوم' : 'Start Today'}
            </p>
            <h2 style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 'clamp(56px,8vw,120px)', fontWeight: 400, lineHeight: 0.88, color: '#fff', margin: '0 0 32px', position: 'relative' }}>
              {isAr ? 'شاهد العالم\nبوضوح تام' : 'See the World\n'}
              <span style={{ color: '#C9A84C' }}>{isAr ? '' : 'Clearly.'}</span>
            </h2>
            <p style={{ fontSize: 16, fontWeight: 300, lineHeight: 1.75, color: 'rgba(255,255,255,0.40)', maxWidth: 480, margin: '0 auto 48px' }}>
              {isAr ? 'انضم إلى آلاف الشركات التي تستخدم عين لرؤية ما يخفى على غيرها.' : 'Join thousands of businesses using AYN to see what others miss — before it matters.'}
            </p>
            <div style={{ display: 'flex', gap: 16, justifyContent: 'center', flexWrap: 'wrap' }}>
              <Link to="/pricing"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 12, padding: '16px 44px', background: '#C9A84C', color: '#000', fontWeight: 700, fontSize: 12, letterSpacing: '0.14em', textTransform: 'uppercase', textDecoration: 'none', transition: 'transform 0.2s, box-shadow 0.2s' }}
                onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.04)'; e.currentTarget.style.boxShadow = '0 0 40px rgba(201,168,76,0.3)'; }}
                onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.boxShadow = 'none'; }}>
                {isAr ? 'ابدأ مجاناً' : 'Get Started Free'} <ArrowRight size={14} />
              </Link>
              <Link to="/features"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 12, padding: '16px 44px', background: 'transparent', border: '1px solid rgba(255,255,255,0.14)', color: 'rgba(255,255,255,0.55)', fontSize: 12, fontWeight: 400, letterSpacing: '0.14em', textTransform: 'uppercase', textDecoration: 'none', transition: 'all 0.2s' }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.4)'; e.currentTarget.style.color = '#fff'; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.14)'; e.currentTarget.style.color = 'rgba(255,255,255,0.55)'; }}>
                {isAr ? 'استكشف المميزات' : 'See Features'}
              </Link>
            </div>
          </Reveal>

          {/* Trust badges */}
          <Reveal delay={0.2}>
            <div style={{ marginTop: 64, display: 'flex', justifyContent: 'center', gap: 48, flexWrap: 'wrap' }}>
              {[
                { icon: Shield, label: isAr ? 'مشفر بالكامل' : 'End-to-End Encrypted' },
                { icon: Globe, label: isAr ? 'يدعم العربية والإنجليزية' : 'Arabic & English' },
                { icon: Zap, label: isAr ? 'لا بطاقة ائتمانية' : 'No Credit Card Required' },
              ].map(({ icon: Icon, label }, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <Icon size={14} color="#C9A84C" />
                  <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)', letterSpacing: '0.06em' }}>{label}</span>
                </div>
              ))}
            </div>
          </Reveal>
        </section>

        <Footer />
        <AuthModal open={showAuthModal} onOpenChange={setShowAuthModal} />
      </div>
    </>
  );
});

export default LandingPage;
