# CLAUDE.md - AYN System Map (index)

Read THIS file first, then open ONLY the domain file you need from docs/map/. Do not re-explore the codebase for questions these files answer. Total cost to orient: this index plus one domain file.

MAINTENANCE RULE: any commit that changes a seam, message type, backend action, table, or version MUST update the matching map file in the same commit.

Last verified: commit "Unified tracker + resume flow", manifest v2.7.0, AYN_BUILD 2.6.2, July 21 2026.

## What AYN is

One repo, one Supabase backend (project dfkoxuokfkttjhfjcecx), three product areas plus shared infrastructure. Solo founder: Ghazi. Site aynn.io. Deployed via Lovable (project a2fa8496-aed3-4f21-93fc-bbbabc069583) which pushes to this GitHub repo.

| Area | What it is | Map file |
|---|---|---|
| Chrome extension | Sideloaded MV3 extension: scans and autofills job application forms (Ashby, Greenhouse, Lever, Workday, iCIMS, Gem, generic), scores job cards, tracks applications, attaches resumes. Code: extension/. | docs/map/extension.md |
| Resume Hub | Web workspace at /resume-hub: profile, resume builder and tailoring, saved jobs, application tracker, extension management. Code: src/components/resume-hub/, src/lib/resumeHub.ts, src/lib/extension.ts. Backend: supabase/functions/resume-hub. | docs/map/resume-hub.md |
| AI platform | Signed-in chat dashboard (emotional eye UI, streaming chat via ayn-ai-proxy), World Intelligence swarm simulator, agent society, cc-generate report tools, subscriptions and credits, support system, NDA and contract signing, admin panel, landing page, i18n (en/ar/fr). Code: src/components/dashboard, eye, admin, support, landing; src/admin-app; src/pages/*. | docs/map/platform.md |

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
