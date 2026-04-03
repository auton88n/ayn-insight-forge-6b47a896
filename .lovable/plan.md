

# AYN vs. Blueprint PRD Standard — Gap Analysis

This is a read-only audit. No changes will be made.

---

## 1. SYSTEM ARCHITECTURE — Gap Assessment

### Blueprint says
```
Frontend UI → Gateway/BFF → Domain Services → Repository Layer → Supabase
```

### AYN has
```
Frontend UI → Supabase REST (direct) + Edge Functions (for AI/email/payments)
```

**Missing layers**: There is no Gateway/BFF layer and no Domain Services layer. The frontend calls Supabase REST directly via `supabaseApi.ts` for all CRUD operations. Edge functions handle AI, payments, and email but each one independently manages auth, CORS, validation, and logging — there is no shared gateway.

**Gap severity**: High. This is the single biggest architectural deviation from the blueprint. Business logic is split between frontend hooks (940-line `useMessages.ts`), edge functions (`ayn-unified` at 2,500 lines), and RLS policies. There is no single place where "domain truth" lives.

---

## 2. REPO STRUCTURE — Gap Assessment

### Blueprint says
Feature/domain-first structure with `/features/auth/`, `/features/billing/`, `/server/modules/auth/{controller,service,repo,schema}`.

### AYN has
```
/src
  /components (by UI domain: admin/, trading/, dashboard/, engineering/)
  /hooks (flat: 42 hooks, no domain grouping)
  /lib (flat: utilities, no domain separation)
  /stores (3 Zustand stores)
  /types (5 type files)
  /contexts (5 context providers)
  NO /features directory
  NO /server directory

/supabase/functions (105+ edge functions, flat list, no module structure)
  /_shared (15 shared utilities — but no controller/service/repo pattern)
```

**Gaps**:
- No `/features` directory — logic is scattered across hooks and components
- No `controller.ts / service.ts / repo.ts / schema.ts` pattern in edge functions — each function is a monolith
- Hooks are flat (42 files) instead of grouped by domain (`/hooks/auth/`, `/hooks/billing/`)
- Edge functions are flat (105+ files) instead of grouped into modules (`/functions/auth-gateway/`, `/functions/ai-router/`)

**Gap severity**: Medium. The component directory structure is reasonable (grouped by UI domain). But the hook and edge function organization will become unmanageable at 150+ functions.

---

## 3. DATA MODEL — Gap Assessment

### Blueprint says
- Foreign keys for real relationships
- Indexes on hot query paths
- `created_at` and `updated_at` on every table
- Summary tables for expensive metrics
- Normalized core entities

### AYN has
- 100+ tables, well-normalized per entity
- `user_roles` properly separated from `profiles`
- `created_at` present on most tables
- **Most tables have `Relationships: []`** — foreign keys are largely missing at the DB level
- **No summary tables** (`daily_usage_summary`, `billing_summary`, `user_activity_summary` do not exist) — dashboard stats are computed via RPC functions that query raw tables
- **No visible `updated_at`** on many tables
- 176 migration files — active schema evolution

**Gaps**:
- Foreign key constraints: **Critical gap**. Referential integrity is app-enforced only
- Summary/materialized tables: **Missing entirely**. Dashboard metrics hit raw tables every time
- `updated_at`: Inconsistent across schema
- Indexing: Not visible from types, but given 100+ tables and no explicit index strategy, likely gaps on hot paths like `messages(user_id, session_id, created_at)`

**Gap severity**: High for foreign keys and summary tables. These directly impact data integrity and performance at scale.

---

## 4. FRONTEND RULES — Gap Assessment

### Blueprint says
- Components under 150-200 lines
- Hooks: one responsibility each
- Never let one hook become a hidden backend
- Page → FeatureSection → Cards → Primitives

### AYN has
- `useMessages.ts`: **940 lines** — handles message loading, sending, intent detection, streaming, emotion tracking, document generation, image handling. This is a hidden backend.
- `useAuth.ts`: 269 lines — handles access check, profile fetch, role check, terms consent, device tracking. Borderline.
- Admin tabs: 47 components — each focused on one feature. Good.
- UI primitives in `/components/ui/`: Clean, reusable. Good.
- Component composition pattern is generally followed in the admin panel and dashboard.

