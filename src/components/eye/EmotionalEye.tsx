import { useEffect, useState, useRef, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { useAYNEmotion } from '@/stores/emotionStore';
import { useDebugStore } from '@/stores/debugStore';
import { useIdleDetection } from '@/hooks/useIdleDetection';
import { useEyeGestures } from '@/hooks/useEyeGestures';
import { usePerformanceMode } from '@/hooks/usePerformanceMode';
import { EyeParticles } from './EyeParticles';
import { ThinkingDots } from './ThinkingDots';
import { useIsMobile } from '@/hooks/use-mobile';
import { HELMET_FRAMES, FRAME_COUNT } from '@/assets/helmet-frames';

// The fully assembled 3D object from the landing page
const ASSEMBLED_SPHERE = HELMET_FRAMES[FRAME_COUNT - 1];

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

const EmotionalEyeComponent = ({
  size = 'lg',
  className,
}: EmotionalEyeProps) => {
  const {
    emotionConfig, emotion,
    isAbsorbing, isResponding,
    isSurprised, isPulsing, activityLevel,
  } = useAYNEmotion();

  const debugIsEnabled = useDebugStore((s) => s.isDebugMode);
  const [isHovered, setIsHovered] = useState(false);

  const isMobile         = useIsMobile();
  const performanceConfig = usePerformanceMode();
  const { isDeepIdle }   = useIdleDetection({ idleThreshold: 15, deepIdleThreshold: 30 });
  const { isSquished, handlers: gestureHandlers } = useEyeGestures();

  /* ── Direct-DOM refs for mouse animation (no state updates) ── */
  const sphereRef    = useRef<HTMLDivElement>(null);
  const rafRef       = useRef<number | null>(null);
  const mouseNorm    = useRef({ x: 0, y: 0 }); // -1..1

  /* ── Performant mouse tracking — direct DOM, RAF-throttled ── */
  useEffect(() => {
    if (isMobile || performanceConfig.shouldReduceAnimations || isDeepIdle) return;

    const applyTransforms = () => {
      rafRef.current = null;
      const { x, y } = mouseNorm.current;
      // 3D Parallax tilt using hardware acceleration
      if (sphereRef.current) {
        sphereRef.current.style.transform =
          `perspective(1000px) rotateY(${x * 12}deg) rotateX(${-y * 12}deg) translateZ(10px)`;
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

  /* ── Activity breathing speed ── */
  const BREATHING: Record<string, number> = { idle: 1.2, low: 1.0, medium: 0.8, high: 0.6 };
  const breathDur = (emotionConfig?.breathingSpeed ?? 3) * (BREATHING[safeActivityLevel] ?? 1);

  if (debugIsEnabled) useDebugStore.getState().incrementRenderCount('EmotionalEye');

  // Interactive scaling
  const scale = isSurprised ? 1.08 : isSquished ? 0.94 : 1;

  return (
    <div className={cn('relative flex items-center justify-center overflow-visible', className)}>

      {/* Thinking dots */}
      <ThinkingDots
        isVisible={isResponding && !performanceConfig.shouldReduceAnimations}
        color={glowColor}
        size={eyeSize}
      />

      {/* Outer ambient halo matched to the emotion */}
      <div
        className="absolute inset-0 rounded-full pointer-events-none scale-125"
        style={{
          background: `radial-gradient(circle, ${glowColor}25 0%, ${glowColor}0a 50%, transparent 75%)`,
          filter: 'blur(16px)',
          transition: 'background 0.9s ease',
          animationDuration: `${breathDur}s`,
        }}
      />

      {/* ── 3D Sphere wrapper ── */}
      <motion.div
        animate={{ scale }}
        transition={{ type: 'spring', stiffness: 400, damping: 25 }}
        className="relative z-10"
      >
        <div
          ref={sphereRef}
          className={cn('relative cursor-pointer select-none will-change-transform flex items-center justify-center', SIZE_MAP[size].cls)}
          style={{ transformStyle: 'preserve-3d', transition: 'transform 0.15s ease-out' }}
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => { setIsHovered(false); gestureHandlers.onMouseLeave(); }}
          onClick={gestureHandlers.onClick}
          onDoubleClick={gestureHandlers.onDoubleClick}
          onMouseDown={gestureHandlers.onMouseDown}
          onMouseUp={gestureHandlers.onMouseUp}
          onTouchStart={gestureHandlers.onTouchStart}
          onTouchEnd={gestureHandlers.onTouchEnd}
        >
          {/* High-quality 3D rendered frame asset */}
          <img
            src={ASSEMBLED_SPHERE}
            alt="AYN Brain"
            draggable={false}
            className="w-full h-full object-contain drop-shadow-2xl"
            style={{ 
              filter: `drop-shadow(0 20px 30px rgba(0,0,0,0.5)) drop-shadow(0 0 40px ${glowColor}30)` 
            }}
          />
        </div>
      </motion.div>

      {/* Emotion label */}
      <AnimatePresence>
        {emotion !== 'calm' && (
          <motion.div
            initial={{ opacity: 0, y: -5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -5 }}
            transition={{ delay: 0.3, duration: 0.2 }}
            className="absolute -bottom-6 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded-full bg-background/80 backdrop-blur-sm border border-border/50 z-20"
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
