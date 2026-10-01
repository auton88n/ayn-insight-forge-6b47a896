// Programmatic sound generation using Web Audio API
// Rich emotional sounds using multi-oscillator synthesis

export type SoundType = 
  // Mode sounds
  | 'mode-general' | 'mode-research' | 'mode-pdf' | 'mode-vision' | 'mode-civil'
  // Emotion sounds (handled separately with multi-note synthesis)
  | 'emotion-happy' | 'emotion-thinking' | 'emotion-excited' | 'emotion-curious' | 'emotion-frustrated' | 'emotion-calm'
  | 'emotion-sad' | 'emotion-mad' | 'emotion-bored' | 'emotion-comfort' | 'emotion-supportive'
  // Interaction sounds
  | 'message-send' | 'message-absorb' | 'response-received' | 'suggestion-click' | 'blink' | 'blink-open'
  // Conversational sounds
  | 'understanding' | 'empathy' | 'anticipation' | 'recognition' | 'comfort'
  // Typing context sounds
  | 'listening' | 'attentive-blink' | 'thoughtful-blink' | 'processing'
  // Feedback sounds
  | 'feedback-positive' | 'feedback-negative';

interface SoundConfig {
  type: OscillatorType;
  frequency: number;
  duration: number;
  gain: number;
  attack: number;
  decay: number;
  detune?: number;
  filterFreq?: number;
}

// New interface for rich emotion sounds
interface NoteConfig {
  frequency: number;
  delay: number;      // Start time offset in seconds
  duration: number;
  gain: number;
  type: OscillatorType;
  pitchBend?: { endFreq: number; duration: number };
  filterFreq?: number;
}

interface EmotionSoundConfig {
  notes: NoteConfig[];
  masterGain: number;
}

// Simple sounds for modes and interactions
const SOUND_CONFIGS: Record<string, SoundConfig> = {
  // Mode sounds - loud and distinct
  'mode-general': { type: 'sine', frequency: 440, duration: 0.15, gain: 0.25, attack: 0.01, decay: 0.14 },
  'mode-research': { type: 'triangle', frequency: 523, duration: 0.12, gain: 0.22, attack: 0.01, decay: 0.11, detune: 5 },
  'mode-pdf': { type: 'sine', frequency: 392, duration: 0.1, gain: 0.20, attack: 0.02, decay: 0.08 },
  'mode-vision': { type: 'sine', frequency: 587, duration: 0.18, gain: 0.22, attack: 0.01, decay: 0.17, filterFreq: 2000 },
  'mode-civil': { type: 'square', frequency: 330, duration: 0.08, gain: 0.15, attack: 0.01, decay: 0.07, filterFreq: 1500 },
  
  // Interaction sounds - clear and prominent
  'message-send': { type: 'sine', frequency: 880, duration: 0.1, gain: 0.22, attack: 0.01, decay: 0.09 },
  'message-absorb': { type: 'sine', frequency: 330, duration: 0.15, gain: 0.18, attack: 0.01, decay: 0.14 },
  'response-received': { type: 'sine', frequency: 659, duration: 0.12, gain: 0.25, attack: 0.01, decay: 0.11 },
  'suggestion-click': { type: 'sine', frequency: 740, duration: 0.06, gain: 0.20, attack: 0.005, decay: 0.055 },
  // Blink sounds - subtle but audible
  'blink': { type: 'sine', frequency: 200, duration: 0.18, gain: 0.06, attack: 0.08, decay: 0.10 },
  'blink-open': { type: 'sine', frequency: 240, duration: 0.06, gain: 0.04, attack: 0.01, decay: 0.05 },
  
  // Conversational sounds - clear and audible
  'understanding': { type: 'sine', frequency: 392, duration: 0.25, gain: 0.20, attack: 0.05, decay: 0.2, detune: 3 },
  'empathy': { type: 'sine', frequency: 294, duration: 0.35, gain: 0.20, attack: 0.08, decay: 0.27 },
  'anticipation': { type: 'sine', frequency: 440, duration: 0.15, gain: 0.18, attack: 0.02, decay: 0.13, detune: 8 },
  'recognition': { type: 'triangle', frequency: 523, duration: 0.1, gain: 0.18, attack: 0.01, decay: 0.09 },
  'comfort': { type: 'sine', frequency: 262, duration: 0.4, gain: 0.20, attack: 0.1, decay: 0.3 },
  
  // Typing context sounds - audible feedback
  'listening': { type: 'sine', frequency: 330, duration: 0.12, gain: 0.18, attack: 0.03, decay: 0.09 },
  'attentive-blink': { type: 'sine', frequency: 494, duration: 0.06, gain: 0.15, attack: 0.01, decay: 0.05 },
  'thoughtful-blink': { type: 'sine', frequency: 262, duration: 0.15, gain: 0.15, attack: 0.04, decay: 0.11 },
  'processing': { type: 'triangle', frequency: 370, duration: 0.2, gain: 0.18, attack: 0.05, decay: 0.15, detune: 5 },
};