**Gaps**:
- `useMessages.ts` violates every hook rule in the blueprint — it must be decomposed into 5-6 focused hooks
- Intent detection is duplicated between frontend and backend (`intentDetector.ts` in edge function vs regex in `useMessages.ts`)

**Gap severity**: High for `useMessages.ts`. Medium for the rest — most components follow reasonable patterns.

---

## 5. LAZY LOADING — Gap Assessment

### Blueprint says: Lazy load heavy routes, admin, charts, editors. Keep auth shell and nav eager.

### AYN has: All routes lazy-loaded via `React.lazy()` in `App.tsx`. All 30+ admin tabs lazy-loaded. Core shell (nav, toasters, providers) is eager.

**Gap**: None. This matches the blueprint exactly. One of AYN's strongest areas.

---

## 6. DATA FETCHING & CACHING — Gap Assessment

### Blueprint says
- TanStack Query for server state with intentional staleTime
- Freshness classes per data type
- Prefetch next likely screen
- Never count large tables by fetching all rows

### AYN has
- TanStack Query with 1-min staleTime, 5-min gcTime — good defaults
- **Count query in `useMessages.ts` fetches all IDs (`select=id`) instead of using HEAD with count** — violates "never count by fetching all rows"
- No prefetching of adjacent screens
- No freshness classification — everything uses the same staleTime regardless of volatility

**Gap severity**: Medium. The count query is a concrete performance bug. Lack of freshness classes is a design gap.

---

## 7. AI SYSTEM — Gap Assessment

### Blueprint says
```
ai-router → chat-handler → search-handler → intelligence-handler → document-handler → image-handler
```

### AYN has
```
ayn-unified (2,500 lines) → does everything: chat, search, image, documents, trading, tools, memory
```

**This is the exact anti-pattern the blueprint warns against.** The monolithic `ayn-unified` function handles intent detection, model routing, tool execution, memory extraction, context injection, streaming, error handling, and fallback chains in a single file.

**Gaps**:
- No ai-router pattern — everything in one function
- No per-handler model policy — model selection is inline
- No per-handler cost control — all costs logged together
- No per-handler testing — impossible to test image generation without triggering chat logic
- Fallback chains exist (good) but are embedded in the monolith

**Gap severity**: Critical. This is the highest-risk item in the codebase. A bug in document generation can break chat. A model change affects everything.

---

## 8. ASYNC JOBS — Gap Assessment

### Blueprint says: Move emails, ingestion, reports, AI backfills, predictions to background jobs. Jobs must be idempotent, retryable, logged.

### AYN has
- `ayn-pulse-engine`: Scheduled data ingestion (FRED, Alpha Vantage, GDELT) — runs every 4 hours. Good.
- `ayn-proactive-loop`: Scheduled alerts/briefings. Good.
- `twitter-scheduled-poster`: Scheduled social posting. Good.
- Email functions (`send-email`, `send-contract-email`, etc.): Invoked synchronously from request paths — **not backgrounded**
- Document generation (`generate-document`, `generate-contract-pdf`): Invoked inline — **not backgrounded**

**Gaps**:
- No job queue or retry mechanism — edge functions are fire-and-forget
- Email sends block the request path
- No idempotency keys on any async operations
- No job status tracking or dead-letter handling

**Gap severity**: Medium-High. Works at current scale but will fail under load (email timeouts, PDF generation delays).

---

## 9. SECURITY — Gap Assessment

### Blueprint says: Fail closed on access errors. Role-based access. Never trust frontend-only checks. Restrict CORS. Rate limit expensive endpoints.

### AYN has
- RLS enabled across tables — good
- `user_roles` separated from `profiles` — good
- Server-side rate limiting with `api_rate_limits` table — good
- PIN gate for admin — good
- Prompt injection defense (3-layer) — good
- **`checkAccess` defaults to `true` on error** (line 57-59 of `useAuth.ts`) — **fails open**, directly violates "fail closed"
- **`verify_jwt = false` on 100+ edge functions** — relies on manual auth per function
- **CORS wildcard (`*`) on `ayn-unified`** — any origin can call the AI endpoint
- **Admin URL hardcoded in client bundle** — discoverable

