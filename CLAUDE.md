# CLAUDE.md - AYN System Map (index)

Read THIS file first, then open ONLY the domain file you need from docs/map/. Do not re-explore the codebase for questions these files answer. Total cost to orient: this index plus one domain file.

MAINTENANCE RULE: any commit that changes a seam, message type, backend action, table, or version MUST update the matching map file in the same commit.

Last verified: v3.6.0 the proposal loop. The two sides of AYN are connected end to end for the first time. An approved employer no longer lands in the seeker dashboard: Index.tsx AuthedShell routes them to src/pages/EmployerHub.tsx, which finally calls employerApi.intake, .match and .sendProposal (all three had zero callers before this release). The employer describes a role, edits the JobSpec, reads up to three candidates with score, evidence, gaps and a skills provenance split, and sends a JOB PROPOSAL: job title, location, employment type, salary range, link to the posting, and a message up to 1000 characters. reveal_requests is now the proposals table (same name, eight new columns) with two rate limits: one open proposal per org and candidate at a time, and no new proposal within 30 days of a decline. The seeker reads proposals on a new Proposals tab in Resume Hub, badged with the pending count and surfaced as the first Home next-action; accepting is the only thing that releases name, email and phone. Discovery copy is now one line per idea. No transactional email path exists in the repo, so notification is in-app only. Preceded by v3.5.1 honest discovery consent: employers see the full profile (not an "anonymized" one), turning discovery ON opens a confirmation dialog, and talent_pool_set records consent_version (current value v3.5.1-full-profile). Preceded by v3.5.0 "a profile that can actually be matched": Profile is FIVE collapsible groups; skills carry level, years and last used; work history rows expand to industry, team size and achievement bullets; autosave on blur. Still one profile, one resume: BuilderTab.tsx is gone, tailored documents are outputs downloaded from JobsTab. July 2026.

Preceded by "v3.0.1 tracker removal" and "v3.0.0 autofill removal — the extension is read only. Deleted the entire write path and the fill-only backend surface. Permissions are activeTab, storage, sidePanel, webNavigation with https only."

## What AYN is

One repo, one Supabase backend (project dfkoxuokfkttjhfjcecx), four product areas plus shared infrastructure. Solo founder: Ghazi. Site aynn.io. Deployed via Lovable (project a2fa8496-aed3-4f21-93fc-bbbabc069583) which pushes to this GitHub repo.

| Area | What it is | Map file |
|---|---|---|
| Chrome extension | Sideloaded MV3 extension, READ ONLY since v3.0.0: reads the real job description off the page, scores the match, tailors resumes and cover letters, answers questions about the job, scores job cards, tracks applications. It never writes to a page. Code: extension/. | docs/map/extension.md |
| Resume Hub | Web workspace at /resume-hub: profile (which now holds the one active resume), saved jobs with their tailored documents, get discovered, extension management. Code: src/components/resume-hub/, src/lib/resumeHub.ts, src/lib/resumeDocs.ts, src/lib/extension.ts. Backend: supabase/functions/resume-hub. | docs/map/resume-hub.md |
| AI platform | Signed-in chat dashboard (emotional eye UI, streaming chat via ayn-unified), World Intelligence swarm simulator, agent society, cc-generate report tools, subscriptions and credits, support system, NDA and contract signing, admin panel, landing page, i18n (en/ar/fr). Code: src/components/dashboard, eye, admin, support, landing; src/admin-app; src/pages/*. | docs/map/platform.md |
| Talent Pool | Employer marketplace. Phase A (data layer) and Phase B (hiring mode in dashboard chat + hybrid matcher + reveal flow) shipped. | docs/map/resume-hub.md (talent pool + employer marketplace sections) |

## Routes (src/App.tsx)

/ (landing or Dashboard when signed in), /resume-hub, /resume-match, /handoff, /extension/approve, /settings, /pricing, /dashboard/pricing, /support, /contact, /world-intelligence, /sign/:token, /nda/:token, /terms, /privacy, /reset-password, /subscription-success|canceled, /approval-result, /admin/custom-orders, /manage-bae76e99d97e188b (admin app; /admin redirects to 404 on purpose).

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
