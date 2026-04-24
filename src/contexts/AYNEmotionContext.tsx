import React, { createContext, useContext, useState, useCallback, ReactNode, useRef, useMemo, useEffect } from 'react';
import { hapticFeedback } from '@/lib/haptics';

export type AYNEmotion = 'calm' | 'happy' | 'excited' | 'thinking' | 'frustrated' | 'curious' | 'sad' | 'mad' | 'bored' | 'comfort' | 'supportive';
export type EmotionSource = 'content' | 'behavior' | 'response' | 'default';

export interface EmotionConfig {
  color: string;
  glowColor: string;
  ringClass: string;
  glowClass: string;
  irisScale: number;
  breathingSpeed: number;
  particleType: 'sparkle' | 'orbit' | 'energy' | 'none';
  transitionMs: number; // Sync with sound duration
}

export const EMOTION_CONFIGS: Record<AYNEmotion, EmotionConfig> = {
  // 😌 Soft Ocean Blue - peaceful, balanced like still water
  calm: {
    color: 'hsl(193, 38%, 47%)',      // #4A90A4
    glowColor: 'hsl(193, 45%, 60%)',
    ringClass: 'ring-cyan-400/40 dark:ring-cyan-400/35',
    glowClass: 'shadow-[0_0_50px_hsl(193,38%,47%,0.45)] dark:shadow-[0_0_60px_hsl(193,45%,50%,0.5)]',
    irisScale: 1,
    breathingSpeed: 5.5,  // Slow, peaceful breathing
    particleType: 'sparkle',
    transitionMs: 600,
  },
  // 🤗 Deep Warm Rose - nurturing warmth for empathy
  comfort: {
    color: 'hsl(349, 49%, 69%)',      // #D98695
    glowColor: 'hsl(349, 55%, 78%)',
    ringClass: 'ring-rose-300/40 dark:ring-rose-400/35',
    glowClass: 'shadow-[0_0_50px_hsl(349,49%,69%,0.45)] dark:shadow-[0_0_60px_hsl(349,55%,65%,0.5)]',
    irisScale: 1.02,
    breathingSpeed: 4.5,  // Warm, soothing breathing
    particleType: 'sparkle',
    transitionMs: 700,
  },
  // 💪 Soft Rose-Beige - supportive encouragement
  supportive: {
    color: 'hsl(10, 61%, 78%)',       // #E8A598
    glowColor: 'hsl(10, 65%, 85%)',
    ringClass: 'ring-orange-200/40 dark:ring-orange-300/35',
    glowClass: 'shadow-[0_0_45px_hsl(10,61%,78%,0.4)] dark:shadow-[0_0_55px_hsl(10,65%,75%,0.45)]',
    irisScale: 1.05,
    breathingSpeed: 4,
    particleType: 'sparkle',
    transitionMs: 600,
  },
  // 😊 Warm Peach-Gold - sunshine, joy, warmth
  happy: {
    color: 'hsl(36, 100%, 65%)',      // #FFB84D
    glowColor: 'hsl(36, 100%, 75%)',
    ringClass: 'ring-amber-400/50 dark:ring-amber-400/45',
    glowClass: 'shadow-[0_0_50px_hsl(36,100%,65%,0.5)] dark:shadow-[0_0_60px_hsl(36,100%,60%,0.5)]',
    irisScale: 1.05,
    breathingSpeed: 3.5,  // Content, relaxed
    particleType: 'sparkle',
    transitionMs: 500,
  },
  // 🤩 Electric Coral - energy, enthusiasm
  excited: {
    color: 'hsl(0, 100%, 67%)',       // #FF5757
    glowColor: 'hsl(0, 100%, 80%)',
    ringClass: 'ring-red-400/50 dark:ring-red-400/45',
    glowClass: 'shadow-[0_0_60px_hsl(0,100%,67%,0.55)] dark:shadow-[0_0_70px_hsl(0,100%,60%,0.55)]',
    irisScale: 1.15,
    breathingSpeed: 2,    // Fast, energetic
    particleType: 'energy',
    transitionMs: 400,
  },
  // 🤔 Royal Indigo - deep contemplation
  thinking: {
    color: 'hsl(239, 82%, 61%)',      // #4B4DED
    glowColor: 'hsl(239, 85%, 75%)',
    ringClass: 'ring-indigo-500/50 dark:ring-indigo-400/45',
    glowClass: 'shadow-[0_0_50px_hsl(239,82%,61%,0.5)] dark:shadow-[0_0_60px_hsl(239,85%,55%,0.5)]',
    irisScale: 0.85,
    breathingSpeed: 3,    // Alert, engaged
    particleType: 'orbit',
    transitionMs: 600,
  },
  // 😤 Hot Orange-Red - tension without aggression
  frustrated: {
    color: 'hsl(6, 78%, 57%)',        // #E74C3C
    glowColor: 'hsl(6, 80%, 70%)',
    ringClass: 'ring-red-500/40 dark:ring-red-500/35',
    glowClass: 'shadow-[0_0_45px_hsl(6,78%,57%,0.4)] dark:shadow-[0_0_55px_hsl(6,80%,50%,0.45)]',
    irisScale: 0.9,
    breathingSpeed: 1.8,  // Quick, tense
    particleType: 'energy',
    transitionMs: 500,
  },
  // 🧐 Bright Magenta - wonder, exploration
  curious: {
    color: 'hsl(282, 56%, 62%)',      // #B565D8
    glowColor: 'hsl(282, 60%, 75%)',
    ringClass: 'ring-purple-400/45 dark:ring-purple-400/40',
    glowClass: 'shadow-[0_0_50px_hsl(282,56%,62%,0.45)] dark:shadow-[0_0_60px_hsl(282,60%,55%,0.5)]',
    irisScale: 1.1,
    breathingSpeed: 2.8,  // Alert, exploratory
    particleType: 'sparkle',
    transitionMs: 500,
  },
  // 😢 Muted Lavender - melancholy, understanding
  sad: {
    color: 'hsl(271, 11%, 59%)',      // #9B8FA6
    glowColor: 'hsl(271, 15%, 70%)',
    ringClass: 'ring-purple-300/30 dark:ring-purple-300/25',
    glowClass: 'shadow-[0_0_35px_hsl(271,11%,59%,0.3)] dark:shadow-[0_0_45px_hsl(271,15%,55%,0.35)]',
    irisScale: 0.9,
    breathingSpeed: 6,    // Slow, subdued
    particleType: 'orbit',
    transitionMs: 800,
  },
  // 😠 Deep Crimson - intensity, distinct from frustrated
  mad: {
    color: 'hsl(354, 80%, 42%)',      // #C21626
    glowColor: 'hsl(354, 85%, 55%)',
    ringClass: 'ring-red-700/50 dark:ring-red-600/45',
    glowClass: 'shadow-[0_0_50px_hsl(354,80%,42%,0.5)] dark:shadow-[0_0_60px_hsl(354,85%,40%,0.5)]',
    irisScale: 0.8,
    breathingSpeed: 1.5,  // Rapid, intense
    particleType: 'energy',
    transitionMs: 400,
  },
  // 😑 Muted Slate-Blue - low energy but present
  bored: {
    color: 'hsl(197, 9%, 58%)',       // #8A979C
    glowColor: 'hsl(197, 12%, 68%)',
    ringClass: 'ring-slate-400/25 dark:ring-slate-400/20',
    glowClass: 'shadow-[0_0_25px_hsl(197,9%,58%,0.2)] dark:shadow-[0_0_35px_hsl(197,12%,55%,0.25)]',
    irisScale: 0.95,
    breathingSpeed: 7,    // Very slow, lethargic
    particleType: 'orbit',
    transitionMs: 700,
  },
};

