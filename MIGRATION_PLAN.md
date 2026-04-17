# AYN Migration Plan: Supabase → Python Spine

## Architecture Decision
All services move to spine.aynn.io (Railway Python). 
Supabase kept ONLY for Postgres database (data storage).
No more edge functions.

## Phase 1: DONE ✅
- /auth (login, register, refresh, logout, me)
- /chat (main AI — replaces ayn-unified)
- /chats (sessions + messages)
- /user/limits (replaces check-subscription)
- Background jobs (scheduler)

## Phase 2: Core endpoints needed NOW
Priority = used on every page load or core flow

### /generate/suggestions
Called by: useMessages.ts when chat loads
Replaces: generate-suggestions
Does: returns 3 suggested questions based on context

### /generate/eye-behaviors  
Called by: AYN orb animation
Replaces: generate-eye-behaviors
Does: returns emotion/animation config

### /upload
Called by: file attachment in chat
Replaces: file-upload
Does: uploads file to storage, returns URL

### /admin/verify-pin + /admin/set-pin
Called by: AdminPinGate.tsx
Replaces: verify-admin-pin, set-admin-pin
Does: verifies 6-digit admin PIN

### /support/bot
Called by: support chat widget
Replaces: support-bot
Does: AI response for support tickets

## Phase 3: Email endpoints
All use Resend API

### /email/contact → send-contact-email
### /email/application → send-application-email  
### /email/ticket-notification → send-ticket-notification
### /email/ticket-reply → send-ticket-reply
### /email/reply → send-reply-email

## Phase 4: Engineering endpoints (complex)
### /engineering/analyze → engineering-ai-analysis
### /engineering/chat → engineering-ai-chat
### /engineering/agent → engineering-ai-agent
### /engineering/pdf → generate-engineering-pdf
### /engineering/dxf → generate-dxf

## Phase 5: Payments (Stripe)
### /payments/checkout → create-checkout
### /payments/portal → customer-portal
### /payments/webhook → stripe-webhook

## Phase 6: Analytics + Admin
### /analytics/track → track-visit
### /admin/ai-assistant → admin-ai-assistant

## Frontend Migration Pattern
For each endpoint:
1. Add Python route to spine
2. Add spineApi.ts method
3. Replace supabase.functions.invoke() in frontend
4. Remove Supabase call
