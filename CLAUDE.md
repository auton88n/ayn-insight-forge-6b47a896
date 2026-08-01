# CLAUDE.md - AYN System Map (index)

Read THIS file first, then open ONLY the domain file you need from docs/map/. Do not re-explore the codebase for questions these files answer. Total cost to orient: this index plus one domain file.

MAINTENANCE RULE: any commit that changes a seam, message type, backend action, table, or version MUST update the matching map file in the same commit.

Last verified: v3.26.0 admin panel audit, four fixes. One, candidate_index.indexed_at and candidate_index.embedding_model are nullable now, so the Candidates reindex button (admin_mark_candidates_stale nulls both) no longer throws a not null violation on the first real candidate; employer_match already coerces with (r.embedding_model || FALLBACK_EMBED_MODEL), so a nulled row is treated as stale and rebuilt by the bounded 25 per run inline reindex, and the update was tested against a live row. Two, the 'duty' role is dropped from the admin gate: every admin RPC checks has_role(auth.uid(),'admin') only, so duty could pass the PIN and then read "Admin access required" everywhere, and it is now denied at the door. Three, the PIN can no longer be skipped from devtools: AdminApp checks user_roles before it honours any cached flag, and the cache holds an HMAC signed 8 hour ticket minted by admin-auth-pin, re-verified through a new check { ticket } action, instead of a forgeable user id. Four, the settings write in AdminPanel moved onto adminRpc (useSetSystemConfig) like every other admin call. Details in docs/map/platform.md.

Preceded by v3.25.0 the kill switches are real. The admin Kill switches pane used to write flags nothing read. Now resume-hub reads get_feature_flags through the service client with a 30 second cache and refuses the work behind each switch with a 503 carrying { code: "feature_disabled", feature, message }, handle_new_user raises when signups is off, and the frontend shows the switch message in place of the feature instead of an error toast. Six keys: platform, candidate_search, proposals, assessments, tailoring, signups, all defaulting to on. Details in docs/map/platform.md.



Preceded by v3.21.0 clean the repo. Sixty eight dead Supabase edge functions were deleted from the deployment; on the repo side only cc-generate had source left, and it is gone. supabase/functions now holds resume-hub, resume-match, stripe-billing, stripe-webhook, sign-document, ayn-agent-society and _shared. The frontend lost every module tied to a retired product: src/components/eye/, transcript/, tutorial/, creators/, debug/, the unreachable src/components/dashboard/ chat shell, src/hooks/chat/, useAYN, useMessages, useChatSession, useConversationFlow, usePinnedChats, the emotion hooks and stores, usePredictionGraph, useImagePersistence, useTutorial, useActionTracker, aynPersonality, emotionMapping, userEmotionDetection, gradingStandards, reportParser, grading and tutorial types, and src/constants/routes.ts plus apiEndpoints.ts (both still listed trading and engineering endpoints). README and this file now describe the job search product only.

Preceded by v3.20.0 new admin. The legacy 30-tab admin is deleted (AdminDashboard, TestResultsDashboard and the whole test-results/ folder, VisitorAnalytics, GoogleAnalytics, LLMManagement, AYNMindDashboard, SystemMonitoring, CronControl, FAQManagement, ConversationViewer, Beta/Message feedback viewers, ApplicationManagement, CustomOrders, NDAManager, DocumentStudio, ContractAI, UserAILimits, AdminAIAssistant, AYNActivityLog, RevenueDashboard, SubscriptionManagement, CreditGift*, UserDetailPage, plus src/pages/AdminCustomOrders.tsx and the /admin/custom-orders route, src/lib/browserTestRunner.ts and src/lib/userJourneyTests.ts). What replaces it is six sections in src/components/admin/sections/: OVERVIEW (seekers, discoverable, employers, proposals, assessments, credits, AI spend, and a pending-employer callout), EMPLOYERS (the approval queue is the only gate into the pool: approve starts a 30 day free month, decline records an internal note, plus manual plan change and trial extension), CANDIDATES (talent pool health: stale index, thin profiles, embedding models, bounded 25 per run reindex), MARKETPLACE (proposal funnel, acceptance rate per employer, assessment funnel and verdicts), MONEY (Stripe backed MRR, plans, failed payments, credit ledger, AI cost) and SYSTEM (accounts, support, errors, rate limits, AI cost, email, terms consent, settings as panes). Data comes from new admin-only SECURITY DEFINER RPCs (get_admin_overview / _employers / _candidates / _marketplace / _money, admin_employer_approve / _decline / _override, admin_mark_candidates_stale), each one raising "Admin access required" unless has_role(auth.uid(),'admin'). Access is unchanged: /manage-bae76e99d97e188b, login then user_roles check then the server-side 4 digit PIN. Branding: .admin-surface on <body> re-points the tokens and the two non-token Button variants to AYN ember, same trick as .employer-surface. July 2026.

