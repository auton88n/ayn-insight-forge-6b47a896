/**
 * HeroScroll — Pure white bg matching frames exactly.
 * Simple clean scroll scrubbing. No distorting transforms.
 * Frames are #ffffff — page is #ffffff — seamless floating object.
 */

import { useEffect, useRef, memo, useCallback } from 'react';
import { useReducedMotion } from 'framer-motion';
import { ArrowRight, Search, BarChart3, Target, LayoutGrid, Database, Users, FileText, CheckCircle, Cpu, Home, Plane, Building2, HardHat, ShoppingBag, Stethoscope } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useLanguage } from '@/contexts/LanguageContext';
import { HELMET_FRAMES, FRAME_COUNT } from '@/assets/helmet-frames';

function clamp(v: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, v)); }
function lerp(a: number, b: number, t: number) { return a + (b - a) * t; }
function map(v: number, a: number, b: number, c: number, d: number) {
  return c + (clamp(v, a, b) - a) / (b - a) * (d - c);
}

const C = {
  bg:     '#ffffff',
  bgOff:  '#ffffff',
  ink:    '#06070A',
  inkMid: '#3D3F45',
  inkSub: '#6E7076',
  border: 'rgba(0,0,0,0.08)',
  borderMd: 'rgba(0,0,0,0.12)',
  display: "'Inter Tight', 'Inter', system-ui, sans-serif",
  body:    "'Inter', system-ui, sans-serif",
  mono:    "'JetBrains Mono', ui-monospace, monospace",
};

const cache: HTMLImageElement[] = HELMET_FRAMES.map(src => {
  const img = new Image(); img.src = src; img.decoding = 'async'; return img;
});

