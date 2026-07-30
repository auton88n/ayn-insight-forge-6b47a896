# AYN AI platform map (everything besides the extension and Resume Hub)

## Chat dashboard (v3.7.0: it is a job search copilot)
/ renders LandingPage for visitors, Dashboard (src/components/Dashboard.tsx + dashboard/, eye/) for signed-in users. The emotional eye UI (EmotionalEye, AYNSpeechBubble, ResponseCard, StreamingMarkdown) is the chat surface. Chat flows through src/hooks/useMessages.ts and hooks/chat/ (useSSEStream, useIntentDetection, useMessagePersistence) to the ayn-unified edge function. Emotion state: stores/emotionStore + lib/emotionMapping (the eye reacts to conversation). File uploads via useFileUpload, pinned chats, i18n via LanguageContext (en, ar, fr in src/i18n).

WHAT THE CHAT IS. Until v3.7.0 this was a general purpose assistant with a market intelligence persona: ayn-unified was roughly 1500 lines that scanned crypto pairs, pulled commodity prices, built country profiles, ran an autonomous paper trading loop, and branched into structural engineering. That is why a job seeker got answers about gold and oil. v3.7.0 deleted all of it, along with the engineering intent, EngineeringContext, calculatorType and buildingCode. There is now exactly one persona: a job search copilot grounded in the signed-in person's own data.

FILES. supabase/functions/ayn-unified/index.ts (auth, per-chat cap of 100, plan limit via check_user_ai_limit, injection logging, SSE passthrough that strips [MEMORY:] tags), jobContext.ts (the grounding builder), systemPrompts.ts (one prompt, buildCopilotSystemPrompt), llmGateway.ts (chains trimmed to chat / deep / files), emotionDetector.ts, memoryHandler.ts. src/lib/aynPersonality.ts is the client-side echo of the same voice and no longer mentions engineering.

GROUNDING. jobContext.ts reads server side with the service role, from the user's own rows only: identity via _shared/identity.ts, user_profile_canonical (skills with level, years and recency; work history with achievements; education; certifications; preferences; work eligibility), jobs plus the newest job_matches score and breakdown per job, talent_pool_consent, pending reveal_requests with the org name, and user_memory. It closes with a WHAT IS MISSING list that names the exact Resume Hub tab to fix each gap, so the copilot points instead of guessing. PII BOUNDARY: email, phone, address, postal code and profile links are never loaded into the prompt. The client sends messages and nothing that becomes a fact about the user.

STARTERS. An empty chat opens with three prompts built from real state (src/hooks/useCopilotStarters.ts): a pending proposal, an unscored or low scoring saved job, an empty profile group, discovery being off. They are emitted through useBubbleAnimation.emitSuggestions, the same channel as follow-ups.

TWO CHATS, ONE VOICE, SEPARATE PROMPTS. ext_ask in the extension answers questions about ONE job description with the resume as support, in a page side panel, with no memory. The dashboard copilot answers questions about a CAREER with the whole account as support, with memory. They deliberately do not share a prompt: merging them would either drag the JD context into career advice or dilute the extension's grounding, which is its entire value. What they do share is the voice rules (lowercase, no markdown symbols, no em dashes, never invent experience) and _shared/identity.ts. If a third surface appears, extract the shared voice block, not the whole prompt.


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

## Employer mode (v2.9.0-B)

`src/components/dashboard/EmployerChatPanel.tsx` is a full-surface overlay opened from a "Hiring mode" button in the top right of the dashboard shell. It is entirely separate from the seeker chat pipeline: it does not go through `useAYN` / `ayn-ai-proxy`. All calls hit `src/lib/employer.ts`, which is a thin session-JWT wrapper around `supabase/functions/resume-hub` employer actions.

Flow inside the panel:
1. On open, `employer_org_get`. If no org, the assistant greets with the sales-oriented line "Search AYN's talent pool for candidates who match your open role. First, register your company so I can start finding candidates." above the inline register card; `employer_org_create` sets up the org + admin membership. (v2.9.1: same "Hiring mode" button in the dashboard shell, no separate route — clicking it just opens the panel directly on the register card for a user with no org.)
2. Free-text chat → `employer_intake_chat` (at most 3 clarifying questions, then a JobSpec).
3. When JobSpec lands, an editable spec card exposes a "Find candidates" button → `employer_match`.
4. Results render as anonymized candidate cards with score ring, matched must-haves, gaps, and grounded "why" bullets. "Request intro" calls `employer_reveal_request`; contact reveal happens only after the candidate approves in ProfileTab.

Seeker-side surface (v2.9.1): `src/pages/ResumeHub.tsx` fetches `reveal_list` on mount and, if any request is pending, shows a small primary-colored count badge on the Profile rail icon (aria-labeled "N intro requests") and a "<n> companies want an intro" line at the top of the Talent Pool card in `ProfileTab.tsx`, so a seeker notices an incoming request without hunting for it.