Preceded by v3.13.0 verification assessments. An employer can send a candidate a short assessment before deciding whether to spend a proposal. Questions are generated from that candidate's own claimed background against the JobSpec of the search they were found in, and the prompt (QUALITY_MODEL) probes lived experience rather than textbook knowledge, so doing the work is the only way to answer well. Three new tables, and the split between them is the security design: assessments (candidate readable, SELECT only, anon has nothing, all writes via service_role), assessment_rubrics and assessment_results (ALL privileges revoked from anon and authenticated, service_role only, verified with has_table_privilege after the migration). The candidate never sees a score, only growth notes; the employer sees score, verdict, per question observations and the milliseconds spent per question, because a flawless four paragraph answer written in eleven seconds is the signal. The timer is enforced from the server side started_at, never a client clock. Ten new resume-hub actions: employer_assessment_generate, employer_assessment_send, employer_assessment_list, assessment_list, assessment_start, assessment_answer, assessment_submit, assessment_growth_notes. UI: AssessmentDialog and AssessmentsPanel on a new employer Assessments tab, "Send an assessment" beside "Send a job proposal" in the candidate dialog, and a badged Assessments tab in Resume Hub for the candidate. July 2026.

Preceded by v3.12.0 employer surface, properly. Nine fixes from real testing. The buttons were still black because the shadcn Button variants in this repo are written with bg-foreground and border-foreground, not bg-primary, so redefining --primary under .employer-surface never reached them; index.css now retints button.bg-foreground and button.border-foreground inside the scope (measured: primary resolves to rgb(249,112,21), outline stays transparent, both 44px tall, with a real gap and Start over clearly secondary). The proposal draft prompt was rewritten from a match report into an invitation: greeting, one line on the company, at most two specifics about the person, an invitation to talk, then what happens next, with skills-with-years and the phrase "must-have skills" explicitly forbidden. Intake persistence was broken two ways: the save effect returned early while the phase was "opening" so the free text opener was never written at all, and the step position was never stored, so a restored draft reopened at the first unanswered question; the step now travels inside phase as "asking:<step>" (column read widened from 24 to 64 chars). The candidate background block no longer renders profile_text: employer_match attaches a structured buildCandidateProfile block (header, skills grouped by level, experience rows, education, seeking) that never emits a label for an empty value, and buildProfileText itself was fixed to stop producing "YoE: ." and "Education: BSc  at". EmployerHub now has an AYN branded header with a company menu (Company profile, Sign out), a left nav in the Resume Hub language (Search, Proposals, Company) that is not rendered while the v3.11.0 gate is closed, and the company profile behind a dialog rather than a card in the flow. Resume Hub's "Back" button was replaced by the AYN mark with Sign out in a right side menu. The legacy dashboard is deleted (src/components/Dashboard.tsx and src/components/dashboard/DashboardContainer.tsx) and /dashboard plus /dashboard/* redirect to "/", which routes by role. July 2026.

Preceded by v3.11.0 company profile first. The company profile is a required onboarding step, not a settings form: an employer cannot run a candidate search or send a proposal until name, website, industry, headquarters, company size and an about paragraph of at least 80 characters are filled in (LinkedIn and logo stay optional). While required fields are missing, EmployerHub renders ONLY the onboarding company profile, and the same rule is enforced server side by assertOrgProfileComplete in resume-hub, which returns 428 from employer_spec_extract, employer_match and employer_reveal_request. Clearing a required field later re-locks the surface in place and names the field. Nudges are specific lines per missing field, no percentage bar. July 2026.