export const HeroScroll = memo(() => {
  const { language } = useLanguage();
  const isAr = language === 'ar';
  const reduced = useReducedMotion();

  const CHAPTERS = [
    {
      headline: isAr ? 'يعمل وأنت نائم.\nيتعلم وأنت تنمو.\nيبلغك عندما يهم الأمر.' : language === 'fr' ? 'Travaille pendant que vous dormez.\nApprend pendant que vous grandissez.\nSignale quand cela compte.' : 'Works while you sleep.\nLearns while you grow.\nReports when it matters.',
      body: '',
      stat: '01', unit: isAr ? 'اليقظة' : language === 'fr' ? 'Vigilance' : 'Vigilance',
      in: 0.15, out: 0.31
    },
    {
      headline: isAr ? 'التقارير تصبح محادثات.\nالبيانات تصبح توجهاً.\nالفرق تصبح متسقة.' : language === 'fr' ? 'Les rapports deviennent des conversations.\nLes données deviennent une direction.\nLes équipes s\'alignent.' : 'Reports become conversations.\nData becomes direction.\nTeams become aligned.',
      body: '',
      stat: '02', unit: isAr ? 'التوجيه' : language === 'fr' ? 'Direction' : 'Direction',
      in: 0.34, out: 0.49
    },
    {
      headline: isAr ? 'كل تحديث.\nكل ملف.\nذاكرة واحدة حية.' : language === 'fr' ? 'Chaque mise à jour.\nChaque fichier.\nUne mémoire vivante.' : 'Every update.\nEvery file.\nOne living memory.',
      body: '',
      stat: '03', unit: isAr ? 'الذاكرة' : language === 'fr' ? 'Mémoire' : 'Memory',
      in: 0.52, out: 0.67
    },
    {
      headline: isAr ? 'قوة عاملة واحدة للذكاء الاصطناعي.\nدائماً قيد العمل.\nتحركك للأمام.' : language === 'fr' ? 'Une main-d\'œuvre IA.\nToujours active.\nVous fait avancer.' : 'One AI workforce.\nAlways on.\nMoving you forward.',
      body: '',
      stat: '04', unit: isAr ? 'التقدم' : language === 'fr' ? 'Progrès' : 'Progress',
      in: 0.70, out: 0.85
    },
  ];

  const spacerRef = useRef<HTMLDivElement>(null);
  const imgRef    = useRef<HTMLImageElement>(null);
  const floatRef  = useRef<HTMLDivElement>(null);
  const headRef   = useRef<HTMLDivElement>(null);
  const ctaRef2   = useRef<HTMLDivElement>(null);
  const chRefs    = useRef<(HTMLDivElement | null)[]>([]);

  const scrollP   = useRef(0);
  const mouseX    = useRef(0.5);
  const mouseY    = useRef(0.5);
  const lastFrame = useRef(-1);
  const curFloatY = useRef(0);
  const curTiltX  = useRef(0);
  const curTiltY  = useRef(0);

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
    return () => { window.removeEventListener('scroll', onScroll); window.removeEventListener('mousemove', onMouse); };
  }, [onScroll, onMouse]);

  useEffect(() => {
    if (cache[0]?.complete && imgRef.current) { imgRef.current.src = cache[0].src; lastFrame.current = 0; }
    else if (cache[0]) cache[0].onload = () => { if (imgRef.current) imgRef.current.src = cache[0].src; };

    const LERP = 0.055;

    const tick = (t: number) => {
      requestAnimationFrame(tick);
      const p = scrollP.current;

      /* Frame scrub — direct */
      if (!reduced) {
        const idx = clamp(Math.round(p * (FRAME_COUNT - 1)), 0, FRAME_COUNT - 1);
        if (idx !== lastFrame.current) {
          lastFrame.current = idx;
          const c = cache[idx];
          if (c?.complete && imgRef.current) imgRef.current.src = c.src;
        }
      }

      /* Idle float + pointer tilt — combined on floatRef */
      if (!reduced && floatRef.current) {
        const floatY = Math.sin(t * 0.00055) * 7;
        curFloatY.current = lerp(curFloatY.current, floatY, LERP);
        const tiltY = map(mouseX.current, 0, 1, 3, -3);
        const tiltX = map(mouseY.current, 0, 1, -2, 2);
        curTiltX.current = lerp(curTiltX.current, tiltX, LERP);
        curTiltY.current = lerp(curTiltY.current, tiltY, LERP);
        floatRef.current.style.transform =
          `translateY(${curFloatY.current.toFixed(2)}px) ` +
          `perspective(1000px) rotateX(${curTiltX.current.toFixed(3)}deg) rotateY(${curTiltY.current.toFixed(3)}deg)`;
      }

      /* Object opacity - removed fade in so it's visible immediately */
      if (imgRef.current) imgRef.current.style.opacity = '1';

      /* Headline */
      if (headRef.current) {
        const op = p < 0.12 ? 1 : map(p, 0.12, 0.20, 1, 0);
        headRef.current.style.opacity = `${op}`;
        headRef.current.style.transform = `translateY(${map(p, 0.12, 0.20, 0, -20)}px)`;
        headRef.current.style.pointerEvents = op < 0.05 ? 'none' : 'auto';
      }

      /* Chapters */
      CHAPTERS.forEach((ch, i) => {
        const el = chRefs.current[i];
        if (!el) return;
        const peak = ch.in + (ch.out - ch.in) * 0.25;
        const fadeOut = ch.out - (ch.out - ch.in) * 0.18;
        let op = 0, ty = 18;
        if (p >= ch.in && p <= ch.out) {
          if (p < peak)         { op = map(p, ch.in, peak, 0, 1);     ty = map(p, ch.in, peak, 18, 0); }
          else if (p < fadeOut) { op = 1; ty = 0; }
          else                  { op = map(p, fadeOut, ch.out, 1, 0); ty = map(p, fadeOut, ch.out, 0, -18); }
        }
        el.style.opacity = `${op}`;
        el.style.transform = `translateY(${ty}px)`;
        el.style.pointerEvents = op < 0.05 ? 'none' : 'auto';
      });

      /* Final CTA */
      if (ctaRef2.current) {
        const op = map(p, 0.84, 0.93, 0, 1);
        ctaRef2.current.style.opacity = `${op}`;
        ctaRef2.current.style.pointerEvents = op < 0.05 ? 'none' : 'auto';
      }
    };
    const id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
  }, [reduced]);

  return (
    <div style={{ background: C.bg, fontFamily: C.body }}>

      {/* 600vh sticky hero */}
      <div ref={spacerRef} style={{ height: '600vh', position: 'relative' }}>
        <div className="sticky top-0" style={{ height: '100dvh', overflow: 'hidden', background: C.bg }}>

          {/* ── 3D OBJECT — no wrappers, no extra transforms, clean float ── */}
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', paddingRight: 'clamp(32px,4vw,64px)', zIndex: 1 }}>
            <div ref={floatRef} style={{ willChange: 'transform', transformStyle: 'preserve-3d', position: 'relative' }}>
              <img
                ref={imgRef}
                src={HELMET_FRAMES[0]}
                alt="AYN"
                draggable={false}
                style={{
                  /* Frames are 255,255,255 — page is #ffffff — zero visible edge */
                  width: 'min(42vw, 580px)',
                  height: 'min(42vw, 580px)',
                  objectFit: 'contain',
                  display: 'block',
                  userSelect: 'none',
                  pointerEvents: 'none',
                  opacity: 1,
                  willChange: 'opacity',
                  position: 'relative',
                  zIndex: 1,
                }}
              />
            </div>
          </div>

          {/* Gradient — text/object separation — fully opaque until cutoff */}
          <div style={{ position: 'absolute', inset: 0, zIndex: 2, background: 'linear-gradient(to right, #ffffff 0%, #ffffff 38%, rgba(255,255,255,0) 58%)', pointerEvents: 'none' }} />

          {/* ── TEXT ── */}
          <div style={{ position: 'absolute', inset: 0, zIndex: 10, display: 'flex', alignItems: 'center', padding: '80px clamp(32px,6vw,96px)' }}>
            <div style={{ position: 'relative', width: '100%', maxWidth: 560, height: 'min(80vh, 580px)' }}>

              {/* Headline */}
              <div ref={headRef} style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', willChange: 'opacity, transform' }}>
                <h1 style={{ fontFamily: C.display, fontSize: 'clamp(48px,6.2vw,92px)', fontWeight: 700, lineHeight: 0.95, letterSpacing: '-0.04em', color: C.ink, margin: '0 0 24px' }}>
                  {isAr ? <>قوة<br />المعرفة.</> : language === 'fr' ? <>Le pouvoir<br />de savoir.</> : <>The power<br />to know.</>}
                </h1>
                <p style={{ fontFamily: C.body, fontSize: 18, fontWeight: 400, lineHeight: 1.55, color: C.inkSub, maxWidth: 460, margin: '0 0 36px' }}>
                  {isAr ? 'AYN يربط تقاريرك وملفاتك وقراراتك في طبقة ذكاء واحدة يمكن لشركتك التحدث إليها.' : language === 'fr' ? "AYN connecte vos rapports, fichiers et décisions en une couche d'intelligence à laquelle votre entreprise peut parler." : 'AYN connects your reports, files, and decisions into one intelligence layer your business can talk to.'}
                </p>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                  <Link to="/contact"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '12px 24px', background: C.ink, color: '#fff', fontFamily: C.body, fontSize: 14, fontWeight: 500, borderRadius: 100, textDecoration: 'none', transition: 'opacity 0.2s, transform 0.15s' }}
                    onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.opacity = '0.85'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.opacity = '1'; }}
                    onMouseDown={e => { (e.currentTarget as HTMLAnchorElement).style.transform = 'scale(0.97)'; }}
                    onMouseUp={e => { (e.currentTarget as HTMLAnchorElement).style.transform = 'scale(1)'; }}>
                    {isAr ? 'طلب عرض' : language === 'fr' ? 'Demander une démo' : 'Request Demo'} <ArrowRight size={13} />
                  </Link>
                  <Link to="/contact"
                    style={{ display: 'inline-flex', alignItems: 'center', padding: '12px 18px', background: 'transparent', color: C.inkMid, fontFamily: C.body, fontSize: 14, fontWeight: 400, borderRadius: 100, border: `1px solid ${C.borderMd}`, textDecoration: 'none', transition: 'background 0.2s, border-color 0.2s' }}
                    onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.background = 'rgba(0,0,0,0.04)'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.background = 'transparent'; }}>
                    {isAr ? 'عرض تقرير عينة' : language === 'fr' ? 'Voir un exemple de rapport' : 'View Sample Report'}
                  </Link>
                </div>
              </div>

              {/* Chapters */}
              {CHAPTERS.map((ch, i) => (
                <div key={i} ref={el => { chRefs.current[i] = el; }} style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', opacity: 0, pointerEvents: 'none', willChange: 'opacity, transform' }}>
                  <h2 style={{ fontFamily: C.display, fontSize: 'clamp(34px,4.5vw,64px)', fontWeight: 700, lineHeight: 1.06, letterSpacing: '-0.03em', color: C.ink, margin: '0 0 16px', whiteSpace: 'pre-line' }}>{ch.headline}</h2>
                  <p style={{ fontFamily: C.body, fontSize: 15, fontWeight: 400, lineHeight: 1.6, color: C.inkSub, maxWidth: 360, margin: 0 }}>{ch.body}</p>
                </div>
              ))}

              {/* Final CTA */}
              <div ref={ctaRef2} style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', opacity: 0, pointerEvents: 'none', willChange: 'opacity' }}>
                <h2 style={{ fontFamily: C.display, fontSize: 'clamp(38px,5vw,72px)', fontWeight: 700, lineHeight: 1.04, letterSpacing: '-0.035em', color: C.ink, margin: '0 0 28px' }}>
                  {isAr ? <span>عين واحدة.<br />كل إجابة.</span> : language === 'fr' ? <span>Un seul œil.<br />Toutes les réponses.</span> : <span>One eye.<br />Every answer.</span>}
                </h2>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  <Link to="/contact" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '12px 24px', background: C.ink, color: '#fff', fontFamily: C.body, fontSize: 14, fontWeight: 500, borderRadius: 100, textDecoration: 'none', transition: 'opacity 0.2s' }}
                    onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.opacity = '0.85'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.opacity = '1'; }}>
                    {isAr ? 'طلب عرض خاص' : language === 'fr' ? 'Demander une démo privée' : 'Request Private Demo'} <ArrowRight size={13} />
                  </Link>
                  <Link to="/features" style={{ display: 'inline-flex', alignItems: 'center', padding: '12px 18px', background: 'transparent', color: C.inkMid, fontFamily: C.body, fontSize: 14, borderRadius: 100, border: `1px solid ${C.borderMd}`, textDecoration: 'none', transition: 'background 0.2s' }}
                    onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.background = 'rgba(0,0,0,0.04)'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.background = 'transparent'; }}>
                    {isAr ? 'شاهده في العمل' : language === 'fr' ? 'Le voir en action' : 'See it in action'}
                  </Link>
                </div>
              </div>
            </div>
          </div>

          <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 1, background: C.border, zIndex: 5 }} />
        </div>
      </div>

      {/* Section 2 */}
      <section style={{ padding: 'clamp(96px,14vh,160px) clamp(32px,6vw,96px)', background: C.bgOff }}>
        <div style={{ width: '100%', maxWidth: 1100, margin: '0 auto' }}>
          <h2 style={{ fontFamily: C.display, fontSize: 'clamp(36px,5vw,68px)', fontWeight: 700, lineHeight: 0.98, letterSpacing: '-0.04em', color: C.ink, margin: '0 0 24px' }}>
            {isAr ? <>لماذا <span style={{ color: C.inkMid }}>AYN؟</span></> : language === 'fr' ? <>Pourquoi <span style={{ color: C.inkMid }}>AYN ?</span></> : <>Why <span style={{ color: C.inkMid }}>AYN?</span></>}
          </h2>
          <p style={{ fontFamily: C.body, fontSize: 18, fontWeight: 400, lineHeight: 1.55, color: C.inkSub, maxWidth: 560, margin: '0 0 64px' }}>
            {isAr
              ? 'بُني AYN للقادة الذين يحتاجون إلى الوضوح والسرعة والتحكم في عالم يعيد الذكاء الاصطناعي تشكيله.'
              : language === 'fr'
              ? "AYN est conçu pour les dirigeants qui ont besoin de clarté, de rapidité et de contrôle dans un monde remodelé par l'IA."
              : 'AYN is built for leaders who need clarity, speed, and control in a world being reshaped by AI.'}
          </p>
          <div style={{ width: '100%', height: 1, background: C.border, marginBottom: 56 }} />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 'clamp(48px,6vw,96px)' }}>
            {[
              {
                label: isAr ? 'للقادة الذين يحتاجون' : language === 'fr' ? 'POUR LES DIRIGEANTS' : 'FOR LEADERS WHO NEED',
                items: isAr
                  ? ['الوضوح وسط الضوضاء', 'سرعة في القرار', 'التحكم في السياق', 'الثقة للتحرك']
                  : language === 'fr'
                  ? ['De la clarté dans le bruit', 'De la vitesse de décision', 'Du contrôle du contexte', 'La confiance pour agir']
                  : ['Clarity in the noise', 'Speed of decision', 'Control of context', 'Confidence to act'],
              },
              {
                label: isAr ? 'ما يقدمه AYN' : language === 'fr' ? 'CE QUE AYN APPORTE' : 'WHAT AYN GIVES YOU',
                items: isAr
                  ? ['طبقة ذكاء واحدة', 'التقارير تصبح محادثات', 'ذاكرة عبر الشركة', 'تصرف قبل أن تُغلق الفرصة']
                  : language === 'fr'
                  ? ["Une couche d'intelligence", 'Les rapports deviennent conversations', "Une mémoire d'entreprise", 'Agir avant que la fenêtre se ferme']
                  : ['One intelligence layer', 'Reports become conversations', 'Memory across the company', 'Act before the window closes'],
              },
            ].map((col, i) => (
              <div key={i}>
                <p style={{ fontFamily: C.mono, fontSize: 11, fontWeight: 500, letterSpacing: '0.18em', textTransform: 'uppercase', color: C.inkSub, margin: '0 0 20px' }}>{col.label}</p>
                <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 14 }}>
                  {col.items.map((it, j) => (
                    <li key={j} style={{ fontFamily: C.body, fontSize: 16, fontWeight: 400, lineHeight: 1.45, color: C.ink, display: 'flex', gap: 12 }}>
                      <span style={{ color: C.inkSub, flexShrink: 0 }}>·</span>
                      <span>{it}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Section 3 — Features */}
      <section style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', padding: '96px clamp(32px,5vw,80px)', background: C.bg, borderBottom: `1px solid ${C.border}` }}>
        <div style={{ width: '100%', maxWidth: 1280, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 64 }}>
            <h2 style={{ fontFamily: C.display, fontSize: 'clamp(28px,3.8vw,52px)', fontWeight: 700, lineHeight: 1.06, letterSpacing: '-0.03em', color: C.ink, margin: '0 0 16px' }}>
              {isAr ? 'بُني لكل جزء من العمل.' : language === 'fr' ? 'Conçu pour chaque partie de l\'entreprise.' : 'Built for every part of the business.'}
            </h2>
            <p style={{ fontFamily: C.body, fontSize: 16, fontWeight: 400, lineHeight: 1.68, color: C.inkSub, maxWidth: 640, margin: '0 auto' }}>
              {isAr ? 'تساعد AYN القادة على طرح الأسئلة، وقراءة سياق الشركة، وتحويل النشاط اليومي إلى قرارات.' : language === 'fr' ? "AYN aide les dirigeants à poser des questions, à lire le contexte de l'entreprise et à transformer l'activité quotidienne en décisions." : 'AYN helps leaders ask questions, read company context, and turn daily activity into decisions.'}
            </p>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 24 }}>
            {[
              {
                title: isAr ? 'اسأل عملك' : 'Ask Your Business',
                desc: isAr ? 'اطرح أسئلة عبر التقارير وجداول البيانات والتحديثات والمستندات ونشاط الفريق.' : 'Ask questions across reports, spreadsheets, updates, documents, and team activity.',
                icon: Search
              },
              {
                title: isAr ? 'ذاكرة الشركة' : 'Company Memory',
                desc: isAr ? 'حول الملفات والتقارير والتحديثات والقرارات إلى ذاكرة واحدة حية يمكن لشركتك استخدامها.' : 'Turn files, reports, updates, and decisions into one living memory your company can use.',
                icon: Database
              },
              {
                title: isAr ? 'تحديثات الفريق' : 'Team Updates',
                desc: isAr ? 'اسمح للموظفين والمديرين بإضافة التحديثات والمعوقات والملاحظات والتقدم في AYN.' : 'Let employees and managers add updates, blockers, notes, and progress into AYN.',
                icon: Users
              },
              {
                title: isAr ? 'تقارير القيادة' : 'Leadership Reports',
                desc: isAr ? 'أنشئ تقارير للمديرين وملخصات للرئيس التنفيذي والأولويات وخطط العمل من نشاط الشركة.' : 'Generate manager reports, CEO summaries, priorities, and action plans from company activity.',
                icon: FileText
              },
              {
                title: isAr ? 'إجابات قائمة على الأدلة' : 'Evidence-Based Answers',
                desc: isAr ? 'شاهد من أين أتت الإجابات، مع سياق من بيانات شركتك.' : 'See where answers came from, with context from your company data.',
                icon: CheckCircle
              },
              {
                title: isAr ? 'قوة عاملة من وكلاء الذكاء الاصطناعي' : 'AI Agent Workforce',
                desc: isAr ? 'وكلاء متخصصون يدعمون المبيعات والعمليات والتمويل والمستندات والدعم والقيادة.' : 'Specialized agents support sales, operations, finance, documents, support, and leadership.',
                icon: Cpu
              }
            ].map((card, i) => (
              <div key={i}
                style={{ padding: '32px', background: C.bgOff, border: `1px solid ${C.border}`, borderRadius: 12, transition: 'border-color 0.3s' }}
                onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.borderColor = C.ink; }}
                onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.borderColor = C.border; }}>
                <div style={{ width: 40, height: 40, borderRadius: 8, background: 'rgba(0,0,0,0.03)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 20 }}>
                  <card.icon size={20} color={C.ink} />
                </div>
                <h3 style={{ fontFamily: C.display, fontSize: 18, fontWeight: 600, letterSpacing: '-0.02em', color: C.ink, marginBottom: 10 }}>{card.title}</h3>
                <p style={{ fontFamily: C.body, fontSize: 14, color: C.inkSub, lineHeight: 1.65 }}>{card.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="solutions" style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '96px clamp(24px,4vw,64px)', background: C.bgOff, borderBottom: `1px solid ${C.border}` }}>
        <div style={{ width: '100%', maxWidth: 1280, margin: '0 auto', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <div style={{ textAlign: 'center', marginBottom: 64 }}>
            <h2 style={{ fontFamily: C.display, fontSize: 'clamp(26px,3.8vw,52px)', fontWeight: 700, letterSpacing: '-0.03em', color: C.ink, margin: '0 0 16px', lineHeight: 1.04 }}>
              {isAr ? 'بُني للشركات التي تحتاج إلى الوضوح للنمو.' : language === 'fr' ? 'Conçu pour les entreprises qui ont besoin de clarté pour croître.' : 'Built for the companies that need clarity to grow.'}
            </h2>
            <p style={{ fontFamily: C.body, fontSize: 16, fontWeight: 400, lineHeight: 1.68, color: C.inkSub, maxWidth: 800, margin: '0 auto' }}>
              {isAr ? 'تتكيف AYN مع مختلف الصناعات من خلال ربط شعوبها وبياناتها وتقاريرها وعملياتها اليومية في طبقة استخبارات واحدة تعمل بالذكاء الاصطناعي.' : language === 'fr' ? "AYN s'adapte à différents secteurs en connectant leurs collaborateurs, leurs données, leurs rapports et leurs opérations quotidiennes en une seule couche d'intelligence artificielle." : 'AYN adapts to different industries by connecting their people, data, reports, and daily operations into one AI intelligence layer.'}
            </p>
          </div>
          
          <div style={{ width: '100%', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '32px' }}>
            {[
              { 
                title: isAr ? 'الشركات العائلية' : 'Family Businesses',
                desc: isAr ? 'ساعد المالكين على رؤية ما يحدث عبر الفرق والفروع والمديرين والعمليات اليومية دون الاعتماد على تحديثات متفرقة.' : 'Help owners see what is happening across teams, branches, managers, and daily operations without depending on scattered updates.',
                icon: Home 
              },
              { 
                title: isAr ? 'السياحة والضيافة' : 'Tourism & Hospitality',
                desc: isAr ? 'اربط الحجوزات وطلبات العملاء والموردين والعمليات والتمويل وتعليقات الضيوف في تقارير قيادة واضحة.' : 'Connect bookings, customer requests, suppliers, operations, finance, and guest feedback into clear leadership reports.',
                icon: Plane 
              },
              { 
                title: isAr ? 'العقارات وإدارة الممتلكات' : 'Real Estate & Property Management',
                desc: isAr ? 'تتبع العملاء المحتملين والمستأجرين والصيانة والعقود والمدفوعات والمستندات وتحديثات المدير في عرض واحد متصل.' : 'Track leads, tenants, maintenance, contracts, payments, documents, and manager updates in one connected view.',
                icon: Building2 
              },
              { 
                title: isAr ? 'البناء والمقاولات' : 'Construction & Contracting',
                desc: isAr ? 'اتبع تقدم المشروع وتأخيرات الموردين وتقارير الموقع والموافقات والفواتير والمعوقات التشغيلية قبل أن تؤثر على التسليم.' : 'Follow project progress, supplier delays, site reports, approvals, invoices, and operational blockers before they affect delivery.',
                icon: HardHat 
              },
              { 
                title: isAr ? 'التجزئة والفرانشايز' : 'Retail & Franchises',
                desc: isAr ? 'امنح القيادة رؤية عبر الفروع والمبيعات ومشكلات المخزون وشكاوى العملاء وتحديثات الموظفين وإشارات الأداء.' : 'Give leadership visibility across branches, sales, inventory issues, customer complaints, staff updates, and performance signals.',
                icon: ShoppingBag 
              },
              { 
                title: isAr ? 'العيادات والشركات الخدمية' : 'Clinics & Service Businesses',
                desc: isAr ? 'اربط المواعيد ودعم العملاء والمدفوعات وتحديثات الموظفين والمستندات والقضايا التشغيلية في قرارات يومية أكثر وضوحاً.' : 'Connect appointments, customer support, payments, staff updates, documents, and operational issues into clearer daily decisions.',
                icon: Stethoscope 
              }
            ].map((item, i) => (
              <div key={i} style={{ padding: '32px', background: C.bg, border: `1px solid ${C.border}`, borderRadius: 12, display: 'flex', gap: 20 }}>
                <div style={{ width: 48, height: 48, borderRadius: 12, background: 'rgba(0,0,0,0.02)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <item.icon size={22} color={C.ink} />
                </div>
                <div>
                  <h3 style={{ fontFamily: C.display, fontSize: 18, fontWeight: 600, letterSpacing: '-0.02em', color: C.ink, marginBottom: 10 }}>{item.title}</h3>
                  <p style={{ fontFamily: C.body, fontSize: 14, color: C.inkSub, lineHeight: 1.6 }}>{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Section 5 — Final CTA (dark) */}
      <section style={{ minHeight: '80dvh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', overflow: 'hidden', background: C.ink, padding: 'clamp(72px,8vw,120px) 32px 140px', position: 'relative' }}>
        {[460, 320, 200].map((sz, i) => (
          <div key={i} style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: `min(85vw,${sz}px)`, height: `min(85vw,${sz}px)`, borderRadius: '50%', border: `1px solid rgba(255,255,255,${0.06 - i * 0.015})`, pointerEvents: 'none' }} />
        ))}
        <div style={{ position: 'relative', zIndex: 10, maxWidth: 640, width: '100%', paddingBottom: 100 }}>
          <h2 style={{ fontFamily: C.display, fontSize: 'clamp(36px,7vw,92px)', fontWeight: 700, lineHeight: 1.02, letterSpacing: '-0.04em', color: '#fff', margin: '0 0 40px' }}>
            {isAr ? <span>أذكى عين<br />في الغرفة<br />هي عينك.</span> : language === 'fr' ? <span>L'intelligence<br />la plus puissante<br />est la vôtre.</span> : <span>The most intelligent<br />eye in the room<br />is yours.</span>}
          </h2>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link to="/contact"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '12px 24px', background: '#fff', color: C.ink, fontFamily: C.body, fontSize: 14, fontWeight: 600, letterSpacing: '-0.01em', borderRadius: 100, textDecoration: 'none', transition: 'opacity 0.2s, transform 0.15s' }}
              onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.opacity = '0.88'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.opacity = '1'; }}
              onMouseDown={e => { (e.currentTarget as HTMLAnchorElement).style.transform = 'scale(0.97)'; }}
              onMouseUp={e => { (e.currentTarget as HTMLAnchorElement).style.transform = 'scale(1)'; }}>
              {isAr ? 'طلب عرض خاص' : language === 'fr' ? 'Demander une démo privée' : 'Request Private Demo'} <ArrowRight size={13} />
            </Link>
            <Link to="/features"
              style={{ display: 'inline-flex', alignItems: 'center', padding: '12px 18px', background: 'transparent', color: 'rgba(255,255,255,0.65)', fontFamily: C.body, fontSize: 14, borderRadius: 100, border: '1px solid rgba(255,255,255,0.20)', textDecoration: 'none', transition: 'border-color 0.2s, color 0.2s' }}
              onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.borderColor = 'rgba(255,255,255,0.45)'; (e.currentTarget as HTMLAnchorElement).style.color = '#fff'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.borderColor = 'rgba(255,255,255,0.20)'; (e.currentTarget as HTMLAnchorElement).style.color = 'rgba(255,255,255,0.65)'; }}>
              {isAr ? 'استكشف المميزات' : language === 'fr' ? 'Explorer les fonctionnalités' : 'Explore Features'}
            </Link>
          </div>
        </div>
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '16px clamp(24px,5vw,80px)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, zIndex: 20, borderTop: '1px solid rgba(255,255,255,0.07)' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 20px' }}>
            {[{ label: 'Privacy', href: '/privacy' }, { label: 'Terms', href: '/terms' }, { label: 'Contact', href: '/contact' }].map(l => (
              <Link key={l.label} to={l.href} style={{ fontFamily: C.body, fontSize: 11, color: 'rgba(255,255,255,0.28)', textDecoration: 'none', transition: 'color 0.2s' }}
                onMouseEnter={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.65)')}
                onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.28)')}>
                {l.label}
              </Link>
            ))}
          </div>
          <span style={{ fontFamily: C.body, fontSize: 11, color: 'rgba(255,255,255,0.16)' }}>© 2026 AYN Intelligence</span>
        </div>
      </section>
    </div>
  );
});

HeroScroll.displayName = 'HeroScroll';
