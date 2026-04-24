import { create } from 'zustand';
import { hapticFeedback } from '@/lib/haptics';

// ── Types & Configs ──────────────────────────────────────────────────────────

export type AYNEmotion = 'calm' | 'happy' | 'excited' | 'thinking' | 'frustrated' | 'curious' | 'sad' | 'mad' | 'bored' | 'comfort' | 'supportive';
export type EmotionSource = 'content' | 'behavior' | 'response' | 'default';
export type ActivityLevel = 'idle' | 'low' | 'medium' | 'high';

export interface EmotionConfig {
  color: string;
  glowColor: string;
  ringClass: string;
  glowClass: string;
  irisScale: number;
  breathingSpeed: number;
  particleType: 'sparkle' | 'orbit' | 'energy' | 'none';
  transitionMs: number;
}

export const EMOTION_CONFIGS: Record<AYNEmotion, EmotionConfig> = {
  calm: {
    color: 'hsl(200, 60%, 55%)',
    glowColor: 'hsl(200, 65%, 65%)',
    ringClass: 'ring-sky-400/40 dark:ring-sky-400/35',
    glowClass: 'shadow-[0_0_50px_hsl(200,60%,55%,0.45)] dark:shadow-[0_0_60px_hsl(200,65%,50%,0.5)]',
    irisScale: 1,
    breathingSpeed: 5.5,
    particleType: 'sparkle',
    transitionMs: 600,
  },
  comfort: {
    color: 'hsl(25, 70%, 75%)',
    glowColor: 'hsl(25, 75%, 82%)',
    ringClass: 'ring-orange-200/40 dark:ring-orange-300/35',
    glowClass: 'shadow-[0_0_50px_hsl(25,70%,75%,0.45)] dark:shadow-[0_0_60px_hsl(25,75%,70%,0.5)]',
    irisScale: 1.02,
    breathingSpeed: 4.5,
    particleType: 'sparkle',
    transitionMs: 700,
  },
  supportive: {
    color: 'hsl(280, 45%, 75%)',
    glowColor: 'hsl(280, 50%, 82%)',
    ringClass: 'ring-purple-200/40 dark:ring-purple-300/35',
    glowClass: 'shadow-[0_0_45px_hsl(280,45%,75%,0.4)] dark:shadow-[0_0_55px_hsl(280,50%,70%,0.45)]',
    irisScale: 1.05,
    breathingSpeed: 4,
    particleType: 'sparkle',
    transitionMs: 600,
  },
  happy: {
    color: 'hsl(45, 95%, 60%)',
    glowColor: 'hsl(45, 100%, 72%)',
    ringClass: 'ring-yellow-400/50 dark:ring-yellow-400/45',
    glowClass: 'shadow-[0_0_50px_hsl(45,95%,60%,0.5)] dark:shadow-[0_0_60px_hsl(45,100%,55%,0.5)]',
    irisScale: 1.05,
    breathingSpeed: 3.5,
    particleType: 'sparkle',
    transitionMs: 500,
  },
  excited: {
    color: 'hsl(330, 85%, 60%)',
    glowColor: 'hsl(330, 90%, 72%)',
    ringClass: 'ring-pink-400/50 dark:ring-pink-400/45',
    glowClass: 'shadow-[0_0_60px_hsl(330,85%,60%,0.55)] dark:shadow-[0_0_70px_hsl(330,90%,55%,0.55)]',
    irisScale: 1.15,
    breathingSpeed: 2,
    particleType: 'energy',
    transitionMs: 400,
  },
  thinking: {
    color: 'hsl(250, 70%, 65%)',
    glowColor: 'hsl(250, 75%, 75%)',
    ringClass: 'ring-violet-500/50 dark:ring-violet-400/45',
    glowClass: 'shadow-[0_0_50px_hsl(250,70%,65%,0.5)] dark:shadow-[0_0_60px_hsl(250,75%,60%,0.5)]',
    irisScale: 0.85,
    breathingSpeed: 3,
    particleType: 'orbit',
    transitionMs: 600,
  },
  frustrated: {
    color: 'hsl(20, 70%, 50%)',
    glowColor: 'hsl(20, 75%, 62%)',
    ringClass: 'ring-orange-500/40 dark:ring-orange-500/35',
    glowClass: 'shadow-[0_0_45px_hsl(20,70%,50%,0.4)] dark:shadow-[0_0_55px_hsl(20,75%,45%,0.45)]',
    irisScale: 0.9,
    breathingSpeed: 1.8,
    particleType: 'energy',
    transitionMs: 500,
  },
  curious: {
    color: 'hsl(170, 60%, 50%)',
    glowColor: 'hsl(170, 65%, 62%)',
    ringClass: 'ring-teal-400/45 dark:ring-teal-400/40',
    glowClass: 'shadow-[0_0_50px_hsl(170,60%,50%,0.45)] dark:shadow-[0_0_60px_hsl(170,65%,45%,0.5)]',
    irisScale: 1.1,
    breathingSpeed: 2.8,
    particleType: 'sparkle',
    transitionMs: 500,
  },
  sad: {
    color: 'hsl(220, 40%, 50%)',
    glowColor: 'hsl(220, 45%, 62%)',
    ringClass: 'ring-blue-400/30 dark:ring-blue-400/25',
    glowClass: 'shadow-[0_0_35px_hsl(220,40%,50%,0.3)] dark:shadow-[0_0_45px_hsl(220,45%,45%,0.35)]',
    irisScale: 0.9,
    breathingSpeed: 6,
    particleType: 'orbit',
    transitionMs: 800,
  },
  mad: {
    color: 'hsl(354, 80%, 42%)',
    glowColor: 'hsl(354, 85%, 55%)',
    ringClass: 'ring-red-700/50 dark:ring-red-600/45',
    glowClass: 'shadow-[0_0_50px_hsl(354,80%,42%,0.5)] dark:shadow-[0_0_60px_hsl(354,85%,40%,0.5)]',
    irisScale: 0.8,
    breathingSpeed: 1.5,
    particleType: 'energy',
    transitionMs: 400,
  },
  bored: {
    color: 'hsl(200, 12%, 58%)',
    glowColor: 'hsl(200, 15%, 68%)',
    ringClass: 'ring-slate-400/25 dark:ring-slate-400/20',
    glowClass: 'shadow-[0_0_25px_hsl(200,12%,58%,0.2)] dark:shadow-[0_0_35px_hsl(200,15%,55%,0.25)]',
    irisScale: 0.95,
    breathingSpeed: 7,
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
  'رائع', 'ممتاز', 'مذهل', 'عظيم', 'مبروك', 'نجاح', 'إنجاز',
];

// ── Store Interface ──────────────────────────────────────────────────────────

interface EmotionStore {
  emotion: AYNEmotion;
  emotionSource: EmotionSource;
  emotionConfig: EmotionConfig;
  isAbsorbing: boolean;
  isBlinking: boolean;
  isResponding: boolean;
  isUserTyping: boolean;
  isAttentive: boolean;
  lastActivityTime: number;
  isSurprised: boolean;
  isPulsing: boolean;
  isWinking: boolean;
  activityLevel: ActivityLevel;

  setEmotion: (emotion: AYNEmotion) => void;
  setEmotionWithSource: (emotion: AYNEmotion, source: EmotionSource) => void;
  triggerAbsorption: () => void;
  triggerBlink: () => void;
  setIsResponding: (responding: boolean) => void;
  setIsUserTyping: (typing: boolean) => void;
  setIsAttentive: (attentive: boolean) => void;
  triggerAttentionBlink: () => void;
  updateActivity: () => void;
  triggerSurprise: () => void;
  detectExcitement: (text: string) => boolean;
  triggerPulse: () => void;
  triggerWink: () => void;
  triggerEmpathyBlink: () => void;
  triggerEmpathyPulse: () => void;
  bumpActivity: () => void;
}

// ── Internal timeout tracking ────────────────────────────────────────────────

let _activityCount = 0;
let _activityDecayTimer: ReturnType<typeof setTimeout> | null = null;
let _blinkTimer: ReturnType<typeof setTimeout> | null = null;
let _surpriseTimer: ReturnType<typeof setTimeout> | null = null;
let _pulseTimer: ReturnType<typeof setTimeout> | null = null;
let _winkTimer: ReturnType<typeof setTimeout> | null = null;
let _absorptionTimer: ReturnType<typeof setTimeout> | null = null;
let _blinkResetTimer: ReturnType<typeof setTimeout> | null = null;
let _empathyBlinkTimer: ReturnType<typeof setTimeout> | null = null;

// ── Store ────────────────────────────────────────────────────────────────────

export const useEmotionStore = create<EmotionStore>((set, get) => ({
  emotion: 'calm',
  emotionSource: 'default',
  emotionConfig: EMOTION_CONFIGS['calm'],
  isAbsorbing: false,
  isBlinking: false,
  isResponding: false,
  isUserTyping: false,
  isAttentive: false,
  lastActivityTime: Date.now(),
  isSurprised: false,
  isPulsing: false,
  isWinking: false,
  activityLevel: 'idle',

  setEmotion: (emotion) => {
    set({ emotion, emotionSource: 'response', emotionConfig: EMOTION_CONFIGS[emotion] });
  },

  setEmotionWithSource: (emotion, source) => {
    set({ emotion, emotionSource: source, emotionConfig: EMOTION_CONFIGS[emotion] });
  },

  triggerAbsorption: () => {
    if (_absorptionTimer) clearTimeout(_absorptionTimer);
    set({ isAbsorbing: true });
    hapticFeedback('light');
    _absorptionTimer = setTimeout(() => {
      set({ isAbsorbing: false });
      _absorptionTimer = null;
    }, 300);
  },

  triggerBlink: () => {
    if (_blinkResetTimer) clearTimeout(_blinkResetTimer);
    set({ isBlinking: true });
    _blinkResetTimer = setTimeout(() => {
      set({ isBlinking: false });
      _blinkResetTimer = null;
    }, 180);
  },

  setIsResponding: (responding) => set({ isResponding: responding }),
  setIsUserTyping: (typing) => set({ isUserTyping: typing }),
  setIsAttentive: (attentive) => set({ isAttentive: attentive }),

  triggerAttentionBlink: () => {
    if (_blinkTimer) clearTimeout(_blinkTimer);
    if (_blinkResetTimer) clearTimeout(_blinkResetTimer);
    set({ isBlinking: true });
    _blinkResetTimer = setTimeout(() => {
      set({ isBlinking: false });
      _blinkResetTimer = null;
      _blinkTimer = setTimeout(() => {
        set({ isBlinking: true });
        _blinkResetTimer = setTimeout(() => {
          set({ isBlinking: false });
          _blinkResetTimer = null;
        }, 100);
      }, 150);
    }, 100);
  },

  updateActivity: () => set({ lastActivityTime: Date.now() }),

  triggerSurprise: () => {
    if (_surpriseTimer) clearTimeout(_surpriseTimer);
    set({ isSurprised: true });
    hapticFeedback('excited');
    _surpriseTimer = setTimeout(() => set({ isSurprised: false }), 600);
  },

  detectExcitement: (text) => {
    const lowerText = text.toLowerCase();
    const hasExcitingKeyword = EXCITING_KEYWORDS.some((kw) =>
      lowerText.includes(kw.toLowerCase())
    );
    if (hasExcitingKeyword) {
      get().triggerSurprise();
    }
    return hasExcitingKeyword;
  },

  triggerPulse: () => {
    if (_pulseTimer) clearTimeout(_pulseTimer);
    set({ isPulsing: true });
    hapticFeedback('pulse');
    _pulseTimer = setTimeout(() => set({ isPulsing: false }), 400);
  },

  triggerWink: () => {
    if (_winkTimer) clearTimeout(_winkTimer);
    set({ isWinking: true });
    _winkTimer = setTimeout(() => set({ isWinking: false }), 250);
  },

  triggerEmpathyBlink: () => {
    if (_empathyBlinkTimer) clearTimeout(_empathyBlinkTimer);
    get().triggerBlink();
    _empathyBlinkTimer = setTimeout(() => {
      get().triggerBlink();
      _empathyBlinkTimer = null;
    }, 400);
  },

  triggerEmpathyPulse: () => {
    hapticFeedback('empathy');
    get().triggerPulse();
  },

  bumpActivity: () => {
    _activityCount = Math.min(_activityCount + 1, 10);

    const levelFromCount = (c: number): ActivityLevel =>
      c >= 7 ? 'high' : c >= 4 ? 'medium' : c >= 1 ? 'low' : 'idle';

    set({ activityLevel: levelFromCount(_activityCount) });

    if (_activityDecayTimer) clearTimeout(_activityDecayTimer);

    const decayActivity = () => {
      _activityCount = Math.max(0, _activityCount - 1);
      set({ activityLevel: levelFromCount(_activityCount) });
      if (_activityCount > 0) {
        _activityDecayTimer = setTimeout(decayActivity, 3000);
      }
    };

    _activityDecayTimer = setTimeout(decayActivity, 5000);
  },
}));

// ── Convenience hook (drop-in replacement for useAYNEmotion) ─────────────────

export const useAYNEmotion = () => useEmotionStore();
