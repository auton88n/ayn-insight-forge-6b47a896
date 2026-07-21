# AYN AI platform map (everything besides the extension and Resume Hub)

## Chat dashboard
/ renders LandingPage for visitors, Dashboard (src/components/Dashboard.tsx + dashboard/, eye/) for signed-in users. The emotional eye UI (EmotionalEye, AYNSpeechBubble, ResponseCard, StreamingMarkdown) is the chat surface. Chat flows through src/hooks/useAYN.ts and hooks/chat/ (useSSEStream, useIntentDetection, useMessagePersistence) to the ayn-ai-proxy edge function: multi-model LLM proxy guarded by header x-proxy-secret (env AYN_PROXY_SECRET) plus x-source; supports streaming, fallback models, intents. Emotion state: src/contexts/AYNEmotionContext + stores/emotionStore + lib/emotionMapping (the eye reacts to conversation). File uploads via useFileUpload, saved images gallery, pinned chats, tutorial overlay (useTutorial), i18n via LanguageContext (en, ar, fr in src/i18n).

## World Intelligence and agent society
/world-intelligence (src/pages/WorldIntelligence.tsx + components/dashboard/simulator/): MiroFish-style swarm simulator, five stages Seed -> Graph -> Simulate -> Report -> Chat, driven by useEnginSim against engin.aynn.io (external engine, src/lib/enginApi.ts). The ayn-agent-society edge function is the world simulation backend: modes simulate (layers 1 to 6, batched), get_agents (world_personas table, 73 seeded personas), chat (in character), get_conversations, get_messages.

## cc-generate
Edge function producing structured team documents from updates: manager_report, ceo_brief, action_plan, qa. System prompts enforce the no-em-dash style. Consumed by dashboard document tools (DocumentStudio, eye document cards).

## Subscriptions and credits
src/contexts/SubscriptionContext: tiers (free plus paid; paid gives unlimited credits and engineering calcs), startCheckout via Stripe, pages /pricing, /dashboard/pricing, /subscription-success, /subscription-canceled. Usage tracking hooks (useUsageTracking) and tier limits in src/constants/tierLimits.ts.

## Support system
/support: src/components/support/ (AISupportChat, FAQBrowser, TicketForm, TicketList, UserTicketDetail) with admin counterparts (SupportManagement, TicketDetailModal). Contact page at /contact writes contact messages viewed in admin.

## Contracts and NDA signing
/sign/:token (ClientSign) and /nda/:token (NDASign) are anon signing pages powered by the sign-document edge function: the ONLY write path to custom_orders and nda_agreements for unauthenticated visitors holding a signing_token; stores generated files in the generated-files bucket. Admin side: NDAManager, ContractAI, CustomOrders, /admin/custom-orders.

## Admin app
/manage-bae76e99d97e188b mounts src/admin-app (AdminApp, adminSupabase client, useAdminQuery with adminRpc). /admin deliberately 404s. Panels in src/components/admin: user management, revenue, AI cost, LLM management, error and rate-limit monitoring, email broadcast, beta feedback, analytics, test-results dashboards, AYN mind and activity logs. Admin gate: AdminPinGate.

## Standalone
/resume-match uses the resume-match edge function (honest recruiter scoring, JSON verdict with comparisonRows). scripts/perpetual_predict.py plus .github/workflows/perpetual-predictions.yml: scheduled market prediction job writing snapshots (ayn_market_snapshot migration). public/sw.js service worker. e2e/ Playwright suites cover the platform (auth, dashboard, admin, security, stress); they target the platform, run them only when touching platform code.

## Servers
server.js: express static host for dist/ with SPA fallback and cache headers (/assets immutable, /frames 7 days). backend/server.py: FastAPI health stub only. Real backend = Supabase edge functions + RLS tables.
