/**
 * spineApi.ts — single API client for all spine.aynn.io calls
 * Replaces ALL supabase.from(), supabase.functions.invoke(), and supabase.storage calls
 */
import { AYN_BACKEND_URL } from '@/config';
import { tokenStore } from './spineAuth';

const SPINE = AYN_BACKEND_URL || 'https://spine.aynn.io';

async function req<T = any>(method: string, path: string, body?: object): Promise<T> {
  const token = tokenStore.getAccessToken() || (typeof localStorage !== 'undefined' ? localStorage.getItem('ayn_admin_token') : null);
  const res = await fetch(`${SPINE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || err.error || `${res.status}`);
  }
  return res.json();
}

export const spineApi = {
  // ── Auth / User ────────────────────────────────────────────────────────────
  getMe:        () => req<any>('GET', '/auth/me'),
  getLimits:    () => req<any>('GET', '/user/limits'),
  getProfile:   () => req<any>('GET', '/user/profile'),
  updateProfile:(profile: object) => req('POST', '/user/profile', profile),
  acceptTerms:  (d: any) => req('POST', '/user/terms', d),

  // ── Memory ─────────────────────────────────────────────────────────────────
  getMemory:    () => req<any>('GET', '/user/memory'),
  upsertMemory: (key: string, value: any) => req('POST', '/user/memory', { key, value }),
  saveMemory:   (key: string, value: any) => req('POST', '/user/memory', { key, value }),
  deleteMemory: (key: string) => req('DELETE', `/user/memory/${key}`),

  // ── Settings / Preferences ─────────────────────────────────────────────────
  getSettings:      () => req<any>('GET', '/user/settings'),
  saveSettings:     (settings: object) => req('POST', '/user/settings', { settings }),
  getPreferences:   () => req<any>('GET', '/user/preferences'),
  savePreferences:  (prefs: object) => req('POST', '/user/preferences', prefs),

  // ── Beta Feedback ──────────────────────────────────────────────────────────
  submitBetaFeedback: (feedback: object) => req('POST', '/user/beta-feedback', feedback),

  // ── Pinned Chats ───────────────────────────────────────────────────────────
  getPinnedChats: () => req<any[]>('GET', '/user/pinned-chats'),
  pinChat:        (session_id: string, title: string) => req('POST', '/user/pinned-chats', { session_id, title }),
  unpinChat:      (session_id: string) => req('DELETE', `/user/pinned-chats/${session_id}`),

  // ── Avatar ─────────────────────────────────────────────────────────────────
  uploadAvatar: async (userId: string, file: File) => {
    const token = tokenStore.getAccessToken() || (typeof localStorage !== 'undefined' ? localStorage.getItem('ayn_admin_token') : null);
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

  // ── Chat Sessions ──────────────────────────────────────────────────────────
  listChats:        () => req<any[]>('GET', '/chats'),
  getMessages:      (sid: string) => req<any[]>('GET', `/chats/${sid}`),
  saveMessage:      (sid: string, d: any) => req('POST', `/chats/${sid}`, d),
  deleteSession:    (sid: string) => req('DELETE', `/chats/${sid}`),
  getLatestSession: () => req<{ session_id: string | null }>('GET', '/chats/latest/session-id'),

  // ── Generation ─────────────────────────────────────────────────────────────
  getSuggestions:  (context: string, mode: string) => req('POST', '/generate/suggestions', { context, mode }),
  getEyeBehaviors: () => req('POST', '/generate/eye-behaviors', {}),
  saveImage:       (image_url: string, prompt: string) => req('POST', '/generate/save-image', { image_url, prompt }),

  // ── File Upload ────────────────────────────────────────────────────────────
  uploadFile: (data: string, name: string, type: string, size: number) =>
    req<{ url: string; name: string; type: string }>('POST', '/upload', { data, name, type, size }),

  // ── Support ────────────────────────────────────────────────────────────────
  supportBot: (message: string, user_name?: string) => req('POST', '/support/bot', { message, user_name }),
  contactUs:  (name: string, email: string, message: string) => req('POST', '/support/contact', { name, email, message }),

  // ── Analytics ──────────────────────────────────────────────────────────────
  trackVisit: (visitor_id: string, page_path: string, referrer?: string) =>
    req('POST', '/analytics/track', { visitor_id, page_path, referrer }),
  logError:   (error_message: string, url?: string, context?: object) =>
    req('POST', '/analytics/error', { error_message, url, context }),

  // ── Payments ───────────────────────────────────────────────────────────────
  createCheckout: (price_id: string) => req('POST', '/payments/checkout', { price_id }),
  customerPortal: () => req('POST', '/payments/portal', {}),

  // ── Email ──────────────────────────────────────────────────────────────────
  sendEmail:       (to: string, subject: string, template: string, data: object) =>
    req('POST', '/email/send', { to, subject, template, data }),
  sendTicketReply: (ticket_id: string, content: string, user_email: string) =>
    req('POST', '/email/ticket-reply', { ticket_id, content, user_email }),
  sendReplyEmail:  (application_id: string, content: string, email: string) =>
    req('POST', '/email/reply', { application_id, content, email }),

  // ── Engineering ────────────────────────────────────────────────────────────
  engineeringChat:        (message: string, context: string) =>
    req('POST', '/engineering/chat', { message, context }),
  engineeringAnalysis:    (data: object, type: string) =>
    req('POST', '/engineering/analyze', { data, type }),
  engineeringAgent:       (task: string, context: object) =>
    req('POST', '/engineering/agent', { task, context }),
  generateDxf:            (data: object) => req('POST', '/engineering/dxf', { data }),
  generateEngineeringPdf: (data: object) => req('POST', '/engineering/pdf', { data }),
  generateCompliancePdf:  (data: object) => req('POST', '/engineering/compliance-pdf', { data }),

  // ── Analysis ───────────────────────────────────────────────────────────────
  analyzeChart:     (image: string, symbol: string, timeframe: string) =>
    req('POST', '/analyze/chart', { image, symbol, timeframe }),
  analyzeFloorPlan: (image: string, context?: string) =>
    req('POST', '/analyze/floor-plan', { image, context }),

  // ── Trading ────────────────────────────────────────────────────────────────
  getKlines: (symbol: string, interval: string, limit?: number) =>
    req('POST', '/trading/klines', { symbol, interval, limit: limit || 100 }),

  // ── Storage ────────────────────────────────────────────────────────────────
  storageUpload:  (bucket: string, path: string, data: string, content_type?: string) =>
    req('POST', '/storage/upload', { bucket, path, data, content_type }),
  storageGetUrl:  (bucket: string, path: string) =>
    req<{ public_url: string }>('GET', `/storage/url?bucket=${bucket}&path=${encodeURIComponent(path)}`),
  storageList:    (bucket: string, prefix?: string) =>
    req('GET', `/storage/list?bucket=${bucket}&prefix=${prefix || ''}`),
  storageDelete:  (bucket: string, path: string) =>
    req('DELETE', `/storage/delete?bucket=${bucket}&path=${encodeURIComponent(path)}`),

  // ── Marketing ──────────────────────────────────────────────────────────────
  brandScan:       (url: string) => req('POST', '/marketing/brand-scan', { url }),
  brandDna:        (url: string) => req('POST', '/marketing/brand-dna', { url }),
  creativeChat:    (message: string, brand_context?: object) =>
    req('POST', '/marketing/creative-chat', { message, brand_context }),
  generatePlan:    (topic: string, audience?: string) =>
    req('POST', '/marketing/generate-plan', { topic, audience }),
  generateThread:  (topic: string, tone?: string, count?: number) =>
    req('POST', '/marketing/generate-thread', { topic, tone, count }),
  postTweet:       (text: string) => req('POST', '/marketing/post', { text }),
  autoMarket:      () => req('POST', '/marketing/auto-market', {}),

  // ── World Intelligence ─────────────────────────────────────────────────────
  getAllIntelligence:        () => req<any>('GET', '/intelligence/all'),
  getAccuracy:               () => req<any[]>('GET', '/intelligence/accuracy'),
  getPredictionOutcomes:     (limit = 200) => req<any[]>('GET', `/intelligence/prediction-outcomes?limit=${limit}`),
  getAgentConversations:     (limit = 20) => req<any[]>('GET', `/intelligence/agent-conversations?limit=${limit}`),
  getAgentStates:            (limit = 100) => req<any[]>('GET', `/intelligence/agent-states?limit=${limit}`),
  getAgentMessages:          (conversation_id: string, limit = 200) =>
    req<any[]>('GET', `/intelligence/agent-messages?conversation_id=${conversation_id}&limit=${limit}`),
  getCriticalSignals:        (limit = 8) => req<any[]>('GET', `/intelligence/critical-signals?limit=${limit}`),
  getWorldSimulations:       (limit = 10) => req<any[]>('GET', `/intelligence/world-simulations?limit=${limit}`),
  getWorldEvents:            (simulation_run_id: string) =>
    req<any[]>('GET', `/intelligence/world-events?simulation_run_id=${simulation_run_id}`),
  votePrediction:            (pred_id: string, vote: string, user_id: string) =>
    req('POST', '/intelligence/vote', { pred_id, vote, user_id }),

  // ── Generic request escape hatch ──────────────────────────────────────────
  req: <T = any>(method: string, path: string, body?: object) => req<T>(method, path, body),
};

// ── Admin API (separate export) ────────────────────────────────────────────────
export const adminApi = {
  // Stats & Users
  getStats:           () => req<any>('GET', '/admin/stats'),
  getUsers:           () => req<any[]>('GET', '/admin/users'),
  getUserMessages:    (user_id: string) => req<any[]>('GET', `/admin/user-messages?user_id=${user_id}`),
  getHealth:          () => req<any>('GET', '/admin/health'),

  // Conversations / Messages
  getConversations:   () => req<any[]>('GET', '/admin/conversations'),
  getMessages:        (sid: string) => req<any[]>('GET', `/admin/conversations/${sid}`),

  // Errors
  getErrors:          (source?: string, status = 'open') =>
    req<any[]>('GET', `/admin/errors?status=${status}${source ? '&source=' + source : ''}`),
  resolveError:       (id: string, note = '') => req('POST', `/admin/errors/${id}/resolve`, { error_id: id, note }),

  // Subscriptions & Credits
  getSubscriptions:   () => req<any[]>('GET', '/admin/subscriptions'),
  giftCredits:        (user_id: string, amount: number, reason?: string) =>
    req('POST', '/admin/add-credits', { user_id, credits: amount, reason }),
  unblockUser:        (user_id: string) => req('POST', '/admin/unblock-user', { user_id }),

  // Support Tickets
  getSupportTickets:  () => req<any[]>('GET', '/admin/tickets'),
  updateTicket:       (id: string, d: any) => req('PATCH', `/admin/support-tickets/${id}`, d),
  replyTicket:        (id: string, msg: string) => req('POST', `/admin/support-tickets/${id}/reply`, { message: msg }),

  // Contact & Beta
  getContactMessages: () => req<any[]>('GET', '/admin/contact-messages'),
  getBetaFeedback:    () => req<any[]>('GET', '/admin/beta-feedback'),

  // Custom Orders & NDA
  getCustomOrders:    () => req<any[]>('GET', '/admin/orders'),
  createCustomOrder:  (d: any) => req('POST', '/admin/custom-orders', d),
  updateCustomOrder:  (id: string, d: any) => req('PATCH', `/admin/custom-orders/${id}`, d),
  getNdaAgreements:   () => req<any[]>('GET', '/admin/ndas'),
  createNda:          (d: any) => req('POST', '/admin/nda-agreements', d),

  // System Config
  getSystemConfig:    () => req<any[]>('GET', '/admin/config'),
  upsertSystemConfig: (key: string, value: any) => req('POST', '/admin/config', { key, value }),

  // Service Applications
  getServiceApplications: () => req<any[]>('GET', '/admin/service-applications'),

  // Analytics & Monitoring
  getLlmStats:        () => req<any>('GET', '/admin/llm'),
  getVisitorAnalytics:() => req<any>('GET', '/admin/analytics/summary'),
  getTestResults:     () => req<any[]>('GET', '/admin/test-results'),
  getRateLimits:      () => req<any[]>('GET', '/admin/rate-limits'),
  getNotificationLog: () => req<any[]>('GET', '/admin/notification-log'),

  // Payments & Revenue
  getStripeBalance:   () => req<any>('GET', '/payments/admin/balance'),
  getStripeCharges:   () => req<any[]>('GET', '/payments/admin/charges'),
  getStripeSubscriptions: () => req<any[]>('GET', '/payments/admin/subscriptions'),
  issueRefund:        (payment_intent_id: string, amount?: number) =>
    req('POST', '/payments/refund', { payment_intent_id, amount }),
  cancelSubscription: (sub_id: string) =>
    req('POST', `/payments/admin/cancel/${sub_id}`, {}),

  // PIN
  verifyAdminPin:     (pin: string) => req<{ valid: boolean; lockoutRemaining?: number }>('POST', '/admin/verify-pin', { pin }),
  setAdminPin:        (pin: string, new_pin: string) => req('POST', '/admin/set-pin', { pin, new_pin }),

  // AI Assistant
  aiAssistant:        (message: string, context?: string) =>
    req('POST', '/admin/ai-assistant', { message, context }),

  // Marketing (admin use)
  brandScan:          (url: string) => req('POST', '/marketing/brand-scan', { url }),
  brandDna:           (url: string) => req('POST', '/marketing/brand-dna', { url }),
  creativeChat:       (message: string, brand_context?: object) =>
    req('POST', '/marketing/creative-chat', { message, brand_context }),
  generateThread:     (topic: string, tone?: string, count?: number) =>
    req('POST', '/marketing/generate-thread', { topic, tone, count }),
  postTweet:          (text: string) => req('POST', '/marketing/post', { text }),
  autoMarket:         () => req('POST', '/marketing/auto-market', {}),

  // Engineering (admin tools)
  engineeringAnalysis: (data: object, type: string) =>
    req('POST', '/engineering/analyze', { data, type }),
  engineeringChat:    (message: string, context: string) =>
    req('POST', '/engineering/chat', { message, context }),

  // Email (admin actions)
  sendTicketReply:    (ticket_id: string, content: string, user_email: string) =>
    req('POST', '/email/ticket-reply', { ticket_id, content, user_email }),
  sendReplyEmail:     (application_id: string, content: string, email: string) =>
    req('POST', '/email/reply', { application_id, content, email }),
};
