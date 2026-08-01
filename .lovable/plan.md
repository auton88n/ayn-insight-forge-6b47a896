## What I verified first

- The kill switch RPCs exist and do save (`get_admin_feature_flags` / `admin_set_feature_flag` write `system_config.feature_flags`), but **nothing in the app or the edge functions ever reads them**. A search across `src/` and `supabase/functions/` for feature flags returns zero hits. So today the switches are decorative: flipping one changes nothing for users.
- The **AI cost** pane is wired to a real RPC, but `llm_usage_logs` has **0 rows** (0 in the last 30 days), and no edge function writes to it. The three functions that call the AI gateway (`resume-hub`, `resume-match`, `ayn-agent-society`) log nothing. That is why the pane looks dead.
- **Terms consent** does have data (8 rows), but the RPC returns raw `jsonb_agg` which is `NULL` when empty, and the pane has no empty state. Errors (1172 rows), rate limits (10) and support (1 ticket) do return data.

## What I will build

### 1. Kill switches become real maintenance mode

Flags: `candidate_search`, `proposals`, `assessments`, `tailoring`, `signups`, plus a new global `platform` switch. Each flag can carry an optional admin-written message.

Server side (the part that actually stops people):
- A `get_feature_flags()` RPC readable by anon and authenticated that returns only the flag values and messages, no admin check.
- A `assertFeatureEnabled(flag)` guard in `supabase/functions/resume-hub/index.ts`, cached for 30 seconds, returning HTTP 503 with `{ maintenance: true, feature, message }`. Applied to:
  - candidate_search: `employer_spec_extract`, `employer_skill_catalog`, `employer_match`, `employer_card_answer`
  - proposals: `employer_draft_proposal`, `employer_reveal_request`
  - assessments: all `employer_assessment_*` and `assessment_*` actions
  - tailoring: `tailor`, `cover_letter`, `smart_tailor`, `ext_cover_letter_text`
  - platform: every action except the read-only bootstrap ones
- `signups`: enforced in the `handle_new_user` trigger, which raises when signups are off, so it cannot be bypassed by calling the auth API directly.

Client side (the part users see):
- A `useFeatureFlags()` hook polling the public RPC every 60 seconds.
- A `MaintenanceNotice` banner in the AYN ember style shown on the affected surface, with the admin message or a default "This is temporarily under maintenance. We are working on it." It disappears the moment the flag is turned back on.
- Buttons for a disabled feature are disabled, not just warned about: Find candidates, Send a job proposal, Send an assessment, Generate tailored resume / cover letter, and Sign up.
- `platform` off shows a full-page maintenance screen for everyone except admins, so the admin can still work.

### 2. AI cost becomes a real number

- A shared `logAiUsage()` helper writing to `llm_usage_logs` (model, prompt/completion tokens, computed cost, action name, user id, latency) plus `llm_failures` on gateway errors. Called from every gateway call site in `resume-hub` (chat + embeddings) and `resume-match`, always non blocking so a logging failure never breaks a user request.
- The pane keeps its current layout and starts filling in from the first call after deploy; until then it shows an honest "No AI calls recorded yet" instead of a wall of zeros.

### 3. Empty states and small fixes

- `get_admin_terms_consent` returns `[]` instead of `NULL` when empty; same coalesce audit on the other system RPCs.
- Every system pane gets a real empty state so "no data" never looks like "broken".

## Technical notes

- Migration: add the `platform` flag and per-flag message to the allowed key list in `admin_set_feature_flag`, add `get_feature_flags()` (anon + authenticated execute), harden `handle_new_user`, and fix the consent RPC. Grants included.
- No change to admin access: `/manage-bae76e99d97e188b`, role check, then the server side PIN.
- Kill switch changes keep writing to `security_audit_logs` at high severity.
