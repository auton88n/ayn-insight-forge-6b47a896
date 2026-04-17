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
  // Generation
  getSuggestions:  (context: string, mode: string) => req('POST', '/generate/suggestions', { context, mode }),
  getEyeBehaviors: () => req('POST', '/generate/eye-behaviors', {}),
  saveImage:       (image_url: string, prompt: string) => req('POST', '/generate/save-image', { image_url, prompt }),

  // Upload
  uploadFile:      (data: string, name: string, type: string, size: number) =>
                     req<{url: string, name: string, type: string}>('POST', '/upload', { data, name, type, size }),

  // Support
  supportBot:      (message: string, user_name?: string) => req('POST', '/support/bot', { message, user_name }),
  contactUs:       (name: string, email: string, message: string) => req('POST', '/support/contact', { name, email, message }),

  // Analytics
  trackVisit:      (visitor_id: string, page_path: string, referrer?: string) =>
                     req('POST', '/analytics/track', { visitor_id, page_path, referrer }),
  logError:        (error_message: string, url?: string, context?: object) =>
                     req('POST', '/analytics/error', { error_message, url, context }),

  // Payments
  createCheckout:  (price_id: string) => req('POST', '/payments/checkout', { price_id }),
  customerPortal:  () => req('POST', '/payments/portal', {}),

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
  getSupportTickets:    () => req<any[]>('GET', '/admin/support-tickets'),
  updateTicket:         (id: string, d: any) => req('PATCH', `/admin/support-tickets/${id}`, d),
  replyTicket:          (id: string, msg: string) => req('POST', `/admin/support-tickets/${id}/reply`, { message: msg }),
  getCustomOrders:      () => req<any[]>('GET', '/admin/custom-orders'),
  createCustomOrder:    (d: any) => req('POST', '/admin/custom-orders', d),
  updateCustomOrder:    (id: string, d: any) => req('PATCH', `/admin/custom-orders/${id}`, d),
  getNdaAgreements:     () => req<any[]>('GET', '/admin/nda-agreements'),
  createNda:            (d: any) => req('POST', '/admin/nda-agreements', d),
  getSystemConfig:      () => req<any[]>('GET', '/admin/system-config'),
  upsertSystemConfig:   (key: string, value: any) => req('POST', '/admin/system-config', { key, value }),
  getServiceApplications: () => req<any[]>('GET', '/admin/service-applications'),
  getLlmStats:          () => req<any>('GET', '/admin/llm-stats'),
  getVisitorAnalytics:  () => req<any>('GET', '/admin/visitor-analytics'),
};

// ─── Extended API methods added in full migration ─────────────────────────────

  // Engineering
  engineeringChat:     (message: string, context: string) =>
                         req('POST', '/engineering/chat', { message, context }),
  engineeringAnalysis: (data: object, type: string) =>
                         req('POST', '/engineering/analyze', { data, type }),
  engineeringAgent:    (task: string, context: object) =>
                         req('POST', '/engineering/agent', { task, context }),
  generateDxf:         (data: object) => req('POST', '/engineering/dxf', { data }),
  generateEngineeringPdf: (data: object) => req('POST', '/engineering/pdf', { data }),
  generateCompliancePdf:  (data: object) => req('POST', '/engineering/compliance-pdf', { data }),

  // Admin
  verifyAdminPin:  (pin: string) => req('POST', '/admin/verify-pin', { pin }),
  setAdminPin:     (pin: string, newPin: string) => req('POST', '/admin/set-pin', { pin, new_pin: newPin }),
  getAdminUsers:   () => req('GET', '/admin/users'),
  getAdminStats:   () => req('GET', '/admin/stats'),

  // Email
  sendEmail:         (to: string, subject: string, template: string, data: object) =>
                       req('POST', '/email/send', { to, subject, template, data }),
  sendTicketReply:   (ticket_id: string, content: string, user_email: string) =>
                       req('POST', '/email/ticket-reply', { ticket_id, content, user_email }),
  sendReplyEmail:    (application_id: string, content: string, email: string) =>
                       req('POST', '/email/reply', { application_id, content, email }),

  // Memory
  saveMemory:        (key: string, value: string) =>
                       req('POST', '/user/memory', { key, value }),

  // Chart analysis
  analyzeChart:      (image: string, symbol: string, timeframe: string) =>
                       req('POST', '/analyze/chart', { image, symbol, timeframe }),
