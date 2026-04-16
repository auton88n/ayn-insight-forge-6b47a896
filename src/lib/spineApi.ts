/**
 * spineApi.ts — single API client for all spine.aynn.io calls
 * Replaces ALL supabase.from() and supabaseApi calls
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
    throw new Error(err.detail || err.error || `${res.status}`);
  }
  return res.json();
}

export const spineApi = {
  // Auth/User
  getMe:       () => req<any>('GET', '/auth/me'),
  getLimits:   () => req<any>('GET', '/user/limits'),
  getProfile:  () => req<any>('GET', '/user/profile'),
  acceptTerms: (d: any) => req('POST', '/user/terms', d),

  // Chats
  listChats:        () => req<any[]>('GET', '/chats'),
  getMessages:      (sid: string) => req<any[]>('GET', `/chats/${sid}`),
  saveMessage:      (sid: string, d: any) => req('POST', `/chats/${sid}`, d),
  deleteSession:    (sid: string) => req('DELETE', `/chats/${sid}`),
  getLatestSession: () => req<{ session_id: string | null }>('GET', '/chats/latest/session-id'),

  // World Intelligence
  getAllIntelligence: () => req<any>('GET', '/intelligence/all'),

  // Predictions (vote)
  votePrediction: (predId: string, vote: string, userId: string) =>
    req('POST', `/intelligence/vote`, { pred_id: predId, vote, user_id: userId }),
};
