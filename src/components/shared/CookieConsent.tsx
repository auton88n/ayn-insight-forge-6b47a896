// v3.30.0 — cookie consent. Small, calm, and it actually gates Google
// Analytics rather than announcing it. Accept and Reject carry equal weight,
// nothing is pre-ticked, and Global Privacy Control is honoured as a reject
// without ever showing the banner.
import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  readCookieConsent, writeCookieConsent, loadAnalytics, globalPrivacyControlOn,
} from '@/lib/analytics';

const OPEN_EVENT = 'ayn:open-cookie-preferences';

/** Footer link handler: reopen the banner so a choice can be changed. */
export function openCookiePreferences() {
  window.dispatchEvent(new CustomEvent(OPEN_EVENT));
}

export function CookieConsent() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (globalPrivacyControlOn()) {
      // Treat as a reject, record it, and stay out of the way.
      if (!readCookieConsent()) writeCookieConsent('rejected', true);
      return;
    }
    if (!readCookieConsent()) setVisible(true);
  }, []);

  useEffect(() => {
    const onOpen = () => setVisible(true);
    window.addEventListener(OPEN_EVENT, onOpen as EventListener);
    return () => window.removeEventListener(OPEN_EVENT, onOpen as EventListener);
  }, []);

  const decide = useCallback((choice: 'accepted' | 'rejected') => {
    writeCookieConsent(choice);
    if (choice === 'accepted') loadAnalytics();
    setVisible(false);
  }, []);

  if (!visible) return null;

  return (
    <div
      role="dialog"
      aria-live="polite"
      aria-label="Cookie choices"
      className="fixed inset-x-3 bottom-3 z-[60] sm:inset-x-auto sm:right-4 sm:bottom-4 sm:max-w-md"
    >
      <div className="rounded-2xl border border-border bg-card/95 backdrop-blur p-4 shadow-lg">
        <p className="text-sm font-medium text-foreground">Analytics cookies</p>
        <p className="mt-1.5 text-sm text-muted-foreground leading-relaxed">
          We would like to measure how the site is used. Cookies that keep you signed in and
          keep the site secure are strictly necessary and stay on either way. You can change
          this later from the footer.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => decide('accepted')}
            className="flex-1 min-w-[120px] rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
          >
            Accept
          </button>
          <button
            type="button"
            onClick={() => decide('rejected')}
            className="flex-1 min-w-[120px] rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
          >
            Reject
          </button>
        </div>
        <p className="mt-2.5 text-xs text-muted-foreground">
          <Link to="/privacy" className="underline underline-offset-2 hover:text-foreground">Privacy Policy</Link>
        </p>
      </div>
    </div>
  );
}

export default CookieConsent;
