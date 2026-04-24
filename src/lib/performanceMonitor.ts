import { SUPABASE_URL } from '@/config';

/**
 * Reports Core Web Vitals (TTFB, DCL, Load) to the report-vitals edge function.
 * Only runs in production for 10% of sessions. Non-blocking — failures are silently ignored.
 */
export function initPerformanceMonitoring() {
  if (import.meta.env.DEV) return;
  if (Math.random() > 0.1) return; // 10% sampling

  window.addEventListener('load', () => {
    setTimeout(() => {
      try {
        const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
        if (!nav) return;
        const metrics = {
          ttfb: Math.round(nav.responseStart - nav.requestStart),
          dcl: Math.round(nav.domContentLoadedEventEnd - nav.startTime),
          load: Math.round(nav.loadEventEnd - nav.startTime),
          url: window.location.pathname,
          connection: (navigator as any).connection?.effectiveType || 'unknown',
        };
        navigator.sendBeacon?.(
          `${SUPABASE_URL}/functions/v1/report-vitals`,
          JSON.stringify(metrics)
        );
      } catch { /* silent */ }
    }, 3000);
  });
}
