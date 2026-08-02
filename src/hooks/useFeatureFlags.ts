// v3.24.0 — maintenance switches, read by every surface.
// The admin panel writes these; the product reads them and refuses to run a
// feature that has been switched off. Server side enforcement lives in the
// edge functions, this is only what the person sees.
import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export type FeatureKey =
  | 'platform'
  | 'candidate_search'
  | 'proposals'
  | 'assessments'
  | 'tailoring'
  | 'signups';

type FlagState = {
  flags: Partial<Record<FeatureKey, boolean>>;
  messages: Partial<Record<FeatureKey, string>>;
  loaded: boolean;
};

const EMPTY: FlagState = { flags: {}, messages: {}, loaded: false };

let cache: FlagState = EMPTY;
let inflight: Promise<FlagState> | null = null;
const listeners = new Set<(s: FlagState) => void>();

async function load(): Promise<FlagState> {
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const { data, error } = await supabase.rpc('get_feature_flags' as never);
      if (error) throw error;
      const d = (data || {}) as { flags?: Record<string, boolean>; messages?: Record<string, string> };
      cache = { flags: (d.flags || {}) as FlagState['flags'], messages: (d.messages || {}) as FlagState['messages'], loaded: true };
    } catch {
      // Never lock the product out because the read failed.
      cache = { flags: {}, messages: {}, loaded: true };
    }
    listeners.forEach(l => l(cache));
    inflight = null;
    return cache;
  })();
  return inflight;
}

/** Force a re-read, used after a 503 maintenance answer. */
export const refreshFeatureFlags = () => load();

const POLL_MS = 60_000;

export function useFeatureFlags() {
  const [state, setState] = useState<FlagState>(cache);

  useEffect(() => {
    listeners.add(setState);
    // v3.35.0 — every component calling useFeature() fired its own
    // get_feature_flags round trip on mount even when a fresh cache already
    // existed, because this only checked for an in-flight request, never an
    // already-loaded one. Measured live on aynn.io: two calls on one
    // landing page load, ~350-500ms each.
    if (!cache.loaded) void load();
    const id = window.setInterval(() => { void load(); }, POLL_MS);
    return () => { listeners.delete(setState); window.clearInterval(id); };
  }, []);

  const isEnabled = useCallback(
    (key: FeatureKey) => (key in state.flags ? state.flags[key] !== false : true),
    [state],
  );
  const messageFor = useCallback(
    (key: FeatureKey) => (state.messages[key] || '').trim(),
    [state],
  );

  return { ...state, isEnabled, messageFor, refresh: load };
}

/** Convenience for a single feature. */
export function useFeature(key: FeatureKey) {
  const { isEnabled, messageFor, loaded } = useFeatureFlags();
  return { enabled: isEnabled(key), message: messageFor(key), loaded };
}
