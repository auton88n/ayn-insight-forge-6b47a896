/**
 * adminApi.ts — REST wrapper for the admin panel.
 *
 * Routes all admin DB/RPC/edge-function calls through the spine
 * (https://spine.aynn.io/admin/...). The Supabase JS SDK is no longer used.
 *
 * Auth: spine admin JWT stored under 'ayn_admin_token' by AdminApp.tsx.
 */
import { subscribeAdminTables } from './adminSSE';

const SPINE_BASE = 'https://spine.aynn.io';
const ADMIN_TOKEN_KEY = 'ayn_admin_token';

/** Read the spine admin access token from localStorage. */
export function getAdminToken(): string | null {
  try {
    return localStorage.getItem(ADMIN_TOKEN_KEY);
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
  const res = await fetch(`${SPINE_BASE}/admin/db/${endpoint}`, {
    method,
    headers: {
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
  get<T = unknown>(endpoint: string, opts?: FetchOptions): Promise<T> {
    return call<T>('GET', endpoint, undefined, opts);
  },
  insert<T = unknown>(table: string, rows: object | object[], opts?: FetchOptions): Promise<T> {
    return call<T>('POST', table, rows, opts);
  },
  update<T = unknown>(endpoint: string, patch: object, opts?: FetchOptions): Promise<T> {
    return call<T>('PATCH', endpoint, patch, opts);
  },
  remove<T = unknown>(endpoint: string, opts?: FetchOptions): Promise<T> {
    return call<T>('DELETE', endpoint, undefined, opts);
  },
  /** Call a Postgres RPC function via spine. */
  async rpc<T = unknown>(fn: string, args: object = {}): Promise<T> {
    const token = getAdminToken();
    const res = await fetch(`${SPINE_BASE}/admin/db/rpc/${fn}`, {
      method: 'POST',
      headers: {
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
  /** Invoke a spine admin function (replaces edge function invoke). */
  async invoke<T = unknown>(name: string, body: object = {}): Promise<{ data: T | null; error: Error | null }> {
    try {
      const token = getAdminToken();
      const res = await fetch(`${SPINE_BASE}/admin/fn/${name}`, {
        method: 'POST',
        headers: {
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

  /**
   * from() — Drop-in shim for adminSupabase.from(table).
   * Returns a builder that delegates to the spine /admin/db proxy.
   */
  from(table: string) {
    const filters: string[] = [];
    const builder: any = {
      _table: table,
      _method: 'GET' as 'GET' | 'POST' | 'PATCH' | 'DELETE',
      _body: undefined as unknown,
      _limit: undefined as number | undefined,
      _order: undefined as string | undefined,
      _range: undefined as [number, number] | undefined,
      _single: false,
      _maybeSingle: false,
      _prefer: undefined as string | undefined,

      select(_cols = '*') { return this; },

      insert(rows: object | object[]) {
        this._method = 'POST';
        this._body = rows;
        this._prefer = 'return=representation';
        return this;
      },

      update(patch: object) {
        this._method = 'PATCH';
        this._body = patch;
        this._prefer = 'return=representation';
        return this;
      },

      upsert(rows: object | object[], opts?: { onConflict?: string }) {
        this._method = 'POST';
        this._body = rows;
        this._prefer = `resolution=merge-duplicates,return=representation${opts?.onConflict ? `,on_conflict=${opts.onConflict}` : ''}`;
        return this;
      },

      delete() { this._method = 'DELETE'; return this; },

      eq(col: string, val: unknown)  { filters.push(`${col}=eq.${val}`); return this; },
      neq(col: string, val: unknown) { filters.push(`${col}=neq.${val}`); return this; },
      gt(col: string, val: unknown)  { filters.push(`${col}=gt.${val}`); return this; },
      gte(col: string, val: unknown) { filters.push(`${col}=gte.${val}`); return this; },
      lt(col: string, val: unknown)  { filters.push(`${col}=lt.${val}`); return this; },
      lte(col: string, val: unknown) { filters.push(`${col}=lte.${val}`); return this; },
      is(col: string, val: unknown)  { filters.push(`${col}=is.${val}`); return this; },
      not(col: string, op: string, val: unknown) { filters.push(`${col}=not.${op}.${val}`); return this; },
      in(col: string, vals: unknown[]) { filters.push(`${col}=in.(${vals.join(',')})`); return this; },
      contains(col: string, val: unknown) { filters.push(`${col}=cs.${JSON.stringify(val)}`); return this; },
      ilike(col: string, val: string) { filters.push(`${col}=ilike.${val}`); return this; },

      order(col: string, opts?: { ascending?: boolean }) {
        this._order = `${col}.${opts?.ascending === false ? 'desc' : 'asc'}`;
        return this;
      },

      limit(n: number) { this._limit = n; return this; },

      range(from: number, to: number) { this._range = [from, to]; return this; },

      single()      { this._single = true; return this; },
      maybeSingle() { this._maybeSingle = true; return this; },

      async execute() {
        return this._run();
      },

      then(resolve: (v: any) => any, reject: (e: any) => any) {
        return this._run().then(resolve, reject);
      },

      async _run() {
        try {
          let endpoint = this._table;
          const params: string[] = [...filters];
          if (this._order)  params.push(`order=${this._order}`);
          if (this._limit !== undefined) params.push(`limit=${this._limit}`);
          if (this._range)  params.push(`offset=${this._range[0]}`, `limit=${this._range[1] - this._range[0] + 1}`);
          if (params.length) endpoint += '?' + params.join('&');

          const data = await call<any>(
            this._method,
            endpoint,
            this._body,
            { prefer: this._prefer }
          );

          const result = Array.isArray(data) ? data : (data !== null ? [data] : []);
          if (this._single)      return { data: result[0] ?? null, error: null };
          if (this._maybeSingle) return { data: result[0] ?? null, error: null };
          return { data: result, error: null, count: result.length };
        } catch (e: any) {
          return { data: null, error: { message: e.message } };
        }
      },
    };
    return builder;
  },

  /** channel() — SSE bridge shim for realtime subscriptions. */
  channel(name: string) {
    const handlers: Array<{ table: string; cb: (payload: any) => void }> = [];
    let unsubscribe: (() => void) | null = null;
    const ch: any = {
      _name: name,
      on(_event: string, opts: any, cb: (payload: any) => void) {
        const table = opts?.table;
        if (table) handlers.push({ table, cb });
        return ch;
      },
      subscribe(statusCb?: (status: string) => void) {
        const tables = Array.from(new Set(handlers.map(h => h.table)));
        if (tables.length) {
          unsubscribe = subscribeAdminTables(tables, (table) => {
            for (const h of handlers) {
              if (h.table === table) {
                try { h.cb({ eventType: 'CHANGE', table, new: null, old: null }); } catch { /* ignore */ }
              }
            }
          });
        }
        statusCb?.('SUBSCRIBED');
        return ch;
      },
      unsubscribe() {
        unsubscribe?.();
        unsubscribe = null;
        return Promise.resolve('ok');
      },
    };
    return ch;
  },

  removeChannel(ch: any) {
    try { return ch?.unsubscribe?.(); } catch { /* ignore */ }
  },

  functions: {
    async invoke<T = unknown>(name: string, opts: { body?: object } = {}): Promise<{ data: T | null; error: Error | null }> {
      return adminApi.invoke<T>(name, opts.body ?? {});
    },
  },
};