// Rich multi-note emotion sounds
const EMOTION_SOUND_CONFIGS: Record<string, EmotionSoundConfig> = {
  // Happy - Warm, Uplifting Major Third (C5 → E5)
  'happy': {
    masterGain: 0.25,
    notes: [
      { frequency: 523, delay: 0, duration: 0.2, gain: 0.4, type: 'sine' },      // C5
      { frequency: 659, delay: 0.08, duration: 0.2, gain: 0.5, type: 'sine' },   // E5
    ]
  },
  
  // Sad - Descending Minor Second (D4 → Db4)
  'sad': {
    masterGain: 0.22,
    notes: [
      { frequency: 294, delay: 0, duration: 0.35, gain: 0.5, type: 'sine' },     // D4
      { frequency: 277, delay: 0.15, duration: 0.4, gain: 0.4, type: 'sine' },   // Db4
    ]
  },
  
  // Excited - Quick Ascending Major Arpeggio (C5 → E5 → G5)
  'excited': {
    masterGain: 0.28,
    notes: [
      { frequency: 523, delay: 0, duration: 0.12, gain: 0.4, type: 'sine' },     // C5
      { frequency: 659, delay: 0.06, duration: 0.12, gain: 0.45, type: 'sine' }, // E5
      { frequency: 784, delay: 0.12, duration: 0.15, gain: 0.5, type: 'sine' },  // G5
    ]
  },
  
  // Thinking - Pulsing Triangle with subtle vibrato effect
  'thinking': {
    masterGain: 0.2,
    notes: [
      { frequency: 349, delay: 0, duration: 0.15, gain: 0.5, type: 'triangle' },    // F4
      { frequency: 355, delay: 0.12, duration: 0.15, gain: 0.4, type: 'triangle' }, // Slightly sharp
      { frequency: 349, delay: 0.24, duration: 0.15, gain: 0.3, type: 'triangle' }, // Back to F4
    ]
  },
  
  // Curious - Rising Question Inflection (pitch bend 350 → 500 Hz)
  'curious': {
    masterGain: 0.24,
    notes: [
      { frequency: 350, delay: 0, duration: 0.25, gain: 0.5, type: 'sine', pitchBend: { endFreq: 500, duration: 0.25 } },
    ]
  },
  
  // Frustrated - Tense Minor Second Dissonance (A3 + Bb3)
  'frustrated': {
    masterGain: 0.2,
    notes: [
      { frequency: 220, delay: 0, duration: 0.18, gain: 0.45, type: 'triangle' },   // A3
      { frequency: 233, delay: 0, duration: 0.18, gain: 0.45, type: 'triangle' },   // Bb3
    ]
  },
  
  // Mad - Sharp Low Intensity (E2 with filtered square)
  'mad': {
    masterGain: 0.22,
    notes: [
      { frequency: 82, delay: 0, duration: 0.12, gain: 0.6, type: 'square', filterFreq: 800 },   // E2
      { frequency: 165, delay: 0.02, duration: 0.1, gain: 0.3, type: 'square', filterFreq: 600 }, // E3 overtone
    ]
  },
  
  // Bored - Yawn-like Slow Descent (200 → 150 Hz)
  'bored': {
    masterGain: 0.18,
    notes: [
      { frequency: 200, delay: 0, duration: 0.5, gain: 0.5, type: 'sine', pitchBend: { endFreq: 150, duration: 0.5 } },
    ]
  },
  
  // Calm - Soft Flowing Major Chord (C4 + E4 + G4)
  'calm': {
    masterGain: 0.18,
    notes: [
      { frequency: 262, delay: 0, duration: 0.35, gain: 0.35, type: 'sine' },    // C4
      { frequency: 330, delay: 0.02, duration: 0.35, gain: 0.35, type: 'sine' }, // E4
      { frequency: 392, delay: 0.04, duration: 0.35, gain: 0.3, type: 'sine' },  // G4
    ]
  },
  
  // Comfort - Warm Perfect Fifth (G3 + D4)
  'comfort': {
    masterGain: 0.22,
    notes: [
      { frequency: 196, delay: 0, duration: 0.4, gain: 0.45, type: 'sine' },     // G3
      { frequency: 294, delay: 0.05, duration: 0.4, gain: 0.45, type: 'sine' },  // D4
    ]
  },
  
  // Supportive - Gentle Ascending Steps (C4 → D4 → E4)
  'supportive': {
    masterGain: 0.22,
    notes: [
      { frequency: 262, delay: 0, duration: 0.12, gain: 0.4, type: 'sine' },     // C4
      { frequency: 294, delay: 0.1, duration: 0.12, gain: 0.45, type: 'sine' },  // D4
      { frequency: 330, delay: 0.2, duration: 0.15, gain: 0.5, type: 'sine' },   // E4
    ]
  },

  // Feedback Positive - Bright ascending chime (E5 → A5)
  'feedback-positive': {
    masterGain: 0.3,
    notes: [
      { frequency: 659, delay: 0, duration: 0.12, gain: 0.5, type: 'sine' },     // E5
      { frequency: 880, delay: 0.08, duration: 0.18, gain: 0.55, type: 'sine' }, // A5
    ]
  },

  // Feedback Negative - Gentle descending tone (D4 → Bb3)
  'feedback-negative': {
    masterGain: 0.22,
    notes: [
      { frequency: 294, delay: 0, duration: 0.2, gain: 0.45, type: 'sine' },     // D4
      { frequency: 233, delay: 0.1, duration: 0.3, gain: 0.35, type: 'sine' },   // Bb3
    ]
  },
};