// Keywords that trigger excitement/surprise reaction
const EXCITING_KEYWORDS = [
  'amazing', 'incredible', 'perfect', 'excellent', 'brilliant', 'fantastic',
  'wow', 'awesome', 'great', 'success', 'achievement', 'breakthrough',
  'important', 'urgent', 'critical', 'milestone', 'winner', 'congratulations',
  'exciting', 'love', 'best', 'outstanding', 'exceptional', 'remarkable',
  'رائع', 'ممتاز', 'مذهل', 'عظيم', 'مبروك', 'نجاح', 'إنجاز'
];

// Activity level for dynamic particle behavior
export type ActivityLevel = 'idle' | 'low' | 'medium' | 'high';

interface AYNEmotionContextType {
  emotion: AYNEmotion;
  emotionSource: EmotionSource;
  emotionConfig: EmotionConfig;
  setEmotion: (emotion: AYNEmotion) => void;
  setEmotionWithSource: (emotion: AYNEmotion, source: EmotionSource) => void;
  isAbsorbing: boolean;
  triggerAbsorption: () => void;
  isBlinking: boolean;
  triggerBlink: () => void;
  isResponding: boolean;
  setIsResponding: (responding: boolean) => void;
  // New smart life states
  isUserTyping: boolean;
  setIsUserTyping: (typing: boolean) => void;
  isAttentive: boolean;
  setIsAttentive: (attentive: boolean) => void;
  triggerAttentionBlink: () => void;
  lastActivityTime: number;
  updateActivity: () => void;
  // Surprise/excitement reaction
  isSurprised: boolean;
  triggerSurprise: () => void;
  detectExcitement: (text: string) => boolean;
  // Pulse effect for new messages
  isPulsing: boolean;
  triggerPulse: () => void;
  // Wink interaction
  isWinking: boolean;
  triggerWink: () => void;
  // Empathy responses to user emotions
  triggerEmpathyBlink: () => void;
  triggerEmpathyPulse: () => void;
  // Dynamic activity level for particles
  activityLevel: ActivityLevel;
  bumpActivity: () => void;
}

