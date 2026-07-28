# CLAUDE.md - AYN System Map (index)

Read THIS file first, then open ONLY the domain file you need from docs/map/. Do not re-explore the codebase for questions these files answer. Total cost to orient: this index plus one domain file.

MAINTENANCE RULE: any commit that changes a seam, message type, backend action, table, or version MUST update the matching map file in the same commit.

Last verified: commit "v2.11.3 quality scorer fairness fix (jdQualityDetail noise heuristic in extension/background.js used to flag any short Title-Case line as page chrome, which penalized every real JD section header like Responsibilities/Requirements/Benefits/Nice to have; a rich structured JD scored 63 with noise=50 instead of 80+; v2.11.3 adds a positive headerRe allowlist checked FIRST so listed section headers can never count as noise, tightens the short-Title-Case rule to only fire on runs of 3+ consecutive candidates under 16 chars with no trailing colon so nav menus still get caught but isolated headers do not, rebalances weights to length 15% / sections 30% / bullets 20% / roleSignal 25% / noise -25% so relevance dominates raw length; regression baseline measured against three fixtures: rich JD 82 noise 0, pure boilerplate 0 noise 100, thin ~300 char JD 6 which keeps the paste prompt firing under the 45 threshold)", manifest v2.11.3, AYN_BUILD 2.11.1, July 28 2026.

## What AYN is

One repo, one Supabase backend (project dfkoxuokfkttjhfjcecx), four product areas plus shared infrastructure. Solo founder: Ghazi. Site aynn.io. Deployed via Lovable (project a2fa8496-aed3-4f21-93fc-bbbabc069583) which pushes to this GitHub repo.

