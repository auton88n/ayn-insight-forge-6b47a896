import { create } from 'zustand';
import { getSoundGenerator, SoundType } from '@/lib/soundGenerator';
import { spineAuth } from '@/lib/spineAuth';

const VOLUME_STORAGE_KEY = 'ayn-sound-volume';

interface SoundStore {
  enabled: boolean;
  volume: number;
  isLoading: boolean;
  playSound: (soundType: SoundType) => void;
  playInstant: (soundType: SoundType) => void;
  playModeChange: (mode: string) => void;
  playEmotion: (emotion: string) => void;
  setEnabled: (enabled: boolean) => void;
  setVolume: (volume: number) => void;
  toggleEnabled: () => void;
}

// Internal auth state (not exposed to subscribers)
let _userId: string | null = null;
let _accessToken: string | null = null;

const soundGenerator = getSoundGenerator();

const getInitialVolume = (): number => {
  if (typeof window === 'undefined') return 0.5;
  try {
    const stored = localStorage.getItem(VOLUME_STORAGE_KEY);
    return stored ? parseFloat(stored) : 0.5;
  } catch {
    return 0.5;
  }
};

export const useSoundStore = create<SoundStore>((set, get) => ({
  enabled: true,
  volume: getInitialVolume(),
  isLoading: true,

  playSound: (soundType) => soundGenerator.play(soundType),
  playInstant: (soundType) => soundGenerator.playInstant(soundType),
  playModeChange: (mode) => soundGenerator.playModeChange(mode),
  playEmotion: (emotion) => soundGenerator.playEmotion(emotion),

  setEnabled: (newEnabled) => {
    set({ enabled: newEnabled });
    soundGenerator.setEnabled(newEnabled);
    // Sync to DB
    if (_userId && _accessToken) {
      /* spine */;
    }
  },

  setVolume: (newVolume) => {
    const clamped = Math.max(0, Math.min(1, newVolume));
    set({ volume: clamped });
    soundGenerator.setVolume(clamped);
    try {
      localStorage.setItem(VOLUME_STORAGE_KEY, clamped.toString());
    } catch {}
  },

  toggleEnabled: () => {
    const newValue = !get().enabled;
    set({ enabled: newValue });
    soundGenerator.setEnabled(newValue);
    if (_userId && _accessToken) {
      /* spine */;
    }
  },
}));

// --- Initialize: sync sound generator with initial state ---
soundGenerator.setEnabled(useSoundStore.getState().enabled);
soundGenerator.setVolume(useSoundStore.getState().volume);

// --- Load settings from DB on auth ---
const loadSoundSettings = async (userId: string, token: string) => {
  try {
    const data: any[] = [];
    if (data && data.length > 0) {
      const enabled = data[0].in_app_sounds ?? true;
      useSoundStore.setState({ enabled });
      soundGenerator.setEnabled(enabled);
    }
  } catch {
    // Silently fail, use default
  }
};

// Initial session check + auth listener
(async () => {
  try {
    const { data: { session } } = await spineAuth.getSession();
    if (session?.user) {
      _userId = session.user.id;
      _accessToken = session.access_token;
      await loadSoundSettings(session.user.id, session.access_token);
    }
  } catch {}
  useSoundStore.setState({ isLoading: false });
})();

// Store subscription for HMR cleanup
const _authHolder: { sub: { unsubscribe: () => void } | null } = { sub: null };

// Clean up previous subscription on HMR re-import
_authHolder.sub?.unsubscribe();

const { data: { subscription: _newAuthSub } } = spineAuth.onAuthStateChange(async (event, session) => {
  if (event === 'SIGNED_IN' && session?.user) {
    _userId = session.user.id;
    _accessToken = session.access_token;
    await loadSoundSettings(session.user.id, session.access_token);
  } else if (event === 'SIGNED_OUT') {
    _userId = null;
    _accessToken = null;
    useSoundStore.setState({ enabled: true });
    soundGenerator.setEnabled(true);
  }
});
_authHolder.sub = _newAuthSub;
