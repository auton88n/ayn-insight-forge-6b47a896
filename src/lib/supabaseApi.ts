/**
 * Centralized Supabase REST API utility
 * Bypasses Supabase client to avoid deadlocks and improve performance
 */

import { SUPABASE_URL, SUPABASE_ANON_KEY } from '@/config';
import { supabase } from '@/integrations/supabase/client';

interface FetchOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  headers?: Record<string, string>;
  timeout?: number;
  signal?: AbortSignal;
}

/**
 * Make a direct REST API call to Supabase
 */
export const supabaseApi = {
  /**
   * GET request to Supabase REST API
   */
  async get<T = unknown>(endpoint: string, token: string, options: Omit<FetchOptions, 'method'> = {}): Promise<T> {
    return this.fetch<T>(endpoint, token, { ...options, method: 'GET' });
  },

  /**
   * POST request to Supabase REST API
   */
  async post<T = unknown>(endpoint: string, token: string, body: unknown, options: Omit<FetchOptions, 'method' | 'body'> = {}): Promise<T> {
    return this.fetch<T>(endpoint, token, { ...options, method: 'POST', body });
  },

  /**
   * PATCH request to Supabase REST API
   */
  async patch<T = unknown>(endpoint: string, token: string, body: unknown, options: Omit<FetchOptions, 'method' | 'body'> = {}): Promise<T> {
    return this.fetch<T>(endpoint, token, { ...options, method: 'PATCH', body });
  },

  /**
   * DELETE request to Supabase REST API
   */
  async delete<T = unknown>(endpoint: string, token: string, options: Omit<FetchOptions, 'method'> = {}): Promise<T> {
    return this.fetch<T>(endpoint, token, { ...options, method: 'DELETE' });
  },

  /**
   * Call an RPC function via REST API
   */
  async rpc<T = unknown>(functionName: string, token: string, params: Record<string, unknown> = {}): Promise<T> {
    // Get freshest token
    let activeToken = token;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.access_token) activeToken = session.access_token;
    } catch { /* ignore */ }

    const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${functionName}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${activeToken}`,
        'apikey': SUPABASE_ANON_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(params),
    });

    if (!response.ok) {
      if (response.status === 401) {
        // Force refresh if 401
        try {
          const { data, error } = await supabase.auth.refreshSession();
          if (!error && data.session?.access_token) {
            const retryResponse = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${functionName}`, {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${data.session.access_token}`,
                'apikey': SUPABASE_ANON_KEY,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify(params),
            });
            if (retryResponse.ok) {
              const text = await retryResponse.text();
              return (text ? JSON.parse(text) : null) as T;
            }
          }
        } catch { /* ignore refresh error */ }
      }
      const errorText = await response.text();
      throw new Error(`RPC error ${response.status}: ${errorText}`);
    }

    const text = await response.text();
    return (text ? JSON.parse(text) : null) as T;
  },

  /**
   * GET with retry logic - returns null on failure instead of throwing
   */
  async getWithRetry<T = unknown>(endpoint: string, token: string, retries = 2): Promise<T | null> {
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        return await this.get<T>(endpoint, token);
      } catch (err) {
        if (attempt === retries) return null;
        await new Promise(r => setTimeout(r, 600));
      }
    }
    return null;
  },

  /**
   * Core fetch method with timeout and error handling
   */
  async fetch<T = unknown>(endpoint: string, token: string, options: FetchOptions = {}): Promise<T> {
    const { method = 'GET', body, headers = {}, timeout = 15000, signal } = options;

    const internalController = signal ? null : new AbortController();
    const timeoutId = internalController ? setTimeout(() => internalController.abort(), timeout) : null;
    const effectiveSignal = signal || internalController?.signal;

    // Get freshest token
    let activeToken = token;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.access_token) activeToken = session.access_token;
    } catch { /* ignore */ }

    const makeRequest = async (tokenToUse: string) => {
      return await fetch(`${SUPABASE_URL}/rest/v1/${endpoint}`, {
        method,
        headers: {
          'Authorization': `Bearer ${tokenToUse}`,
          'apikey': SUPABASE_ANON_KEY,
          'Content-Type': 'application/json',
          'Prefer': method === 'GET' ? 'return=representation' : method === 'POST' ? 'return=representation' : 'return=minimal',
          ...headers,
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: effectiveSignal,
      });
    };

    try {
      let response = await makeRequest(activeToken);

      if (response.status === 401) {
        // Force refresh and retry on 401 Unauthorized
        try {
          const { data, error } = await supabase.auth.refreshSession();
          if (!error && data.session?.access_token) {
            response = await makeRequest(data.session.access_token);
          }
        } catch { /* ignore refresh error */ }
      }

      if (timeoutId) clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`API error ${response.status}: ${errorText}`);
      }

      const text = await response.text();
      return (text ? JSON.parse(text) : null) as T;
    } catch (error) {
      if (timeoutId) clearTimeout(timeoutId);
      if (error instanceof Error && error.name === 'AbortError') {
        throw error;
      }
      throw error;
    }
  },
};
