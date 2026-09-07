// v3.30.0 — analytics is consent gated. Google Analytics used to load in the
// static head on first paint, which sets cookies before anyone has chosen.
// Nothing here runs until the visitor accepts, and a reject means the tag is
// never fetched at all.
import { supabase } from '@/integrations/supabase/client';

export const GA_MEASUREMENT_ID = 'G-6ZYH0N7G6M';

// v3.359.0 — PostHog session replay, added for the same reason this app's
// own history keeps citing: a bug report today is a screenshot and a guess
// at what must have happened before it. This lets a real session be watched
// instead of reconstructed. Inert by construction until the founder signs
// up for PostHog Cloud himself and sets these two env vars in the deploy —
// creating that account is not something to do on someone's behalf, so the
// code has to ship first and wait for the real key.
export const POSTHOG_KEY = import.meta.env.VITE_POSTHOG_KEY as string | undefined;
export const POSTHOG_HOST = (import.meta.env.VITE_POSTHOG_HOST as string | undefined) || 'https://us.i.posthog.com';

export const COOKIE_CONSENT_KEY = 'ayn-cookie-consent';
// v3.359.0 — bumped 1.0 -> 2.0. Session recording is a genuinely different
// category of collection than the plain aggregate-usage measurement this
// document's own "Changes" section describes, and that section makes an
// explicit promise: "If we ever add a category beyond the two above, we
// will ask for consent again rather than quietly extending the old one."
// readCookieConsent() already treats any version mismatch as no-decision-
// yet (see below), so bumping this one constant is the actual mechanism
// that honours that promise — every existing accepted-under-1.0 record is
// invalidated and the banner (now naming both tools and the masking
// safeguard) shows again, rather than silently starting recordings under
// an old consent that never mentioned them.
export const COOKIE_CONSENT_VERSION = '2.0';

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

// v3.359.0 — every text node and every input on the page is masked in the
// recording by default (maskAllInputs + the wildcard maskTextSelector), not
// just password/card-shaped fields. This is deliberately the strict end of
// what PostHog allows: this product's own pages carry a resume's real name
// and address, cover letter drafts, salary figures, and work-authorization
// answers, and none of that belongs in a session replay just because the
// *page structure* around it is worth watching for a real bug. What survives
// unmasked is exactly what the debugging case actually needs — where things
// were clicked, what rendered, in what order, at what size — never what was
// actually typed or displayed. Loosening this to unmask a specific "safe"
// field later is a real option, but the default has to start here, not the
// other way around.
function loadPostHog() {
  if (!POSTHOG_KEY || typeof document === 'undefined') return;
  import('posthog-js').then(({ default: posthog }) => {
    posthog.init(POSTHOG_KEY!, {
      api_host: POSTHOG_HOST,
      person_profiles: 'identified_only',
      // localStorage, not a cookie — matches how this app already handles
      // a signed-in session and the cookie choice itself, and keeps the
      // Cookie Policy's own "Google Analytics is the one thing that sets an
      // actual cookie" line true rather than needing a second exception.
      persistence: 'localStorage',
      session_recording: {
        maskAllInputs: true,
        maskTextSelector: '*',
      },
    });
    // Exposed the same way the classic snippet loader always has been, so
    // it's reachable from devtools for debugging — and so this config can
    // actually be verified against the real, initialized instance rather
    // than a fresh, unconfigured one a separate import() would return.
    (window as unknown as { posthog?: unknown }).posthog = posthog;
  }).catch(() => { /* a failed load must never break the app it's watching */ });
}

/** Loads gtag.js and PostHog. Only ever called after an explicit accept. */
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

  loadPostHog();
}

/** Called once at startup. Loads analytics only when consent is already given. */
export function initAnalyticsFromConsent() {
  if (globalPrivacyControlOn()) return;
  if (readCookieConsent()?.choice === 'accepted') loadAnalytics();
}