const AYNEmotionContext = createContext<AYNEmotionContextType | undefined>(undefined);

export const AYNEmotionProvider = ({ children }: { children: ReactNode }) => {
  const [emotion, setEmotionState] = useState<AYNEmotion>('calm');
  const [emotionSource, setEmotionSource] = useState<EmotionSource>('default');
  const [isAbsorbing, setIsAbsorbing] = useState(false);
  const [isBlinking, setIsBlinking] = useState(false);
  const [isResponding, setIsResponding] = useState(false);
  const [isUserTyping, setIsUserTyping] = useState(false);
  const [isAttentive, setIsAttentive] = useState(false);
  const [lastActivityTime, setLastActivityTime] = useState(Date.now());
  const [isSurprised, setIsSurprised] = useState(false);
  const [isPulsing, setIsPulsing] = useState(false);
  const [isWinking, setIsWinking] = useState(false);
  const [activityLevel, setActivityLevel] = useState<ActivityLevel>('idle');
  const activityCountRef = useRef(0);
  const activityDecayRef = useRef<NodeJS.Timeout | null>(null);
  const blinkTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const surpriseTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pulseTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const winkTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Cleanup all timeout refs on unmount to prevent memory leaks
  useEffect(() => {
    return () => {
      if (activityDecayRef.current) clearTimeout(activityDecayRef.current);
      if (blinkTimeoutRef.current) clearTimeout(blinkTimeoutRef.current);
      if (surpriseTimeoutRef.current) clearTimeout(surpriseTimeoutRef.current);
      if (pulseTimeoutRef.current) clearTimeout(pulseTimeoutRef.current);
      if (winkTimeoutRef.current) clearTimeout(winkTimeoutRef.current);
    };
  }, []);

  // Bump activity when messages sent/received or typing
  const bumpActivity = useCallback(() => {
    activityCountRef.current = Math.min(activityCountRef.current + 1, 10);
    
    // Map activity count to level
    if (activityCountRef.current >= 7) {
      setActivityLevel('high');
    } else if (activityCountRef.current >= 4) {
      setActivityLevel('medium');
    } else if (activityCountRef.current >= 1) {
      setActivityLevel('low');
    }
    
    // Clear existing decay timer
    if (activityDecayRef.current) {
      clearTimeout(activityDecayRef.current);
    }
    
    // Start decay - activity decreases over time
    activityDecayRef.current = setTimeout(function decayActivity() {
      activityCountRef.current = Math.max(0, activityCountRef.current - 1);
      
      if (activityCountRef.current >= 7) {
        setActivityLevel('high');
      } else if (activityCountRef.current >= 4) {
        setActivityLevel('medium');
      } else if (activityCountRef.current >= 1) {
        setActivityLevel('low');
      } else {
        setActivityLevel('idle');
      }
      
      if (activityCountRef.current > 0) {
        activityDecayRef.current = setTimeout(decayActivity, 3000);
      }
    }, 5000);
  }, []);

  const setEmotionWithSource = useCallback((newEmotion: AYNEmotion, source: EmotionSource) => {
    // ONLY set emotion state - haptic is handled EXCLUSIVELY by useEmotionOrchestrator
    // This prevents duplicate haptic triggers
    setEmotionState(newEmotion);
    setEmotionSource(source);
  }, []);

  const setEmotion = useCallback((newEmotion: AYNEmotion) => {
    // Default to 'response' source for backward compatibility
    setEmotionWithSource(newEmotion, 'response');
  }, [setEmotionWithSource]);

  const triggerAbsorption = useCallback(() => {
    setIsAbsorbing(true);
    hapticFeedback('light'); // Subtle feedback when message absorbed
    setTimeout(() => setIsAbsorbing(false), 300);
  }, []);

  const triggerBlink = useCallback(() => {
    setIsBlinking(true);
    // 180ms gives eye time to fully close (150ms) + brief hold before opening
    setTimeout(() => setIsBlinking(false), 180);
  }, []);

  // Double-blink for attention (when user starts typing)
  const triggerAttentionBlink = useCallback(() => {
    // Clear any existing blink timeout
    if (blinkTimeoutRef.current) {
      clearTimeout(blinkTimeoutRef.current);
    }
    
    // First blink
    setIsBlinking(true);
    setTimeout(() => {
      setIsBlinking(false);
      // Second blink after short pause
      blinkTimeoutRef.current = setTimeout(() => {
        setIsBlinking(true);
        setTimeout(() => setIsBlinking(false), 100);
      }, 150);
    }, 100);
  }, []);

  const updateActivity = useCallback(() => {
    setLastActivityTime(Date.now());
  }, []);

  // Trigger brief surprise/excitement enlargement
  const triggerSurprise = useCallback(() => {
    if (surpriseTimeoutRef.current) {
      clearTimeout(surpriseTimeoutRef.current);
    }
    setIsSurprised(true);
    hapticFeedback('excited'); // Two quick bursts for excitement
    surpriseTimeoutRef.current = setTimeout(() => {
      setIsSurprised(false);
    }, 600);
  }, []);

  // Detect exciting keywords in text
  const detectExcitement = useCallback((text: string): boolean => {
    const lowerText = text.toLowerCase();
    const hasExcitingKeyword = EXCITING_KEYWORDS.some(keyword => 
      lowerText.includes(keyword.toLowerCase())
    );
    if (hasExcitingKeyword) {
      triggerSurprise();
    }
    return hasExcitingKeyword;
  }, [triggerSurprise]);

  // Trigger pulse effect for new message receive
  const triggerPulse = useCallback(() => {
    if (pulseTimeoutRef.current) {
      clearTimeout(pulseTimeoutRef.current);
    }
    setIsPulsing(true);
    hapticFeedback('pulse'); // Subtle pulse for new message
    pulseTimeoutRef.current = setTimeout(() => {
      setIsPulsing(false);
    }, 400);
  }, []);

  // Empathetic response triggers - AYN responds to USER emotions
  const triggerEmpathyBlink = useCallback(() => {
    // Slow, understanding double-blink for when user is sad/anxious
    triggerBlink();
    setTimeout(() => triggerBlink(), 400);
  }, [triggerBlink]);

  const triggerEmpathyPulse = useCallback(() => {
    // Gentle pulse showing "I understand your feelings"
    hapticFeedback('empathy');
    triggerPulse();
  }, [triggerPulse]);

  // Trigger wink (asymmetric blink)
  const triggerWink = useCallback(() => {
    if (winkTimeoutRef.current) {
      clearTimeout(winkTimeoutRef.current);
    }
    setIsWinking(true);
    winkTimeoutRef.current = setTimeout(() => {
      setIsWinking(false);
    }, 250);
  }, []);

  // Memoize emotionConfig to prevent unnecessary re-renders
  const emotionConfig = useMemo(() => EMOTION_CONFIGS[emotion], [emotion]);

  return (
    <AYNEmotionContext.Provider
      value={{
        emotion,
        emotionSource,
        emotionConfig,
        setEmotion,
        setEmotionWithSource,
        isAbsorbing,
        triggerAbsorption,
        isBlinking,
        triggerBlink,
        isResponding,
        setIsResponding,
        isUserTyping,
        setIsUserTyping,
        isAttentive,
        setIsAttentive,
        triggerAttentionBlink,
        lastActivityTime,
        updateActivity,
        isSurprised,
        triggerSurprise,
        detectExcitement,
        isPulsing,
        triggerPulse,
        isWinking,
        triggerWink,
        triggerEmpathyBlink,
        triggerEmpathyPulse,
        activityLevel,
        bumpActivity,
      }}
    >
      {children}
    </AYNEmotionContext.Provider>
  );
};

export const useAYNEmotion = () => {
  const context = useContext(AYNEmotionContext);
  if (!context) {
    throw new Error('useAYNEmotion must be used within an AYNEmotionProvider');
  }
  return context;
};