Preceded by v3.10.1 the employer surface is actually orange. v3.10.0 added the .employer-surface token scope in src/index.css but never applied the class, so every employer primary button still resolved to the black --primary. EmployerHub.tsx now sets the class on all three root wrappers AND adds it to document.body for the lifetime of the surface, because Radix Dialog, AlertDialog, Popover and Select portal their content into document.body, outside the page tree. CompanyProfile is now rendered in EmployerHub (it had no caller), and the seeker Proposals card shows the employer's industry, size, headquarters, website, logo and about text. July 2026.

Preceded by v3.9.0 drafted proposals, no free chat. The last free-form chat in the product is gone. Under each candidate in EmployerHub there is now a row of fixed question cards (Why this score, What is missing, Compare to the others, What to ask in a screen), each one stateless server call grounded in the stored employer_searches row, cached client side per candidate and card. Backend action employer_results_chat is replaced by employer_card_answer, and employer_draft_proposal now pre-writes the proposal message from the JobSpec and the match result so the box is never empty. Three testing bugs fixed at the prompt level: the role is hard-coded into every prompt from the JobSpec so it can never be re-described, recorded years of experience is asserted as fact instead of called unspecified, and internal refs like c1 are both forbidden and stripped server side. Files: src/components/employer/CandidateAskCards.tsx added, src/components/employer/CandidateChat.tsx deleted. July 2026.

Preceded by v3.8.0 the chat is candidate search, nothing else. The seeker dashboard chat is deleted. It was producing career direction essays with headings, unsupported flattery, and an offer to "find open roles in Toronto", a capability the product does not have. Index.tsx AuthedShell now routes a signed in job seeker to /resume-hub; seekers talk to AYN only through Ask AYN in the extension, grounded in one real job description. Deleted: the whole supabase/functions/ayn-unified function and src/hooks/useCopilotStarters.ts. Left in the repo but unreachable by any route: src/components/Dashboard.tsx, src/components/dashboard/, src/components/eye/, src/hooks/useMessages.ts, useAYN.ts, src/lib/aynPersonality.ts. The one remaining conversational surface is the employer candidate search in EmployerHub: a widget driven intake (title, seniority, must have skills with live candidate counts, nice to have, location and remote, employment type, minimum years, work eligibility) into an editable JobSpec, then employer_match, then a chat scoped to evaluating those three candidates only. Backend actions employer_intake_chat is gone, replaced by employer_spec_extract, employer_skill_catalog and employer_results_chat. Off topic gets one sentence and the intake question again. No praise without evidence. July 2026.

Preceded by v3.6.0 the proposal loop. The two sides of AYN are connected end to end for the first time. An approved employer no longer lands in the seeker dashboard: Index.tsx AuthedShell routes them to src/pages/EmployerHub.tsx, which finally calls employerApi.intake, .match and .sendProposal (all three had zero callers before this release). The employer describes a role, edits the JobSpec, reads up to three candidates with score, evidence, gaps and a skills provenance split, and sends a JOB PROPOSAL: job title, location, employment type, salary range, link to the posting, and a message up to 1000 characters. reveal_requests is now the proposals table (same name, eight new columns) with two rate limits: one open proposal per org and candidate at a time, and no new proposal within 30 days of a decline. The seeker reads proposals on a new Proposals tab in Resume Hub, badged with the pending count and surfaced as the first Home next-action; accepting is the only thing that releases name, email and phone. Discovery copy is now one line per idea. No transactional email path exists in the repo, so notification is in-app only. Preceded by v3.5.1 honest discovery consent: employers see the full profile (not an "anonymized" one), turning discovery ON opens a confirmation dialog, and talent_pool_set records consent_version (current value v3.5.1-full-profile). Preceded by v3.5.0 "a profile that can actually be matched": Profile is FIVE collapsible groups; skills carry level, years and last used; work history rows expand to industry, team size and achievement bullets; autosave on blur. Still one profile, one resume: BuilderTab.tsx is gone, tailored documents are outputs downloaded from JobsTab.

