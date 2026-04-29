# World Simulation v2 — Native Edge Function Engine (MicroFish-style)

Replace the Python `engine.aynn.io` backend with Supabase Edge Functions powered by the Lovable AI Gateway (`google/gemini-2.5-flash`). Scale to **225 agent personas** across the 6 real categories you described, wire in the **7-layer pipeline** that's only decorative today, and add a **"Feed Agents the News"** button so users can broadcast any signal/event/product to the whole society with one click.

---

## What's wrong today

- Frontend talks to `engine.aynn.io` (Python on Railway). It's flaky, CORS-prone, and the agent roster doesn't match your real 225-persona deployment.
- `useEnginSim` shows a 7-layer legend in the UI but the backend doesn't actually run 7 layers — it just calls one `/simulate` endpoint and renders a stepper.
- No "feed news → all agents react" path. The "pull live signal" button only fills the textbox.
- Categories shown in UI (`government, central_bank, market, bank, company, person, …`) don't match what you actually want: **Social classes (74), Governments (65), Companies (35), Markets (16), Banks (15), Central banks (10), Media (10)**.

---

## What we'll build

### 1. Persona library (data, not code)
A new file `supabase/functions/_shared/personas.ts` exporting **225 personas** in the 6+1 categories you listed. Each persona has:
`id, name, category, subcategory, country, region, age, gender, ethnicity, religion, income_class, occupation, culture, flag, bio, beliefs, biases, speaking_style`.

This is the single source of truth, shared by every edge function. No DB seed needed for v1 — flat TS array keeps cold-starts fast.

### 2. Seven Edge Functions (one per layer)
Each function takes a small payload, runs Gemini with persona context, returns structured JSON. They are chained by an orchestrator.

| # | Function | Layer | What it does |
|---|----------|-------|--------------|
| 1 | `sim-roster` | — | Picks the right N personas for the seed + user filters (region, religion, income, age, gender) |
| 2 | `sim-layer-economic` | L1 Economic | Markets, banks, central banks react: prices, flows, policy |
| 3 | `sim-layer-institutional` | L2 Institutional | Governments + media react: policy moves, narratives |
| 4 | `sim-layer-elite` | L3 Elite | Companies + power players react: strategic moves |
| 5 | `sim-layer-narrative` | L4 Narrative | Media agents shape the story across regions |
| 6 | `sim-layer-community` | L5 Community | Social-class personas react inside their cultures |
| 7 | `sim-layer-human` | L6 Human | Individual emotional + behavioral reactions |
| 8 | `sim-synthesize` | L7 Synthesis | Combines all layers into the final report (outcomes, drivers, winners/losers, dissent) |

Plus two utilities:
- `sim-feed-news` — the **"Feed the Agents" button**. Takes any signal/headline/event and broadcasts it to all active personas, updating their belief/emotion state in `agent_society_state` table.
- `sim-agent-chat` — chat with one persona (replaces `/chat` on Python).

All 9 use Lovable AI Gateway (`google/gemini-2.5-flash`, free during promo). No external Python.

### 3. Database (one migration)
```text
agent_society_runs        — one row per simulation (user_id, seed, question, report, status)
agent_society_messages    — per-layer per-agent statements (run_id, layer, persona_id, content, emotion)
agent_society_state       — current emotion/belief per persona per user (so news feeds persist)
agent_society_news_feed   — every news item the user has fed into the society
```
RLS: users see their own; messages readable when parent run is theirs.

### 4. Frontend rewire
- `src/lib/enginApi.ts` → swap `fetch(ENGIN_URL/...)` for `supabase.functions.invoke('sim-*', ...)`. Keep the same return shape so existing UI keeps working.
- `useEnginSim` becomes a real 7-step pipeline: it now calls layers in order, streams stage updates, and lights up the existing 7-layer legend for real.
- New "**Feed the Agents**" button in `SeedInput` (next to "pull live signal"): one click → calls `sim-feed-news` with the latest headline → toast shows "225 agents updated".
- `AgentRoster` filter chips updated to the real 6 categories: `social_class, government, company, market, bank, central_bank, media`.
- Update default agent counts: Quick=50, Standard=120, Deep=225 (full society).

### 5. Cleanup
- Keep `ENGIN_URL` in `src/config.ts` as a fallback flag, but default everything to edge functions.
- Delete dead Python references in `useEnginSim` error messages (CORS hint).

---

## Technical details

**Why edge functions over Python**: same model (Gemini), no Railway cold-starts, no CORS, free via Lovable Gateway, scales horizontally per layer.

**Cost control**: Layers run sequentially but agents inside a layer are batched into one Gemini call ("here are 30 personas, give me each one's reaction in JSON"). 225 agents ≈ 8–12 Gemini calls per full sim, well under the per-user quota.

**Streaming UX**: orchestrator (`useEnginSim`) flips `stage` after each layer resolves so the existing stepper + layer-progress bars become live indicators, not decoration.

**Persona seeding**: 225 personas hand-curated to match your Python deployment list (US gen-Z urban black woman, Saudi post-reform young woman, Brazil favela, Vatican, SWIFT, Lazarus Group, ransomware gangs, carbon market, Fox/BBC/Al Jazeera/CGTN/TikTok algorithm, etc.).

**Feed-news flow**: `sim-feed-news` does a single Gemini batch call → "given this news, update the emotion/belief of these 225 personas in 1 line each" → upserts to `agent_society_state`. Subsequent simulations read this state so the world "remembers" what it's been told.

---

## Out of scope (for this round)
- Live agent-to-agent chat between simulations (we keep round-based statements).
- Real-time streaming of layer output token-by-token (we resolve layer-by-layer instead, which is fast enough).
- Migrating historical conversations from the Python backend.

Approve and I'll implement everything in one pass: migration → 9 edge functions → personas file → enginApi rewrite → useEnginSim pipeline → SeedInput "Feed the Agents" button → roster categories.
