import { useEffect, useState, useRef, memo, useMemo } from 'react';
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

// 3D Imports
import { Canvas, useFrame } from '@react-three/fiber';
import { Environment, Sphere, Torus } from '@react-three/drei';
import * as THREE from 'three';

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

/* ── Lightweight 3D Scene ── */
function EyeScene({ mouseNorm, glowColor, isPulsing, isBlinking, isAbsorbing }: any) {
  const groupRef = useRef<THREE.Group>(null);
  const coreRef = useRef<THREE.Mesh>(null);
  const ringsRef = useRef<THREE.Group>(null);
  
  // Safely parse colors. Fallback to orange if invalid.
  const color = useMemo(() => {
    try { return new THREE.Color(glowColor); } catch { return new THREE.Color('#ffaa00'); }
  }, [glowColor]);
  
  const coreColor = useMemo(() => {
    try { return new THREE.Color(glowColor).multiplyScalar(1.5); } catch { return new THREE.Color('#ffcc00'); }
  }, [glowColor]);

  useFrame((state, delta) => {
    if (groupRef.current) {
      // Smooth tracking towards mouse pointer
      const targetX = -mouseNorm.current.y * 0.6; // look up/down
      const targetY = mouseNorm.current.x * 0.6;  // look left/right
      
      groupRef.current.rotation.x = THREE.MathUtils.damp(groupRef.current.rotation.x, targetX, 5, delta);
      groupRef.current.rotation.y = THREE.MathUtils.damp(groupRef.current.rotation.y, targetY, 5, delta);
      
      // Gentle floating animation
      groupRef.current.position.y = Math.sin(state.clock.elapsedTime * 2) * 0.05;
    }
    
    // Core pulsing & blinking logic
    if (coreRef.current) {
      const baseScale = isPulsing ? 1 + Math.sin(state.clock.elapsedTime * 8) * 0.15 : 1;
      const blinkScale = isBlinking ? 0.01 : 1; // shrink to almost nothing on blink
      const absorbScale = isAbsorbing ? 0.8 : 1;
      coreRef.current.scale.setScalar(THREE.MathUtils.damp(coreRef.current.scale.x, baseScale * blinkScale * absorbScale, 15, delta));
    }
    
    // Rotate rings slowly
    if (ringsRef.current) {
      ringsRef.current.rotation.z -= delta * 0.2;
    }
  });

  return (
    <>
      <Environment preset="studio" />
      <ambientLight intensity={0.3} />
      <directionalLight position={[5, 10, 5]} intensity={1.5} />
      <directionalLight position={[-5, 5, -5]} intensity={0.5} color="#5555ff" />
      
      <group ref={groupRef} scale={[1.4, 1.4, 1.4]}>
        
        {/* Outer Shell - Glossy Black Sphere */}
        <Sphere args={[1.8, 64, 64]}>
          <meshPhysicalMaterial 
            color="#020202"
            metalness={0.9}
            roughness={0.08}
            clearcoat={1}
            clearcoatRoughness={0.05}
          />
        </Sphere>
        
        {/* Subtle Sci-Fi Grid Overlay (Panel lines) */}
        <Sphere args={[1.805, 12, 12]}>
          <meshBasicMaterial color="#1a1a1a" wireframe transparent opacity={0.3} />
        </Sphere>

        {/* The Eye / Reactor Core Group */}
        <group position={[0, 0, 1.45]}>
          
          {/* Deep black cavity background */}
          <Sphere args={[0.95, 32, 32]} position={[0, 0, 0]} scale={[1, 1, 0.3]}>
             <meshBasicMaterial color="#000000" />
          </Sphere>

          {/* Inner Glowing Core */}
          <Sphere ref={coreRef} args={[0.25, 32, 32]} position={[0, 0, 0.45]}>
            <meshBasicMaterial color={coreColor} />
          </Sphere>
          
          {/* Faked Bloom / Soft Glow (highly performant, no post-processing) */}
          <Sphere args={[0.45, 32, 32]} position={[0, 0, 0.4]}>
            <meshBasicMaterial color={color} transparent opacity={0.3} blending={THREE.AdditiveBlending} depthWrite={false} />
          </Sphere>
          <Sphere args={[0.65, 32, 32]} position={[0, 0, 0.35]}>
            <meshBasicMaterial color={color} transparent opacity={0.15} blending={THREE.AdditiveBlending} depthWrite={false} />
          </Sphere>

          {/* Concentric Glowing Rings */}
          <group ref={ringsRef}>
            <Torus args={[0.45, 0.015, 16, 64]} position={[0, 0, 0.3]}>
              <meshBasicMaterial color={coreColor} />
            </Torus>
            <Torus args={[0.6, 0.025, 16, 64]} position={[0, 0, 0.25]}>
              <meshBasicMaterial color={color} />
            </Torus>
            <Torus args={[0.75, 0.015, 16, 64]} position={[0, 0, 0.2]}>
              <meshBasicMaterial color={coreColor} transparent opacity={0.8} />
            </Torus>
          </group>
          
          {/* Outer glossy rim matching the shell */}
          <Torus args={[0.95, 0.15, 32, 64]} position={[0, 0, 0.1]}>
            <meshPhysicalMaterial 
              color="#030303"
              metalness={0.9}
              roughness={0.1}
              clearcoat={1}
            />
          </Torus>
        </group>
      </group>
    </>
  );
}

