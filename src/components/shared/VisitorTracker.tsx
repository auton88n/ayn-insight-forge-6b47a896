import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { trackPageView } from '@/lib/analytics';

/** Tracks SPA route changes after the visitor has made an analytics choice. */
export function VisitorTracker() {
  const { pathname } = useLocation();
  const lastPath = useRef<string | null>(null);

  useEffect(() => {
    if (lastPath.current === pathname) return;
    lastPath.current = pathname;
    void trackPageView(pathname);
  }, [pathname]);

  return null;
}
