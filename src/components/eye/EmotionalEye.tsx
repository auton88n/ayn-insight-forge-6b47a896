/**
 * EmotionalEye — 3D sphere design with performant mouse-tracking.
 * Mouse tracking uses direct DOM refs + RAF (zero React re-renders per frame).
 */
import { useEffect, useState, useRef, useCallback, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { useAYNEmotion } from '@/stores/emotionStore';
import { useSoundStore } from '@/stores/soundStore';
import { useDebugStore } from '@/stores/debugStore';
import { useIdleDetection } from '@/hooks/useIdleDetection';
import { useEyeGestures } from '@/hooks/useEyeGestures';
import { usePerformanceMode } from '@/hooks/usePerformanceMode';
import { EyeParticles } from './EyeParticles';
import { ThinkingDots } from './ThinkingDots';
import { useIsMobile } from '@/hooks/use-mobile';

export type PupilReaction = 'normal' | 'dilate-slightly' | 'dilate-more' | 'contract';
export type BlinkPattern  = 'normal' | 'slow-comfort' | 'quick-attentive' | 'double-understanding';

interface EmotionalEyeProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  gazeTarget?: { x: number; y: number } | null;
  pupilReaction?: PupilReaction;
  blinkPattern?: BlinkPattern;
  colorIntensity?: number;
}

const SIZE_MAP = {
  sm: { cls: 'w-[100px] h-[100px] md:w-[120px] md:h-[120px]', px: 120 },
  md: { cls: 'w-[140px] h-[140px] md:w-[180px] md:h-[180px]',  px: 180 },
  lg: { cls: 'w-[160px] h-[160px] md:w-[220px] md:h-[220px] lg:w-[260px] lg:h-[260px]', px: 260 },
};

// Tick mark positions (8 evenly spaced on the ring)
const TICKS = Array.from({ length: 8 }, (_, i) => {
  const a = (i * 45 * Math.PI) / 180;
  return { x1: 50 + 33 * Math.cos(a), y1: 50 + 33 * Math.sin(a), x2: 50 + 38 * Math.cos(a), y2: 50 + 38 * Math.sin(a) };
});

