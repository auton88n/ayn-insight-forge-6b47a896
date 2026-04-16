/**
 * spineApi.ts — API client for spine.aynn.io
 * Replaces all direct Supabase REST calls for chats, messages, user data
 */
import { AYN_BACKEND_URL } from '@/config';
import { tokenStore } from './spineAuth';

const SPINE = AYN_BACKEND_URL || 'https://spine.aynn.io';

async function req<T>(method: string, path: string, body?: object): Promise<T> {
  const token = tokenStore.getAccessToken();
  const res = await fetch(`${SPINE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || err.error || `Request failed: ${res.status}`);
  }
  return res.json();
}

export const spineApi = {
  // ── Chats ────────────────────────────────────────────────────────────────
  listChats: () => req<Array<{ session_id: string; title: string; updated_at: string }>>('GET', '/chats'),
  
  getMessages: (sessionId: string) => req<Array<any>>('GET', `/chats/${sessionId}`),
  
  saveMessage: (sessionId: string, data: { role: string; content: string; title?: string; intent_type?: string; model_used?: string }) =>
    req('POST', `/chats/${sessionId}`, data),
  
  deleteSession: (sessionId: string) => req('DELETE', `/chats/${sessionId}`),
  
  getLatestSessionId: () => req<{ session_id: string | null }>('GET', '/chats/latest/session-id'),

  // ── User ─────────────────────────────────────────────────────────────────
  getMe: () => req<any>('GET', '/auth/me'),

  // ── User ─────────────────────────────────────────────────────────────────
  getLimits: () => req<any>('GET', '/user/limits'),
  getProfile: () => req<any>('GET', '/user/profile'),
  acceptTerms: (data: { privacy: boolean; terms: boolean; ai_disclaimer: boolean }) =>
    req('POST', '/user/terms', data),

  // ── Intelligence ─────────────────────────────────────────────────────────
  getAllIntelligence: () => req<any>('GET', '/intelligence/all'),
};
