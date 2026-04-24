/**
 * Edge function endpoints
 * Centralized API endpoint definitions
 */

export const API_ENDPOINTS = {
  // AI & Chat
  AYN_UNIFIED: 'ayn-unified',
  GENERATE_SUGGESTIONS: 'generate-suggestions',
  GENERATE_DOCUMENT: 'generate-document',
  AI_EDIT_IMAGE: 'ai-edit-image',
  AI_CAPTION_GENERATOR: 'ai-caption-generator',
  
  // Engineering
  ENGINEERING_AI_CHAT: 'engineering-ai-chat',
  ENGINEERING_AI_AGENT: 'engineering-ai-agent',
  ENGINEERING_AI_ANALYSIS: 'engineering-ai-analysis',
  ENGINEERING_AI_ASSISTANT: 'engineering-ai-assistant',
  ENGINEERING_AI_VALIDATOR: 'engineering-ai-validator',
  GENERATE_DXF: 'generate-dxf',
  GENERATE_ENGINEERING_PDF: 'generate-engineering-pdf',
  GENERATE_GRADING_DESIGN: 'generate-grading-design',
  GENERATE_GRADING_DXF: 'generate-grading-dxf',
  PARSE_SURVEY_FILE: 'parse-survey-file',
  PARSE_PDF_DRAWING: 'parse-pdf-drawing',
  
  // Auth & User
  AUTH_SEND_EMAIL: 'auth-send-email',
  DELETE_ACCOUNT: 'delete-account',
  CHECK_SUBSCRIPTION: 'check-subscription',
  
  // Payments
  CREATE_CHECKOUT: 'create-checkout',
  CUSTOMER_PORTAL: 'customer-portal',
  STRIPE_WEBHOOK: 'stripe-webhook',
  
  // Support
  SUPPORT_BOT: 'support-bot',
  SEND_TICKET_NOTIFICATION: 'send-ticket-notification',
  SEND_TICKET_REPLY: 'send-ticket-reply',
  
  // Admin
  ADMIN_AI_ASSISTANT: 'admin-ai-assistant',
  ADMIN_NOTIFICATIONS: 'admin-notifications',
  VERIFY_ADMIN_PIN: 'verify-admin-pin',
  SET_ADMIN_PIN: 'set-admin-pin',
  APPROVE_PIN_CHANGE: 'approve-pin-change',
  APPROVE_ACCESS: 'approve-access',
  
  // Email
  SEND_EMAIL: 'send-email',
  SEND_CONTACT_EMAIL: 'send-contact-email',
  SEND_APPLICATION_EMAIL: 'send-application-email',
  SEND_REPLY_EMAIL: 'send-reply-email',
  SEND_USAGE_ALERT: 'send-usage-alert',
  
  // Files
  FILE_UPLOAD: 'file-upload',
  SAVE_GENERATED_IMAGE: 'save-generated-image',
  
  // Analytics & Tracking
  TRACK_VISIT: 'track-visit',
  GOOGLE_ANALYTICS: 'google-analytics',
  MEASURE_UX: 'measure-ux',
  
  // Testing (Admin)
  AI_TEST_AGENT: 'ai-test-agent',
  AI_TEST_RUNNER: 'ai-test-runner',
  AI_COMPREHENSIVE_TESTER: 'ai-comprehensive-tester',
  RUN_REAL_TESTS: 'run-real-tests',
  
  // Trading
  ANALYZE_TRADING_CHART: 'analyze-trading-chart',
  
  // Health
  HEALTH: 'health',
} as const;

export type ApiEndpoint = typeof API_ENDPOINTS[keyof typeof API_ENDPOINTS];