// Global unlock state for iOS AudioContext
let globalUnlockPromise: Promise<void> | null = null;
let isUnlocked = false;

// Unlock AudioContext on first user interaction (required for iOS/Safari)
const unlockAudioContext = (audioContext: AudioContext): Promise<void> => {
  if (isUnlocked || audioContext.state === 'running') {
    isUnlocked = true;
    return Promise.resolve();
  }
  
  if (globalUnlockPromise) return globalUnlockPromise;
  
  globalUnlockPromise = new Promise((resolve) => {
    const unlock = () => {
      if (isUnlocked) {
        resolve();
        return;
      }
      
      // Resume context
      audioContext.resume().then(() => {
        // Play silent buffer to fully unlock on iOS
        const buffer = audioContext.createBuffer(1, 1, 22050);
        const source = audioContext.createBufferSource();
        source.buffer = buffer;
        source.connect(audioContext.destination);
        source.start(0);
        
        isUnlocked = true;
        
        // Remove listeners after unlock
        document.removeEventListener('touchstart', unlock, true);
        document.removeEventListener('touchend', unlock, true);
        document.removeEventListener('mousedown', unlock, true);
        document.removeEventListener('keydown', unlock, true);
        
        resolve();
      }).catch(() => {
        // Retry on next interaction
      });
    };
    
    // Listen for first user interaction
    document.addEventListener('touchstart', unlock, true);
    document.addEventListener('touchend', unlock, true);
    document.addEventListener('mousedown', unlock, true);
    document.addEventListener('keydown', unlock, true);
    
    // Try immediately in case already interacted
    unlock();
  });
  
  return globalUnlockPromise;
};

