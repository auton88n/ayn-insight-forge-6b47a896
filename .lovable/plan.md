

Three real bugs from the screenshot + description. Let me map each to the code.

## Bug 1 — Recent chat title doesn't persist for the first message

User sends first message → sidebar shows "gello" (or whatever the first words were) → but after refresh / when AI replies, it reverts to "New Chat" or generic title. The title set optimistically isn't being persisted to Spine, OR Spine is overwriting it on first AI response with a stale value.

Likely files:
- `src/hooks/useMessages.ts` or `src/hooks/useChats.ts` — where new chat is created
- `src/components/dashboard/Sidebar.tsx` (RecentChats section)
- Spine endpoint: `POST /chats` or `PATCH /chats/{id}` — needs to accept and store the title

Need to read these to confirm:
- Is the title being sent to Spine when chat is created?
- Does Spine persist `title` column on `conversations` table?
- Does the SSE stream push back the canonical title and overwrite the optimistic one?

## Bug 2 — Credit bar not detecting credits

Screenshot shows "5 of 5 messages remaining" with full white bar — but user says it's not detecting actual usage. After sending a message, the count doesn't decrement in the UI.

Likely cause: Frontend `useUsageTracking` hook either:
- Polls `/user/limits` but cache isn't invalidated after sending a message
- Listens to `/sse/user` for usage updates but Spine isn't pushing the update event after `current_daily_messages` increments
- We just fixed the SSE loop to read from Railway every 15s — the diff might not push events when value changes

Likely files:
- `src/hooks/useUsageTracking.ts`
- `src/components/dashboard/CreditUpgradeCard.tsx` (already in context)
- `ayn-backend/routers/sse.py` (just edited)
- `ayn-backend/routers/user.py` — `/user/limits` endpoint
- Spine chat handler — must increment `current_daily_messages` after each user message

## Bug 3 — Bonus credits not adding

When user earns +5 from feedback, `bonus_credits` column should increment in `user_ai_limits` and the bar should show blue segment. Per screenshot, button is visible ("Earn +5 Credits") so feedback flow exists, but:
- Either the feedback submit endpoint isn't writing `bonus_credits += 5` to Railway Postgres
- Or `/user/limits` isn't returning `bonus_credits` field
- Or `CreditUpgradeCard` isn't reading it correctly (it does read `propBonusCredits`, so likely backend issue)

Likely files:
- Feedback submit endpoint in Spine — `POST /user/beta-feedback` or similar
- `ayn-backend/routers/user.py` — `/user/limits` response shape
- Frontend feedback modal handler

## Plan

### Step 1 — Investigate (read-only)

Read these files in parallel to confirm root causes:
- `src/hooks/useUsageTracking.ts`
- `src/hooks/useChats.ts` and `src/hooks/useMessages.ts`
- `src/components/dashboard/Sidebar.tsx` (recent chats section)
- `ayn-backend/routers/user.py`
- `ayn-backend/routers/chats.py`
- `ayn-backend/routers/sse.py` (already edited, verify final shape)
- Spine chat send handler (probably `routers/chat.py` or `routers/messages.py`)
- Feedback endpoint location

### Step 2 — Fix Bug 1 (chat title persistence)

- Confirm `POST /chats` in Spine accepts `title` and writes it to `conversations.title`
- If Spine generates auto-title on first AI response, either disable that or make it only fire when `title IS NULL`
- Frontend: ensure title is sent on creation and not overwritten by stale SSE payload
- Add SSE event `chat.title.updated` so sidebar gets the canonical title without a refresh

### Step 3 — Fix Bug 2 (credit decrement)

- Spine: confirm chat send handler runs `UPDATE user_ai_limits SET current_daily_messages = current_daily_messages + 1 WHERE user_id = $1` atomically
- Spine: after increment, push an SSE event on `/sse/user` with the new value (don't wait 15s for next poll)
- Frontend `useUsageTracking`: invalidate React Query cache for `/user/limits` immediately after sending a message (optimistic decrement + refetch)

### Step 4 — Fix Bug 3 (bonus credits)

- Spine: in feedback submit handler, run `UPDATE user_ai_limits SET bonus_credits = COALESCE(bonus_credits, 0) + 5 WHERE user_id = $1` and log to `beta_feedback_log`
- Spine: `/user/limits` response must include `bonus_credits` field (verify the Railway query selects it)
- Spine: usage check logic must consider `daily_messages + bonus_credits` as the effective daily cap, not just `daily_messages`
- Frontend: `CreditUpgradeCard` already renders `propBonusCredits` correctly — no change needed once backend returns it

### Step 5 — Verify end-to-end

After deploy:
1. Send a chat message → sidebar title sticks → bar decrements from 5 → 4 within 1s
2. Submit feedback → `bonus_credits` becomes 5 → blue segment appears in bar → cap becomes 10
3. `GET /user/limits` returns `{ daily_messages: 5, current_daily_messages: 1, bonus_credits: 5, monthly_messages: 0 }`

## Out of scope

- Cron jobs (working)
- Auth flow (working)
- World Intelligence dashboard (separate task)
- The "Earn +5" button styling (works as designed)

## What I need from you

Just say "go" and I'll execute Steps 1–5 in one push. ~45 min of work across 4 frontend files and 3 Spine routers.