const EmotionalEyeComponent = ({
  size = 'lg',
  className,
  gazeTarget,
  pupilReaction  = 'normal',
  blinkPattern   = 'normal',
  colorIntensity = 0.5,
}: EmotionalEyeProps) => {
  const {
    emotionConfig, emotion,
    isAbsorbing, isBlinking, triggerBlink, isResponding,
    isUserTyping, isAttentive, isSurprised,
    isPulsing, isWinking, activityLevel,
  } = useAYNEmotion();

  const soundContext   = useSoundStore();
  const debugIsEnabled = useDebugStore((s) => s.isDebugMode);
  const [isHovered, setIsHovered] = useState(false);

  const lastBlinkRef         = useRef(Date.now());
  const idleBlinkIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const prevBlinkingRef      = useRef(false);
  const isSignificantBlinkRef = useRef(false);
  const typingStartRef       = useRef<number | null>(null);
  const pauseBlinkTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const isMobile         = useIsMobile();
  const performanceConfig = usePerformanceMode();
  const { isDeepIdle }   = useIdleDetection({ idleThreshold: 15, deepIdleThreshold: 30 });
  const { isSquished, handlers: gestureHandlers } = useEyeGestures();

  /* ── Direct-DOM refs for mouse animation (no state updates) ── */
  const sphereRef    = useRef<HTMLDivElement>(null);
  const reactorRef   = useRef<HTMLDivElement>(null);
  const rafRef       = useRef<number | null>(null);
  const mouseNorm    = useRef({ x: 0, y: 0 }); // -1..1

  /* ── Blink sounds ── */
  useEffect(() => {
    if (isBlinking && !prevBlinkingRef.current) {
      if (isSignificantBlinkRef.current && soundContext?.playInstant) soundContext.playInstant('blink');
    } else if (!isBlinking && prevBlinkingRef.current) {
      if (isSignificantBlinkRef.current && soundContext?.playInstant) soundContext.playInstant('blink-open');
      isSignificantBlinkRef.current = false;
    }
    prevBlinkingRef.current = isBlinking;
  }, [isBlinking, soundContext]);

  /* ── Blink interval logic ── */
  const getBlinkInterval = useCallback(() => {
    switch (blinkPattern) {
      case 'slow-comfort':      return 4000 + Math.random() * 2000;
      case 'quick-attentive':   return 1200 + Math.random() * 600;
      case 'double-understanding': return 2500 + Math.random() * 1000;
      default: break;
    }
    if (isUserTyping) {
      const d = typingStartRef.current ? Date.now() - typingStartRef.current : 0;
      if (d > 5000) return 6000 + Math.random() * 2000;
      if (d > 2000) return 4500 + Math.random() * 1500;
      return 3500 + Math.random() * 1000;
    }
    if (isResponding) return 800 + Math.random() * 400;
    return 3000 + Math.random() * 1500;
  }, [isUserTyping, isResponding, blinkPattern]);

  useEffect(() => {
    if (idleBlinkIntervalRef.current) { clearInterval(idleBlinkIntervalRef.current); idleBlinkIntervalRef.current = null; }
    const schedule = () => {
      idleBlinkIntervalRef.current = setTimeout(() => {
        if (!isAbsorbing && !isAttentive) {
          const now = Date.now();
          if (now - lastBlinkRef.current > 500) {
            triggerBlink(); lastBlinkRef.current = now;
            if (blinkPattern === 'double-understanding') setTimeout(() => triggerBlink(), 200);
          }
        }
        schedule();
      }, getBlinkInterval());
    };
    schedule();
    return () => { if (idleBlinkIntervalRef.current) clearTimeout(idleBlinkIntervalRef.current); };
  }, [isAbsorbing, isAttentive, getBlinkInterval, triggerBlink, blinkPattern]);

  useEffect(() => {
    if (isUserTyping) {
      if (!typingStartRef.current) typingStartRef.current = Date.now();
      if (pauseBlinkTimeoutRef.current) { clearTimeout(pauseBlinkTimeoutRef.current); pauseBlinkTimeoutRef.current = null; }
    } else if (typingStartRef.current) {
      const d = Date.now() - typingStartRef.current;
      typingStartRef.current = null;
      pauseBlinkTimeoutRef.current = setTimeout(() => {
        if (!isAbsorbing && !isResponding) {
          triggerBlink();
          if (d > 3000) setTimeout(() => triggerBlink(), 250);
        }
      }, 300 + Math.random() * 200);
    }
    return () => { if (pauseBlinkTimeoutRef.current) clearTimeout(pauseBlinkTimeoutRef.current); };
  }, [isUserTyping, isAbsorbing, isResponding, triggerBlink]);

  /* ── Performant mouse tracking — direct DOM, RAF-throttled ── */
  useEffect(() => {
    if (isMobile || performanceConfig.shouldReduceAnimations || isDeepIdle) return;

    const applyTransforms = () => {
      rafRef.current = null;
      const { x, y } = mouseNorm.current;
      // Sphere: subtle 3D tilt (±6 deg)
      if (sphereRef.current) {
        sphereRef.current.style.transform =
          `perspective(700px) rotateY(${x * 6}deg) rotateX(${-y * 6}deg)`;
      }
      // Reactor core: parallax shift (±12%)
      if (reactorRef.current) {
        reactorRef.current.style.transform = `translate(${x * 12}%, ${y * 12}%)`;
      }
    };

    const onMove = (e: MouseEvent) => {
      mouseNorm.current = {
        x: (e.clientX / window.innerWidth)  * 2 - 1,
        y: (e.clientY / window.innerHeight) * 2 - 1,
      };
      if (rafRef.current === null) rafRef.current = requestAnimationFrame(applyTransforms);
    };

    const onLeave = () => {
      mouseNorm.current = { x: 0, y: 0 };
      if (rafRef.current === null) rafRef.current = requestAnimationFrame(applyTransforms);
    };

    window.addEventListener('mousemove', onMove,  { passive: true });
    window.addEventListener('mouseleave', onLeave);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseleave', onLeave);
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [isMobile, performanceConfig.shouldReduceAnimations, isDeepIdle]);

  const safeActivityLevel = activityLevel || 'idle';
  const glowColor = emotionConfig?.glowColor || 'hsl(35, 95%, 55%)';
  const eyeSize   = SIZE_MAP[size].px;

  /* ── Blink scaleY (applied to sphere body only) ── */
  const blinkScaleY = isBlinking ? 0.05 : isSquished ? 0.78 : 1;
  const blinkTransition = `transform ${isBlinking ? '0.12s' : '0.18s'} cubic-bezier(0.4,0,0.2,1)`;

  /* ── Activity breathing speed ── */
  const BREATHING: Record<string, number> = { idle: 1.2, low: 1.0, medium: 0.8, high: 0.6 };
  const breathDur = (emotionConfig?.breathingSpeed ?? 3) * (BREATHING[safeActivityLevel] ?? 1);

  if (debugIsEnabled) useDebugStore.getState().incrementRenderCount('EmotionalEye');

  return (
    <div className={cn('relative flex items-center justify-center overflow-visible', className)}>

      {/* Thinking dots */}
      <ThinkingDots
        isVisible={isResponding && !performanceConfig.shouldReduceAnimations}
        color={glowColor}
        size={eyeSize}
      />

      {/* Outer ambient halo */}
      <div
        className="absolute -inset-6 rounded-full pointer-events-none"
        style={{
          background: `radial-gradient(circle, ${glowColor}28 0%, ${glowColor}0a 50%, transparent 75%)`,
          filter: 'blur(12px)',
          transition: 'background 0.9s ease',
          animationDuration: `${breathDur}s`,
        }}
      />

      {/* ── Sphere wrapper (mouse tilt applied here via ref) ── */}
      <div
        ref={sphereRef}
        className={cn('relative cursor-pointer select-none will-change-transform', SIZE_MAP[size].cls)}
        style={{ transformStyle: 'preserve-3d', transition: 'transform 0.12s ease-out' }}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => { setIsHovered(false); gestureHandlers.onMouseLeave(); }}
        onClick={gestureHandlers.onClick}
        onDoubleClick={gestureHandlers.onDoubleClick}
        onMouseDown={gestureHandlers.onMouseDown}
        onMouseUp={gestureHandlers.onMouseUp}
        onTouchStart={gestureHandlers.onTouchStart}
        onTouchEnd={gestureHandlers.onTouchEnd}
      >
        {/* Drop shadow */}
        <div
          className="absolute inset-0 rounded-full pointer-events-none"
          style={{
            boxShadow: `0 24px 64px rgba(0,0,0,0.65), 0 0 48px ${glowColor}22`,
            transition: 'box-shadow 0.8s ease',
          }}
        />

        {/* ── Sphere body (blink scaleY here) ── */}
        <div
          className="absolute inset-0 rounded-full overflow-hidden will-change-transform"
          style={{
            transform: `scaleY(${blinkScaleY})`,
            transition: blinkTransition,
            /* 3-D look: light from top-left */
            background: `
              radial-gradient(ellipse 65% 55% at 38% 28%,
                #3c3c3c 0%, #1c1c1c 30%, #0e0e0e 60%, #050505 100%)
            `,
            boxShadow: `
              inset 0  28px 56px rgba(255,255,255,0.04),
              inset 0 -28px 56px rgba(0,0,0,0.85),
              inset -16px 0 36px rgba(0,0,0,0.55),
              inset  16px 0 36px rgba(0,0,0,0.35)
            `,
          }}
        >
          {/* Grid / tile panel lines */}
          <svg
            className="absolute inset-0 w-full h-full pointer-events-none"
            viewBox="0 0 200 200"
            preserveAspectRatio="xMidYMid slice"
            style={{ opacity: 0.13, mixBlendMode: 'screen' }}
            aria-hidden
          >
            <defs>
              <mask id="em-circle">
                <radialGradient id="em-fade" cx="50%" cy="50%" r="50%">
                  <stop offset="0%"  stopColor="white" stopOpacity="1" />
                  <stop offset="75%" stopColor="white" stopOpacity="0.6" />
                  <stop offset="100%" stopColor="white" stopOpacity="0" />
                </radialGradient>
                <circle cx="100" cy="100" r="99" fill="url(#em-fade)" />
              </mask>
            </defs>
            <g mask="url(#em-circle)">
              {Array.from({ length: 11 }, (_, i) => {
                const v = ((i + 1) * 200) / 12;
                return (
                  <g key={i}>
                    <line x1="0" y1={v}   x2="200" y2={v}   stroke="white" strokeWidth="0.7" />
                    <line x1={v} y1="0"   x2={v}   y2="200" stroke="white" strokeWidth="0.7" />
                  </g>
                );
              })}
            </g>
          </svg>

          {/* Specular highlight */}
          <div
            className="absolute rounded-full pointer-events-none"
            style={{
              width: '38%', height: '26%', top: '7%', left: '11%',
              background: 'radial-gradient(ellipse, rgba(255,255,255,0.14) 0%, transparent 70%)',
              filter: 'blur(5px)',
            }}
          />

          {/* ── Reactor core (parallax shift via ref) ── */}
          <div className="absolute inset-0 flex items-center justify-center">
            <div
              ref={reactorRef}
              className="relative will-change-transform"
              style={{ width: '56%', height: '56%', transition: 'transform 0.09s ease-out' }}
            >
              {/* Ambient behind rings */}
              <div
                className="absolute inset-0 rounded-full"
                style={{
                  background: `radial-gradient(circle, ${glowColor}50 0%, ${glowColor}18 45%, transparent 70%)`,
                  filter: 'blur(8px)',
                  transition: 'background 0.8s ease',
                }}
              />

              {/* SVG rings + core */}
              <svg
                viewBox="0 0 100 100"
                className="absolute inset-0 w-full h-full"
                style={{ overflow: 'visible' }}
                aria-hidden
              >
                <defs>
                  <filter id="em-glow" x="-50%" y="-50%" width="200%" height="200%">
                    <feGaussianBlur stdDeviation="1.4" result="b" />
                    <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
                  </filter>
                </defs>

                {/* Concentric rings — outermost to innermost */}
                {[{ r: 47, w: 1.2, op: 0.25 }, { r: 40, w: 1.6, op: 0.40 },
                  { r: 33, w: 2.0, op: 0.60 }, { r: 26, w: 2.4, op: 0.80 },
                  { r: 19, w: 2.8, op: 1.00 }].map(({ r, w, op }) => (
                  <circle
                    key={r}
                    cx="50" cy="50" r={r}
                    fill="none"
                    stroke={glowColor}
                    strokeWidth={w}
                    strokeOpacity={op}
                    filter="url(#em-glow)"
                  />
                ))}

                {/* Tick marks on middle ring */}
                {TICKS.map((t, i) => (
                  <line
                    key={i}
                    x1={t.x1} y1={t.y1} x2={t.x2} y2={t.y2}
                    stroke={glowColor} strokeWidth="1.6" strokeOpacity="0.85"
                    filter="url(#em-glow)"
                  />
                ))}

                {/* Filled glow zone */}
                <circle cx="50" cy="50" r="34" fill={glowColor} fillOpacity="0.07" />

                {/* Core orb */}
                <circle cx="50" cy="50" r="11" fill={glowColor} fillOpacity="0.88" filter="url(#em-glow)" />
                {/* Core highlight */}
                <circle cx="46" cy="46" r="4.5" fill="rgba(255,225,160,0.92)" filter="url(#em-glow)" />
              </svg>
            </div>
          </div>

          {/* Depth vignette (edge darkening) */}
          <div
            className="absolute inset-0 rounded-full pointer-events-none"
            style={{
              background:
                'radial-gradient(circle at 50% 50%, transparent 48%, rgba(0,0,0,0.78) 100%)',
            }}
          />
        </div>
      </div>

      {/* Emotion label */}
      <AnimatePresence>
        {emotion !== 'calm' && (
          <motion.div
            initial={{ opacity: 0, y: -5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -5 }}
            transition={{ delay: 0.3, duration: 0.2 }}
            className="absolute -bottom-6 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded-full bg-background/80 backdrop-blur-sm border border-border/50"
          >
            <span className="text-[10px] font-medium text-muted-foreground flex items-center gap-1 whitespace-nowrap">
              <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: emotionConfig?.color }} />
              {emotion.charAt(0).toUpperCase() + emotion.slice(1)}
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Particles */}
      {performanceConfig.enableParticles && !isDeepIdle && (
        <EyeParticles
          isActive
          size={eyeSize}
          glowColor={glowColor}
          activityLevel={activityLevel}
          emotion={emotion}
          particleType={emotionConfig?.particleType === 'none' ? 'sparkle' : emotionConfig?.particleType}
          isAbsorbing={isAbsorbing}
          isPulsing={isPulsing}
          performanceMultiplier={performanceConfig.particleMultiplier}
        />
      )}
    </div>
  );
};

export const EmotionalEye = memo(EmotionalEyeComponent);
