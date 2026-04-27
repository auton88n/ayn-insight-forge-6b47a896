# Rebuild /world-intelligence as a MiroFish-Style Swarm Simulator

The current Agents page (AgentSociety + WorldSimulator) is hardcoded to a fixed 80-persona Supabase model and points at `ayn-world-simulator` edge function and `ayn_world_*` Supabase tables — none of which match your real Python backend at `engin.aynn.io`. We'll replace it with a MiroFish-style flow wired to engin.

---

## What the new page does (MiroFish workflow)

```text
①  SEED            ②  GRAPH          ③  SIMULATE       ④  REPORT       ⑤  CHAT
─────────         ─────────         ─────────         ─────────       ─────────
paste/upload  →   entities &    →   N-round agent →   prediction  →   talk to
+ question        relationships     interactions      + drivers       any agent
                  visualized        stream live       + confidence    or ReportAgent
```

A single console page. Stage stepper at top. Center canvas changes per stage. Left rail = agent roster. Bottom = live signals ticker.

---

## The mismatch we're fixing

Current code calls things that no longer exist on your backend:

| Current (broken) | New |
|---|---|
| `supabase.functions.invoke('ayn-world-simulator')` | `POST {ENGIN_URL}/simulations` |
| `from('ayn_world_simulations')` / `ayn_world_events` | `GET {ENGIN_URL}/simulations/:id` + `/stream` (SSE) |
| Hardcoded 80 personas in `RAW_POS` | `GET /simulations/:id/agents` from engin |
| `fetchPredictions` / `fetchMasterPreds` (undefined → build error) | removed |
| `setActiveSection('signals')` (not in union → build error) | replaced by stage state machine |
| Runtime 404 "Edge function not found" | gone, no Supabase function calls |

---

## Backend contract (engin.aynn.io)

Frontend will call a single client `src/lib/enginApi.ts` against `VITE_ENGIN_URL` (default `https://engin.aynn.io`). Auth: forwards the Supabase access token as `Authorization: Bearer <jwt>` (matches existing spineApi pattern). If your Python uses different paths or an API-key header, only this one file changes — send me the OpenAPI and I'll adapt.

| Method | Path | Body / Returns |
|---|---|---|
| POST | `/simulations` | `{seed, question, rounds?, agents?}` → `{sim_id, status}` |
| GET  | `/simulations/:id` | status + meta |
| GET  | `/simulations/:id/graph` | `{nodes:[], edges:[]}` |
| GET  | `/simulations/:id/agents` | persona list `{id, name, category, country, emotion}` |
| GET  | `/simulations/:id/stream` | **SSE**: `turn`, `signal`, `emotion`, `done` events |
| GET  | `/simulations/:id/report` | structured prediction |
| POST | `/simulations/:id/agents/:agentId/chat` | chat with one agent |
| POST | `/simulations/:id/report/chat` | chat with ReportAgent |
| POST | `/simulations/:id/inject` | god-view variable injection mid-run |

If a route is missing, the UI degrades to a skeleton + "engine route not available" toast. We'll list any gaps so you can add them on the Python side.

---

## Frontend changes

**Replace (rewrite):**
- `src/pages/WorldIntelligence.tsx` — new five-stage shell. Removes the broken `fetchPredictions` / `fetchMasterPreds` references and the stale `'signals'` section. Removes Supabase fetches.

**New under `src/components/dashboard/simulator/`:**
- `SimulatorShell.tsx` — stage stepper + 3-column layout
- `SeedInput.tsx` — textarea, file drop (PDF/CSV/MD), preset chips, prediction question
- `GraphCanvas.tsx` — force-directed graph (reuses `@react-three/fiber@^8.18` + `@react-three/drei@^9.122` already in project)
- `SimulationView.tsx` — live network + turn counter + emotion heatmap
- `AgentRoster.tsx` — left rail with category filters (matches the look in your screenshot: ALL/GOVERNMENTS/CENTRAL BANKS/MARKETS/BANKS/COMPANIES/PEOPLE)
- `SignalsTicker.tsx` — bottom live stream
- `ReportPanel.tsx` — outcome cards, drivers, confidence bars
- `AgentChatDrawer.tsx` — slide-in chat with selected agent or ReportAgent
- `useEnginSim.ts` — hook orchestrating create → poll → SSE → report

**New API client:**
- `src/lib/enginApi.ts` — REST + SSE parser (mirrors the proven SSE pattern in `src/hooks/chat/useSSEStream.ts`)

**Config:**
- `src/config.ts` — add `ENGIN_URL` (default `https://engin.aynn.io`, override `VITE_ENGIN_URL`)

**Move to legacy (kept in repo, not imported):**
- `AgentSociety.tsx`, `WorldSimulator.tsx`, `AgentConvViewer.tsx`, `AccuracyScoreboard.tsx`, `PredictionCard.tsx` → `src/components/dashboard/world/_legacy/`. Easy to restore if needed; deletable later.

---

## Visual redesign

Aligned with your screenshot reference and existing `world-intelligence/dashboard-aesthetic` memory:

- Stage stepper across the top with neon progress dots
- Glass cards, thin top-light borders (existing `GlassCard`)
- Agent roster pill chips: `ALL 87`, `GOVERNMENTS 27`, `CENTRAL BANKS 7`, `MARKETS 10`, `BANKS 8`, `COMPANIES 11`, `PEOPLE 31`
- Network graph as the hero (force-directed, agents pulse on emotion change)
- Right column: agent list with country flag, category icon, emotion bar (Confident/Worried/Excited)
- Bottom: `LIVE SIGNALS — click to react` ticker
- Typography: Syne (display), JetBrains Mono (telemetry), Inter (body)
- Palette: existing dark `#0a0a0f`, cyan/violet primaries, emotion accents from current `EM` map

---

## Bug fixes included

- Build error: `Cannot find name 'fetchPredictions'` (line 292) → removed.
- Build error: `Cannot find name 'fetchMasterPreds'` (line 292) → removed.
- Build error: `'signals' not assignable to ViewSection` (line 529) → replaced by `SimStage` union.
- Runtime: `Edge function returned 404` → no more `ayn-world-simulator` calls.

---

## Out of scope

- No changes to your Python service (you confirmed engin.aynn.io is the existing backend).
- No changes to auth, billing, admin, other dashboard pages.
- Keeps `ws-relay`, `ayn-ai-proxy` and other intentional Supabase functions untouched.
- ReportAgent prompt engineering stays server-side.

---

## Open items (won't block start)

1. `engin.aynn.io` did not respond from the sandbox (likely IP-restricted or browser-only). Plan assumes it works from the user's browser. If routes differ, send the OpenAPI and only `enginApi.ts` changes.
2. Auth scheme: defaulting to `Authorization: Bearer <supabase-jwt>` (matches spineApi). Tell me if engin uses an API key header instead.

---

## Deliverable

After approval:
- `/world-intelligence` shows the new MiroFish-style simulator immediately (no new route).
- Preset seed ("Suez bypass becomes permanent") runs end-to-end against engin: graph builds, simulation streams, report renders, agents are chattable.
- Build is green. Runtime 404 gone.
