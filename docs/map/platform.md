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

RESULTS AND EVALUATION (v3.9.0, src/components/employer/CandidateAskCards.tsx, employer_card_answer). There is no free-form chat anywhere in the product any more. The results chat was removed because it described the role wrongly, contradicted itself on years of experience, and leaked internal refs like c1. Under each candidate sits a row of four question cards: Why this score, What is missing, Compare to the others (hidden when only one candidate came back), What to ask in a screen. Each is one stateless server call grounded in the stored search row: the role line is hard-coded into the prompt from the JobSpec, years of experience is asserted as fact when recorded, a missing detail is reported as not available and never guessed. Answers are cached client side per candidate and card. The model never sees names, emails, phones or user ids.

THE PROPOSAL MESSAGE (v3.9.0). Opening the proposal dialog fires employer_draft_proposal, which returns a written message citing only the matched requirements. The employer edits it. If drafting fails, the box stays empty and sending still works.

OFF TOPIC RULE. Anything that is not defining the role or evaluating the returned candidates gets one short sentence saying AYN only helps find candidates for a role, then the current intake question again. No answer to the off topic question, no lecture.

CAPABILITY DENIALS, stated plainly when asked. AYN cannot search job boards. It cannot find open roles. It cannot contact candidates beyond sending a proposal. It cannot see candidates who have not opted into discovery.

EVIDENCE RULE. No praise without evidence. Every statement about fit points at something in that candidate's returned profile. No "perfect fit", no "huge asset", no "exactly what you are looking for". Voice rules unchanged: no markdown symbols, no asterisks, no bullet characters, short sentences, no em dashes, no en dashes.

## World Intelligence and agent society
/world-intelligence (src/pages/WorldIntelligence.tsx + components/dashboard/simulator/): MiroFish-style swarm simulator, five stages Seed -> Graph -> Simulate -> Report -> Chat, driven by useEnginSim against engin.aynn.io (external engine, src/lib/enginApi.ts). The ayn-agent-society edge function is the world simulation backend: modes simulate (layers 1 to 6, batched), get_agents (world_personas table, 73 seeded personas), chat (in character), get_conversations, get_messages.

## Subscriptions and credits
src/contexts/SubscriptionContext: tiers (free plus paid; paid gives unlimited credits), startCheckout via Stripe, pages /pricing, /dashboard/pricing, /subscription-success, /subscription-canceled. Usage tracking hooks (useUsageTracking) and tier limits in src/constants/tierLimits.ts.

## Support system
/support: src/components/support/ (AISupportChat, FAQBrowser, TicketForm, TicketList, UserTicketDetail) with admin counterparts (SupportManagement, TicketDetailModal). Contact page at /contact writes contact messages viewed in admin.

## Legacy signing pages
/sign/:token (ClientSign) and /nda/:token (NDASign) are the last remnants of a retired document signing product. They still resolve, backed by the sign-document edge function, so links already sent do not break. No admin surface points at them any more.

## Admin app
/manage-bae76e99d97e188b mounts src/admin-app (AdminApp, adminSupabase client, useAdminQuery with adminRpc). /admin deliberately 404s. Six sections in src/components/admin/sections: Overview, Employers, Candidates, Marketplace, Money, System.

### The gate (v3.26.0)
Sign in, then user_roles must say 'admin', then the 4 digit PIN. Two things changed. The 'duty' role is gone from the gate: every admin RPC checks has_role(auth.uid(),'admin') only, so a duty user used to pass the PIN and then read "Admin access required" on every panel. Duty is now denied at the door. And the PIN can no longer be skipped from devtools: checkAdmin reads user_roles BEFORE it looks at any cached flag, and the cache no longer holds a user id it holds an HMAC signed ticket minted by admin-auth-pin on a correct PIN (payload userId.exp, signed server side, 8 hour window). A new admin-auth-pin action, check { ticket }, re-verifies it, so a hand written sessionStorage value fails and drops the browser back to the PIN screen.

Every admin read and write goes through adminRpc in useAdminQuery, which sets the Authorization header explicitly to dodge the "Multiple GoTrueClient" session conflict. The last hold out, the settings write in AdminPanel, now goes through useSetSystemConfig on the same path instead of calling supabase.rpc directly.

### Reindex (v3.26.0)
candidate_index.indexed_at and candidate_index.embedding_model are nullable. The admin Candidates reindex button calls admin_mark_candidates_stale, which nulls both columns; while they were NOT NULL that call would have thrown on the first real candidate. employer_match coerces with (r.embedding_model || FALLBACK_EMBED_MODEL), so a nulled row reads as stale against the current spec model and is picked up by the bounded 25 per run inline reindex.


