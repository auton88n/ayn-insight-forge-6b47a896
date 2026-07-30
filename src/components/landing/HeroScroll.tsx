/**
 * HeroScroll — Pure white bg matching frames exactly.
 * Simple clean scroll scrubbing. No distorting transforms.
 * Frames are #ffffff — page is #ffffff — seamless floating object.
 */

import { useEffect, useRef, useState, memo, useCallback } from 'react';
import type React from 'react';
import { useReducedMotion } from 'framer-motion';
import { ArrowRight, Wand2, Target, ShieldCheck, FileText, Sparkles, LayoutGrid } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useLanguage } from '@/contexts/LanguageContext';
import {
  FillInProgressIllustration,
  MatchScoreIllustration,
  ProvenanceIllustration,
  OnePageDocIllustration,
  RunSummaryIllustration,
} from './ProductIllustrations';


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

export const HeroScroll = memo(({ onStartFree }: { onStartFree?: () => void }) => {
  const { language } = useLanguage();
  const isAr = language === 'ar';
  const reduced = useReducedMotion();
  // "stacked" layout (text zone on top, object below) for phones and tablets
  const [isMobile, setIsMobile] = useState(
    typeof window !== 'undefined' && window.innerWidth < 1024
  );

  useEffect(() => {
    preloadFrames();
    const onResizeMq = () => setIsMobile(window.innerWidth < 1024);
    window.addEventListener('resize', onResizeMq, { passive: true });
    return () => window.removeEventListener('resize', onResizeMq);
  }, []);

  const CHAPTERS = [
    {
      headline: 'Forty fields.\nEvery time.\nFor months.',
      body: 'Applying is not hard. It is just endless.',
      stat: '01', unit: 'Profile',
      in: 0.15, out: 0.31
    },
    {
      headline: 'One click.\nThe whole form.\nIncluding the hard parts.',
      body: 'Screening questions, dropdowns, work history, all of it.',
      stat: '02', unit: 'Match',
      in: 0.34, out: 0.49
    },
    {
      headline: 'Know before\nyou spend\nthe hour.',
      body: 'See how well you match before you apply.',
      stat: '03', unit: 'Fill',
      in: 0.52, out: 0.67
    },
    {
      headline: 'A resume that\nfits the role.\nEvery time.',
      body: 'Tailored from your real experience. One page.',
      stat: '04', unit: 'Tailor',
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
              <canvas
                ref={canvasRef}
                style={{
                  /* Frames are 255,255,255 — page is #ffffff — zero visible edge */
                  display: 'block',
                  userSelect: 'none',
                  pointerEvents: 'none',
                  willChange: 'transform',
                  position: 'relative',
                  zIndex: 1,
                }}
              />
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
                <h1 style={{ fontFamily: C.display, fontSize: 'clamp(32px,5.4vw,64px)', fontWeight: 700, lineHeight: 1.0, letterSpacing: '-0.04em', color: C.ink, margin: '0 0 20px', textAlign: 'left' }}>
                  You have filled the same form a hundred times.
                </h1>
                <p style={{ fontFamily: C.body, fontSize: 17, fontWeight: 400, lineHeight: 1.55, color: C.inkSub, maxWidth: 520, margin: '0 0 28px', textAlign: 'left' }}>
                  AYN applies for you. One click per job, not forty fields.
                </p>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                  <button type="button" onClick={() => onStartFree?.()}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '12px 24px', background: C.ink, color: '#fff', fontFamily: C.body, fontSize: 14, fontWeight: 500, borderRadius: 100, border: 'none', cursor: 'pointer', transition: 'opacity 0.2s, transform 0.15s' }}
                    onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.opacity = '0.85'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.opacity = '1'; }}>
                    Start free <ArrowRight size={13} />
                  </button>
                  <a href="#employers"
                    style={{ display: 'inline-flex', alignItems: 'center', padding: '12px 18px', background: 'transparent', color: C.inkMid, fontFamily: C.body, fontSize: 14, fontWeight: 400, borderRadius: 100, border: `1px solid ${C.borderMd}`, textDecoration: 'none', transition: 'background 0.2s, border-color 0.2s' }}
                    onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.background = 'rgba(0,0,0,0.04)'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.background = 'transparent'; }}>
                    For employers
                  </a>
                </div>
                <p style={{ fontFamily: C.body, fontSize: 13, color: C.inkMid, margin: '14px 0 0', textAlign: 'left' }}>
                  Free to start. Works on Greenhouse, Lever, Workday, Ashby and more.
                </p>

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
                <h2 style={{ fontFamily: C.display, fontSize: 'clamp(30px,5vw,60px)', fontWeight: 700, lineHeight: 1.04, letterSpacing: '-0.035em', color: C.ink, margin: '0 0 28px', textAlign: 'left' }}>
                  <span>Your next application<br />should take a minute.</span>
                </h2>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  <button type="button" onClick={() => onStartFree?.()} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '12px 24px', background: C.ink, color: '#fff', fontFamily: C.body, fontSize: 14, fontWeight: 500, borderRadius: 100, border: 'none', cursor: 'pointer', transition: 'opacity 0.2s' }}
                    onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.opacity = '0.85'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.opacity = '1'; }}>
                    Start free <ArrowRight size={13} />
                  </button>
                  <a href="#features" style={{ display: 'inline-flex', alignItems: 'center', padding: '12px 18px', background: 'transparent', color: C.inkMid, fontFamily: C.body, fontSize: 14, borderRadius: 100, border: `1px solid ${C.borderMd}`, textDecoration: 'none', transition: 'background 0.2s' }}
                    onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.background = 'rgba(0,0,0,0.04)'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.background = 'transparent'; }}>
                    See what it does
                  </a>
                </div>
              </div>
            </div>
          </div>

          <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 1, background: C.border, zIndex: 5 }} />
        </div>
      </div>

      {/* Section 2 — How it works */}
      <section id="how" style={{ padding: 'clamp(96px,14vh,160px) clamp(32px,6vw,96px)', background: C.bgOff }}>
        <div style={{ width: '100%', maxWidth: 1100, margin: '0 auto' }}>
          <h2 style={{ fontFamily: C.display, fontSize: 'clamp(32px,4.5vw,58px)', fontWeight: 700, lineHeight: 1.04, letterSpacing: '-0.04em', color: C.ink, margin: '0 0 56px', textAlign: 'center' }}>
            How it works
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))', gap: 40 }}>
            {[
              { n: '1', text: 'Add your resume once.' },
              { n: '2', text: 'Open any job posting.' },
              { n: '3', text: 'Click fill.' },
            ].map(step => (
              <div key={step.n} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                <div style={{ width: 48, height: 48, borderRadius: 100, border: `1px solid ${C.borderMd}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: C.display, fontSize: 20, fontWeight: 700, color: C.ink }}>
                  {step.n}
                </div>
                <p style={{ fontFamily: C.body, fontSize: 17, lineHeight: 1.6, color: C.inkSub, margin: 0 }}>{step.text}</p>
              </div>
            ))}
          </div>


          {/* Fill in progress illustration */}
          <div style={{ width: '100%', maxWidth: 900, margin: 'clamp(56px,8vw,96px) auto 0' }}>
            <FillInProgressIllustration />
          </div>
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
            <h2 style={{ fontFamily: C.display, fontSize: 'clamp(32px,4.5vw,58px)', fontWeight: 700, lineHeight: 1.06, letterSpacing: '-0.04em', color: C.ink, margin: '0 0 20px', textAlign: 'center' }}>
              Features
            </h2>
            <p style={{ fontFamily: C.body, fontSize: 18, fontWeight: 400, lineHeight: 1.6, color: C.inkSub, maxWidth: 680, margin: '0 auto', textWrap: 'balance' as React.CSSProperties['textWrap'], textAlign: 'center' }}>
              Everything you need to apply faster without losing control of what goes out with your name on it.
            </p>
          </div>

          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 300px), 1fr))', 
            gap: 32 
          }}>
            {[
              {
                title: 'Autofill that handles the hard parts',
                desc: 'Names and emails are easy. AYN also handles work history, education, custom screening questions, dropdown menus, and the long forms that make you give up halfway through.',
                icon: Wand2
              },
              {
                title: 'A match score you can check',
                desc: 'AYN scores you against the actual job description it read from the page, and shows you how many characters it found and which resume it compared. If it cannot find a real job description, it says so instead of guessing.',
                icon: Target,
                art: MatchScoreIllustration
              },
              {
                title: 'It never invents an answer',
                desc: 'Every answer AYN fills has to come from your own profile or resume. If it cannot verify something, it leaves the field blank and tells you, rather than making something up.',
                icon: ShieldCheck,
                art: ProvenanceIllustration
              },
              {
                title: 'Tailored resumes and cover letters',
                desc: 'One page, real text a resume scanner can read, not an image. AYN rewrites your existing experience to match the role without inventing jobs, changing your numbers, or adding skills you do not have.',
                icon: FileText,
                art: OnePageDocIllustration
              },

              {
                title: 'It learns your answers',
                desc: 'Answer a question once and AYN remembers it, even when the next company words it differently. Sensitive questions like work authorization are always yours to answer.',
                icon: Sparkles
              },
              {
                title: 'Everything in one place',
                desc: 'Your resumes, saved jobs, applications, and match scores live in Resume Hub, so you can see what you applied to and what happened next.',
                icon: LayoutGrid
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
                {/* Illustration slot, same height on every card so the grid stays even */}
                <div style={{ height: 150, marginBottom: 28, display: 'flex', alignItems: 'center', justifyContent: (card as { art?: unknown }).art ? 'center' : 'flex-start' }}>
                  {(card as { art?: React.ComponentType<{ style?: React.CSSProperties }> }).art ? (
                    (() => { const Art = (card as { art: React.ComponentType<{ style?: React.CSSProperties }> }).art; return <Art style={{ maxWidth: 240, maxHeight: 150 }} />; })()
                  ) : (
                    <div style={{
                      width: 60,
                      height: 60,
                      borderRadius: 20,
                      background: 'linear-gradient(135deg, rgba(0,0,0,0.06) 0%, rgba(0,0,0,0.01) 100%)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      border: '1px solid rgba(0,0,0,0.03)'
                    }}>
                      <card.icon size={28} color={C.ink} strokeWidth={1.5} />
                    </div>
                  )}
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

      {/* Section 4 — Trust */}
      <section id="trust" style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 'clamp(96px,14vh,160px) clamp(20px,4vw,64px)',
        background: '#fcfcfc',
        borderBottom: `1px solid ${C.border}`,
        position: 'relative'
      }}>
        <div style={{ width: '100%', maxWidth: 860, margin: '0 auto', textAlign: 'center' }}>
          <h2 style={{ fontFamily: C.display, fontSize: 'clamp(32px,4.5vw,58px)', fontWeight: 700, letterSpacing: '-0.04em', color: C.ink, margin: '0 0 24px', lineHeight: 1.04 }}>
            Built to be honest with you
          </h2>
          <p style={{ fontFamily: C.body, fontSize: 18, fontWeight: 400, lineHeight: 1.7, color: C.inkSub, margin: 0, textWrap: 'balance' as React.CSSProperties['textWrap'] }}>
            AYN tells you what it did and what it could not do. It shows which job description it read and how complete it was, which resume it compared you against, and which fields it filled, skipped, or wants you to review. Sensitive questions about work authorization, sponsorship, salary, and self identification are never guessed. You answer those.
          </p>

          <div style={{ width: '100%', maxWidth: 560, margin: 'clamp(40px,6vw,64px) auto 0' }}>
            <RunSummaryIllustration />
          </div>
        </div>

      </section>

      {/* Section 5 — Final CTA (dark) */}
      <section style={{ minHeight: '80dvh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', overflow: 'hidden', background: C.ink, padding: 'clamp(72px,8vw,120px) clamp(20px,5vw,32px) 140px', position: 'relative' }}>
        {[460, 320, 200].map((sz, i) => (
          <div key={i} style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: `min(85vw,${sz}px)`, height: `min(85vw,${sz}px)`, borderRadius: '50%', border: `1px solid rgba(255,255,255,${0.06 - i * 0.015})`, pointerEvents: 'none' }} />
        ))}
        <div style={{ position: 'relative', zIndex: 10, maxWidth: 640, width: '100%', paddingBottom: 100, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <h2 style={{ fontFamily: C.display, fontSize: 'clamp(32px,5.4vw,72px)', fontWeight: 700, lineHeight: 1.04, letterSpacing: '-0.04em', color: '#fff', margin: '0 0 40px', textAlign: 'center' }}>
            <span>Your next application should take a minute, not an hour.</span>
          </h2>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
            <button type="button" onClick={() => onStartFree?.()}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '12px 24px', background: '#fff', color: C.ink, fontFamily: C.body, fontSize: 14, fontWeight: 600, letterSpacing: '-0.01em', borderRadius: 100, border: 'none', cursor: 'pointer', transition: 'opacity 0.2s, transform 0.15s' }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.opacity = '0.88'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.opacity = '1'; }}>
              Start free <ArrowRight size={13} />
            </button>
            <Link to="/resume-hub?tab=extension"
              style={{ display: 'inline-flex', alignItems: 'center', padding: '12px 18px', background: 'transparent', color: 'rgba(255,255,255,0.65)', fontFamily: C.body, fontSize: 14, borderRadius: 100, border: '1px solid rgba(255,255,255,0.20)', textDecoration: 'none', transition: 'border-color 0.2s, color 0.2s' }}
              onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.borderColor = 'rgba(255,255,255,0.45)'; (e.currentTarget as HTMLAnchorElement).style.color = '#fff'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.borderColor = 'rgba(255,255,255,0.20)'; (e.currentTarget as HTMLAnchorElement).style.color = 'rgba(255,255,255,0.65)'; }}>
              Add to Chrome
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
