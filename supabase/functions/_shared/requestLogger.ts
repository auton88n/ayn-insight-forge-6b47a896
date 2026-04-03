/**
 * AYN v2 — Centralized Request Logger
 * Used by ayn-gateway and ai-router to write structured logs to system_logs.
 * 
 * Usage:
 *   const log = createRequestLog({ request_id, user_id, endpoint });
 *   ... do work ...
 *   await log.end(supabase, { status: 'success', intent: 'chat' });
 *   await log.error(supabase, 'Something failed');
 */

export interface RequestLogOptions {
  request_id: string;
  user_id: string | null;
  endpoint: string;
  intent?: string;
  metadata?: Record<string, unknown>;
}

export interface RequestLog {
  /** Call when request completes successfully */
  end: (supabase: SupabaseLike, opts?: { status?: string; intent?: string; metadata?: Record<string, unknown> }) => Promise<void>;
  /** Call on error */
  error: (supabase: SupabaseLike, errorMessage: string, opts?: { metadata?: Record<string, unknown> }) => Promise<void>;
  /** The request_id, expose so gateway can forward it as a header */
  request_id: string;
  /** Start time in ms */
  startedAt: number;
}

// Minimal Supabase client type we need
interface SupabaseLike {
  from: (table: string) => {
    insert: (data: Record<string, unknown>) => Promise<{ error: unknown }>;
  };
}

/**
 * Creates a request log tracker. Call .end() or .error() to flush to DB.
 */
export function createRequestLog(opts: RequestLogOptions): RequestLog {
  const startedAt = Date.now();

  async function write(
    supabase: SupabaseLike,
    status: string,
    intent: string | undefined,
    error: string | null,
    extraMeta: Record<string, unknown> = {}
  ): Promise<void> {
    const latency_ms = Date.now() - startedAt;
    try {
      await supabase.from('system_logs').insert({
        request_id: opts.request_id,
        user_id: opts.user_id,
        endpoint: opts.endpoint,
        intent: intent ?? opts.intent ?? null,
        status,
        latency_ms,
        error,
        metadata: { ...opts.metadata, ...extraMeta },
      });
    } catch (e) {
      // Never let logging crash the request
      console.error('[requestLogger] Failed to write system_log:', e);
    }
  }

  return {
    request_id: opts.request_id,
    startedAt,

    async end(supabase, { status = 'success', intent, metadata } = {}) {
      await write(supabase, status, intent, null, metadata);
    },

    async error(supabase, errorMessage, { metadata } = {}) {
      await write(supabase, 'error', undefined, errorMessage, metadata);
    },
  };
}

/**
 * Generates a request ID: ayn-<timestamp>-<random>
 * Short enough to log, unique enough for correlation.
 */
export function generateRequestId(): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  return `ayn-${ts}-${rand}`;
}
