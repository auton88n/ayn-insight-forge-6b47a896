import { useState, useEffect, useMemo } from 'react';
import { useReducedMotion } from 'framer-motion';

interface PerformanceConfig {
  // Device capability detection
  isLowEndDevice: boolean;
  
  // Animation settings
  shouldReduceAnimations: boolean;
  particleMultiplier: number; // 0-1 scale
  maxConcurrentSprings: number;
  
  // Timing adjustments
  mouseTrackingThrottle: number; // ms
  microMovementInterval: number; // ms
  
  // Feature flags
  enableParticles: boolean;
  enableMicroMovements: boolean;
  enableMouseTracking: boolean;
  enableGlowEffects: boolean;
}

const detectDeviceCapability = (): boolean => {
  // Check hardware concurrency (CPU cores)
  const cores = navigator.hardwareConcurrency || 4;
  if (cores <= 2) return true;
  
  // Check device memory if available
  const memory = (navigator as any).deviceMemory;
  if (memory && memory <= 4) return true;
  
  // Check for mobile/tablet via user agent
  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  
  // Mobile with few cores is low-end
  if (isMobile && cores <= 4) return true;
  
  return false;
};

export const usePerformanceMode = (): PerformanceConfig => {
  const prefersReducedMotion = useReducedMotion();
  const [isLowEndDevice, setIsLowEndDevice] = useState(false);
  
  useEffect(() => {
    setIsLowEndDevice(detectDeviceCapability());
  }, []);
  
  const config = useMemo((): PerformanceConfig => {
    const shouldReduceAnimations = prefersReducedMotion || isLowEndDevice;
    
    if (prefersReducedMotion) {
      // User explicitly wants reduced motion - minimal animations
      return {
        isLowEndDevice,
        shouldReduceAnimations: true,
        particleMultiplier: 0,
        maxConcurrentSprings: 1,
        mouseTrackingThrottle: 200,
        microMovementInterval: 10000,
        enableParticles: false,
        enableMicroMovements: false,
        enableMouseTracking: false,
        enableGlowEffects: false,
      };
    }
    
    if (isLowEndDevice) {
      // Low-end device - reduce but don't eliminate
      return {
        isLowEndDevice: true,
        shouldReduceAnimations: true,
        particleMultiplier: 0.3,
        maxConcurrentSprings: 3,
        mouseTrackingThrottle: 100,
        microMovementInterval: 8000,
        enableParticles: true,
        enableMicroMovements: false,
        enableMouseTracking: true,
        enableGlowEffects: true,
      };
    }
    
    // High-end device - full animations
    return {
      isLowEndDevice: false,
      shouldReduceAnimations: false,
      particleMultiplier: 1,
      maxConcurrentSprings: 8,
      mouseTrackingThrottle: 16, // ~60fps
      microMovementInterval: 5000,
      enableParticles: true,
      enableMicroMovements: true,
      enableMouseTracking: true,
      enableGlowEffects: true,
    };
  }, [prefersReducedMotion, isLowEndDevice]);
  
  return config;
};
