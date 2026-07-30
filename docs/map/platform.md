# AYN AI platform map (everything besides the extension and Resume Hub)

## The chat (v3.8.0: it is candidate search, nothing else)
There is exactly ONE conversational surface in the product's web app, and it belongs to employers. It takes an employer from "I have a role to fill" to "here are the three best candidates". It is not a career coach, not a general assistant, and it does not chat about anything else.

SEEKERS HAVE NO DASHBOARD CHAT. v3.8.0 removed it. Index.tsx AuthedShell now sends a signed in job seeker straight to /resume-hub. The seeker talks to AYN through Ask AYN in the extension, grounded in one real job description plus their resume, which is unchanged. Deleted with it: the ayn-unified edge function (index.ts, jobContext.ts, systemPrompts.ts, llmGateway.ts, emotionDetector.ts, memoryHandler.ts) and src/hooks/useCopilotStarters.ts. The eye UI files (src/components/eye/, src/components/dashboard/, src/hooks/useMessages.ts, useAYN.ts, src/lib/aynPersonality.ts) are still in the repo but have no route reaching them.

WHY. A real session produced three paragraphs of career direction with headings, unsupported flattery ("a perfect fit", "a huge asset"), and an offer to "find specific open roles in Toronto", a capability that does not exist anywhere in the product. A general purpose chat promises things the product cannot do, so the general purpose chat is gone.

WIDGET INTAKE (src/components/employer/IntakeWizard.tsx). The employer does not free type a role. They answer one question at a time by clicking, with a "type it instead" escape on every step. An opening description is optional and, when given, is run through employer_spec_extract so answered questions are skipped. Sequence:
1. Role title. Text with common title suggestions.
2. Seniority. Buttons: intern, entry, mid, senior, staff or principal, manager, director or above.
3. Must have skills. Chips, max 6, autocompleted from employer_skill_catalog, which only returns skills that exist in candidate_skills for opted in candidates, with a live count per skill so over-constraining is visible.
4. Nice to have skills. Same widget, max 6, optional.
5. Location and remote. Buttons on site / hybrid / remote, plus a location field unless fully remote.
6. Employment type. Buttons: full time, contract, part time, internship.
7. Minimum years. Buttons: any, 2 plus, 5 plus, 8 plus, 10 plus.
8. Work eligibility. Country plus must already be authorised / open to sponsoring.
Then an editable JobSpec summary card. Clicking any line reopens that single widget. "Find candidates" calls employer_match.

RESULTS AND EVALUATION (src/components/employer/CandidateChat.tsx, employer_results_chat). The chat under the results is scoped to the candidates THAT search returned, grounded only in what employer_match returned: compare them, explain a score, explain a gap. A detail that was not returned is reported as not available, never guessed. The model never sees names, emails, phones or user ids. Sending a proposal is unchanged from v3.6.0.

OFF TOPIC RULE. Anything that is not defining the role or evaluating the returned candidates gets one short sentence saying AYN only helps find candidates for a role, then the current intake question again. No answer to the off topic question, no lecture.

CAPABILITY DENIALS, stated plainly when asked. AYN cannot search job boards. It cannot find open roles. It cannot contact candidates beyond sending a proposal. It cannot see candidates who have not opted into discovery.

EVIDENCE RULE. No praise without evidence. Every statement about fit points at something in that candidate's returned profile. No "perfect fit", no "huge asset", no "exactly what you are looking for". Voice rules unchanged: no markdown symbols, no asterisks, no bullet characters, short sentences, no em dashes, no en dashes.

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

