// v3.30.0 — analytics is consent gated. Google Analytics used to load in the
// static head on first paint, which sets cookies before anyone has chosen.
// Nothing here runs until the visitor accepts, and a reject means the tag is
// never fetched at all.
import { supabase } from '@/integrations/supabase/client';

export const GA_MEASUREMENT_ID = 'G-6ZYH0N7G6M';

export const COOKIE_CONSENT_KEY = 'ayn-cookie-consent';
export const COOKIE_CONSENT_VERSION = '1.0';

export type CookieChoice = 'accepted' | 'rejected';

export type CookieConsentRecord = {
  choice: CookieChoice;
  version: string;
  decidedAt: string;
  /** true when the browser sent Global Privacy Control and we honoured it */
  gpc?: boolean;
};

export function globalPrivacyControlOn(): boolean {
  try {
    return (navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl === true;
  } catch {
    return false;
  }
}

export function readCookieConsent(): CookieConsentRecord | null {
  try {
    const raw = localStorage.getItem(COOKIE_CONSENT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CookieConsentRecord;
    if (parsed?.choice !== 'accepted' && parsed?.choice !== 'rejected') return null;
    if (parsed.version !== COOKIE_CONSENT_VERSION) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeCookieConsent(choice: CookieChoice, gpc = false): CookieConsentRecord {
  const record: CookieConsentRecord = {
    choice,
    version: COOKIE_CONSENT_VERSION,
    decidedAt: new Date().toISOString(),
    gpc,
  };
  try { localStorage.setItem(COOKIE_CONSENT_KEY, JSON.stringify(record)); } catch { /* private mode */ }
  // Best effort only. The local record above is what actually gates
  // analytics; this just lets the admin panel see aggregate accept/reject
  // counts. A failed send here must never block or retry against the
  // person's own choice, and it works whether they're signed in or not.
  void supabase.rpc('record_cookie_consent', { p_choice: choice, p_gpc: gpc }).then(
    () => undefined,
    () => undefined,
  );
  return record;
}

export function clearCookieConsent() {
  try { localStorage.removeItem(COOKIE_CONSENT_KEY); } catch { /* private mode */ }
}

let loaded = false;

/** Loads gtag.js. Only ever called after an explicit accept. */
export function loadAnalytics() {
  if (loaded || typeof document === 'undefined') return;
  loaded = true;
  const s = document.createElement('script');
  s.async = true;
  s.src = `https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`;
  document.head.appendChild(s);

  const w = window as unknown as { dataLayer?: unknown[] };
  w.dataLayer = w.dataLayer || [];
  const gtag = (...args: unknown[]) => { w.dataLayer!.push(args); };
  gtag('js', new Date());
  gtag('config', GA_MEASUREMENT_ID, { anonymize_ip: true });
}

/** Called once at startup. Loads analytics only when consent is already given. */
export function initAnalyticsFromConsent() {
  if (globalPrivacyControlOn()) return;
  if (readCookieConsent()?.choice === 'accepted') loadAnalytics();
}
