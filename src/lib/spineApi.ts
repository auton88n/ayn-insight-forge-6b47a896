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

  // Pinned chats
  getPinnedChats: () => req<any[]>('GET', '/user/pinned-chats'),
  pinChat: (session_id: string, title: string) => req('POST', '/user/pinned-chats', { session_id, title }),
  unpinChat: (session_id: string) => req('DELETE', `/user/pinned-chats/${session_id}`),

  // Avatar
  uploadAvatar: async (userId: string, file: File) => {
    const SPINE = (await import('@/config')).AYN_BACKEND_URL || 'https://spine.aynn.io';
    const { tokenStore } = await import('@/lib/spineAuth');
    const token = tokenStore.getAccessToken();
    const fd = new FormData();
    fd.append('file', file);
    const res = await fetch(`${SPINE}/user/avatar`, {
      method: 'POST',
      headers: token ? { 'Authorization': `Bearer ${token}` } : {},
      body: fd,
    });
    if (!res.ok) throw new Error('Upload failed');
    return res.json();
  },

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

// ── Admin ──────────────────────────────────────────────────────────────────
export const adminApi = {
  getStats:          () => req<any>('GET', '/admin/stats'),
  getUsers:          () => req<any[]>('GET', '/admin/users'),
  getConversations:  () => req<any[]>('GET', '/admin/conversations'),
  getMessages:       (sid: string) => req<any[]>('GET', `/admin/conversations/${sid}`),
  getErrors:         (source?: string, status = 'open') => req<any[]>('GET', `/admin/errors?status=${status}${source ? '&source=' + source : ''}`),
  resolveError:      (id: string, note = '') => req('POST', `/admin/errors/${id}/resolve`, { error_id: id, note }),
  getSubscriptions:  () => req<any[]>('GET', '/admin/subscriptions'),
  getContactMessages:() => req<any[]>('GET', '/admin/contact-messages'),
  getBetaFeedback:   () => req<any[]>('GET', '/admin/beta-feedback'),
  giftCredits:       (user_id: string, amount: number, reason: string) => req('POST', '/admin/gift-credits', { user_id, amount, reason }),
  getHealth:         () => req<any>('GET', '/admin/health'),
};
