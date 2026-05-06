/**
 * HeroScroll — Pure white bg matching frames exactly.
 * Simple clean scroll scrubbing. No distorting transforms.
 * Frames are #ffffff — page is #ffffff — seamless floating object.
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

const C = {
  bg:     '#ffffff',
  bgOff:  '#ffffff',
  ink:    '#06070A',
  inkMid: '#3D3F45',
  inkSub: '#6E7076',
  border: 'rgba(0,0,0,0.08)',
  borderMd: 'rgba(0,0,0,0.12)',
  display: "'Space Grotesk', system-ui, sans-serif",
  body:    "'Geist', system-ui, sans-serif",
};

const CHAPTERS = [
  {
    eyebrow: isAr ? 'من هو AYN' : language === 'fr' ? 'Qui est AYN' : 'Who is AYN',
    headline: isAr ? 'يفكر.\nيتعلم.\nيفهم.' : language === 'fr' ? 'Pense.\nApprend.\nComprend.' : 'Thinks.\nLearns.\nUnderstands.',
    body: isAr ? 'ليس أداة تفتحها. ذكاء يعيش داخل شركتك.' : language === 'fr' ? 'Pas un outil que vous ouvrez. Une intelligence qui vit dans votre entreprise.' : 'Not a tool you open. An intelligence that lives inside your business.',
    stat: '01', unit: isAr ? 'الهوية' : language === 'fr' ? 'Identité' : 'Identity',
    in: 0.15, out: 0.37
  },
  {
    eyebrow: isAr ? 'ما يفعله AYN' : language === 'fr' ? 'Ce que fait AYN' : 'What AYN Does',
    headline: isAr ? 'بياناتك.\nمخاطرك.\nتفوّقك.' : language === 'fr' ? 'Vos données.\nVos risques.\nVotre avance.' : 'Your data.\nYour risk.\nYour edge.',
    body: isAr ? 'يتصل بكل شيء داخل شركتك. يقرأ كل إشارة. يجد كل إجابة.' : language === 'fr' ? 'Se connecte à tout dans votre entreprise. Lit chaque signal. Trouve chaque réponse.' : 'Connects to everything inside your business. Reads every signal. Finds every answer.',
    stat: '02', unit: isAr ? 'القدرة' : language === 'fr' ? 'Capacité' : 'Capability',
    in: 0.40, out: 0.60
  },
  {
    eyebrow: isAr ? 'ما بداخله' : language === 'fr' ? "Ce qui est à l'intérieur" : "What's Inside",
    headline: isAr ? 'يتعلم بنفسه.\nيُصلح نفسه.\nيقود نفسه.' : language === 'fr' ? 'Auto-apprenant.\nAuto-guérissant.\nAuto-conduit.' : 'Self-learning.\nSelf-healing.\nSelf-driven.',
    body: isAr ? 'ذكاء ينمو مع شركتك. لا يملكه أي منافس.' : language === 'fr' ? "Une intelligence qui grandit avec votre entreprise. Aucun concurrent ne possède cela." : "An intelligence that grows with your business. No competitor has this.",
    stat: '03', unit: isAr ? 'التفوق' : language === 'fr' ? 'Supériorité' : 'Superiority',
    in: 0.63, out: 0.82
  },
];

const cache: HTMLImageElement[] = HELMET_FRAMES.map(src => {
  const img = new Image(); img.src = src; img.decoding = 'async'; return img;
});

export const HeroScroll = memo(() => {
  const { language } = useLanguage();
  const isAr = language === 'ar';
  const reduced = useReducedMotion();

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

      /* Object opacity */
      if (imgRef.current) imgRef.current.style.opacity = `${map(p, 0, 0.06, 0, 1)}`;

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

  const eyebrowStyle: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 8,
    fontFamily: C.body, fontSize: 11, fontWeight: 500,
    letterSpacing: '0.12em', textTransform: 'uppercase',
    color: C.inkSub, marginBottom: 20,
  };

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
                  opacity: 0,
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
                <div style={eyebrowStyle}>
                  <span style={{ display: 'inline-block', width: 18, height: 1, background: C.inkSub, flexShrink: 0 }} />
                  {isAr ? 'ذكاء الأعمال' : language === 'fr' ? "Intelligence d'Affaires" : 'Business Intelligence'}
                </div>
                <h1 style={{ fontFamily: C.display, fontSize: 'clamp(44px,5.5vw,80px)', fontWeight: 700, lineHeight: 1.06, letterSpacing: '-0.03em', color: C.ink, margin: '0 0 18px' }}>
                  {isAr ? <>قوة <span style={{ color: C.inkMid }}>المعرفة.</span></> : language === 'fr' ? <>Le pouvoir <span style={{ color: C.inkMid }}>de savoir.</span></> : <>The power <span style={{ color: C.inkMid }}>to know.</span></>}
                </h1>
                <p style={{ fontFamily: C.body, fontSize: 16, fontWeight: 400, lineHeight: 1.68, color: C.inkSub, maxWidth: 380, margin: '0 0 32px', letterSpacing: '-0.005em' }}>
                  {isAr ? 'العين التي تعيش داخل شركتك. ترى كل شيء. لا تفوّت شيئاً.' : language === 'fr' ? "L'œil qui vit au cœur de votre entreprise. Voit tout. Ne rate rien." : 'The eye that lives inside your business. Sees everything. Misses nothing.'}
                </p>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 40 }}>
                  <Link to="/pricing"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '11px 22px', background: C.ink, color: '#fff', fontFamily: C.body, fontSize: 14, fontWeight: 500, letterSpacing: '-0.01em', borderRadius: 100, textDecoration: 'none', transition: 'opacity 0.2s, transform 0.15s' }}
                    onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.opacity = '0.85'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.opacity = '1'; }}
                    onMouseDown={e => { (e.currentTarget as HTMLAnchorElement).style.transform = 'scale(0.97)'; }}
                    onMouseUp={e => { (e.currentTarget as HTMLAnchorElement).style.transform = 'scale(1)'; }}>
                    {isAr ? 'طلب عرض خاص' : language === 'fr' ? 'Demander une démo privée' : 'Request Private Demo'} <ArrowRight size={13} />
                  </Link>
                  <Link to="/features"
                    style={{ display: 'inline-flex', alignItems: 'center', padding: '11px 18px', background: 'transparent', color: C.inkMid, fontFamily: C.body, fontSize: 14, fontWeight: 400, letterSpacing: '-0.01em', borderRadius: 100, border: `1px solid ${C.borderMd}`, textDecoration: 'none', transition: 'background 0.2s, border-color 0.2s' }}
                    onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.background = 'rgba(0,0,0,0.04)'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.background = 'transparent'; }}>
                    {isAr ? 'شاهده في العمل' : language === 'fr' ? 'Le voir en action' : 'See it in action'}
                  </Link>
                </div>
                <div style={{ display: 'flex', gap: 28, paddingTop: 20, borderTop: `1px solid ${C.border}` }}>
                  {[
                    { n: isAr ? 'متصل' : language === 'fr' ? 'Connecté' : 'Connected', l: '' },
                    { n: isAr ? 'ذكي' : language === 'fr' ? 'Intelligent' : 'Intelligent', l: '' },
                    { n: isAr ? 'دائماً هنا' : language === 'fr' ? 'Toujours là' : 'Always On', l: '' }
                  ].map((s, i) => (
                    <div key={i}>
                      <p style={{ fontFamily: C.display, fontSize: 22, fontWeight: 700, color: C.ink, lineHeight: 1, margin: '0 0 3px', letterSpacing: '-0.04em' }}>{s.n}</p>
                      <p style={{ fontFamily: C.body, fontSize: 11, color: C.inkSub, letterSpacing: '0.04em', margin: 0, textTransform: 'uppercase' }}>{s.l}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Chapters */}
              {CHAPTERS.map((ch, i) => (
                <div key={i} ref={el => { chRefs.current[i] = el; }} style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', opacity: 0, pointerEvents: 'none', willChange: 'opacity, transform' }}>
                  <div style={eyebrowStyle}>
                    <span style={{ display: 'inline-block', width: 18, height: 1, background: C.inkSub, flexShrink: 0 }} />
                    {ch.eyebrow}
                  </div>
                  <h2 style={{ fontFamily: C.display, fontSize: 'clamp(34px,4.5vw,64px)', fontWeight: 700, lineHeight: 1.06, letterSpacing: '-0.03em', color: C.ink, margin: '0 0 16px', whiteSpace: 'pre-line' }}>{ch.headline}</h2>
                  <p style={{ fontFamily: C.body, fontSize: 15, fontWeight: 400, lineHeight: 1.68, color: C.inkSub, maxWidth: 360, margin: '0 0 24px', letterSpacing: '-0.005em' }}>{ch.body}</p>
                  <div style={{ display: 'inline-flex', alignItems: 'baseline', gap: 8, padding: '12px 18px', background: 'rgba(0,0,0,0.04)', border: `1px solid ${C.border}`, borderRadius: 8, alignSelf: 'flex-start' }}>
                    <span style={{ fontFamily: C.display, fontSize: 28, fontWeight: 700, color: C.ink, lineHeight: 1, letterSpacing: '-0.04em' }}>{ch.stat}</span>
                    <span style={{ fontFamily: C.body, fontSize: 11, color: C.inkSub, letterSpacing: '0.06em', textTransform: 'uppercase' }}>{ch.unit}</span>
                  </div>
                </div>
              ))}

              {/* Final CTA */}
              <div ref={ctaRef2} style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', opacity: 0, pointerEvents: 'none', willChange: 'opacity' }}>
                <p style={{ fontFamily: C.body, fontSize: 11, fontWeight: 500, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.inkSub, margin: '0 0 16px' }}>
                  {isAr ? 'ما هو AYN' : language === 'fr' ? "Ce qu'est AYN" : 'What AYN Is'}
                </p>
                <h2 style={{ fontFamily: C.display, fontSize: 'clamp(38px,5vw,72px)', fontWeight: 700, lineHeight: 1.04, letterSpacing: '-0.035em', color: C.ink, margin: '0 0 28px' }}>
                  {isAr ? <span>عين واحدة.<br />كل إجابة.</span> : language === 'fr' ? <span>Un seul œil.<br />Toutes les réponses.</span> : <span>One eye.<br />Every answer.</span>}
                </h2>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  <Link to="/pricing" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '12px 24px', background: C.ink, color: '#fff', fontFamily: C.body, fontSize: 14, fontWeight: 500, borderRadius: 100, textDecoration: 'none', transition: 'opacity 0.2s' }}
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
      <section style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', padding: '96px clamp(32px,6vw,96px)', background: C.bgOff, borderBottom: `1px solid ${C.border}` }}>
        <div style={{ width: '100%', maxWidth: 1280, margin: '0 auto' }}>
          <div style={{ maxWidth: 540 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 22 }}>
              <span style={{ display: 'inline-block', width: 18, height: 1, background: C.inkSub }} />
              <span style={{ fontFamily: C.body, fontSize: 11, fontWeight: 500, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.inkSub }}>About AYN</span>
            </div>
            <h2 style={{ fontFamily: C.display, fontSize: 'clamp(30px,4vw,56px)', fontWeight: 700, lineHeight: 1.06, letterSpacing: '-0.03em', color: C.ink, margin: '0 0 18px' }}>
              {isAr ? <>ليس أداة.<br />ذكاء حقيقي.</> : language === 'fr' ? <>Pas un outil.<br />Une intelligence.</> : <>Not a tool.<br />An intelligence.</>}
            </h2>
            <p style={{ fontFamily: C.body, fontSize: 16, fontWeight: 400, lineHeight: 1.70, color: C.inkSub, maxWidth: 400 }}>
              {isAr ? 'بُني ليعيش داخل شركتك. يعرفها. يحميها. يدفعها للأمام.' : language === 'fr' ? 'Conçu pour vivre au cœur de votre entreprise. La connaître. La protéger. La faire avancer.' : 'Built to live inside your business. Know it. Protect it. Move it forward.'}
            </p>
          </div>
        </div>
      </section>

      {/* Section 3 — Features */}
      <section style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', padding: '96px clamp(32px,5vw,80px)', background: C.bg, borderBottom: `1px solid ${C.border}` }}>
        <div style={{ width: '100%', maxWidth: 1280, margin: '0 auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(300px,1fr))', gap: 'clamp(40px,6vw,96px)', alignItems: 'center' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 22 }}>
              <span style={{ display: 'inline-block', width: 18, height: 1, background: C.inkSub }} />
              <span style={{ fontFamily: C.body, fontSize: 11, fontWeight: 500, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.inkSub }}>Capabilities</span>
            </div>
            <h2 style={{ fontFamily: C.display, fontSize: 'clamp(28px,3.8vw,52px)', fontWeight: 700, lineHeight: 1.06, letterSpacing: '-0.03em', color: C.ink, margin: '0 0 16px' }}>
              {isAr ? <>دقة<br />تتحدث عن نفسها.</> : language === 'fr' ? <>Une précision<br />qui parle d'elle-même.</> : <>Precision that<br />speaks for itself.</>}
            </h2>
            <p style={{ fontFamily: C.body, fontSize: 15, fontWeight: 400, lineHeight: 1.68, color: C.inkSub, maxWidth: 320 }}>
              {isAr ? 'كل إجابة مبنية على بياناتك. لا افتراضات. كل شيء موثّق.' : language === 'fr' ? "Chaque réponse ancrée dans vos données. Rien d'assumé. Tout vérifié." : 'Every answer rooted in your data. Nothing assumed. Everything verified.'}
            </p>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {[
              { label: 'Prediction Accuracy', val: '84.2%', bars: [35,65,40,88,60,78,45,70,55] },
              { label: 'Countries Monitored',  val: '187+' },
              { label: 'Query Response',       val: '<2s'  },
            ].map((card, i) => (
              <div key={i}
                style={{ padding: '16px 18px', background: i === 0 ? 'rgba(0,0,0,0.04)' : 'rgba(0,0,0,0.02)', border: `1px solid ${C.border}`, borderRadius: 9, transition: 'background 0.2s' }}
                onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.background = 'rgba(0,0,0,0.05)'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = i === 0 ? 'rgba(0,0,0,0.04)' : 'rgba(0,0,0,0.02)'; }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: card.bars ? 10 : 0 }}>
                  <span style={{ fontFamily: C.body, fontSize: 13, color: C.inkSub }}>{card.label}</span>
                  <span style={{ fontFamily: C.display, fontSize: 18, fontWeight: 700, color: C.ink, letterSpacing: '-0.03em' }}>{card.val}</span>
                </div>
                {card.bars && (
                  <div style={{ height: 28, display: 'flex', alignItems: 'flex-end', gap: 2 }}>
                    {card.bars.map((h, j) => <div key={j} style={{ flex: 1, height: `${h}%`, background: 'rgba(0,0,0,0.14)', borderRadius: '2px 2px 0 0' }} />)}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Section 4 — Services */}
      <section style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '96px clamp(24px,4vw,64px)', background: C.bgOff, borderBottom: `1px solid ${C.border}` }}>
        <div style={{ width: '100%', maxWidth: 1280, margin: '0 auto', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 18 }}>
            <span style={{ display: 'inline-block', width: 18, height: 1, background: C.inkSub }} />
            <span style={{ fontFamily: C.body, fontSize: 11, fontWeight: 500, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.inkSub }}>Services</span>
          </div>
          <h2 style={{ fontFamily: C.display, fontSize: 'clamp(26px,3.8vw,52px)', fontWeight: 700, letterSpacing: '-0.03em', color: C.ink, margin: '0 0 48px', textAlign: 'center', lineHeight: 1.04 }}>
            {isAr ? <>ذكاء واحد.<br />كل زاوية.</> : language === 'fr' ? <>Une intelligence.<br />Chaque angle.</> : <>One intelligence.<br />Every angle.</>}
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))', gap: 2, width: '100%' }}>
            {[
              {
                icon: Search,
                title: isAr ? 'يعرف شركتك' : language === 'fr' ? 'Connaît votre entreprise' : 'Knows Your Business',
                desc: isAr ? 'يتصل. يقرأ. يفهم.' : language === 'fr' ? 'Connecte. Lit. Comprend.' : 'Connects. Reads. Understands.',
                active: false
              },
              {
                icon: BarChart3,
                title: isAr ? 'يقرأ كل مخاطرة' : language === 'fr' ? 'Lit chaque risque' : 'Reads Every Risk',
                desc: isAr ? 'يجدها قبل أن تجدك.' : language === 'fr' ? "Le trouve avant qu'il vous trouve." : 'Finds it before it finds you.',
                active: false
              },
              {
                icon: Target,
                title: isAr ? 'يتحرك قبلك' : language === 'fr' ? 'Vous fait bouger en premier' : 'Moves You First',
                desc: isAr ? 'رؤية قبل أن يراها أي أحد.' : language === 'fr' ? "L'insight avant que quiconque le voie." : 'Insight before anyone else sees it.',
                active: true
              },
            ].map((card, i) => (
              <div key={i}
                style={{ padding: '26px 22px', background: card.active ? 'rgba(0,0,0,0.05)' : C.bg, border: `1px solid ${C.border}`, borderRadius: 11, transition: 'background 0.2s' }}
                onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.background = 'rgba(0,0,0,0.05)'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = card.active ? 'rgba(0,0,0,0.05)' : C.bg; }}>
                <div style={{ width: 30, height: 30, borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16, background: 'rgba(0,0,0,0.06)', border: `1px solid ${C.border}` }}>
                  <card.icon size={13} color={C.inkMid} />
                </div>
                <h3 style={{ fontFamily: C.display, fontSize: 15, fontWeight: 600, color: C.ink, margin: '0 0 7px', letterSpacing: '-0.02em' }}>{card.title}</h3>
                <p style={{ fontFamily: C.body, fontSize: 13, color: C.inkSub, lineHeight: 1.65, margin: 0 }}>{card.desc}</p>
              </div>
            ))}
          </div>
          <div style={{ width: '100%', maxWidth: 520, display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'relative', marginTop: 48 }}>
            <div style={{ position: 'absolute', top: 14, left: '18%', right: '18%', height: 1, background: C.border }} />
            {[{ label: isAr ? 'اتصال' : language === 'fr' ? 'CONNECTER' : 'CONNECT', icon: Search }, { label: isAr ? 'تحليل' : language === 'fr' ? 'ANALYSER' : 'ANALYZE', icon: BarChart3 }, { label: isAr ? 'تحرك' : language === 'fr' ? 'AGIR' : 'ACT', icon: Target }].map((step, i) => (
              <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 7, position: 'relative', zIndex: 1 }}>
                <div style={{ width: 30, height: 30, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: C.bgOff, border: `1px solid ${C.borderMd}`, transition: 'background 0.2s' }}
                  onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.background = 'rgba(0,0,0,0.07)'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = C.bgOff; }}>
                  <step.icon size={12} color={C.inkMid} />
                </div>
                <span style={{ fontFamily: C.body, fontSize: 9, fontWeight: 500, letterSpacing: '0.16em', color: C.inkSub, textTransform: 'uppercase' }}>{step.label}</span>
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
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 22 }}>
            <span style={{ display: 'inline-block', width: 18, height: 1, background: 'rgba(255,255,255,0.22)' }} />
            <span style={{ fontFamily: C.body, fontSize: 11, fontWeight: 500, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.42)' }}>Start Today</span>
            <span style={{ display: 'inline-block', width: 18, height: 1, background: 'rgba(255,255,255,0.22)' }} />
          </div>
          <h2 style={{ fontFamily: C.display, fontSize: 'clamp(36px,7vw,92px)', fontWeight: 700, lineHeight: 1.02, letterSpacing: '-0.04em', color: '#fff', margin: '0 0 40px' }}>
            {isAr ? <span>أذكى عين<br />في الغرفة<br />هي عينك.</span> : language === 'fr' ? <span>L'intelligence<br />la plus puissante<br />est la vôtre.</span> : <span>The most intelligent<br />eye in the room<br />is yours.</span>}
          </h2>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link to="/pricing"
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
            {[{ label: 'Privacy', href: '/privacy' }, { label: 'Terms', href: '/terms' }, { label: 'Pricing', href: '/pricing' }, { label: 'Contact', href: '/contact' }].map(l => (
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
