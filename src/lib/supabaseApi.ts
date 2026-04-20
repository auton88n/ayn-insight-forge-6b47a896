/**
 * supabaseApi.ts — LEGACY SHIM
 *
 * The direct Supabase REST endpoint (SUPABASE_URL/rest/v1/...) is retired.
 * This file now proxies all requests through the Spine backend's
 * /admin/db/ endpoint so existing call sites (engineering tools,
 * prediction graph hook) keep working without a rewrite.
 *
 * Token resolution order:
 *   1. ayn_admin_token (admin sessions — required for /admin/db proxy)
 *   2. caller-supplied token (kept for signature compatibility, currently unused
 *      because spine has no user-side db proxy)
 *
 * If a non-admin user hits one of these legacy endpoints they will get 401,
 * which is the correct behavior — these tools (Engineering, Compliance,
 * PredictionGraph) are admin/internal-only per current product scope.
 *
 * For user-facing data, use spineApi (src/lib/spineApi.ts) instead.
 */

import { AYN_BACKEND_URL } from '@/config';

const SPINE = AYN_BACKEND_URL || 'https://spine.aynn.io';
const ADMIN_TOKEN_KEY = 'ayn_admin_token';

interface FetchOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  headers?: Record<string, string>;
  timeout?: number;
  signal?: AbortSignal;
}

function getActiveToken(fallback?: string): string | null {
  try {
    const t = localStorage.getItem(ADMIN_TOKEN_KEY);
    if (t) return t;
  } catch { /* ignore */ }
  return fallback || null;
}

async function spineCall<T>(
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  path: string,
  fallbackToken: string,
  body?: unknown,
  opts: { headers?: Record<string, string>; signal?: AbortSignal; timeout?: number } = {},
): Promise<T> {
  const token = getActiveToken(fallbackToken);
  const controller = opts.signal ? null : new AbortController();
  const timeoutId = controller ? setTimeout(() => controller.abort(), opts.timeout ?? 15000) : null;
  const signal = opts.signal || controller?.signal;

  try {
    const res = await fetch(`${SPINE}${path}`, {
      method,
      headers: {
        ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
        'Content-Type': 'application/json',
        'Prefer': method === 'GET' ? 'count=exact' : 'return=representation',
        ...(opts.headers ?? {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal,
    });
    if (timeoutId) clearTimeout(timeoutId);
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`spineApi ${method} ${path} ${res.status}: ${text}`);
    }
    const text = await res.text();
    return (text ? JSON.parse(text) : null) as T;
  } catch (e) {
    if (timeoutId) clearTimeout(timeoutId);
    throw e;
  }
}

export const supabaseApi = {
  async get<T = unknown>(endpoint: string, token: string, options: Omit<FetchOptions, 'method'> = {}): Promise<T> {
    return spineCall<T>('GET', `/admin/db/${endpoint}`, token, undefined, options);
  },

  async post<T = unknown>(endpoint: string, token: string, body: unknown, options: Omit<FetchOptions, 'method' | 'body'> = {}): Promise<T> {
    return spineCall<T>('POST', `/admin/db/${endpoint}`, token, body, options);
  },

  async patch<T = unknown>(endpoint: string, token: string, body: unknown, options: Omit<FetchOptions, 'method' | 'body'> = {}): Promise<T> {
    return spineCall<T>('PATCH', `/admin/db/${endpoint}`, token, body, options);
  },

  async delete<T = unknown>(endpoint: string, token: string, options: Omit<FetchOptions, 'method'> = {}): Promise<T> {
    return spineCall<T>('DELETE', `/admin/db/${endpoint}`, token, undefined, options);
  },

  async rpc<T = unknown>(functionName: string, token: string, params: Record<string, unknown> = {}): Promise<T> {
    return spineCall<T>('POST', `/admin/db/rpc/${functionName}`, token, params);
  },

  async getWithRetry<T = unknown>(endpoint: string, token: string, retries = 2): Promise<T | null> {
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        return await this.get<T>(endpoint, token);
      } catch {
        if (attempt === retries) return null;
        await new Promise(r => setTimeout(r, 600));
      }
    }
    return null;
  },

  async fetch<T = unknown>(endpoint: string, token: string, options: FetchOptions = {}): Promise<T> {
    const { method = 'GET', body, ...rest } = options;
    return spineCall<T>(method, `/admin/db/${endpoint}`, token, body, rest);
  },
};
