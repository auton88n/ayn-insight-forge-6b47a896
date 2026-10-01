// v3.357.0 -- shared by ErrorBoundary.tsx (a page-crashing render error)
// and the two global listeners installed in main.tsx (an unhandled
// promise rejection, and a JS error that happens outside React's own
// render -- a click handler, a setTimeout, a background save). All
// three write to the exact same error_logs table error-alert-check
// already watches every 10 minutes, so a "quiet" failure that used to
// just print to the browser console now reaches the same admin-panel/
// email pipeline a page-crashing one already did.
//
// Deliberately narrow, matching the discipline already established for
// the extension's own equivalent (ext_error_report, resume-hub): never
// blocks or slows down whatever called it, deduped client side by a
// cheap fingerprint (24h cooldown per distinct bug) so the same bug
// firing in a loop reports once, not once per second, and capped at a
// fixed number of reports per day per browser regardless of how many
// distinct bugs are firing. The backend's own error-alert-check burst
// detection is the real, global safety net; this is only here so one
// broken tab can't hammer the table.
//
// IMPORTANT: the insert below deliberately never chains .select() --
// PostgREST's default INSERT is return=minimal, so it never needs to
// read the new row back under RLS. Adding .select() would re-check the
// row against error_logs' own SELECT policies (admin-only), which a
// signed-out visitor can never pass, and the insert would fail with a
// row-level-security error despite the WITH CHECK itself being fine --
// the exact same INSERT ... RETURNING pitfall this codebase's own
// history already hit once for guest support tickets (v3.61.0-era).

import { supabase } from '@/integrations/supabase/client';

const DEDUP_KEY = 'ayn_err_dedup';
const DAILY_KEY = 'ayn_err_daily';
const DEDUP_WINDOW_MS = 24 * 60 * 60 * 1000;
const DAILY_CAP = 20;
const DEDUP_MAX_KEYS = 80;

function hashFingerprint(s: string): string {
  // djb2 -- a short, cheap dedup key, not a security hash.
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

export type ClientErrorSource = 'render_crash' | 'unhandled_rejection' | 'global_error';

interface ReportErrorInput {
  message: string;
  stack?: string | null;
  componentStack?: string | null;
  source: ClientErrorSource;
}

export async function reportClientError(input: ReportErrorInput): Promise<void> {
  try {
    const message = (input.message || 'Unknown error').slice(0, 1000);
    if (!message) return;
    const firstStackLine = (input.stack || '').split('\n')[1] || '';
    const fingerprint = hashFingerprint(`${input.source}:${message}:${firstStackLine}`);

    let dedup: Record<string, number> = {};
    let daily = { day: todayStr(), count: 0 };
    try {
      dedup = JSON.parse(localStorage.getItem(DEDUP_KEY) || '{}');
      const rawDaily = JSON.parse(localStorage.getItem(DAILY_KEY) || 'null');
      if (rawDaily && rawDaily.day === todayStr()) daily = rawDaily;
    } catch {
      // Corrupted/unavailable storage -- treat as empty rather than
      // ever let a storage problem block reporting a real bug.
    }

    if (daily.count >= DAILY_CAP) return;
    const last = dedup[fingerprint];
    if (last && Date.now() - last < DEDUP_WINDOW_MS) return;

    const { data: { session } } = await supabase.auth.getSession();
    await (supabase as any).from('error_logs').insert({
      error_message: message,
      error_stack: input.stack ? input.stack.slice(0, 5000) : null,
      component_stack: input.componentStack ? input.componentStack.slice(0, 5000) : null,
      url: window.location.href,
      endpoint: window.location.pathname,
      context: { kind: input.source },
      user_id: session?.user?.id || null,
      user_agent: navigator.userAgent,
    });

    dedup[fingerprint] = Date.now();
    const keys = Object.keys(dedup);
    if (keys.length > DEDUP_MAX_KEYS) {
      keys.sort((a, b) => dedup[a] - dedup[b]);
      for (const k of keys.slice(0, keys.length - DEDUP_MAX_KEYS)) delete dedup[k];
    }
    try {
      localStorage.setItem(DEDUP_KEY, JSON.stringify(dedup));
      localStorage.setItem(DAILY_KEY, JSON.stringify({ day: todayStr(), count: daily.count + 1 }));
    } catch {
      // Storage full/unavailable -- the report itself already succeeded.
    }
  } catch {
    // Reporting a bug must never itself throw somewhere that matters.
  }
}
