import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';

const VISITOR_ID_KEY = 'ayn_visitor_id';
const SESSION_ID_KEY = 'ayn_session_id';

// Use relative path for API calls - proxied through same origin in production
// Falls back to direct Supabase URL only in development
const API_BASE = import.meta.env.DEV 
  ? 'https://dfkoxuokfkttjhfjcecx.supabase.co/functions/v1'
  : 'https://dfkoxuokfkttjhfjcecx.supabase.co/functions/v1/api';

// Generate a random ID
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
}

// Get or create visitor ID (persistent)
function getVisitorId(): string {
  let visitorId = localStorage.getItem(VISITOR_ID_KEY);
  if (!visitorId) {
    visitorId = generateId();
    localStorage.setItem(VISITOR_ID_KEY, visitorId);
  }
  return visitorId;
}

// Get or create session ID (per session)
function getSessionId(): string {
  let sessionId = sessionStorage.getItem(SESSION_ID_KEY);
  if (!sessionId) {
    sessionId = generateId();
    sessionStorage.setItem(SESSION_ID_KEY, sessionId);
  }
  return sessionId;
}

// Parse UTM parameters from URL
function getUtmParams(): { utm_source?: string; utm_medium?: string; utm_campaign?: string } {
  const params = new URLSearchParams(window.location.search);
  return {
    utm_source: params.get('utm_source') || undefined,
    utm_medium: params.get('utm_medium') || undefined,
    utm_campaign: params.get('utm_campaign') || undefined,
  };
}

export function useVisitorTracking() {
  const location = useLocation();
  const lastTrackedPath = useRef<string>('');

  useEffect(() => {
    // Don't track the same page twice in a row
    if (lastTrackedPath.current === location.pathname) {
      return;
    }
    lastTrackedPath.current = location.pathname;

    // Don't track admin pages
    if (location.pathname.startsWith('/admin')) {
      return;
    }

    const trackVisit = async () => {
      try {
        const visitorId = getVisitorId();
        const sessionId = getSessionId();
        const utmParams = getUtmParams();

        const payload = {
          visitor_id: visitorId,
          page_path: location.pathname,
          referrer: document.referrer || undefined,
          session_id: sessionId,
          user_agent: navigator.userAgent,
          ...utmParams
        };

        // Use sendBeacon for better reliability, fallback to fetch
        const url = `${API_BASE}/track-visit`;
        const body = JSON.stringify(payload);

        if (navigator.sendBeacon) {
          navigator.sendBeacon(url, body);
        } else {
          fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body,
            keepalive: true
          }).catch(() => {
            // Silently fail - analytics should not break the app
          });
        }
      } catch (error) {
        // Silently fail - analytics should not break the app
        console.debug('Visitor tracking error:', error);
      }
    };

    // Small delay to ensure page is fully loaded
    const timeoutId = setTimeout(trackVisit, 100);

    return () => clearTimeout(timeoutId);
  }, [location.pathname]);
}
