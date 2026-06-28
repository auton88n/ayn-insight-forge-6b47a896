/**
 * HeroScroll — Pure white bg matching frames exactly.
 * Simple clean scroll scrubbing. No distorting transforms.
 * Frames are #ffffff — page is #ffffff — seamless floating object.
 */

import { useEffect, useRef, useState, memo, useCallback } from 'react';
import type React from 'react';
import { useReducedMotion } from 'framer-motion';
import { ArrowRight, Search, BarChart3, Target, LayoutGrid, Database, Users, FileText, CheckCircle, Cpu, Home, Plane, Building2, HardHat, ShoppingBag, Stethoscope } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useLanguage } from '@/contexts/LanguageContext';
import { EmotionalEye } from '@/components/eye/EmotionalEye';

/* ── Frame loading ──────────────────────────────────────────────
 * Frames live in /public/frames as individual JPEGs instead of
 * being base64-inlined in the JS bundle (which made the landing
 * chunk ~57 MB). Mobile gets a smaller 242-frame / 480px set.
 */
// Use the lighter 242-frame / 480px set for phones AND tablets (< 1024px),
// matching the "stacked" layout breakpoint below. Tablets in portrait were
// previously downloading all 484 full-size desktop frames despite rendering
// the small stacked canvas — wasteful and the most common cause of jank on
// mid-range tablets.
const IS_SMALL_SCREEN = typeof window !== 'undefined' && window.innerWidth < 1024;
const FRAME_COUNT = IS_SMALL_SCREEN ? 242 : 484;
const FRAME_DIR = IS_SMALL_SCREEN ? '/frames/helmet-sm' : '/frames/helmet';
const frameUrl = (i: number) => `${FRAME_DIR}/${String(i).padStart(3, '0')}.jpg`;

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
  glassBg: 'rgba(255, 255, 255, 0.45)',
  glassBorder: 'rgba(255, 255, 255, 0.6)',
  glassShadow: '0 12px 36px -12px rgba(0, 0, 0, 0.06)',
};

const cache: (HTMLImageElement | null)[] = new Array(FRAME_COUNT).fill(null);
const loadedFlags: boolean[] = new Array(FRAME_COUNT).fill(false);
let preloadStarted = false;

function loadFrame(i: number) {
  if (cache[i]) return;
  const img = new Image();
  img.decoding = 'async';
  img.onload = () => { loadedFlags[i] = true; };
  img.src = frameUrl(i);
  cache[i] = img;
}

/** Progressive preload: coarse pass first (every 16th frame) so the
 *  scroll scrub works almost immediately, then refine to every frame. */
function preloadFrames() {
  if (preloadStarted) return;
  preloadStarted = true;
  const strides = [16, 4, 1];
  let s = 0;
  const runPass = () => {
    const stride = strides[s];
    let i = 0;
    const step = () => {
      let n = 0;
      while (i < FRAME_COUNT && n < 24) { loadFrame(i); i += stride; n++; }
      if (i < FRAME_COUNT) setTimeout(step, 40);
      else { s++; if (s < strides.length) setTimeout(runPass, 80); }
    };
    step();
  };
  runPass();
}

/** Nearest already-decoded frame to the requested index. */
function nearestLoaded(idx: number): number {
  if (loadedFlags[idx]) return idx;
  for (let d = 1; d < FRAME_COUNT; d++) {
    if (idx - d >= 0 && loadedFlags[idx - d]) return idx - d;
    if (idx + d < FRAME_COUNT && loadedFlags[idx + d]) return idx + d;
  }
  return -1;
}

