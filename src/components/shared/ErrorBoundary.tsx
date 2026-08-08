import React, { Component, ErrorInfo, ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { RefreshCw } from 'lucide-react';

const AYN_MARK = '/ayn-mark.svg';

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

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
    
    // Non-blocking error report to Supabase
    this.reportError(error, errorInfo).catch(() => {});
    
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
        if (!sessionStorage.getItem(key)) {
          sessionStorage.setItem(key, '1');
          window.location.reload();
        }
      } catch {
        // If sessionStorage is unavailable, still attempt a single reload.
        window.location.reload();
      }
    }
  }

  private async reportError(error: Error, errorInfo: ErrorInfo) {
    try {
      const { supabase } = await import('@/integrations/supabase/client');
      const { data: { session } } = await supabase.auth.getSession();

      await (supabase as any).from('error_logs').insert({
        error_message: (error.message || 'Unknown error').slice(0, 1000),
        error_stack: error.stack?.slice(0, 5000) || null,
        component_stack: errorInfo.componentStack?.slice(0, 5000) || null,
        url: window.location.href,
        user_id: session?.user?.id || null,
        user_agent: navigator.userAgent,
      });
    } catch {
      // Silent failure — error reporting should never break the app
    }
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
                Something unexpected happened, but don't worry — we've got this. Let's get you back on track.
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