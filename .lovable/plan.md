# Intelligence Command Center

A new section inside the existing dashboard that turns AYN into a company command center: capture team updates, generate manager/CEO outputs, build action plans, ask questions about the company, and route any output to a teammate via `@mention`.

## 1. Hide the Sphere button

In `src/components/dashboard/Sidebar.tsx` (lines 365–394), wrap the "Sphere" `SidebarGroup` in `{false && (...)}` (kept in code, hidden from UI). The route `/world-intelligence` stays intact.

## 2. New entry in the sidebar

Add a new sidebar item above "Recent Chats" labeled **Command Center** (icon: `Command` from lucide). Clicking it opens the Command Center as the dashboard's center stage view (same slot the chat occupies), without leaving `/dashboard`.

Layout inside `DashboardContainer.tsx`: introduce a small view-switcher state (`'chat' | 'command'`). Default stays `chat`.

## 3. Command Center UI

A single page with a left rail of 5 tools and a right working area.

```text
┌──────────────────────────────────────────────────────────────┐
│  COMMAND CENTER                                       @you   │
├──────────────┬───────────────────────────────────────────────┤
│ Team Updates │   [active tool work area]                     │
│ Manager      │                                               │
│ CEO Brief    │   • input form                                │
│ Action Plan  │   • generate button                           │
│ Ask Anything │   • streamed AI output card                   │
│              │   • [Send to @user] [Copy] [Save]             │
│ ─────────    │                                               │
│ Inbox (3)    │                                               │
└──────────────┴───────────────────────────────────────────────┘
```

### Tool 1 — Team Updates
Form: department, author name, update text, optional impact level (low/med/high). Saves to a personal "updates" log. List view shows the last 50 updates with filters.

### Tool 2 — Manager Report
Reads recent updates → AI generates a structured manager report (highlights, blockers, KPIs, next week).

### Tool 3 — CEO Brief
Reads recent updates → AI generates 1-page executive brief (1 headline, 3 wins, 3 risks, 1 ask).

### Tool 4 — Action Plan
Input: a goal or problem. AI returns an action plan: objective, 5 steps, owners (suggested), deadline, KPI.

### Tool 5 — Ask Anything
Free-text Q&A grounded ONLY in the user's stored updates ("company data" = updates the user entered).

Every output card has three actions: **Copy**, **Save**, and **Send to @user**.

## 4. @Mentions and Inbox

A textarea-anywhere mention picker (typing `@` opens a popup of teammates, fetched once from the existing user lookup). When the user picks a teammate and clicks **Send**, the output is delivered as one of three types: `message`, `report`, or `question`. The recipient sees it in their **Inbox** tab inside Command Center, with sender, type, timestamp, full content, and a Reply button (reply opens an Ask Anything thread referencing the original).

## 5. Data and AI

- **Persistence (MVP):** updates, generated outputs, and inbox items are stored per user via the existing Spine backend (`spine.aynn.io`). Three new endpoints needed:
  - `GET/POST /command-center/updates`
  - `GET/POST /command-center/inbox` (POST = send to mentioned user)
  - `POST /command-center/generate` (server-side call to Lovable AI Gateway with the user's updates as grounding; type = `manager_report | ceo_brief | action_plan | qa`)
- **AI model:** `google/gemini-2.5-flash` via Lovable AI Gateway (per project memory).
- **Mention resolution:** `GET /command-center/teammates` returns `{id, name, email}` for the current org/user network.

If Spine endpoints can't be added in this loop, MVP falls back to `localStorage` for updates + outputs (single-device only), and `Send to @user` is disabled with a tooltip "Inbox is enabling — back online shortly." The UI ships ready for the endpoints.

## Technical details

- Files added: `src/components/dashboard/command/CommandCenter.tsx`, `UpdatesTool.tsx`, `ManagerReportTool.tsx`, `CEOBriefTool.tsx`, `ActionPlanTool.tsx`, `AskAnythingTool.tsx`, `Inbox.tsx`, `MentionPicker.tsx`, `commandApi.ts`.
- Files edited: `src/components/dashboard/Sidebar.tsx` (hide Sphere, add Command Center entry), `src/components/dashboard/DashboardContainer.tsx` (view-switcher + render `<CommandCenter />` when active).
- Styling: dark theme, premium Apple/Palantir per project memory. Inter body, Syne for headings, JetBrains Mono for labels. No em dashes.
- Validation: zod schemas on all forms (length limits 2000 chars per update, 500 chars per question).
- Streaming: AI outputs stream token-by-token using the existing SSE pattern.
- No DB schema changes inside the project (Spine owns data). No Supabase migration needed.

## Out of scope

- Real-time push notifications for inbox (will poll every 30s).
- File attachments on updates.
- Cross-org sharing or external email delivery.
- Any change to the landing page or existing chat behavior.
