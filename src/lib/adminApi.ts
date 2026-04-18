/**
 * adminApi.ts — REST wrapper for the admin panel.
 *
 * Drop-in replacement for adminSupabase.from(...).select/insert/update/delete.
 * Uses the user's JWT (stored under the 'ayn-admin-auth' storageKey) and the
 * Supabase REST endpoint directly. No JS SDK needed.
 *
 * Scope: admin-only. The main app uses spineApi / supabaseApi.
 */
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '@/config';

const ADMIN_STORAGE_KEY = 'ayn-admin-auth';

/** Read the admin access token from localStorage (stored by the supabase-js client). */
export function getAdminToken(): string | null {
  try {
    const raw = localStorage.getItem(ADMIN_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed?.access_token ?? parsed?.currentSession?.access_token ?? null;
  } catch { return null; }
}

interface FetchOptions {
  headers?: Record<string, string>;
  signal?: AbortSignal;
  prefer?: string;
}

async function call<T>(
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  endpoint: string,
  body?: unknown,
  opts: FetchOptions = {},
): Promise<T> {
  const token = getAdminToken();
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${endpoint}`, {
    method,
    headers: {
      'apikey': SUPABASE_ANON_KEY,
      ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
      'Content-Type': 'application/json',
      'Prefer': opts.prefer ?? (method === 'GET' ? 'count=exact' : 'return=representation'),
      ...(opts.headers ?? {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal: opts.signal,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`adminApi ${method} ${endpoint} ${res.status}: ${text}`);
  }
  const text = await res.text();
  return (text ? JSON.parse(text) : null) as T;
}

export const adminApi = {
  /** GET rows. `endpoint` is the path after /rest/v1/, e.g. "support_tickets?status=eq.open&order=created_at.desc". */
  get<T = unknown>(endpoint: string, opts?: FetchOptions): Promise<T> {
    return call<T>('GET', endpoint, undefined, opts);
  },
  /** Insert one or many rows. */
  insert<T = unknown>(table: string, rows: object | object[], opts?: FetchOptions): Promise<T> {
    return call<T>('POST', table, rows, opts);
  },
  /** Update rows matching the filter, e.g. table="support_tickets?id=eq.<uuid>". */
  update<T = unknown>(endpoint: string, patch: object, opts?: FetchOptions): Promise<T> {
    return call<T>('PATCH', endpoint, patch, opts);
  },
  /** Delete rows matching the filter, e.g. table="support_tickets?id=eq.<uuid>". */
  remove<T = unknown>(endpoint: string, opts?: FetchOptions): Promise<T> {
    return call<T>('DELETE', endpoint, undefined, opts);
  },
  /** Call a Postgres RPC function. */
  async rpc<T = unknown>(fn: string, args: object = {}): Promise<T> {
    const token = getAdminToken();
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(args),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`adminApi rpc ${fn} ${res.status}: ${text}`);
    }
    const text = await res.text();
    return (text ? JSON.parse(text) : null) as T;
  },
  /** Invoke an edge function. Replaces adminSupabase.functions.invoke. */
  async invoke<T = unknown>(name: string, body: object = {}): Promise<{ data: T | null; error: Error | null }> {
    try {
      const token = getAdminToken();
      const res = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
        method: 'POST',
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });
      const text = await res.text();
      const data = text ? JSON.parse(text) : null;
      if (!res.ok) return { data: null, error: new Error(data?.error ?? `${res.status}`) };
      return { data: data as T, error: null };
    } catch (e) {
      return { data: null, error: e as Error };
    }
  },
};
