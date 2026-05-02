/**
 * HelmetScrollReveal — Sticky, scroll-scrubbed helmet that disassembles
 * from the assembled view (last frame) into the exploded view (frame 0)
 * as the user scrolls. ONE image element, scroll-driven, then unpins.
 *
 * Respects prefers-reduced-motion: renders a single static helmet only.
 */
import { useEffect, useRef, useState, useCallback, memo } from 'react';
import { HELMET_FRAMES, FRAME_COUNT } from '@/assets/helmet-frames';
import { useLanguage } from '@/contexts/LanguageContext';
import { Globe, TrendingUp, Bot } from 'lucide-react';

const ASSEMBLED = HELMET_FRAMES[FRAME_COUNT - 1];
const EXPLODED = HELMET_FRAMES[0];
const SZ = 'min(75vw, 70vh, 620px)';

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}
function map(v: number, a: number, b: number, c: number, d: number) {
  return c + (clamp(v, a, b) - a) / (b - a) * (d - c);
}

const BLURBS = [
  {
    icon: Globe,
    label: { en: 'WORLD INTELLIGENCE', ar: 'ذكاء عالمي', fr: 'INTELLIGENCE MONDIALE' },
    title: { en: 'See the world before it moves.', ar: 'شاهد العالم قبل أن يتحرك.', fr: 'Voir le monde avant qu\'il ne bouge.' },
    body: { en: 'AYN monitors geopolitical events, commodity flows and market signals across 187 countries.', ar: 'يراقب AYN الأحداث الجيوسياسية وتدفقات السلع وإشارات الأسواق.', fr: 'AYN surveille les événements géopolitiques et les marchés.' },
    range: [0.05, 0.32] as const,
  },
  {
    icon: TrendingUp,
    label: { en: 'MARKET SIGNALS', ar: 'إشارات السوق', fr: 'SIGNAUX DU MARCHÉ' },
    title: { en: 'Every signal. Zero noise.', ar: 'كل إشارة. بلا ضوضاء.', fr: 'Chaque signal. Zéro bruit.' },
    body: { en: 'From oil prices to crypto volatility — AYN cuts through noise and surfaces what moves your business.', ar: 'من النفط إلى التشفير، يستخرج AYN ما يحرّك عملك.', fr: 'AYN extrait ce qui fait bouger votre entreprise.' },
    range: [0.36, 0.64] as const,
  },
  {
    icon: Bot,
    label: { en: 'AI AGENTS', ar: 'وكلاء الذكاء', fr: 'AGENTS IA' },
    title: { en: 'Your team. Never sleeps.', ar: 'فريقك. لا ينام.', fr: 'Votre équipe. Ne dort jamais.' },
    body: { en: 'Custom AI agents trained on your data, delivering intelligence 24/7.', ar: 'وكلاء مخصصون يقدمون الذكاء على مدار الساعة.', fr: 'Agents IA livrant de l\'intelligence 24/7.' },
    range: [0.68, 0.95] as const,
  },
];