Preceded by "v3.0.1 tracker removal" and "v3.0.0 autofill removal — the extension is read only. Deleted the entire write path and the fill-only backend surface. Permissions are activeTab, storage, sidePanel, webNavigation with https only."

## What AYN is

AYN is a job search product with two sides.

For job seekers: a Chrome extension that reads the job posting off the page, scores it against their resume and profile, and generates a tailored resume and cover letter for that specific role. Plus Resume Hub, a web app holding one resume, one profile, saved jobs, and proposals.

For employers: a chat that turns a described role into a structured spec, searches candidates who opted into discovery, returns the three best fits with the evidence behind each, and lets them send an assessment or a job proposal. Contact details are shared only when the candidate accepts.

Stack: React and Vite frontend, Supabase (Postgres, pgvector, edge functions, auth, storage), Stripe for billing, Chrome MV3 extension.

Matching: a deterministic prefilter on extracted skills, then vector recall, then a grounded rerank. Candidates are never invented and skills are tagged extracted or inferred.

One repo, one Supabase backend (project dfkoxuokfkttjhfjcecx). Solo founder: Ghazi. Site aynn.io. Deployed via Lovable (project a2fa8496-aed3-4f21-93fc-bbbabc069583) which pushes to this GitHub repo.

| Area | What it is | Map file |
|---|---|---|
| Chrome extension | Sideloaded MV3 extension, READ ONLY since v3.0.0: reads the real job description off the page, scores the match, tailors resumes and cover letters, answers questions about the job. It never writes to a page. Code: extension/. | docs/map/extension.md |
| Resume Hub | Web workspace at /resume-hub: one profile holding the one active resume, saved jobs with their tailored documents, get discovered, proposals, assessments, extension management. Code: src/components/resume-hub/, src/lib/resumeHub.ts, src/lib/resumeDocs.ts, src/lib/extension.ts. Backend: supabase/functions/resume-hub. | docs/map/resume-hub.md |
| Employer surface | /`EmployerHub`: company profile gate, widget intake to JobSpec, candidate match, ask cards, assessments, proposals. Backend: employer actions in supabase/functions/resume-hub. | docs/map/platform.md |
| Platform | Admin panel, billing and credits, support, landing page, World Intelligence simulator. Code: src/components/admin, support, landing; src/admin-app; src/pages/*. | docs/map/platform.md |

## Routes (src/App.tsx)

/ (landing, or role based routing when signed in), /resume-hub, /resume-match, /handoff, /extension/approve, /employer/pending, /settings, /pricing, /billing, /support, /contact, /world-intelligence, /sign/:token, /nda/:token (legacy signing pages, still live), /terms, /privacy, /reset-password, /subscription-success|canceled, /approval-result, /manage-bae76e99d97e188b (admin app; /admin redirects to 404 on purpose). /dashboard and /dashboard/* redirect to /.

## Edge functions (v3.21.0)

Only these remain: resume-hub (the monolith: extension actions, hub actions, employer actions, assessments), resume-match, stripe-billing, stripe-webhook, sign-document, ayn-agent-society, plus _shared. Everything else was deleted in v3.21.0.


## Global rules (apply everywhere)

1. GENERATED, never hand-edit: public/ayn-extension.zip and public/ayn-extension-version.json. Run node extension/build.mjs.
2. Version bump protocol: manifest.json version + content.js AYN_BUILD fallback, then build.mjs (which rewrites the version file).
3. Never write to the applications or job_applications tables. Both trackers are deprecated and the Tracker UI was deleted in v3.0.1.
4. The extension is read only. Never add code that writes to, clicks, or types into a page.
5. User-facing writing style: no em dashes, no en dashes, ranges use "to". This rule is also baked into the AI system prompts in cc-generate and resume-match.
6. servers: server.js is the express static host for dist/ (SPA fallback, caching for /assets and /frames). backend/server.py is a FastAPI health stub only, not a real backend. The real backend is Supabase edge functions.
7. memory/PRD.md describes an older platform-era snapshot; trust the docs/map files over it.
8. scripts/check-wiring.mjs must pass; it verifies sidepanel messages have handlers, extension actions are registered, and Hub actions are session-reachable.


## The nervous system (how signals actually flow)

```
                    aynn.io (Resume Hub)
                    │  AYN_PROFILE_UPDATED / AYN_PING / handoff deep link
                    ▼
 job page ───► extension sidepanel + background.js ───► resume-hub edge fn ───► Supabase tables
 (content.js         JD resolver ladder                 (14 ext actions,          (jobs, resumes,
  read only)         score / tailor / cover / ask        2 auth lanes)             ai_result_cache)
                    ▲
                    └── saved jobs, scores and applications ──► Hub tabs read the same tables
```

Four loops carry everything:

1. READ LOOP: content.js extracts the JD from the live page (site selector map, JSON-LD and meta fallback); the background JD resolver ladder (manual paste, current page, opener tab, registry, listing fetch, backend lookup) upgrades it until jdQuality >= 45. Everything downstream is grounded on that text.
2. SYNC LOOP: profile edited in the Hub -> AYN_PROFILE_UPDATED clears the extension's cached identity -> next read refetches. 24h TTL is the fallback for closed browsers.
3. GAP LOOP (v3.1.0): _shared/tailoring.ts computes matched / missing / nice-to-have deterministically from the JD against structured sections, the model only surfaces and phrases, and the same analysis is returned to the sidepanel so the user sees what is genuinely missing from their background.
4. HANDOFF LOOP: Hub tailors a resume for a job -> deep link carries resumeId -> sidepanel preselects that resume_versions row for scoring, tailoring, and cover letters.
5. MATCH LOOP (v2.9.0-B): seeker opts in -> indexCandidate builds anonymized profile_text + 768d embedding + extracted/inferred skills -> employer_intake_chat distills a JobSpec -> employer_match runs extracted-only prefilter (must-haves), pgvector recall (top 12), then a single grounded rerank on opaque refs (inferred capped at 10 pts) -> top 3 anonymous cards. The ref_map that binds refs to real users never leaves the edge function.
6. PROPOSAL LOOP (v3.6.0): employer opens a card in EmployerHub and reads the full anonymous reasoning -> sends a job proposal (title, location, type, salary, link, message ≤1000 chars) through employer_reveal_request, rate limited to one open proposal per org and candidate and blocked for 30 days after a decline -> the row lands in reveal_requests -> the seeker sees it on the Resume Hub Proposals tab, badged in the rail and first in Home next-actions -> reveal_decide records accept or decline -> ONLY on accept does employer_reveal_status return name, email and phone. Everything before that step is anonymous, enforced in the edge function, not in the UI.


## Honest assessment (strengths, weaknesses, what is actually smart)

STRENGTHS AND MOAT
- Everything AYN now promises runs on our own backend: JD extraction, match scoring, tailoring, cover letters, talent pool matching. No hostile territory, no probability disguised as a guarantee.
- JD grounding is the real asset: a six-tier resolver plus a quality score means the AI is never asked to judge a job from a nav bar and a cookie banner.
- Unified identity (_shared/identity.ts) feeds scoring, tailoring, and cover letters from one place, so quality fixes land everywhere at once.
- Device-token auth (scoped, revocable, no passwords).

WEAKNESSES AND RISKS
- supabase/functions/resume-hub/index.ts is still a large monolith with no unit tests (e2e/ covers the legacy platform, not the extension). content.js is down to ~970 lines after v3.0.0.
- Distribution: sideload only. No auto update, no Chrome Web Store trust signal; users silently rot on old builds. Biggest product risk today.
- The legacy platform roughly doubles repo weight, confuses tooling and new contributors, and its e2e suites can mislead CI signals.
- Bus factor of one (solo founder). These map files are the mitigation; keeping them current is not optional.

WHAT IS ACTUALLY SMART HERE (for an AI forming a mental model fast)
The core insight that survived v3.0.0: on modern job pages, the DOM is a liar and the visible text is the truth. That is why the reader (site selectors, JSON-LD fallback, quality scoring, the resolver ladder) is the part worth defending. Writing to those same pages was the part that could never be made reliable, so it is gone. Judge any proposed change against that split: read deeply, never write.
