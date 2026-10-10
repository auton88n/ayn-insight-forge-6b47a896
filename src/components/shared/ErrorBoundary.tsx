import React, { Component, ErrorInfo, ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { RefreshCw } from 'lucide-react';
import { reportClientError } from '@/lib/errorReporting';

const AYN_MARK = '/ayn-mark.svg';

/** One retry per minute, not one retry for the lifetime of a browser tab. */
export function canRecoverStaleChunk(stored: string | null, now = Date.now()): boolean {
  const last = Number(stored);
  return !Number.isFinite(last) || last <= 1 || now - last > 60_000;
}

// Shared by componentDidCatch and render so the two checks can never drift
// apart the way they just did (render's copy never got the MIME-type fix).
export function isStaleChunkError(message: string): boolean {
  return (
    message.includes('dynamically imported module') ||
    message.includes('Importing a module script failed') ||
    (message.includes('module script') && message.includes('text/html')) ||
    message.includes('Component is not a function')
  );
}

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public async componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);

    // Reported directly: "sometimes the whole tab starts to reload." This
    // auto-reload is real and mostly correct (confirmed live against
    // production's own error_logs — genuine "Failed to fetch dynamically
    // imported module" failures after a deploy, the exact case this exists
    // to recover from) — but it used to fire-and-forget the report, then
    // immediately call window.location.reload() in the same synchronous
    // tick. A page reload aborts any in-flight network request, so the one
    // class of error most worth having a record of was the one class that
    // almost never actually landed in error_logs — every real occurrence
    // of THIS specific bug was probably invisible even to us. Now the
    // report gets a real, bounded window to complete before the page goes
    // away, capped so a slow/dead network can't meaningfully delay a
    // legitimate stale-chunk recovery either.
    await Promise.race([
      this.reportError(error, errorInfo).catch(() => {}),
      new Promise((resolve) => setTimeout(resolve, 2500)),
    ]);

    // Auto-reload on dynamic import failures (stale chunk errors) — a
    // deploy replaced the JS chunk files with new content-hashed names
    // while this tab still has the old index.html's manifest, so a lazy
    // route import 404s and the SPA fallback serves index.html back in
    // its place. Browsers word that failure differently depending on
    // whether the fetch itself failed or merely returned the wrong
    // content type, so isStaleChunkError matches the shared substring,
    // not one exact phrasing — the MIME-type wording was missing here
    // and slipped through uncaught, reported directly as a stuck
    // "Loading" screen.
    const message = error?.message || '';
    const shouldReload = isStaleChunkError(message);

    // Prevent infinite refresh loops
    if (shouldReload) {
      const key = message.includes('Component is not a function')
        ? 'ayn_auto_reload_component_not_function'
        : 'ayn_auto_reload_stale_chunk';

      try {
        if (canRecoverStaleChunk(sessionStorage.getItem(key))) {
          sessionStorage.setItem(key, String(Date.now()));
          window.location.reload();
        }
      } catch {
        // Without persistent loop protection, leave recovery to the explicit
        // Reload button rather than repeatedly discarding the user's page.
      }
    }
  }

  // v3.357.0 -- now the shared helper every automatic error report goes
  // through (also used by main.tsx's own global listeners below), so a
  // render-crashing bug and a "quiet" one (an unhandled rejection, a
  // click handler that throws) get the identical dedup/rate-cap
  // treatment and land in the same place.
  private async reportError(error: Error, errorInfo: ErrorInfo) {
    await reportClientError({
      message: error.message || 'Unknown error',
      stack: error.stack || null,
      componentStack: errorInfo.componentStack || null,
      source: 'render_crash',
    });
  }

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      const isDev = import.meta.env.DEV;
      const message = this.state.error?.message || '';
      const isAutoReloadError = isStaleChunkError(message);

      return (
        <div className="min-h-screen flex items-center justify-center bg-background px-6">
          <div className="ayn-ember-card max-w-md w-full rounded-2xl p-8 text-center space-y-4">
            <div className="mx-auto h-14 w-14 rounded-full ayn-ember-badge flex items-center justify-center">
              <img src={AYN_MARK} alt="" aria-hidden className="w-7 h-7" draggable={false} />
            </div>
            <div className="space-y-1.5">
              <h1 className="text-xl font-bold tracking-tight text-foreground">Oops! AYN hit a snag</h1>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {isAutoReloadError
                  ? 'A newer version of AYN may be available. Reload to load the current page. Unsaved edits may be lost.'
                  : 'This page could not be displayed. Try again, or reload if the problem continues.'}
              </p>
            </div>
            {isDev && this.state.error && (
              <div className="text-xs text-muted-foreground bg-muted/50 p-3 rounded font-mono text-left">
                {this.state.error.message}
              </div>
            )}
            <Button
              onClick={() => {
                if (isAutoReloadError) {
                  window.location.reload();
                  return;
                }
                this.setState({ hasError: false, error: undefined });
              }}
              variant="default"
              size="sm"
              className="gap-2 ayn-ember-btn"
            >
              <RefreshCw className="w-4 h-4" />
              {isAutoReloadError ? 'Reload Page' : "Let's Try Again"}
            </Button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
