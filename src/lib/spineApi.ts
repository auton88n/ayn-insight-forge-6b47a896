/**
 * spineApi.ts — single API client for all spine.aynn.io calls
 * All Supabase edge-function and table calls flow through here.
 */
import { AYN_BACKEND_URL } from '@/config';
import { tokenStore } from './spineAuth';

const SPINE = AYN_BACKEND_URL || 'https://spine.aynn.io';

export async function req<T = any>(method: string, path: string, body?: object): Promise<T> {
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
    const err = await res.json().catch(() => ({} as any));
    throw new Error(err.detail || err.error || `HTTP ${res.status}`);
  }
  // 204 / empty
  const text = await res.text();
  return (text ? JSON.parse(text) : null) as T;
}

export const spineApi = {
  // Generic escape hatch (used by many call sites)
  req,

  // ── Generation ─────────────────────────────────────────────
  getSuggestions:  (context: string, mode: string) => req('POST', '/generate/suggestions', { context, mode }),
  getEyeBehaviors: () => req('POST', '/generate/eye-behaviors', {}),
  saveImage:       (image_url: string, prompt: string) => req<{ permanentUrl?: string; error?: string }>('POST', '/generate/save-image', { image_url, prompt }),

  // ── Upload ────────────────────────────────────────────────
  uploadFile: (data: string, name: string, type: string, size: number) =>
    req<{ url: string; name: string; type: string }>('POST', '/upload', { data, name, type, size }),

  // ── Support ───────────────────────────────────────────────
  supportBot: (message: string, user_name?: string) => req('POST', '/support/bot', { message, user_name }),
  contactUs:  (name: string, email: string, message: string) => req('POST', '/support/contact', { name, email, message }),

  // ── Analytics ─────────────────────────────────────────────
  trackVisit: (visitor_id: string, page_path: string, referrer?: string) =>
    req('POST', '/analytics/track', { visitor_id, page_path, referrer }),
  logError: (error_message: string, url?: string, context?: object) =>
    req('POST', '/analytics/error', { error_message, url, context }),

  // ── Payments ──────────────────────────────────────────────
  createCheckout: (price_id: string) => req<{ url: string }>('POST', '/payments/checkout', { price_id }),
  customerPortal: () => req<{ url: string }>('POST', '/payments/portal', {}),

  // ── Auth / User ───────────────────────────────────────────
  getMe:       () => req<any>('GET', '/auth/me'),
  getLimits:   () => req<any>('GET', '/user/limits'),
  getProfile:  () => req<any>('GET', '/user/profile'),
  acceptTerms: (d: any) => req('POST', '/user/terms', d),
  saveMemory:  (key: string, value: string) => req('POST', '/user/memory', { key, value }),

  // ── Pinned chats ──────────────────────────────────────────
  getPinnedChats: () => req<any[]>('GET', '/user/pinned-chats'),
  pinChat:        (session_id: string, title: string) => req('POST', '/user/pinned-chats', { session_id, title }),
  unpinChat:      (session_id: string) => req('DELETE', `/user/pinned-chats/${session_id}`),

  // ── Avatar ────────────────────────────────────────────────
  uploadAvatar: async (_userId: string, file: File) => {
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

  // ── Chats ─────────────────────────────────────────────────
  listChats:        () => req<any[]>('GET', '/chats'),
  getMessages:      (sid: string) => req<any[]>('GET', `/chats/${sid}`),
  saveMessage:      (sid: string, d: any) => req('POST', `/chats/${sid}`, d),
  deleteSession:    (sid: string) => req('DELETE', `/chats/${sid}`),
  getLatestSession: () => req<{ session_id: string | null }>('GET', '/chats/latest/session-id'),

  // ── World Intelligence ────────────────────────────────────
  getAllIntelligence: () => req<any>('GET', '/intelligence/all'),
  votePrediction:     (predId: string, vote: string, userId: string) =>
    req('POST', '/intelligence/vote', { pred_id: predId, vote, user_id: userId }),

  // ── Engineering ───────────────────────────────────────────
  engineeringChat:        (message: string, context: string) => req('POST', '/engineering/chat', { message, context }),
  engineeringAnalysis:    (data: object, type: string) => req('POST', '/engineering/analyze', { data, type }),
  engineeringAgent:       (task: string, context: object) => req('POST', '/engineering/agent', { task, context }),
  generateDxf:            (data: object) => req<{ url?: string; dxf?: string }>('POST', '/engineering/dxf', { data }),
  generateEngineeringPdf: (data: object) => req<{ url?: string }>('POST', '/engineering/pdf', { data }),
  generateCompliancePdf:  (data: object) => req<{ url?: string }>('POST', '/engineering/compliance-pdf', { data }),

  // ── Email ─────────────────────────────────────────────────
  sendEmail:       (to: string, subject: string, template: string, data: object) =>
    req('POST', '/email/send', { to, subject, template, data }),
  sendTicketReply: (ticket_id: string, content: string, user_email: string) =>
    req('POST', '/email/ticket-reply', { ticket_id, content, user_email }),
  sendReplyEmail:  (application_id: string, content: string, email: string) =>
    req('POST', '/email/reply', { application_id, content, email }),

  // ── Trading / chart ──────────────────────────────────────
  analyzeChart: (image: string, symbol: string, timeframe: string) =>
    req('POST', '/analyze/chart', { image, symbol, timeframe }),
  analyzeFloorPlan: (image: string) => req('POST', '/analyze/floor-plan', { image }),
  getKlines:    (symbol: string, interval: string, limit: number) =>
    req<{ klines: any[] }>('POST', '/trading/klines', { symbol, interval, limit }),

  // ── Admin ────────────────────────────────────────────────
  verifyAdminPin: (pin: string) => req<{ success: boolean; locked?: boolean; lockoutRemaining?: number }>('POST', '/admin/verify-pin', { pin }),
  setAdminPin:    (pin: string, newPin: string) => req('POST', '/admin/set-pin', { pin, new_pin: newPin }),
  getAdminUsers:  () => req<any>('GET', '/admin/users'),
  getAdminStats:  () => req<any>('GET', '/admin/stats'),
};

// ── Admin (typed surface) ─────────────────────────────────
export const adminApi = {
  getStats:               () => req<any>('GET', '/admin/stats'),
  getUsers:               () => req<any[]>('GET', '/admin/users'),
  getConversations:       () => req<any[]>('GET', '/admin/conversations'),
  getMessages:            (sid: string) => req<any[]>('GET', `/admin/conversations/${sid}`),
  getErrors:              (source?: string, status = 'open') => req<any[]>('GET', `/admin/errors?status=${status}${source ? '&source=' + source : ''}`),
  resolveError:           (id: string, note = '') => req('POST', `/admin/errors/${id}/resolve`, { error_id: id, note }),
  getSubscriptions:       () => req<any[]>('GET', '/admin/subscriptions'),
  getContactMessages:     () => req<any[]>('GET', '/admin/contact-messages'),
  getBetaFeedback:        () => req<any[]>('GET', '/admin/beta-feedback'),
  giftCredits:            (user_id: string, amount: number, reason: string) => req('POST', '/admin/gift-credits', { user_id, amount, reason }),
  getHealth:              () => req<any>('GET', '/admin/health'),
  getSupportTickets:      () => req<any[]>('GET', '/admin/support-tickets'),
  updateTicket:           (id: string, d: any) => req('PATCH', `/admin/support-tickets/${id}`, d),
  replyTicket:            (id: string, msg: string) => req('POST', `/admin/support-tickets/${id}/reply`, { message: msg }),
  getCustomOrders:        () => req<any[]>('GET', '/admin/custom-orders'),
  createCustomOrder:      (d: any) => req('POST', '/admin/custom-orders', d),
  updateCustomOrder:      (id: string, d: any) => req('PATCH', `/admin/custom-orders/${id}`, d),
  getNdaAgreements:       () => req<any[]>('GET', '/admin/nda-agreements'),
  createNda:              (d: any) => req('POST', '/admin/nda-agreements', d),
  getSystemConfig:        () => req<any[]>('GET', '/admin/system-config'),
  upsertSystemConfig:     (key: string, value: any) => req('POST', '/admin/system-config', { key, value }),
  getServiceApplications: () => req<any[]>('GET', '/admin/service-applications'),
  getLlmStats:            () => req<any>('GET', '/admin/llm-stats'),
  getVisitorAnalytics:    () => req<any>('GET', '/admin/visitor-analytics'),
};