### Kill switches (v3.25.0, real for the first time)
Six keys, every one defaulting to ON when absent: platform, candidate_search, proposals, assessments, tailoring, signups. The admin panel writes them with admin_set_feature_flag and the optional per switch message with admin_set_feature_message (max 300 chars), both into system_config under feature_flags and feature_flag_messages. Three readers:
1. Server. supabase/functions/resume-hub/index.ts calls get_feature_flags through the service client, caches the answer for 30 seconds, and gates work in featureGate. platform is checked on every gate, so a full stop covers everything, and the link_* auth actions run before the gate so people can still sign in and read the notice. ACTION_FLAG maps the rest: candidate_search covers employer_spec_extract, employer_skill_catalog and employer_match; proposals covers employer_draft_proposal and employer_reveal_request; assessments covers employer_assessment_generate, employer_assessment_send, assessment_start, assessment_answer and assessment_submit (reading history through assessment_list and employer_assessment_list is never gated); tailoring covers smart_tailor, ext_cover_letter_text and the web lane tailor and cover_letter. A blocked call answers 503 with { code: "feature_disabled", feature, message }.
2. Database. handle_new_user raises when signups is off, so account creation stops even outside the app. Existing people can still sign in.
3. Frontend. get_feature_flags stays executable by anon so a signed out visitor sees a platform off message too. src/hooks/useFeatureFlags.ts polls every 60 seconds and shares one cache; src/components/shared/MaintenanceNotice.tsx renders the switch message in place of the feature (MaintenanceNotice, FeatureGate) or as a full screen (PlatformMaintenanceScreen, used by Index AuthedShell and ResumeHub). src/lib/featureError.ts turns a 503 feature_disabled body into FeatureDisabledError, refreshes the flag cache so the surface repaints as switched off, and the api wrappers in src/lib/employer.ts, resumeHub.ts and assessments.ts all throw it.

## Standalone
/resume-match uses the resume-match edge function (honest recruiter scoring, JSON verdict with comparisonRows). scripts/perpetual_predict.py plus .github/workflows/perpetual-predictions.yml: scheduled market prediction job writing snapshots (ayn_market_snapshot migration). public/sw.js service worker. e2e/ Playwright suites cover the platform (auth, dashboard, admin, security, stress); they target the platform, run them only when touching platform code.

## Servers
server.js: express static host for dist/ with SPA fallback and cache headers (/assets immutable, /frames 7 days). backend/server.py: FastAPI health stub only. Real backend = Supabase edge functions + RLS tables.

## Employer mode (v2.9.0-B)

`src/components/dashboard/EmployerChatPanel.tsx` is a full-surface overlay opened from a "Hiring mode" button in the top right of the dashboard shell. It is entirely separate from the seeker chat pipeline: it does not go through `useAYN` / `ayn-ai-proxy`. All calls hit `src/lib/employer.ts`, which is a thin session-JWT wrapper around `supabase/functions/resume-hub` employer actions.

Flow inside the panel:
1. On open, `employer_org_get`. If no org, the assistant greets with the sales-oriented line "Search AYN's talent pool for candidates who match your open role. First, register your company so I can start finding candidates." above the inline register card; `employer_org_create` sets up the org + admin membership. (v2.9.1: same "Hiring mode" button in the dashboard shell, no separate route — clicking it just opens the panel directly on the register card for a user with no org.)
2. v3.8.0: no free-text intake. `employer_spec_extract` prefills a JobSpec from the optional opening description, then IntakeWizard asks the remaining questions as widgets (`employer_skill_catalog` backs the skill chips).
3. When JobSpec lands, an editable spec card exposes a "Find candidates" button → `employer_match`.
4. Results render as anonymized candidate cards with score ring, matched must-haves, gaps, and grounded "why" bullets. "Request intro" calls `employer_reveal_request`; contact reveal happens only after the candidate approves in ProfileTab.

Seeker-side surface (v2.9.1): `src/pages/ResumeHub.tsx` fetches `reveal_list` on mount and, if any request is pending, shows a small primary-colored count badge on the Profile rail icon (aria-labeled "N intro requests") and a "<n> companies want an intro" line at the top of the Talent Pool card in `ProfileTab.tsx`, so a seeker notices an incoming request without hunting for it.