export const HelmetScrollReveal = memo(() => {
  const { language } = useLanguage();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const progressRef = useRef(0);
  const lastIdxRef = useRef(FRAME_COUNT - 1);
  const rafRef = useRef(0);
  const runningRef = useRef(true);

  const [reduced, setReduced] = useState(false);
  const [mob, setMob] = useState(false);
  const [p, setP] = useState(0);

  // Detect reduced-motion + mobile
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const m = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onR = () => setReduced(m.matches);
    onR();
    m.addEventListener('change', onR);

    const onResize = () => setMob(window.innerWidth < 768);
    onResize();
    window.addEventListener('resize', onResize);
    return () => {
      m.removeEventListener('change', onR);
      window.removeEventListener('resize', onResize);
    };
  }, []);

  // Preload all helmet frames once (skip when reduced motion)
  useEffect(() => {
    if (reduced) return;
    const imgs = HELMET_FRAMES.map((src) => {
      const i = new Image();
      i.src = src;
      return i;
    });
    return () => {
      imgs.forEach((i) => (i.src = ''));
    };
  }, [reduced]);

  const onScroll = useCallback(() => {
    const el = wrapperRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const total = el.offsetHeight - window.innerHeight;
    if (total <= 0) {
      progressRef.current = 0;
      return;
    }
    progressRef.current = clamp(-rect.top / total, 0, 1);
  }, []);

  // RAF loop — single image, scrub frames
  useEffect(() => {
    if (reduced) return;

    const tick = () => {
      if (!runningRef.current) {
        rafRef.current = requestAnimationFrame(tick);
        return;
      }
      const prog = progressRef.current;
      // progress 0 = assembled (last frame); progress 1 = exploded (frame 0)
      const idx = clamp(
        Math.round((1 - prog) * (FRAME_COUNT - 1)),
        0,
        FRAME_COUNT - 1
      );
      if (idx !== lastIdxRef.current) {
        lastIdxRef.current = idx;
        if (imgRef.current) imgRef.current.src = HELMET_FRAMES[idx];
      }
      setP(prog);
      rafRef.current = requestAnimationFrame(tick);
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    rafRef.current = requestAnimationFrame(tick);

    const onVis = () => {
      runningRef.current = !document.hidden;
    };
    document.addEventListener('visibilitychange', onVis);

    return () => {
      window.removeEventListener('scroll', onScroll);
      document.removeEventListener('visibilitychange', onVis);
      cancelAnimationFrame(rafRef.current);
    };
  }, [reduced, onScroll]);

  // Reduced motion: static helmet, no pin
  if (reduced) {
    return (
      <section
        className="w-full flex items-center justify-center overflow-hidden"
        style={{ minHeight: '60vh', background: '#000' }}
        aria-label="AYN helmet"
      >
        <img
          src={ASSEMBLED}
          alt="AYN"
          draggable={false}
          style={{ width: SZ, height: SZ, objectFit: 'contain' }}
        />
      </section>
    );
  }

  const blurbOp = (s: number, e: number) => {
    const peak = s + (e - s) * 0.4;
    if (p < s || p > e) return 0;
    if (p < peak) return map(p, s, peak, 0, 1);
    return map(p, peak, e, 1, 0);
  };
  const blurbY = (s: number, e: number) => {
    const peak = s + (e - s) * 0.4;
    if (p < s) return 30;
    if (p < peak) return map(p, s, peak, 30, 0);
    return map(p, peak, e, 0, -30);
  };

  const lang = (language === 'ar' || language === 'fr' ? language : 'en') as 'en' | 'ar' | 'fr';

  return (
    <section
      ref={wrapperRef}
      className="relative w-full"
      style={{ height: mob ? '220vh' : '320vh', background: '#000' }}
      aria-label="AYN scroll reveal"
    >
      <div
        className="sticky top-0 w-full overflow-hidden flex items-center justify-center"
        style={{ height: '100dvh' }}
      >
        {/* Single helmet — frame-scrubbed */}
        <img
          ref={imgRef}
          src={ASSEMBLED}
          alt="AYN"
          draggable={false}
          decoding="async"
          style={{
            width: SZ,
            height: SZ,
            objectFit: 'contain',
            display: 'block',
            userSelect: 'none',
            willChange: 'contents',
          }}
        />

        {/* Side / bottom blurbs */}
        {BLURBS.map((b, i) => {
          const [s, e] = b.range;
          const op = blurbOp(s, e);
          if (op < 0.01) return null;
          const y = blurbY(s, e);
          const Icon = b.icon;
          return (
            <div
              key={i}
              className={`absolute z-20 pointer-events-none ${
                mob ? 'left-0 right-0 bottom-12 px-6 text-center' : 'left-12 max-w-md'
              }`}
              style={{
                opacity: op,
                transform: `translateY(${y}px)`,
                ...(mob ? {} : { top: '50%', marginTop: -80 }),
              }}
            >
              <div
                className={`flex items-center gap-2 mb-3 ${mob ? 'justify-center' : ''}`}
              >
                <Icon className="w-4 h-4" style={{ color: 'hsl(var(--primary))' }} />
                <span
                  className="text-[9px] tracking-[0.3em] uppercase font-mono"
                  style={{ color: 'rgba(255,255,255,0.4)' }}
                >
                  {b.label[lang]}
                </span>
              </div>
              <h2
                className="font-display font-bold text-white leading-tight mb-3"
                style={{ fontSize: mob ? 'clamp(24px,5vw,38px)' : 'clamp(28px,3vw,46px)' }}
              >
                {b.title[lang]}
              </h2>
              {!mob && (
                <p
                  className="text-sm font-light leading-relaxed"
                  style={{ color: 'rgba(255,255,255,0.5)' }}
                >
                  {b.body[lang]}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
});

HelmetScrollReveal.displayName = 'HelmetScrollReveal';