export class SoundGenerator {
  private audioContext: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private volume: number = 0.5;
  private enabled: boolean = true;
  private unlockPromise: Promise<void> | null = null;

  constructor() {
    this.initAudioContext();
  }

  private initAudioContext(): void {
    if (typeof window === 'undefined') return;
    
    try {
      // Use webkitAudioContext for older Safari
      const AudioContextClass = window.AudioContext || 
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      
      this.audioContext = new AudioContextClass();
      this.masterGain = this.audioContext.createGain();
      this.masterGain.gain.value = this.volume;
      this.masterGain.connect(this.audioContext.destination);
      
      // Start unlock process for iOS
      this.unlockPromise = unlockAudioContext(this.audioContext);
    } catch {
      // Web Audio API not supported - fail silently
    }
  }

  private async ensureContext(): Promise<boolean> {
    if (!this.audioContext) return false;
    
    // Wait for unlock on iOS
    if (this.unlockPromise) {
      await this.unlockPromise;
    }
    
    if (this.audioContext.state === 'suspended') {
      try {
        await this.audioContext.resume();
      } catch {
        return false;
      }
    }
    
    return this.audioContext.state === 'running';
  }

  setVolume(volume: number): void {
    this.volume = Math.max(0, Math.min(1, volume));
    if (this.masterGain) {
      this.masterGain.gain.value = this.volume;
    }
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  async play(soundType: SoundType): Promise<void> {
    if (!this.enabled || !this.audioContext || !this.masterGain) {
      return;
    }
    
    // Respect reduced motion preference
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    
    // Ensure context is unlocked and running
    const isReady = await this.ensureContext();
    if (!isReady || !this.audioContext) {
      return;
    }
    
    const config = SOUND_CONFIGS[soundType];
    if (!config) return;

    const now = this.audioContext.currentTime;
    
    // Create oscillator
    const oscillator = this.audioContext.createOscillator();
    oscillator.type = config.type;
    oscillator.frequency.value = config.frequency;
    if (config.detune) {
      oscillator.detune.value = config.detune;
    }
    
    // Create gain for envelope
    const gainNode = this.audioContext.createGain();
    gainNode.gain.setValueAtTime(0, now);
    gainNode.gain.linearRampToValueAtTime(config.gain, now + config.attack);
    gainNode.gain.exponentialRampToValueAtTime(0.001, now + config.duration);
    
    // Optional filter for softer sounds
    if (config.filterFreq) {
      const filter = this.audioContext.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = config.filterFreq;
      oscillator.connect(filter);
      filter.connect(gainNode);
    } else {
      oscillator.connect(gainNode);
    }
    
    gainNode.connect(this.masterGain);
    
    oscillator.start(now);
    oscillator.stop(now + config.duration);
    
    // Cleanup
    oscillator.onended = () => {
      oscillator.disconnect();
      gainNode.disconnect();
    };
  }

  // Play rich multi-note emotion sounds
  private playEmotionChord(config: EmotionSoundConfig): void {
    if (!this.audioContext || !this.masterGain) return;
    
    const now = this.audioContext.currentTime;
    
    // Create a gain node for the entire emotion sound
    const emotionGain = this.audioContext.createGain();
    emotionGain.gain.value = config.masterGain;
    emotionGain.connect(this.masterGain);
    
    config.notes.forEach(note => {
      if (!this.audioContext) return;
      
      const startTime = now + note.delay;
      
      // Create oscillator for this note
      const oscillator = this.audioContext.createOscillator();
      oscillator.type = note.type;
      oscillator.frequency.setValueAtTime(note.frequency, startTime);
      
      // Apply pitch bend if specified
      if (note.pitchBend) {
        oscillator.frequency.linearRampToValueAtTime(
          note.pitchBend.endFreq, 
          startTime + note.pitchBend.duration
        );
      }
      
      // Create envelope for this note
      const noteGain = this.audioContext.createGain();
      const attackTime = note.duration * 0.1;
      const decayTime = note.duration * 0.9;
      
      noteGain.gain.setValueAtTime(0, startTime);
      noteGain.gain.linearRampToValueAtTime(note.gain, startTime + attackTime);
      noteGain.gain.exponentialRampToValueAtTime(0.001, startTime + attackTime + decayTime);
      
      // Optional filter
      if (note.filterFreq) {
        const filter = this.audioContext.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = note.filterFreq;
        oscillator.connect(filter);
        filter.connect(noteGain);
      } else {
        oscillator.connect(noteGain);
      }
      
      noteGain.connect(emotionGain);
      
      oscillator.start(startTime);
      oscillator.stop(startTime + note.duration + 0.1);
      
      // Cleanup
      oscillator.onended = () => {
        oscillator.disconnect();
        noteGain.disconnect();
      };
    });
    
    // Disconnect emotion gain after all notes finish
    const maxDuration = Math.max(...config.notes.map(n => n.delay + n.duration)) + 0.2;
    setTimeout(() => {
      emotionGain.disconnect();
    }, maxDuration * 1000);
  }

  // Synchronous instant play for time-critical sounds like blink (no await delay)
  playInstant(soundType: SoundType): void {
    if (!this.enabled || !this.audioContext || !this.masterGain) {
      return;
    }
    
    // Skip reduced motion check for essential feedback sounds
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    
    // If context is suspended, try to resume (fire-and-forget, don't wait)
    if (this.audioContext.state === 'suspended') {
      this.audioContext.resume();
    }
    
    // Don't check state - just try to play, Web Audio API handles gracefully
    const config = SOUND_CONFIGS[soundType];
    if (!config) return;
    
    try {
      const now = this.audioContext.currentTime;
      
      // Create oscillator
      const oscillator = this.audioContext.createOscillator();
      oscillator.type = config.type;
      oscillator.frequency.value = config.frequency;
      if (config.detune) {
        oscillator.detune.value = config.detune;
      }
      
      // Create gain for envelope
      const gainNode = this.audioContext.createGain();
      gainNode.gain.setValueAtTime(0, now);
      gainNode.gain.linearRampToValueAtTime(config.gain, now + config.attack);
      gainNode.gain.exponentialRampToValueAtTime(0.001, now + config.duration);
      
      // Optional filter for softer sounds
      if (config.filterFreq) {
        const filter = this.audioContext.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = config.filterFreq;
        oscillator.connect(filter);
        filter.connect(gainNode);
      } else {
        oscillator.connect(gainNode);
      }
      
      gainNode.connect(this.masterGain);
      
      oscillator.start(now);
      oscillator.stop(now + config.duration);
    
      // Cleanup
      oscillator.onended = () => {
        oscillator.disconnect();
        gainNode.disconnect();
      };
    } catch {
      // Silently fail if context not ready
    }
  }

  // Play a quick double tone for mode changes
  playModeChange(mode: string): void {
    const modeMap: Record<string, SoundType> = {
      'General': 'mode-general',
      'Research': 'mode-research',
      'PDF Analysis': 'mode-pdf',
      'Vision': 'mode-vision',
      'Civil Engineering': 'mode-civil',
    };
    
    const soundType = modeMap[mode] || 'mode-general';
    this.play(soundType);
  }

  // Play rich emotion-based sound with multi-note synthesis
  async playEmotion(emotion: string): Promise<void> {
    if (!this.enabled || !this.audioContext || !this.masterGain) {
      return;
    }
    
    // Respect reduced motion preference
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    
    // Ensure context is unlocked and running
    const isReady = await this.ensureContext();
    if (!isReady || !this.audioContext) {
      return;
    }
    
    const emotionConfig = EMOTION_SOUND_CONFIGS[emotion];
    if (emotionConfig) {
      this.playEmotionChord(emotionConfig);
    }
  }

  dispose(): void {
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
      this.masterGain = null;
    }
  }
}

// Singleton instance
let soundGeneratorInstance: SoundGenerator | null = null;

export const getSoundGenerator = (): SoundGenerator => {
  if (!soundGeneratorInstance) {
    soundGeneratorInstance = new SoundGenerator();
  }
  return soundGeneratorInstance;
};
