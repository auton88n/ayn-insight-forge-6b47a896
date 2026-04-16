/**
 * spineAuth.ts — pure spine auth, no Supabase
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
  is_admin?: boolean;
}

export interface SpineSession {
  access_token: string;
  refresh_token: string;
  user: SpineUser;
}

export const tokenStore = {
  getAccessToken: () => localStorage.getItem(ACCESS_TOKEN_KEY),
  getRefreshToken: () => localStorage.getItem(REFRESH_TOKEN_KEY),
  getUser: (): SpineUser | null => {
    try { return JSON.parse(localStorage.getItem(USER_KEY) || 'null'); } catch { return null; }
  },
  save: (s: SpineSession) => {
    localStorage.setItem(ACCESS_TOKEN_KEY, s.access_token);
    localStorage.setItem(REFRESH_TOKEN_KEY, s.refresh_token);
    localStorage.setItem(USER_KEY, JSON.stringify(s.user));
  },
  clear: () => {
    localStorage.removeItem(ACCESS_TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  },
};

type AuthEvent = 'SIGNED_IN' | 'SIGNED_OUT' | 'TOKEN_REFRESHED' | 'USER_UPDATED' | 'PASSWORD_RECOVERY';
type AuthListener = (event: AuthEvent, session: SpineSession | null) => void;
const listeners: AuthListener[] = [];
const emit = (e: AuthEvent, s: SpineSession | null) => listeners.forEach(fn => fn(e, s));

async function post(path: string, body: object, token?: string) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${SPINE}${path}`, { method: 'POST', headers, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.detail?.[0]?.msg || data.detail || data.error || `Error ${res.status}`);
  return data;
}

let refreshPromise: Promise<SpineSession | null> | null = null;

async function doRefresh(): Promise<SpineSession | null> {
  const rt = tokenStore.getRefreshToken();
  if (!rt) return null;
  try {
    const data = await post('/auth/refresh', { refresh_token: rt });
    const session: SpineSession = { access_token: data.access_token, refresh_token: data.refresh_token, user: tokenStore.getUser()! };
    tokenStore.save(session);
    emit('TOKEN_REFRESHED', session);
    return session;
  } catch {
    tokenStore.clear();
    emit('SIGNED_OUT', null);
    return null;
  }
}

export const spineAuth = {
  async getSession() {
    const token = tokenStore.getAccessToken();
    const user = tokenStore.getUser();
    if (!token || !user) return { data: { session: null } };
    // Check if token is close to expiry
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      if (payload.exp * 1000 - Date.now() < 5 * 60 * 1000) {
        if (!refreshPromise) refreshPromise = doRefresh().finally(() => { refreshPromise = null; });
        const s = await refreshPromise;
        if (s) return { data: { session: s } };
      }
    } catch {}
    return { data: { session: { access_token: token, refresh_token: tokenStore.getRefreshToken()!, user } } };
  },

  async getUser() {
    const user = tokenStore.getUser();
    return { data: { user } };
  },

  async signInWithPassword({ email, password }: { email: string; password: string }) {
    try {
      const data = await post('/auth/login', { email, password });
      const session: SpineSession = { access_token: data.access_token, refresh_token: data.refresh_token, user: data.user };
      tokenStore.save(session);
      emit('SIGNED_IN', session);
      return { data: { session, user: data.user }, error: null };
    } catch (e: any) {
      return { data: { session: null, user: null }, error: { message: e.message } };
    }
  },

  async signUp({ email, password, options }: { email: string; password: string; options?: any }) {
    try {
      const name = options?.data?.full_name || '';
      const [first_name, ...rest] = name.split(' ');
      const data = await post('/auth/register', { email, password, first_name: first_name || '', last_name: rest.join(' ') || '' });
      const session: SpineSession = { access_token: data.access_token, refresh_token: data.refresh_token, user: data.user };
      tokenStore.save(session);
      emit('SIGNED_IN', session);
      return { data: { session, user: data.user }, error: null };
    } catch (e: any) {
      return { data: { session: null, user: null }, error: { message: e.message } };
    }
  },

  async signOut() {
    const rt = tokenStore.getRefreshToken();
    if (rt) post('/auth/logout', { refresh_token: rt }).catch(() => {});
    tokenStore.clear();
    emit('SIGNED_OUT', null);
    return { error: null };
  },

  async resetPasswordForEmail(email: string) {
    try { await post('/auth/forgot-password', { email }); return { error: null }; }
    catch (e: any) { return { error: { message: e.message } }; }
  },

  async refreshSession() {
    if (!refreshPromise) refreshPromise = doRefresh().finally(() => { refreshPromise = null; });
    const session = await refreshPromise;
    return { data: { session }, error: session ? null : { message: 'Session expired' } };
  },

  onAuthStateChange(callback: AuthListener) {
    listeners.push(callback);
    const user = tokenStore.getUser();
    const token = tokenStore.getAccessToken();
    if (user && token) {
      setTimeout(() => callback('SIGNED_IN', { access_token: token, refresh_token: tokenStore.getRefreshToken()!, user }), 0);
    }
    return { data: { subscription: { unsubscribe: () => { const i = listeners.indexOf(callback); if (i > -1) listeners.splice(i, 1); } } } };
  },

  async updateUser(updates: { password?: string }) {
    const token = tokenStore.getAccessToken();
    if (!token) return { error: { message: 'Not authenticated' } };
    try { await post('/auth/update-password', { password: updates.password }, token); return { error: null }; }
    catch (e: any) { return { error: { message: e.message } }; }
  },

  async resend(_p: any) { return { error: null }; },
  async signInWithOAuth(_p: any) { return { data: null, error: { message: 'Use email/password login' } }; },
  async getAccessToken() { return tokenStore.getAccessToken(); },
};

// Auto-refresh every 10 min
setInterval(async () => {
  const t = tokenStore.getAccessToken();
  if (!t) return;
  try {
    const p = JSON.parse(atob(t.split('.')[1]));
    if (p.exp * 1000 - Date.now() < 5 * 60 * 1000) {
      if (!refreshPromise) refreshPromise = doRefresh().finally(() => { refreshPromise = null; });
    }
  } catch {}
}, 10 * 60 * 1000);