| Area | What it is | Map file |
|---|---|---|
| Chrome extension | Sideloaded MV3 extension: scans and autofills job application forms (Ashby, Greenhouse, Lever, Workday, iCIMS, Gem, generic), scores job cards, tracks applications, attaches resumes. Code: extension/. | docs/map/extension.md |
| Resume Hub | Web workspace at /resume-hub: profile, resume builder and tailoring, saved jobs, application tracker, extension management. Code: src/components/resume-hub/, src/lib/resumeHub.ts, src/lib/extension.ts. Backend: supabase/functions/resume-hub. | docs/map/resume-hub.md |
| AI platform | Signed-in chat dashboard (emotional eye UI, streaming chat via ayn-ai-proxy), World Intelligence swarm simulator, agent society, cc-generate report tools, subscriptions and credits, support system, NDA and contract signing, admin panel, landing page, i18n (en/ar/fr). Code: src/components/dashboard, eye, admin, support, landing; src/admin-app; src/pages/*. | docs/map/platform.md |
| Talent Pool | Employer marketplace. Phase A (data layer) and Phase B (hiring mode in dashboard chat + hybrid matcher + reveal flow) shipped. | docs/map/resume-hub.md (talent pool + employer marketplace sections) |

## Routes (src/App.tsx)

/ (landing or Dashboard when signed in), /resume-hub, /resume-match, /handoff, /extension/approve, /settings, /pricing, /dashboard/pricing, /support, /contact, /world-intelligence, /sign/:token, /nda/:token, /terms, /privacy, /reset-password, /subscription-success|canceled, /approval-result, /admin/custom-orders, /manage-bae76e99d97e188b (admin app; /admin redirects to 404 on purpose).

## Global rules (apply everywhere)

1. GENERATED, never hand-edit: extension/question-engine.bundle.js, extension/content.bundle.js, public/ayn-extension.zip. Edit sources, then run node extension/build.mjs.
2. Version bump protocol: manifest.json version + content.js AYN_BUILD + public/ayn-extension-version.json together, then build.mjs.
3. Never write to the deprecated applications table (job_applications is the tracker).
4. Never add page writers after post-inject verification beyond aynRecoverWipedAnswers (see extension map, section Gotchas).
5. User-facing writing style: no em dashes, no en dashes, ranges use "to". This rule is also baked into the AI system prompts in cc-generate and resume-match.
6. servers: server.js is the express static host for dist/ (SPA fallback, caching for /assets and /frames). backend/server.py is a FastAPI health stub only, not a real backend. The real backend is Supabase edge functions.
7. memory/PRD.md describes an older platform-era snapshot; trust the docs/map files over it.
8. scripts/check-wiring.mjs must pass; it verifies sidepanel messages have handlers, extension actions are registered, and Hub actions are session-reachable.


## The nervous system (how signals actually flow)

```
                    aynn.io (Resume Hub)
                    │  AYN_TRIGGER_AUTOFILL / AYN_PROFILE_UPDATED / AYN_PING
                    ▼
 job page ◄─── extension sidepanel + background.js ───► resume-hub edge fn ───► Supabase tables
 (content.js)        two-lane resolver                   (35+ actions,            (jobs, resumes,
  scan/inject/         lane1 local vector                 3 auth lanes)            job_applications,
  verify/recover       lane2 AI ext_autofill                                       ext_answers,
                    ▲                                                              autofill_runs)
                    └── telemetry + verified answers flow back up ──► Hub tabs read the same tables
```

Five loops carry everything. If you understand these, you understand AYN:

1. FILL LOOP: scan (Question Engine) -> resolve (local vector, then AI for the rest) -> inject -> verify read-only -> one bounded recovery for rebuild-wiped answers -> telemetry to autofill_runs. Survives both full page reloads (storage snapshot, signature re-anchor) and silent partial rebuilds (content re-anchor by label text).
2. LEARNING LOOP: verified answers persist (ext_answers by question hash, plus the question-learning store via ext-memory) and feed the next fill, so every application makes the next one better. Correctable in ProfileTab so one bad answer cannot poison the future.
3. SYNC LOOP: profile edited in the Hub -> AYN_PROFILE_UPDATED clears the extension's cached fact vector -> next fill refetches. 24h TTL is the fallback for closed browsers.
4. TRACKING LOOP: submit detected on the page -> job_applications upsert -> Tracker board; fill telemetry attaches to the same view. The user's pipeline builds itself.
5. HANDOFF LOOP: Hub tailors a resume for a job -> deep link or external message carries resumeId -> sidepanel preselects it -> ext_autofill resolves that resume_versions row instead of the primary. The tailoring work actually reaches the form.
6. MATCH LOOP (v2.9.0-B): seeker opts in -> indexCandidate builds anonymized profile_text + 768d embedding + extracted/inferred skills -> employer opens hiring mode in the dashboard chat -> employer_intake_chat distills a JobSpec -> employer_match runs extracted-only prefilter (must-haves), pgvector recall (top 12), then a single grounded rerank on opaque refs (inferred capped at 10 pts) -> top 3 anonymized cards -> employer requests intro -> candidate approves in ProfileTab intro requests -> contact revealed only then. The ref_map that binds refs to real users never leaves the edge function.

## Honest assessment (strengths, weaknesses, what is actually smart)

STRENGTHS AND MOAT
- Content re-anchoring (v2.6.1/v2.6.2) is the differentiator: AYN identifies form questions by what they SAY, not by DOM handles, so it survives Ashby's silent bot-check rebuilds that break naive autofillers. This came from real failure analysis, not speculation, and is encoded in the Gotchas section so it never regresses.
- Two-lane resolution keeps cost and latency low: deterministic local facts answer the easy 70 percent free; the AI lane only sees what needs judgment, with sensitive categories (work auth, EEO, salary) deliberately kept AI-side and out of the cached vector.
- Per-user learning memory compounds: hashed question dedupe, use counts, user-correctable.
- Discipline learned the hard way: exactly one writer after verification, report-only verify, truthful fill counts. Earlier retry loops caused double-toggles; that lesson is now law.
- Device-token auth (scoped, revocable, no passwords) and a closed telemetry loop (every fill auditable per user in autofill_runs).

WEAKNESSES AND RISKS
- supabase/functions/resume-hub/index.ts is a ~2400 line monolith and content.js a ~4000 line hand-edited IIFE; both are single points of merge pain with no unit tests (e2e/ covers the legacy platform, not the extension).
- Distribution: sideload only. No auto update, no Chrome Web Store trust signal; users silently rot on old builds. Biggest product risk today.
- The legacy platform roughly doubles repo weight, confuses tooling and new contributors, and its e2e suites can mislead CI signals.
- ayn-ai-proxy falls back to a hardcoded default proxy secret when the env var is unset; treat AYN_PROXY_SECRET as mandatory.
- Bus factor of one (solo founder). These map files are the mitigation; keeping them current is not optional.

WHAT IS ACTUALLY SMART HERE (for an AI forming a mental model fast)
The core insight of the whole system: on modern ATS pages, the DOM is a liar and the visible text is the truth. Every hard-won mechanism (signature re-anchoring, label-text recovery, isConnected guards, visible-label matching over synthetic values) is that one insight applied at a different layer. Judge any proposed change against it.