const EmotionalEyeComponent = ({
  size = 'lg',
  className,
  blinkPattern = 'normal'
}: EmotionalEyeProps) => {
  const {
    emotionConfig, emotion,
    isAbsorbing, isBlinking, triggerBlink, isResponding,
    isUserTyping, isAttentive, isSurprised,
    isPulsing, activityLevel,
  } = useAYNEmotion();

  const debugIsEnabled = useDebugStore((s) => s.isDebugMode);
  const soundContext   = useSoundStore();
  const [isHovered, setIsHovered] = useState(false);

  const isMobile         = useIsMobile();
  const performanceConfig = usePerformanceMode();
  const { isDeepIdle }   = useIdleDetection({ idleThreshold: 15, deepIdleThreshold: 30 });
  const { isSquished, handlers: gestureHandlers } = useEyeGestures();

  /* ── Mouse Tracking Refs ── */
  const mouseNorm = useRef({ x: 0, y: 0 }); // -1..1

  /* ── Blink Tracking ── */
  const lastBlinkRef = useRef(Date.now());
  const idleBlinkIntervalRef = useRef<NodeJS.Timeout | null>(null);

  /* ── Auto Blinking Logic ── */
  useEffect(() => {
    if (idleBlinkIntervalRef.current) { clearInterval(idleBlinkIntervalRef.current); idleBlinkIntervalRef.current = null; }
    const schedule = () => {
      idleBlinkIntervalRef.current = setTimeout(() => {
        if (!isAbsorbing && !isAttentive) {
          const now = Date.now();
          if (now - lastBlinkRef.current > 500) {
            triggerBlink(); 
            if (soundContext?.playInstant) soundContext.playInstant('blink');
            lastBlinkRef.current = now;
            if (blinkPattern === 'double-understanding') setTimeout(() => triggerBlink(), 200);
          }
        }
        schedule();
      }, 3000 + Math.random() * 2000);
    };
    schedule();
    return () => { if (idleBlinkIntervalRef.current) clearTimeout(idleBlinkIntervalRef.current); };
  }, [isAbsorbing, isAttentive, triggerBlink, blinkPattern, soundContext]);

  /* ── Mouse Listener ── */
  useEffect(() => {
    if (isMobile || performanceConfig.shouldReduceAnimations || isDeepIdle) return;

    const onMove = (e: MouseEvent) => {
      mouseNorm.current = {
        x: (e.clientX / window.innerWidth)  * 2 - 1,
        y: (e.clientY / window.innerHeight) * 2 - 1,
      };
    };

    const onLeave = () => { mouseNorm.current = { x: 0, y: 0 }; };

    window.addEventListener('mousemove', onMove,  { passive: true });
    window.addEventListener('mouseleave', onLeave);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseleave', onLeave);
    };
  }, [isMobile, performanceConfig.shouldReduceAnimations, isDeepIdle]);

  const safeActivityLevel = activityLevel || 'idle';
  const glowColor = emotionConfig?.glowColor || 'hsl(35, 95%, 55%)';
  const eyeSize   = SIZE_MAP[size].px;

  if (debugIsEnabled) useDebugStore.getState().incrementRenderCount('EmotionalEye');

  return (
    <div className={cn('relative flex items-center justify-center overflow-visible', className)}>
      {/* Thinking dots */}
      <ThinkingDots
        isVisible={isResponding && !performanceConfig.shouldReduceAnimations}
        color={glowColor}
        size={eyeSize}
      />

      {/* 3D Scene Container */}
      <motion.div
        animate={{ scale: isSurprised ? 1.08 : isSquished ? 0.94 : 1 }}
        transition={{ type: 'spring', stiffness: 400, damping: 25 }}
        className={cn('relative z-10 will-change-transform cursor-pointer', SIZE_MAP[size].cls)}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => { setIsHovered(false); gestureHandlers.onMouseLeave(); }}
        onClick={gestureHandlers.onClick}
        onDoubleClick={gestureHandlers.onDoubleClick}
        onMouseDown={gestureHandlers.onMouseDown}
        onMouseUp={gestureHandlers.onMouseUp}
        onTouchStart={gestureHandlers.onTouchStart}
        onTouchEnd={gestureHandlers.onTouchEnd}
      >
        <Canvas 
          camera={{ position: [0, 0, 5], fov: 45 }}
          gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
          className="pointer-events-none drop-shadow-2xl"
          style={{ filter: `drop-shadow(0 0 20px ${glowColor}30)` }}
        >
          <EyeScene 
            mouseNorm={mouseNorm} 
            glowColor={glowColor}
            isPulsing={isPulsing}
            isBlinking={isBlinking}
            isAbsorbing={isAbsorbing}
          />
        </Canvas>
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