export const HeroScroll = memo(() => {
  const { language } = useLanguage();
  const isAr = language === 'ar';
  const reduced = useReducedMotion();
  // "stacked" layout (text zone on top, object below) for phones and tablets
  const [isMobile, setIsMobile] = useState(
    typeof window !== 'undefined' && window.innerWidth < 1024
  );

  useEffect(() => {
    // Helmet frame sequence retired — EmotionalEye now renders the orb.
    const onResizeMq = () => setIsMobile(window.innerWidth < 1024);
    window.addEventListener('resize', onResizeMq, { passive: true });
    return () => window.removeEventListener('resize', onResizeMq);
  }, []);

  const CHAPTERS = [
    {
      headline: isAr ? 'ابحث عن فرص قبل أن تفوتك.\nطابق سيرتك في ثوانٍ.\nقدم بطاقة.' : language === 'fr' ? 'Trouvez les offres avant de les manquer.\nFaites correspondre votre CV en secondes.\nPostulez avec confiance.' : 'Find jobs before you miss them.\nMatch your resume in seconds.\nApply with confidence.',
      body: '',
      stat: '01', unit: isAr ? 'البحث' : language === 'fr' ? 'Recherche' : 'Search',
      in: 0.15, out: 0.31
    },
    {
      headline: isAr ? 'اقرأ كل وظيفة كخبير.\nاعرف سبب تناسبك.\nاعرف مكانك.' : language === 'fr' ? 'Lisez chaque offre comme un expert.\nVoyez pourquoi vous correspondez.\nSachez où vous en êtes.' : 'Read every job like an expert.\nSee why you fit.\nKnow where you stand.',
      body: '',
      stat: '02', unit: isAr ? 'التوافق' : language === 'fr' ? 'Adéquation' : 'Match',
      in: 0.34, out: 0.49
    },
    {
      headline: isAr ? 'تتبع كل طلب.\nكل متابعة.\nجدول زمني واحد نظيف.' : language === 'fr' ? 'Suivez chaque candidature.\nChaque relance.\nUn seul calendrier clair.' : 'Track every application.\nEvery follow up.\nOne clean timeline.',
      body: '',
      stat: '03', unit: isAr ? 'التنظيم' : language === 'fr' ? 'Organisation' : 'Organize',
      in: 0.52, out: 0.67
    },
    {
      headline: isAr ? 'املأ النماذج بنقرة واحدة.\nاكتب رسائل تحقق النتائج.\nتقدم بسرعة أكبر من الآخرين.' : language === 'fr' ? 'Remplissez les formulaires en un clic.\nRédigez des lettres qui fonctionnent.\nAvancez plus vite que les autres.' : 'Fill forms in one tap.\nWrite letters that land.\nMove faster than the rest.',
      body: '',
      stat: '04', unit: isAr ? 'السرعة' : language === 'fr' ? 'Vitesse' : 'Speed',
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

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const layout    = useRef({ top: 0, height: 0 });

  const onScroll = useCallback(() => {
    const { top, height } = layout.current;
    if (height === 0) return;
    const progress = (window.scrollY - top) / (height - window.innerHeight);
    scrollP.current = clamp(progress, 0, 1);
  }, []);

  const onMouse = useCallback((e: MouseEvent) => {
    mouseX.current = e.clientX / window.innerWidth;
    mouseY.current = e.clientY / window.innerHeight;
  }, []);

  useEffect(() => {
    const updateLayout = () => {
      if (spacerRef.current) {
        const rect = spacerRef.current.getBoundingClientRect();
        layout.current = {
          top: window.scrollY + rect.top,
          height: spacerRef.current.offsetHeight
        };
      }
    };
    
    updateLayout();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('mousemove', onMouse, { passive: true });
    window.addEventListener('resize', updateLayout, { passive: true });
    
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('mousemove', onMouse);
      window.removeEventListener('resize', updateLayout);
    };
  }, [onScroll, onMouse]);

  useEffect(() => {
    const setupCanvas = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const dpr = window.devicePixelRatio || 1;
      const stacked = window.innerWidth < 1024;
      const size = stacked
        ? Math.min(window.innerWidth * 0.66, window.innerHeight * 0.40, 460)
        : Math.min(window.innerWidth * 0.42, 580);
      canvas.width = size * dpr;
      canvas.height = size * dpr;
      canvas.style.width = `${size}px`;
      canvas.style.height = `${size}px`;
      const ctx = canvas.getContext('2d', { alpha: false }); // Background is opaque white
      if (ctx) {
        ctx.setTransform(1, 0, 0, 1, 0, 0); // Reset
        ctx.scale(dpr, dpr);
        // Initial draw — first frame may still be loading over the network
        const drawFirst = () => {
          if (cache[0]?.complete && loadedFlags[0]) {
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, size, size);
            ctx.drawImage(cache[0]!, 0, 0, size, size);
          } else {
            setTimeout(drawFirst, 60);
          }
        };
        drawFirst();
      }
    };
    setupCanvas();
    window.addEventListener('resize', setupCanvas);

    const LERP = 0.055;

    const tick = (t: number) => {
      requestAnimationFrame(tick);
      const p = scrollP.current;

      /* Frame scrub — direct to Canvas */
      if (!reduced) {
        const target = clamp(Math.round(p * (FRAME_COUNT - 1)), 0, FRAME_COUNT - 1);
        const idx = nearestLoaded(target);
        if (idx >= 0 && idx !== lastFrame.current) {
          lastFrame.current = idx;
          const img = cache[idx];
          const canvas = canvasRef.current;
          if (img?.complete && canvas) {
            const ctx = canvas.getContext('2d', { alpha: false });
            if (ctx) {
              const dpr = window.devicePixelRatio || 1;
              const w = canvas.width / dpr;
              const h = canvas.height / dpr;
              ctx.fillStyle = '#ffffff';
              ctx.fillRect(0, 0, w, h);
              ctx.drawImage(img, 0, 0, w, h);
            }
          }
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

      /* Object opacity - controlled by canvas visibility if needed */

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
    return () => {
      cancelAnimationFrame(id);
      window.removeEventListener('resize', setupCanvas);
    };
  }, [reduced, onScroll]);

  return (
    <div style={{ background: C.bg, fontFamily: C.body }}>

      {/* 600vh sticky hero */}
      <div ref={spacerRef} style={{ height: isMobile ? '420vh' : '600vh', position: 'relative' }}>
        <div className="sticky top-0" style={{ height: '100dvh', overflow: 'hidden', background: C.bg }}>

          {/* ── 3D OBJECT — no wrappers, no extra transforms, clean float ── */}
          <div style={isMobile
            ? { position: 'absolute', top: '52%', bottom: 0, left: 0, right: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', paddingBottom: 'max(2vh, env(safe-area-inset-bottom))', zIndex: 1 }
            : { position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', paddingRight: 'clamp(32px,4vw,64px)', zIndex: 1 }}>
            <div ref={floatRef} style={{ 
              willChange: 'transform', 
              transformStyle: 'preserve-3d', 
              position: 'relative',
              backfaceVisibility: 'hidden',
              WebkitBackfaceVisibility: 'hidden'
            }}>
              <div
                style={{
                  userSelect: 'none',
                  pointerEvents: 'none',
                  willChange: 'transform',
                  position: 'relative',
                  zIndex: 1,
                  width: isMobile ? 'min(66vw, 40vh, 460px)' : 'min(42vw, 580px)',
                  height: isMobile ? 'min(66vw, 40vh, 460px)' : 'min(42vw, 580px)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <EmotionalEye size="lg" />
              </div>
            </div>
          </div>

          {/* Gradient — text/object separation — fully opaque until cutoff */}
          <div style={{ position: 'absolute', inset: 0, zIndex: 2, background: isMobile
            ? 'linear-gradient(to bottom, #ffffff 0%, rgba(255,255,255,0.85) 42%, rgba(255,255,255,0) 58%)'
            : 'linear-gradient(to right, #ffffff 0%, #ffffff 38%, rgba(255,255,255,0) 58%)', pointerEvents: 'none' }} />

          {/* ── TEXT ── */}
          <div style={isMobile
            ? { position: 'absolute', top: 0, left: 0, right: 0, height: '52%', zIndex: 10, display: 'flex', alignItems: 'stretch', padding: '88px clamp(20px,5vw,48px) 0' }
            : { position: 'absolute', inset: 0, zIndex: 10, display: 'flex', alignItems: 'center', padding: '80px clamp(32px,6vw,96px)' }}>
            <div style={{ position: 'relative', width: '100%', maxWidth: 800, height: isMobile ? '100%' : 'min(80vh, 580px)' }}>

              {/* Headline */}
              <div ref={headRef} style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'flex-start', willChange: 'opacity, transform' }}>
                <h1 dir={isAr ? 'rtl' : 'ltr'} style={{ fontFamily: C.display, fontSize: 'clamp(38px,8vw,92px)', fontWeight: 700, lineHeight: 0.95, letterSpacing: '-0.04em', color: C.ink, margin: '0 0 24px', textAlign: isAr ? 'right' : 'left' }}>
                  {isAr ? <>بحثك عن عمل<br />مدعوم بالذكاء الاصطناعي.</> : language === 'fr' ? <>Votre recherche<br />d'emploi. Propulsée par l'IA.</> : <>Your job search.<br />Powered by AI.</>}
                </h1>
                <p dir={isAr ? 'rtl' : 'ltr'} style={{ fontFamily: C.body, fontSize: 18, fontWeight: 400, lineHeight: 1.55, color: C.inkSub, maxWidth: 460, margin: '0 0 36px', textAlign: isAr ? 'right' : 'left' }}>
                  {isAr ? 'يربط AYN سيرتك بالوظائف، ويملأ طلباتك، ويكتب رسائل التقديم، ويتتبع كل فرصة في مكان واحد.' : language === 'fr' ? "AYN fait correspondre votre CV aux offres, remplit vos candidatures, rédige vos lettres de motivation et suit chaque opportunité en un seul endroit." : 'AYN matches your resume to jobs, fills your applications, writes your cover letters, and tracks every opportunity in one place.'}
                </p>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                  <Link to="/contact"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '12px 24px', background: C.ink, color: '#fff', fontFamily: C.body, fontSize: 14, fontWeight: 500, borderRadius: 100, textDecoration: 'none', transition: 'opacity 0.2s, transform 0.15s' }}
                    onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.opacity = '0.85'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.opacity = '1'; }}
                    onMouseDown={e => { (e.currentTarget as HTMLAnchorElement).style.transform = 'scale(0.97)'; }}
                    onMouseUp={e => { (e.currentTarget as HTMLAnchorElement).style.transform = 'scale(1)'; }}>
                    {isAr ? 'ابدأ مجاناً' : language === 'fr' ? 'Commencer gratuitement' : 'Start Free'} <ArrowRight size={13} />
                  </Link>
                  <Link to="/contact"
                    style={{ display: 'inline-flex', alignItems: 'center', padding: '12px 18px', background: 'transparent', color: C.inkMid, fontFamily: C.body, fontSize: 14, fontWeight: 400, borderRadius: 100, border: `1px solid ${C.borderMd}`, textDecoration: 'none', transition: 'background 0.2s, border-color 0.2s' }}
                    onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.background = 'rgba(0,0,0,0.04)'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.background = 'transparent'; }}>
                    {isAr ? 'احجز عرضاً' : language === 'fr' ? 'Réserver une démo' : 'Book a Demo'}
                  </Link>
                </div>
              </div>

              {/* Chapters */}
              {CHAPTERS.map((ch, i) => (
                <div key={i} ref={el => { chRefs.current[i] = el; }} style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'flex-start', opacity: 0, pointerEvents: 'none', willChange: 'opacity, transform' }}>
                  <h2 dir={isAr ? 'rtl' : 'ltr'} style={{ fontFamily: C.display, fontSize: 'clamp(26px,3.2vw,48px)', fontWeight: 700, lineHeight: 1.12, letterSpacing: '-0.025em', color: C.ink, margin: '0 0 16px', whiteSpace: 'pre-line', textAlign: isAr ? 'right' : 'left' }}>{ch.headline}</h2>
                  <p dir={isAr ? 'rtl' : 'ltr'} style={{ fontFamily: C.body, fontSize: 15, fontWeight: 400, lineHeight: 1.6, color: C.inkSub, maxWidth: 360, margin: 0, textAlign: isAr ? 'right' : 'left' }}>{ch.body}</p>
                </div>
              ))}

              {/* Final CTA */}
              <div ref={ctaRef2} style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'flex-start', opacity: 0, pointerEvents: 'none', willChange: 'opacity' }}>
                <h2 dir={isAr ? 'rtl' : 'ltr'} style={{ fontFamily: C.display, fontSize: 'clamp(32px,7vw,72px)', fontWeight: 700, lineHeight: 1.04, letterSpacing: '-0.035em', color: C.ink, margin: '0 0 28px', textAlign: isAr ? 'right' : 'left' }}>
                  {isAr ? <span>عين واحدة.<br />كل إجابة.</span> : language === 'fr' ? <span>Un seul œil.<br />Toutes les réponses.</span> : <span>One eye.<br />Every answer.</span>}
                </h2>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  <Link to="/contact" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '12px 24px', background: C.ink, color: '#fff', fontFamily: C.body, fontSize: 14, fontWeight: 500, borderRadius: 100, textDecoration: 'none', transition: 'opacity 0.2s' }}
                    onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.opacity = '0.85'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.opacity = '1'; }}>
                    {isAr ? 'طلب عرض خاص' : language === 'fr' ? 'Demander une démo privée' : 'Request Private Demo'} <ArrowRight size={13} />
                  </Link>
                  <a href="#features" style={{ display: 'inline-flex', alignItems: 'center', padding: '12px 18px', background: 'transparent', color: C.inkMid, fontFamily: C.body, fontSize: 14, borderRadius: 100, border: `1px solid ${C.borderMd}`, textDecoration: 'none', transition: 'background 0.2s' }}
                    onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.background = 'rgba(0,0,0,0.04)'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.background = 'transparent'; }}>
                    {isAr ? 'شاهده في العمل' : language === 'fr' ? 'Le voir en action' : 'See it in action'}
                  </a>
                </div>
              </div>
            </div>
          </div>

          <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 1, background: C.border, zIndex: 5 }} />
        </div>
      </div>

      {/* Section 2 — About */}
      <section id="about" style={{ padding: 'clamp(96px,14vh,160px) clamp(32px,6vw,96px)', background: C.bgOff }}>
        <div style={{ width: '100%', maxWidth: 900, margin: '0 auto', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <h2 dir={isAr ? 'rtl' : 'ltr'} style={{ fontFamily: C.display, fontSize: 'clamp(36px,5vw,68px)', fontWeight: 700, lineHeight: 0.98, letterSpacing: '-0.04em', color: C.ink, margin: '0 0 32px', textAlign: 'center' }}>
            {isAr ? <>عن <span style={{ color: C.inkMid }}>AYN</span></> : language === 'fr' ? <>À propos de <span style={{ color: C.inkMid }}>AYN</span></> : <>About <span style={{ color: C.inkMid }}>AYN</span></>}
          </h2>
          <p dir={isAr ? 'rtl' : 'ltr'} style={{ 
            fontFamily: C.body, 
            fontSize: 'clamp(18px, 1.2vw, 22px)', 
            fontWeight: 400, 
            lineHeight: 1.6, 
            color: C.inkSub, 
            margin: '0 auto',
            maxWidth: 880,
            textWrap: 'balance' as React.CSSProperties['textWrap'],
            textAlign: 'center'
          }}>
            {isAr
              ? 'تم بناء AYN لأصحاب الشركات الذين يحتاجون إلى الوضوح والسرعة والتحكم في عالم يعيد الذكاء الاصطناعي تشكيله. فهو يربط التقارير والمهام والقرارات وبيانات الأعمال المعتمدة في طبقة استخبارات واحدة، مما يساعد القادة على فهم ما تغير، ورؤية ما يهم، والتحرك قبل ضياع الفرص. يساعد AYN الشركات على التكيف بشكل أسرع، والقيادة بذكاء أكبر، والمضي قدمًا بثقة.'
              : language === 'fr'
              ? "AYN a été conçu pour les propriétaires d'entreprises qui ont besoin de clarté, de rapidité et de contrôle dans un monde remodelé par l'IA. Il connecte les rapports, les tâches, les décisions et les données commerciales approuvées en une seule couche d'intelligence, aidant les dirigeants à comprendre ce qui a changé, à voir ce qui compte et à agir avant que les opportunités ne soient manquées. AYN aide les entreprises à s'adapter plus rapidement, à diriger plus intelligemment et à aller de l'avant avec confiance."
              : 'AYN was built for company owners who need clarity, speed, and control in a world being reshaped by AI. It connects reports, tasks, decisions, and approved business data into one intelligence layer, helping leaders understand what changed, see what matters, and act before opportunities are missed. AYN helps companies adapt faster, lead smarter, and move forward with confidence.'}
          </p>
        </div>
      </section>

      {/* Section 3 — Features */}
      <section id="features" style={{ 
        minHeight: '100dvh', 
        display: 'flex', 
        alignItems: 'center', 
        padding: 'clamp(72px,12vh,120px) clamp(20px,5vw,80px)', 
        background: 'radial-gradient(circle at 50% 50%, rgba(255,255,255,1) 0%, rgba(248,250,252,1) 100%)', 
        borderBottom: `1px solid ${C.border}`,
        position: 'relative',
        overflow: 'hidden'
      }}>
        {/* Subtle Background Decoration */}
        <div style={{ position: 'absolute', top: '-10%', left: '-10%', width: '40%', height: '40%', background: 'radial-gradient(circle, rgba(0,0,0,0.02) 0%, transparent 70%)', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', bottom: '-10%', right: '-10%', width: '40%', height: '40%', background: 'radial-gradient(circle, rgba(0,0,0,0.02) 0%, transparent 70%)', pointerEvents: 'none' }} />

        <div style={{ width: '100%', maxWidth: 1280, margin: '0 auto', position: 'relative', zIndex: 1 }}>
          <div style={{ textAlign: 'center', marginBottom: 80, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <h2 dir={isAr ? 'rtl' : 'ltr'} style={{ fontFamily: C.display, fontSize: 'clamp(32px,4.5vw,58px)', fontWeight: 700, lineHeight: 1.06, letterSpacing: '-0.04em', color: C.ink, margin: '0 0 20px', textAlign: 'center' }}>
              {isAr ? 'بُني لكل جزء من العمل.' : language === 'fr' ? 'Conçu pour chaque partie de l\'entreprise.' : 'Built for every part of the business.'}
            </h2>
            <p dir={isAr ? 'rtl' : 'ltr'} style={{ fontFamily: C.body, fontSize: 18, fontWeight: 400, lineHeight: 1.6, color: C.inkSub, maxWidth: 680, margin: '0 auto', textWrap: 'balance' as React.CSSProperties['textWrap'], textAlign: 'center' }}>
              {isAr ? 'تساعد AYN القادة على طرح الأسئلة، وقراءة سياق الشركة، وتحويل النشاط اليومي إلى قرارات.' : language === 'fr' ? "AYN aide les dirigeants à poser des questions, à lire le contexte de l'entreprise et à transformer l'activité quotidienne en décisions." : 'AYN helps leaders ask questions, read company context, and turn daily activity into decisions.'}
            </p>
          </div>

          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 300px), 1fr))', 
            gap: 32 
          }}>
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
                style={{ 
                  padding: 'clamp(28px,5vw,48px) clamp(22px,4vw,40px)', 
                  background: 'rgba(255, 255, 255, 0.4)',
                  backdropFilter: 'blur(20px) saturate(180%)',
                  WebkitBackdropFilter: 'blur(20px) saturate(180%)',
                  border: '1px solid rgba(255, 255, 255, 0.5)', 
                  borderRadius: 32, 
                  transition: 'all 0.5s cubic-bezier(0.19, 1, 0.22, 1)',
                  boxShadow: '0 10px 30px -10px rgba(0, 0, 0, 0.04)',
                  display: 'flex',
                  flexDirection: 'column',
                  position: 'relative',
                  overflow: 'hidden'
                }}
                onMouseEnter={e => { 
                  const t = e.currentTarget as HTMLDivElement;
                  t.style.transform = 'translateY(-10px)';
                  t.style.boxShadow = '0 30px 60px -12px rgba(0, 0, 0, 0.08)';
                  t.style.background = 'rgba(255, 255, 255, 0.6)';
                  t.style.borderColor = 'rgba(255, 255, 255, 0.8)';
                }}
                onMouseLeave={e => { 
                  const t = e.currentTarget as HTMLDivElement;
                  t.style.transform = 'translateY(0)';
                  t.style.boxShadow = '0 10px 30px -10px rgba(0, 0, 0, 0.04)';
                  t.style.background = 'rgba(255, 255, 255, 0.4)';
                  t.style.borderColor = 'rgba(255, 255, 255, 0.5)';
                }}>
                <div style={{ 
                  width: 60, 
                  height: 60, 
                  borderRadius: 20, 
                  background: 'linear-gradient(135deg, rgba(0,0,0,0.06) 0%, rgba(0,0,0,0.01) 100%)', 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'center', 
                  marginBottom: 28,
                  border: '1px solid rgba(0,0,0,0.03)'
                }}>
                  <card.icon size={28} color={C.ink} strokeWidth={1.5} />
                </div>
                <h3 dir={isAr ? 'rtl' : 'ltr'} style={{ fontFamily: C.display, fontSize: 22, fontWeight: 700, letterSpacing: '-0.03em', color: C.ink, marginBottom: 16, textAlign: isAr ? 'right' : 'left' }}>{card.title}</h3>
                <p dir={isAr ? 'rtl' : 'ltr'} style={{ fontFamily: C.body, fontSize: 16, color: C.inkSub, lineHeight: 1.6, flexGrow: 1, textAlign: isAr ? 'right' : 'left' }}>{card.desc}</p>
                
                {/* Subtle Glow */}
                <div style={{ position: 'absolute', top: '-10%', right: '-10%', width: '50%', height: '50%', background: 'radial-gradient(circle, rgba(0,0,0,0.03) 0%, transparent 70%)', pointerEvents: 'none' }} />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Section 4 — Solutions */}
      <section id="solutions" style={{ 
        minHeight: '100dvh', 
        display: 'flex', 
        flexDirection: 'column', 
        alignItems: 'center', 
        justifyContent: 'center', 
        padding: 'clamp(72px,12vh,120px) clamp(20px,4vw,64px)', 
        background: '#fcfcfc', 
        borderBottom: `1px solid ${C.border}`,
        position: 'relative'
      }}>
        <div style={{ width: '100%', maxWidth: 1280, margin: '0 auto', position: 'relative', zIndex: 1 }}>
          <div style={{ textAlign: 'center', marginBottom: 80, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <h2 dir={isAr ? 'rtl' : 'ltr'} style={{ fontFamily: C.display, fontSize: 'clamp(32px,4.5vw,58px)', fontWeight: 700, letterSpacing: '-0.04em', color: C.ink, margin: '0 0 20px', lineHeight: 1.04, textAlign: 'center' }}>
              {isAr ? 'بُني للشركات التي تحتاج إلى الوضوح للنمو.' : language === 'fr' ? 'Conçu pour les entreprises qui ont besoin de clarté pour croître.' : 'Built for the companies that need clarity to grow.'}
            </h2>
            <p dir={isAr ? 'rtl' : 'ltr'} style={{ fontFamily: C.body, fontSize: 18, fontWeight: 400, lineHeight: 1.6, color: C.inkSub, maxWidth: 820, margin: '0 auto', textWrap: 'balance' as React.CSSProperties['textWrap'], textAlign: 'center' }}>
              {isAr ? 'تتكيف AYN مع مختلف الصناعات من خلال ربط شعوبها وبياناتها وتقاريرها وعملياتها اليومية في طبقة استخبارات واحدة تعمل بالذكاء الاصطناعي.' : language === 'fr' ? "AYN s'adapte à différents secteurs en connectant leurs collaborateurs, leurs données, leurs rapports et leurs opérations quotidiennes en une seule couche d'intelligence artificielle." : 'AYN adapts to different industries by connecting their people, data, reports, and daily operations into one AI intelligence layer.'}
            </p>
          </div>
          
          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 320px), 1fr))', 
            gap: 32 
          }}>
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
              <div key={i} style={{ 
                padding: 'clamp(28px,5vw,48px) clamp(22px,4vw,40px)', 
                background: 'rgba(255, 255, 255, 0.45)', 
                backdropFilter: 'blur(20px) saturate(180%)',
                WebkitBackdropFilter: 'blur(20px) saturate(180%)',
                border: '1px solid rgba(255, 255, 255, 0.6)', 
                borderRadius: 32, 
                boxShadow: '0 10px 30px -10px rgba(0, 0, 0, 0.04)',
                display: 'flex', 
                gap: 28,
                transition: 'all 0.5s cubic-bezier(0.19, 1, 0.22, 1)',
                position: 'relative',
                overflow: 'hidden'
              }}
              onMouseEnter={e => { 
                const t = e.currentTarget as HTMLDivElement;
                t.style.transform = 'translateY(-10px)';
                t.style.boxShadow = '0 30px 60px -12px rgba(0, 0, 0, 0.08)';
                t.style.background = 'rgba(255, 255, 255, 0.65)';
                t.style.borderColor = 'rgba(255, 255, 255, 0.9)';
              }}
              onMouseLeave={e => { 
                const t = e.currentTarget as HTMLDivElement;
                t.style.transform = 'translateY(0)';
                t.style.boxShadow = '0 10px 30px -10px rgba(0, 0, 0, 0.04)';
                t.style.background = 'rgba(255, 255, 255, 0.45)';
                t.style.borderColor = 'rgba(255, 255, 255, 0.6)';
              }}>
                <div style={{ 
                  width: 64, 
                  height: 64, 
                  borderRadius: 20, 
                  background: 'linear-gradient(135deg, rgba(0,0,0,0.06) 0%, rgba(0,0,0,0.01) 100%)', 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'center', 
                  flexShrink: 0,
                  border: '1px solid rgba(0,0,0,0.03)'
                }}>
                  <item.icon size={30} color={C.ink} strokeWidth={1.5} />
                </div>
                <div dir={isAr ? 'rtl' : 'ltr'} style={{ textAlign: isAr ? 'right' : 'left' }}>
                  <h3 style={{ fontFamily: C.display, fontSize: 22, fontWeight: 700, letterSpacing: '-0.03em', color: C.ink, marginBottom: 12 }}>{item.title}</h3>
                  <p style={{ fontFamily: C.body, fontSize: 16, color: C.inkSub, lineHeight: 1.6 }}>{item.desc}</p>
                </div>

                {/* Subtle Glow Effect */}
                <div style={{ 
                  position: 'absolute', 
                  bottom: '-20%', 
                  left: '-20%', 
                  width: '60%', 
                  height: '60%', 
                  background: 'radial-gradient(circle, rgba(0,0,0,0.02) 0%, transparent 70%)',
                  pointerEvents: 'none'
                }} />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Section 5 — Final CTA (dark) */}
      <section style={{ minHeight: '80dvh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', overflow: 'hidden', background: C.ink, padding: 'clamp(72px,8vw,120px) clamp(20px,5vw,32px) 140px', position: 'relative' }}>
        {[460, 320, 200].map((sz, i) => (
          <div key={i} style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: `min(85vw,${sz}px)`, height: `min(85vw,${sz}px)`, borderRadius: '50%', border: `1px solid rgba(255,255,255,${0.06 - i * 0.015})`, pointerEvents: 'none' }} />
        ))}
        <div style={{ position: 'relative', zIndex: 10, maxWidth: 640, width: '100%', paddingBottom: 100, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <h2 dir={isAr ? 'rtl' : 'ltr'} style={{ fontFamily: C.display, fontSize: 'clamp(36px,7vw,92px)', fontWeight: 700, lineHeight: 1.02, letterSpacing: '-0.04em', color: '#fff', margin: '0 0 40px', textAlign: 'center' }}>
            {isAr ? <span>أذكى عين<br />في الغرفة<br />هي عينك.</span> : language === 'fr' ? <span>L'intelligence<br />la plus puissante<br />est la vôtre.</span> : <span>The most intelligent<br />eye in the room<br />is yours.</span>}
          </h2>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link to="/contact"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '12px 24px', background: '#fff', color: C.ink, fontFamily: C.body, fontSize: 14, fontWeight: 600, letterSpacing: '-0.01em', borderRadius: 100, textDecoration: 'none', transition: 'opacity 0.2s, transform 0.15s' }}
              onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.opacity = '0.88'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.opacity = '1'; }}
              onMouseDown={e => { (e.currentTarget as HTMLAnchorElement).style.transform = 'scale(0.97)'; }}
              onMouseUp={e => { (e.currentTarget as HTMLAnchorElement).style.transform = 'scale(1)'; }}>
              {isAr ? 'طلب عرض' : language === 'fr' ? 'Demander une démo' : 'Request Demo'} <ArrowRight size={13} />
            </Link>
            <a href="#features"
              style={{ display: 'inline-flex', alignItems: 'center', padding: '12px 18px', background: 'transparent', color: 'rgba(255,255,255,0.65)', fontFamily: C.body, fontSize: 14, borderRadius: 100, border: '1px solid rgba(255,255,255,0.20)', textDecoration: 'none', transition: 'border-color 0.2s, color 0.2s' }}
              onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.borderColor = 'rgba(255,255,255,0.45)'; (e.currentTarget as HTMLAnchorElement).style.color = '#fff'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.borderColor = 'rgba(255,255,255,0.20)'; (e.currentTarget as HTMLAnchorElement).style.color = 'rgba(255,255,255,0.65)'; }}>
              {isAr ? 'استكشف المميزات' : language === 'fr' ? 'Explorer les fonctionnalités' : 'Explore Features'}
            </a>
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
