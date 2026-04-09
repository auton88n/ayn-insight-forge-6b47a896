import { useEffect, useState, useRef, useCallback, memo } from 'react';
import { motion, AnimatePresence, useMotionValue, useSpring, useTransform } from 'framer-motion';
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

// AI-powered empathy response types
export type PupilReaction = 'normal' | 'dilate-slightly' | 'dilate-more' | 'contract';
export type BlinkPattern = 'normal' | 'slow-comfort' | 'quick-attentive' | 'double-understanding';

interface EmotionalEyeProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  gazeTarget?: { x: number; y: number } | null;
  // AI empathy micro-behaviors
  pupilReaction?: PupilReaction;
  blinkPattern?: BlinkPattern;
  colorIntensity?: number;
}

const EmotionalEyeComponent = ({ 
  size = 'lg', 
  className, 
  gazeTarget, 
  pupilReaction = 'normal',
  blinkPattern = 'normal',
  colorIntensity = 0.5
}: EmotionalEyeProps) => {
  const { 
    emotionConfig,
    emotion,
    emotionSource,
    setEmotionWithSource,
    isAbsorbing, 
    isBlinking, 
    triggerBlink, 
    isResponding,
    isUserTyping,
    isAttentive,
    lastActivityTime,
    isSurprised,
    triggerSurprise,
    isPulsing,
    triggerPulse,
    isWinking,
    activityLevel,
  } = useAYNEmotion();
  const soundContext = useSoundStore();
  const debugIsEnabled = useDebugStore((s) => s.isDebugMode);
  const [isHovered, setIsHovered] = useState(false);
  const lastBlinkRef = useRef(Date.now());
  const idleBlinkIntervalRef = useRef<NodeJS.Timeout | null>(null);
  
  const prevBlinkingRef = useRef(false);
  // Track if current blink is "significant" (user-triggered) vs idle blink
  const isSignificantBlinkRef = useRef(false);
  const isMobile = useIsMobile();
  
  // Debug render logging - only count, don't trigger re-renders
  if (debugIsEnabled) {
    useDebugStore.getState().incrementRenderCount('EmotionalEye');
  }
  
  // Performance optimizations - centralized config
  const performanceConfig = usePerformanceMode();
  const { isDeepIdle } = useIdleDetection({ idleThreshold: 15, deepIdleThreshold: 30 });
  
  // Eye gestures for click interactions
  const { isSquished, handlers: gestureHandlers } = useEyeGestures();

  // Simplified gaze tracking - single combined motion value
  const gazeX = useMotionValue(0);
  const gazeY = useMotionValue(0);
  
  // Single optimized spring for all gaze movements - high damping for fast settling
  const smoothGazeX = useSpring(gazeX, { damping: 60, stiffness: 200, mass: 0.5 });
  const smoothGazeY = useSpring(gazeY, { damping: 60, stiffness: 200, mass: 0.5 });

  // Activity-based glow intensity multipliers
  const ACTIVITY_GLOW = {
    idle: 0.3,
    low: 0.45,
    medium: 0.6,
    high: 0.8,
  };
  
  const baseGlowIntensity = ACTIVITY_GLOW[activityLevel];
  const glowIntensity = baseGlowIntensity;

  // Play blink sounds ONLY for significant blinks (user-triggered, not idle)
  useEffect(() => {
    if (isBlinking && !prevBlinkingRef.current) {
      // Only play sound for significant blinks (user interactions, attention)
      if (isSignificantBlinkRef.current && soundContext?.playInstant) {
        soundContext.playInstant('blink');
      }
    } else if (!isBlinking && prevBlinkingRef.current) {
      // Sound for eye opening - only for significant blinks
      if (isSignificantBlinkRef.current && soundContext?.playInstant) {
        soundContext.playInstant('blink-open');
      }
      // Reset significant flag after blink completes
      isSignificantBlinkRef.current = false;
    }
    prevBlinkingRef.current = isBlinking;
  }, [isBlinking, soundContext]);

  // Unified gaze tracking - combines mouse, AI target, and typing state
  useEffect(() => {
    // Skip mouse tracking if disabled, deep idle, or mobile (touch devices don't benefit)
    if (!performanceConfig.enableMouseTracking || isDeepIdle || performanceConfig.shouldReduceAnimations || isMobile) {
      gazeX.set(0);
      gazeY.set(0);
      return;
    }
    
    let rafId: number | null = null;
    let lastX = 0;
    let lastY = 0;
    const throttleMs = performanceConfig.mouseTrackingThrottle;
    let lastUpdate = 0;

    function onMove(e: MouseEvent) {
      const now = Date.now();
      if (now - lastUpdate < throttleMs) return;
      
      if (rafId !== null) return;
      
      rafId = requestAnimationFrame(() => {
        const cx = window.innerWidth / 2;
        const cy = window.innerHeight / 2;
        const newX = (e.clientX - cx) * 0.01;
        const newY = (e.clientY - cy) * 0.01;
        
        // Only update if moved significantly (reduces repaints)
        if (Math.abs(newX - lastX) > 0.5 || Math.abs(newY - lastY) > 0.5) {
          gazeX.set(newX);
          gazeY.set(newY);
          lastX = newX;
          lastY = newY;
          lastUpdate = now;
        }
        rafId = null;
      });
    }

    function onLeave() {
      gazeX.set(0);
      gazeY.set(0);
    }

    window.addEventListener('mousemove', onMove, { passive: true });
    window.addEventListener('mouseleave', onLeave);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseleave', onLeave);
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
  }, [gazeX, gazeY, performanceConfig.enableMouseTracking, performanceConfig.mouseTrackingThrottle, performanceConfig.shouldReduceAnimations, isDeepIdle, isMobile]);

  // AI gaze towards suggestions or input field
  useEffect(() => {
    if (isUserTyping) {
      // Look slightly down toward input field when user is typing
      gazeX.set(0);
      gazeY.set(4); // Subtle downward gaze toward input
    } else if (gazeTarget && !isResponding) {
      gazeX.set(gazeTarget.x * 0.5);
      gazeY.set(gazeTarget.y * 0.2);
    }
  }, [gazeTarget, isUserTyping, isResponding, gazeX, gazeY]);


  // Track typing state for contextual blinks (no sounds - visual only)
  const typingStartRef = useRef<number | null>(null);
  const pauseBlinkTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Track when user starts/stops typing for contextual blinks (silent)
  useEffect(() => {
    if (isUserTyping) {
      if (!typingStartRef.current) {
        typingStartRef.current = Date.now();
      }
      
      // Clear any pending pause blink
      if (pauseBlinkTimeoutRef.current) {
        clearTimeout(pauseBlinkTimeoutRef.current);
        pauseBlinkTimeoutRef.current = null;
      }
    } else if (typingStartRef.current) {
      // User stopped typing - trigger quick attentive blink after short pause (silent)
      const typingDuration = Date.now() - typingStartRef.current;
      typingStartRef.current = null;
      
      // Quick attentive blink when user pauses (visual only, no sound)
      pauseBlinkTimeoutRef.current = setTimeout(() => {
        if (!isAbsorbing && !isResponding) {
          triggerBlink();
          
          // Double blink for long typing sessions (visual only)
          if (typingDuration > 3000) {
            setTimeout(() => triggerBlink(), 250);
          }
        }
      }, 300 + Math.random() * 200);
    }
    
    return () => {
      if (pauseBlinkTimeoutRef.current) {
        clearTimeout(pauseBlinkTimeoutRef.current);
      }
    };
  }, [isUserTyping, isAbsorbing, isResponding, triggerBlink]);

  // Get blink frequency based on AI empathy pattern or state
  const getBlinkInterval = useCallback(() => {
    // AI empathy blink patterns take priority
    switch (blinkPattern) {
      case 'slow-comfort':
        // Slow, gentle blinks for comfort/empathy
        return 4000 + Math.random() * 2000; // 4-6 seconds
      case 'quick-attentive':
        // Quick, alert blinks showing attention
        return 1200 + Math.random() * 600; // 1.2-1.8 seconds
      case 'double-understanding':
        // Normal timing, double blink handled separately
        return 2500 + Math.random() * 1000;
      case 'normal':
      default:
        break; // Fall through to other logic
    }
    
    // During active typing - much slower blinks (AYN is focused on reading)
    if (isUserTyping) {
      const typingDuration = typingStartRef.current ? Date.now() - typingStartRef.current : 0;
      if (typingDuration > 5000) {
        return 6000 + Math.random() * 2000;
      } else if (typingDuration > 2000) {
        return 4500 + Math.random() * 1500;
      }
      return 3500 + Math.random() * 1000;
    }
    
    // While responding - quick blinks
    if (isResponding) return 800 + Math.random() * 400;
    
    // Idle state - frequent natural blinks
    return 3000 + Math.random() * 1500;
  }, [isUserTyping, isResponding, blinkPattern]);

  // Idle blinking effect (silent - no sounds for idle blinks)
  useEffect(() => {
    if (idleBlinkIntervalRef.current) {
      clearInterval(idleBlinkIntervalRef.current);
      idleBlinkIntervalRef.current = null;
    }

    const scheduleNextBlink = () => {
      const interval = getBlinkInterval();
      if (interval === null) return;

      idleBlinkIntervalRef.current = setTimeout(() => {
        if (!isAbsorbing && !isAttentive) {
          const now = Date.now();
          if (now - lastBlinkRef.current > 500) {
            // Idle blinks are silent (isSignificantBlinkRef stays false)
            triggerBlink();
            lastBlinkRef.current = now;
            
            // Double blink for AI empathy patterns (also silent)
            if (blinkPattern === 'double-understanding') {
              setTimeout(() => triggerBlink(), 200);
            }
          }
        }
        scheduleNextBlink();
      }, interval);
    };

    scheduleNextBlink();

    return () => {
      if (idleBlinkIntervalRef.current) {
        clearTimeout(idleBlinkIntervalRef.current);
      }
    };
  }, [isAbsorbing, isAttentive, getBlinkInterval, triggerBlink, blinkPattern]);

  // "Check-in" blink removed for performance (minimal visual benefit, fires every 10s)

  // Get tilt based on emotion - simplified, no micro-movements
  const getEmotionTilt = useCallback(() => {
    switch (emotion) {
      case 'curious': return 3;
      case 'thinking': return -2;
      case 'happy': return 1;
      default: return 0;
    }
  }, [emotion]);

  // Head tilt based on emotion - CSS transition instead of spring
  const emotionTilt = getEmotionTilt();

  const sizeClasses = {
    sm: 'w-[100px] h-[100px] md:w-[120px] md:h-[120px]',
    md: 'w-[140px] h-[140px] md:w-[180px] md:h-[180px]',
    lg: 'w-[160px] h-[160px] md:w-[220px] md:h-[220px] lg:w-[260px] lg:h-[260px]',
  };

  // Activity-based pupil dilation bonus
  const ACTIVITY_PUPIL_BONUS = {
    idle: 0,
    low: 1,
    medium: 2,
    high: 4,
  };

  // Calculate iris radius based on AI pupil reaction, behavior state, or current state
  const getIrisRadius = () => {
    const activityBonus = ACTIVITY_PUPIL_BONUS[activityLevel];
    
    // AI empathy pupil reactions take highest priority
    switch (pupilReaction) {
      case 'dilate-more':
        return 36 + activityBonus; // Very engaged/emotional
      case 'dilate-slightly':
        return 32 + activityBonus; // Attentive/interested
      case 'contract':
        return 20; // Focused/analytical - no bonus
      case 'normal':
      default:
        break; // Fall through to other logic
    }
    
    // Default state-based calculation with activity bonus
    if (isAbsorbing) return 16;
    if (isAttentive) return 34 + activityBonus;
    if (isUserTyping) return 32 + activityBonus;
    if (isResponding) return 30 + activityBonus;
    if (isBlinking) return 28;
    if (isHovered) return 30 + activityBonus;
    return 28 + activityBonus;
  };

  const irisRadius = getIrisRadius() || 28; // Fallback to prevent undefined
  
  // Activity-based breathing speed multipliers (lower = faster)
  const ACTIVITY_BREATHING_MULT = {
    idle: 1.2,    // Slower, relaxed
    low: 1.0,     // Normal
    medium: 0.8,  // Slightly faster
    high: 0.6,    // Quick, energetic
  };
  const breathingDuration = emotionConfig.breathingSpeed * ACTIVITY_BREATHING_MULT[activityLevel];

  // Activity-based saturation boost (percentage increase)
  const ACTIVITY_SATURATION_BOOST = {
    idle: 0,
    low: 5,
    medium: 12,
    high: 20,
  };
  const saturationBoost = ACTIVITY_SATURATION_BOOST[activityLevel];

  // Helper to boost HSL saturation
  const boostSaturation = (hslColor: string, boostPercent: number): string => {
    // Parse HSL color like "hsl(210, 60%, 50%)" or "210 60% 50%"
    const match = hslColor.match(/(\d+)[,\s]+(\d+)%[,\s]+(\d+)%/);
    if (!match) return hslColor;
    const [, h, s, l] = match;
    const newSat = Math.min(100, parseInt(s) + boostPercent);
    return `hsl(${h}, ${newSat}%, ${l}%)`;
  };

  // Apply saturation boost to colors
  const boostedGlowColor = boostSaturation(emotionConfig.glowColor, saturationBoost);
  const boostedColor = boostSaturation(emotionConfig.color, saturationBoost);

  // Calculate eye size for particles
  const eyeSizeMap = { sm: 120, md: 180, lg: 260 };
  const eyeSize = eyeSizeMap[size];

  return (
    <div className={cn("relative flex items-center justify-center overflow-visible", className)}>
      {/* Thinking dots when processing */}
      <ThinkingDots 
        isVisible={isResponding && !performanceConfig.shouldReduceAnimations} 
        color={emotionConfig.glowColor}
        size={eyeSize}
      />
      
      <motion.div
        style={{ 
          x: smoothGazeX, 
          y: smoothGazeY, 
          rotate: emotionTilt,
          willChange: 'transform',
          transform: 'translateZ(0)', // GPU acceleration
        }}
        className="relative z-10 flex items-center justify-center group cursor-pointer overflow-visible"
        initial={{ opacity: 0, y: 8 }}
        animate={{ 
          scale: isSurprised ? 1.1 : isSquished ? 0.92 : 1, 
          opacity: 1,
          y: 0
        }}
        transition={{ 
          opacity: { duration: 0.3, ease: [0.25, 0.1, 0.25, 1] },
          y: { duration: 0.35, ease: [0.25, 0.1, 0.25, 1] },
          scale: { duration: isSurprised ? 0.15 : isSquished ? 0.08 : 0.4, ease: [0.25, 0.1, 0.25, 1] }
        }}
        layout={false}
        onMouseEnter={() => setIsHovered(true)} 
        onMouseLeave={() => { setIsHovered(false); gestureHandlers.onMouseLeave(); }}
        onClick={gestureHandlers.onClick}
        onDoubleClick={gestureHandlers.onDoubleClick}
        onMouseDown={gestureHandlers.onMouseDown}
        onMouseUp={gestureHandlers.onMouseUp}
        onTouchStart={gestureHandlers.onTouchStart}
        onTouchEnd={gestureHandlers.onTouchEnd}
      >
        {/* Soft outer glow halo - syncs with breathing */}
        <motion.div 
          className="absolute -inset-8 rounded-full pointer-events-none animate-glow-breathe"
          style={{
            background: `radial-gradient(circle, ${boostedGlowColor}40 0%, ${boostedGlowColor}20 30%, ${boostedGlowColor}08 55%, transparent 75%)`,
            transition: 'background 0.8s cubic-bezier(0.4, 0, 0.2, 1)',
            '--breathing-duration': `${breathingDuration}s`,
          } as React.CSSProperties}
        />
        
        <div 
          className={cn(
            "relative rounded-full flex items-center justify-center overflow-hidden will-change-transform",
            sizeClasses[size],
            !performanceConfig.shouldReduceAnimations && "animate-eye-breathe"
          )}
          style={{
            '--breathing-duration': `${breathingDuration}s`,
            animationDuration: `${breathingDuration}s`
          } as React.CSSProperties}
        >
          {/* Concentric rings — matching Hero landing page eye */}
          <div className="absolute inset-0 rounded-full bg-[hsl(var(--muted)/0.3)] shadow-[inset_0_4px_24px_rgba(0,0,0,0.15)] dark:bg-[hsl(0,0%,12%)] dark:shadow-[inset_0_4px_24px_rgba(0,0,0,0.5)]" />
          <div className="absolute inset-[8%] rounded-full bg-[hsl(var(--muted)/0.5)] dark:bg-[hsl(0,0%,14%)]" />
          <div className="absolute inset-[16%] rounded-full bg-[hsl(var(--muted)/0.7)] dark:bg-[hsl(0,0%,16%)]" />
          <div className="absolute inset-[24%] rounded-full bg-card shadow-[inset_0_4px_16px_rgba(0,0,0,0.06)] dark:shadow-[inset_0_4px_16px_rgba(0,0,0,0.3)]" />
          <div className="absolute inset-[32%] rounded-full bg-muted" />

          {/* Emotional color ring - always visible with emotion color for engagement */}
          <motion.div 
            className="absolute inset-[15%] rounded-full"
            animate={{ 
              scale: isPulsing ? [1, 1.06, 1] : [1, 1.01, 1],
            }}
            transition={{ 
              scale: isPulsing 
                ? { duration: 0.35, ease: [0.25, 0.1, 0.25, 1] }
                : { duration: 2.5, repeat: Infinity, ease: "easeInOut" }
            }}
            style={{
              backgroundColor: boostedGlowColor,
              boxShadow: `0 0 20px ${boostedGlowColor}70, inset 0 0 10px ${boostedGlowColor}40`,
              transition: 'background-color 0.8s cubic-bezier(0.4, 0, 0.2, 1), box-shadow 0.8s cubic-bezier(0.4, 0, 0.2, 1)',
            }}
          />

          {/* SVG with pupil and brain - optimized transitions */}
          <motion.svg 
            viewBox="0 0 100 100" 
            className="w-[70%] h-[70%] relative z-10"
            xmlns="http://www.w3.org/2000/svg" 
            animate={{
              scaleY: isBlinking ? 0.05 : isSquished ? 0.75 : 1,
              scaleX: isWinking ? 0.88 : isSquished ? 1.08 : 1,
              opacity: isBlinking ? 0.8 : 1,
              skewX: isWinking ? 4 : 0,
            }} 
            transition={{
              duration: isBlinking ? 0.15 : isWinking ? 0.1 : 0.12,
              ease: [0.4, 0, 0.2, 1]
            }}
            style={{
              transformOrigin: 'center center',
              willChange: 'transform'
            }}
          >
            {/* Sclera gradient removed to eliminate border lines */}

            {/* Solid black pupil with breathing dilation sync */}
            <motion.circle 
              cx="50" 
              cy="50" 
              r={irisRadius}
              fill="#000000"
              animate={{
                r: performanceConfig.shouldReduceAnimations 
                  ? irisRadius 
                  : [irisRadius, irisRadius * 1.06, irisRadius], // 6% dilation with breath
              }}
              transition={{
                r: {
                  duration: breathingDuration,
                  repeat: Infinity,
                  ease: "easeInOut",
                },
              }}
              style={{
                // Faster transitions for state changes override breathing
                transition: isAbsorbing 
                  ? "r 0.15s cubic-bezier(0.55, 0.055, 0.675, 0.19)" 
                  : isAttentive
                    ? "r 0.25s cubic-bezier(0.34, 1.56, 0.64, 1)"
                    : isBlinking 
                      ? "r 0.08s cubic-bezier(0.55, 0.055, 0.675, 0.19)" 
                      : undefined // Let framer-motion handle breathing
              }} 
            />
              
            {/* Pure SVG Brain icon - Safari compatible (no foreignObject) */}
            {(() => {
              const brainScale = (irisRadius * 0.7) / 24;
              const strokeColor = emotion === 'calm' ? '#FFFFFF' : boostedColor;
              const pathStyle = { transition: 'stroke 0.8s cubic-bezier(0.4, 0, 0.2, 1)' };
              return (
                <g 
                  transform={`translate(${50 - 12 * brainScale}, ${50 - 12 * brainScale}) scale(${brainScale})`}
                  style={{
                    transition: isAbsorbing 
                      ? "all 0.15s cubic-bezier(0.55, 0.055, 0.675, 0.19)" 
                      : isAttentive
                        ? "all 0.25s cubic-bezier(0.34, 1.56, 0.64, 1)"
                        : isBlinking 
                          ? "all 0.08s cubic-bezier(0.55, 0.055, 0.675, 0.19)" 
                          : "all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)",
                    opacity: 0.92,
                    filter: emotion !== 'calm' ? `drop-shadow(0 0 6px ${boostedColor}30)` : 'none'
                  }}
                >
                  <path d="M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z" stroke={strokeColor} strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" style={pathStyle} />
                  <path d="M12 5a3 3 0 1 1 5.997.125 4 4 0 0 1 2.526 5.77 4 4 0 0 1-.556 6.588A4 4 0 1 1 12 18Z" stroke={strokeColor} strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" style={pathStyle} />
                  <path d="M15 13a4.5 4.5 0 0 1-3-4 4.5 4.5 0 0 1-3 4" stroke={strokeColor} strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" style={pathStyle} />
                  <path d="M17.599 6.5a3 3 0 0 0 .399-1.375" stroke={strokeColor} strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" style={pathStyle} />
                  <path d="M6.003 5.125A3 3 0 0 0 6.401 6.5" stroke={strokeColor} strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" style={pathStyle} />
                  <path d="M3.477 10.896a4 4 0 0 1 .585-.396" stroke={strokeColor} strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" style={pathStyle} />
                  <path d="M19.938 10.5a4 4 0 0 1 .585.396" stroke={strokeColor} strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" style={pathStyle} />
                  <path d="M6 18a4 4 0 0 1-1.967-.516" stroke={strokeColor} strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" style={pathStyle} />
                  <path d="M19.967 17.484A4 4 0 0 1 18 18" stroke={strokeColor} strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" style={pathStyle} />
                </g>
              );
            })()}
          </motion.svg>
        </div>
        
        {/* Particle effects - disabled when deep idle or reduced animations */}
        {performanceConfig.enableParticles && !isDeepIdle && (
          <EyeParticles 
            isActive={true}
            size={eyeSize}
            glowColor={boostedGlowColor}
            activityLevel={activityLevel}
            emotion={emotion}
            particleType={emotionConfig.particleType === 'none' ? 'sparkle' : emotionConfig.particleType}
            isAbsorbing={isAbsorbing}
            isPulsing={isPulsing}
            performanceMultiplier={performanceConfig.particleMultiplier}
          />
        )}
        
        {/* Emotion Label - shows current emotion state */}
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
                <span 
                  className="w-1.5 h-1.5 rounded-full" 
                  style={{ backgroundColor: emotionConfig.color }}
                />
                {emotion.charAt(0).toUpperCase() + emotion.slice(1)}
              </span>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
};

// Memoize the component to prevent unnecessary re-renders
export const EmotionalEye = memo(EmotionalEyeComponent);