**Gap severity**: High. The fail-open pattern and CORS wildcard are the most dangerous.

---

## 10. OBSERVABILITY — Gap Assessment

### Blueprint says: Log request ID, user ID, route, latency, errors, retries, provider, cost. Dashboards for error rate, response time, failed jobs, AI cost, auth failures.

### AYN has
- `llm_usage_logs`: Tracks AI model, tokens, cost — good
- `error_logs`: Captures errors — good
- `security_logs`: Auth events — good
- `ayn_activity_log`: User actions — good
- **No request ID tracing** across frontend → edge function → DB
- **No latency tracking** on edge function calls
- **No structured logging** — `_shared/aynLogger.ts` exists but is a simple wrapper
- **No external observability** (no Sentry, no Datadog, no OpenTelemetry)
- **Admin has ErrorMonitoring and SystemMonitoring tabs** — good for visibility, but these query raw tables, not aggregated metrics

**Gap severity**: Medium-High. Internal logging exists but no production-grade observability stack.

---

## 11. SMART TACTICS — Scorecard

| Tactic | Blueprint | AYN Status |
|--------|-----------|------------|
| Summary tables for expensive reads | Required | Missing |
| Freshness-classified caching | Required | Single staleTime for everything |
| Lazy load non-critical routes | Required | Done well |
| UI thin, services thick | Required | Inverted — hooks are thick, no service layer |
| Feature flags | Required | Not implemented |
| Telemetry before scaling | Required | Partial — logs exist, no tracing |
| Slow work to jobs | Required | Partial — pulse engine yes, emails no |
| Structured AI outputs | Required | Partial — tool calls structured, chat not |
| Single source of truth per domain | Required | Violated — intent detection in 2 places |
| Small files | Required | Violated — useMessages 940 lines, ayn-unified 2500 lines |

---

## 12. STRENGTHS (What AYN Does Well)

1. **Lazy loading** — matches blueprint exactly across all routes and admin tabs
2. **Data pipeline** — `ayn-pulse-engine` with real institutional data sources is a genuine competitive advantage
3. **Security layering** — RLS + rate limiting + PIN gate + prompt injection defense exceeds most startups
4. **Component architecture** — admin panel with 47 focused components, clean UI primitives
5. **State management** — Zustand for cross-cutting state, React Query for server state — correct tool choices
6. **REST API abstraction** — `supabaseApi.ts` with retry, timeout, abort is well-engineered
7. **176 migrations** — active, evolving schema with proper migration history

---

## 13. FINAL VERDICT vs. BLUEPRINT

**Compliance score**: ~45/100

**Where AYN exceeds the blueprint**: Lazy loading, security depth, AI tool integration, data pipeline sophistication.

**Where AYN critically deviates**:

1. **No Gateway/BFF layer** — frontend talks directly to DB and edge functions without middleware
2. **No domain service pattern** — business logic lives in oversized hooks and monolithic edge functions
3. **`ayn-unified` monolith** — the exact anti-pattern the blueprint's AI section warns against
4. **No foreign key constraints** — referential integrity is app-only
5. **No summary tables** — dashboard metrics computed from raw tables
6. **Fails open on auth errors** — violates the blueprint's #1 security rule
7. **No observability stack** — no tracing, no APM, no structured logging
8. **No feature flags** — no safe rollout mechanism
9. **`useMessages.ts` at 940 lines** — violates the "never let one hook become a hidden backend" rule

**What it would take to reach blueprint compliance**:
- Decompose `ayn-unified` into router + handlers (2-3 weeks)
- Add Gateway/BFF edge function for auth/validation/logging (1-2 weeks)
- Create summary tables and scheduled refresh jobs (1 week)
- Add foreign key constraints via migrations (1 week, careful)
- Split `useMessages.ts` into 5-6 domain hooks (1 week)
- Implement feature flags (days)
- Add OpenTelemetry or equivalent (1 week)
- Change `checkAccess` to fail closed (hours)
- Restrict CORS on `ayn-unified` (hours)

**Bottom line**: AYN is a functional, sophisticated product that grew organically. It has real intelligence, real data, and real security — but its internal architecture skipped the layering discipline the blueprint demands. The foundation is solid enough that refactoring toward blueprint compliance is feasible without a rewrite.

