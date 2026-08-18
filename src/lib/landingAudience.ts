// Shared between LandingSections.tsx (owns the "I am looking for a job" /
// "I am hiring" switch) and Header.tsx (nav links that should match whichever
// audience the visitor picked). localStorage is the source of truth so the
// choice survives a reload; the custom event lets a mounted listener react
// to a same-tab change too, since localStorage's own 'storage' event only
// fires in other tabs.
export type Audience = 'job_seeker' | 'employer';

const KEY = 'ayn_landing_audience';
const EVENT = 'ayn:landing-audience-change';

export function readAudience(): Audience {
  if (typeof window === 'undefined') return 'employer';
  return localStorage.getItem(KEY) === 'job_seeker' ? 'job_seeker' : 'employer';
}

export function writeAudience(next: Audience) {
  try { localStorage.setItem(KEY, next); } catch { /* ignore */ }
  window.dispatchEvent(new CustomEvent(EVENT, { detail: next }));
}

export function onAudienceChange(handler: (a: Audience) => void) {
  const onCustom = () => handler(readAudience());
  const onStorage = (e: StorageEvent) => { if (e.key === KEY) handler(readAudience()); };
  window.addEventListener(EVENT, onCustom);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(EVENT, onCustom);
    window.removeEventListener('storage', onStorage);
  };
}
