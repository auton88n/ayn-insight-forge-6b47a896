/**
 * spineAuth.ts — self-hosted auth client for spine.aynn.io
 * 
 * Replaces Supabase Auth entirely.
 * Stores tokens in localStorage, mimics the Supabase auth API shape
 * so we can swap it in gradually.
 */

import { AYN_BACKEND_URL } from '@/config';

const SPINE = AYN_BACKEND_URL || 'https://spine.aynn.io';
const ACCESS_TOKEN_KEY  = 'ayn_access_token';
const REFRESH_TOKEN_KEY = 'ayn_refresh_token';
const USER_KEY          = 'ayn_user';

export interface SpineUser {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  subscription?: { tier: string; status: string };
  limits?: { daily_messages: number; current_daily_messages: number; bonus_credits: number };
}

export interface SpineSession {
  access_token: string;
  refresh_token: string;
  user: SpineUser;
}

// ── Token storage ─────────────────────────────────────────────────────────────

export const tokenStore = {
  getAccessToken: () => localStorage.getItem(ACCESS_TOKEN_KEY),
  getRefreshToken: () => localStorage.getItem(REFRESH_TOKEN_KEY),
  getUser: (): SpineUser | null => {
    try { return JSON.parse(localStorage.getItem(USER_KEY) || 'null'); } catch { return null; }
  },
  save: (session: SpineSession) => {
    localStorage.setItem(ACCESS_TOKEN_KEY, session.access_token);
    localStorage.setItem(REFRESH_TOKEN_KEY, session.refresh_token);
    localStorage.setItem(USER_KEY, JSON.stringify(session.user));
  },
  clear: () => {
    localStorage.removeItem(ACCESS_TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  }
};

// ── Auth state listeners (mimics Supabase onAuthStateChange) ──────────────────

type AuthEvent = 'SIGNED_IN' | 'SIGNED_OUT' | 'TOKEN_REFRESHED' | 'USER_UPDATED';
type AuthListener = (event: AuthEvent, session: SpineSession | null) => void;
const listeners: AuthListener[] = [];

function emit(event: AuthEvent, session: SpineSession | null) {
  listeners.forEach(fn => fn(event, session));
}

// ── Core API calls ────────────────────────────────────────────────────────────

async function spinePost(path: string, body: object, token?: string) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${SPINE}${path}`, { method: 'POST', headers, body: JSON.stringify(body) });
  const data = await res.json();
  if (!res.ok) throw new Error(data.detail?.[0]?.msg || data.detail || data.error || 'Request failed');
  return data;
}

async function spineGet(path: string, token: string) {
  const res = await fetch(`${SPINE}${path}`, {
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.detail || data.error || 'Request failed');
  return data;
}

// ── Refresh token rotation ────────────────────────────────────────────────────

let refreshPromise: Promise<SpineSession> | null = null;

async function refreshSession(): Promise<SpineSession | null> {
  const refreshToken = tokenStore.getRefreshToken();
  if (!refreshToken) return null;
  if (refreshPromise) return refreshPromise;

  refreshPromise = spinePost('/auth/refresh', { refresh_token: refreshToken })
    .then(data => {
      const session: SpineSession = {
        access_token: data.access_token,
        refresh_token: data.refresh_token,
        user: tokenStore.getUser()!,
      };
      tokenStore.save(session);
      emit('TOKEN_REFRESHED', session);
      return session;
    })
    .catch(() => {
      tokenStore.clear();
      emit('SIGNED_OUT', null);
      return null as any;
    })
    .finally(() => { refreshPromise = null; });

  return refreshPromise;
}

// ── Public API (matches Supabase auth shape) ──────────────────────────────────

export const spineAuth = {

  async getSession(): Promise<{ data: { session: SpineSession | null } }> {
    const token = tokenStore.getAccessToken();
    const user = tokenStore.getUser();
    if (!token || !user) return { data: { session: null } };
    return { data: { session: { access_token: token, refresh_token: tokenStore.getRefreshToken()!, user } } };
  },

  async getUser(): Promise<{ data: { user: SpineUser | null } }> {
    const token = tokenStore.getAccessToken();
    if (!token) return { data: { user: null } };
    try {
      const user = await spineGet('/auth/me', token);
      localStorage.setItem(USER_KEY, JSON.stringify(user));
      return { data: { user } };
    } catch {
      return { data: { user: tokenStore.getUser() } };
    }
  },

  async signInWithPassword({ email, password }: { email: string; password: string }) {
    try {
      const data = await spinePost('/auth/login', { email, password });
      const session: SpineSession = { access_token: data.access_token, refresh_token: data.refresh_token, user: data.user };
      tokenStore.save(session);
      emit('SIGNED_IN', session);
      return { data: { session, user: data.user }, error: null };
    } catch (e: any) {
      return { data: { session: null, user: null }, error: { message: e.message } };
    }
  },

  async signUp({ email, password, options }: { email: string; password: string; options?: { data?: { full_name?: string; company_name?: string } } }) {
    try {
      const nameParts = (options?.data?.full_name || '').split(' ');
      const data = await spinePost('/auth/register', {
        email,
        password,
        first_name: nameParts[0] || '',
        last_name: nameParts.slice(1).join(' ') || '',
      });
      const session: SpineSession = { access_token: data.access_token, refresh_token: data.refresh_token, user: data.user };
      tokenStore.save(session);
      emit('SIGNED_IN', session);
      return { data: { session, user: data.user }, error: null };
    } catch (e: any) {
      return { data: { session: null, user: null }, error: { message: e.message } };
    }
  },

  async signOut() {
    const refreshToken = tokenStore.getRefreshToken();
    if (refreshToken) {
      spinePost('/auth/logout', { refresh_token: refreshToken }).catch(() => {});
    }
    tokenStore.clear();
    emit('SIGNED_OUT', null);
    return { error: null };
  },

  async resetPasswordForEmail(email: string) {
    try {
      await spinePost('/auth/forgot-password', { email });
      return { error: null };
    } catch (e: any) {
      return { error: { message: e.message } };
    }
  },

  async refreshSession() {
    const session = await refreshSession();
    return { data: { session }, error: session ? null : { message: 'Session expired' } };
  },

  onAuthStateChange(callback: AuthListener) {
    listeners.push(callback);
    // Immediately fire with current state
    const session = tokenStore.getAccessToken() ? {
      access_token: tokenStore.getAccessToken()!,
      refresh_token: tokenStore.getRefreshToken()!,
      user: tokenStore.getUser()!,
    } : null;
    if (session?.user) setTimeout(() => callback('SIGNED_IN', session), 0);
    return {
      data: {
        subscription: {
          unsubscribe: () => {
            const idx = listeners.indexOf(callback);
            if (idx > -1) listeners.splice(idx, 1);
          }
        }
      }
    };
  },

  // Stubs for Supabase-only features (not needed with spine auth)
  async resend(_params: any) {
    return { error: null }; // No email verification needed with spine
  },

  async signInWithOAuth(_params: any) {
    return { data: null, error: { message: 'OAuth not supported yet — use email/password' } };
  },

  async updateUser(updates: { password?: string }) {
    const token = tokenStore.getAccessToken();
    if (!token || !updates.password) return { error: { message: 'No token or password' } };
    try {
      await spinePost('/auth/update-password', { password: updates.password }, token);
      return { error: null };
    } catch (e: any) {
      return { error: { message: e.message } };
    }
  },

  // Provide access token for API calls
  async getAccessToken(): Promise<string | null> {
    return tokenStore.getAccessToken();
  },
};

// Auto-refresh: check token every 10min, refresh if < 5min left
setInterval(async () => {
  const token = tokenStore.getAccessToken();
  if (!token) return;
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    const expiresIn = payload.exp * 1000 - Date.now();
    if (expiresIn < 5 * 60 * 1000) await refreshSession();
  } catch {}
}, 10 * 60 * 1000);
