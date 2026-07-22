
# v2.10.0 Two-role platform

Turn AYN into a two-sided product with distinct signup, distinct dashboards, and a candidate-hunter chat that replaces the Hiring mode toggle.

## Roles

- job_seeker (default): sees Resume Hub + AYN dashboard. Gets 3 free autofill credits/day only if they opt in to the talent pool.
- employer: sees AYN dashboard only, no Resume Hub, no autofill. Chats with AYN naturally to find candidates. Fully gated until an admin approves; before approval sees a waiting screen.

## 1. Signup and auth

- Single /signup with a role toggle: "I'm looking for a job" vs "I'm hiring".
- Job seeker path creates an instant account and lands in Resume Hub with an onboarding card explaining 3/day credits and the talent pool opt-in.
- Employer path collects company name, size, hiring need, and contact phone. Creates the auth user with role=employer and status=pending_approval, and notifies the team via the existing admin notification pipeline.
- Post-login redirect: seekers to /resume-hub, approved employers to / (AYN dashboard), pending employers to /employer/pending.

## 2. Data model

- profiles.role enum: job_seeker or employer, default job_seeker.
- New employer_accounts table with user_id, company_name, company_size, hiring_need, phone, status (pending_approval, approved, suspended), approved_at, approved_by, package_notes. RLS: owner reads own row, admins read/write all.
- talent_pool_consent becomes the gate for daily seeker credits (see section 4).
- Route guards read profiles.role and employer_accounts.status.

## 3. AYN chat as candidate hunter (replaces Hiring mode UI)

- Delete EmployerChatPanel overlay and the mode toggle. Employers use the same dashboard chat as everyone else.
- In the chat edge function, branch on profiles.role:
  - employer: candidate-hunter system prompt. AYN is warm and consultative, asks about the role, must-haves, nice-to-haves, seniority, location, comp. When it has enough signal, it silently calls the existing employer_intake_chat then employer_match pipeline and streams anonymized candidate cards inline in chat. No separate mode, no separate UI.
  - job_seeker: unchanged assistant behavior.
- Interview invite: employer clicks Invite to interview on a card in chat. Creates an in-app pending request the candidate sees in Resume Hub Profile via the existing intro-request UI, and an email via the existing Resend flow. Candidate approval reveals contact, decline is silent.

## 4. Credits and talent pool coupling

- Seeker 3/day free autofill credits granted only while talent_pool_consent.is_active is true. Turning consent off drops free credits to 0/day; paid plans are unaffected.
- ProfileTab consent toggle copy updated to make the exchange explicit.
- Employers get no autofill credits and no Resume Hub nav.

## 5. UI removals and additions

- Remove: Hiring mode toggle, EmployerChatPanel.tsx, employer-only chat overlay entry point.
- Add: /signup role selector, /employer/pending waiting screen, admin approval controls in a new Employers admin tab (approve, suspend, set package notes), inline candidate-card renderer in the main chat message list reusing the existing match card component.
- Nav: hide Resume Hub link for employers, hide employer-only affordances for seekers.

## 6. Docs and wiring

- Update CLAUDE.md, docs/map/platform.md, and docs/map/resume-hub.md (Talent pool section) with the new roles, gating, and chat-embedded matcher flow.
- Extend scripts/check-wiring.mjs with role-based routing assertions and a check confirming EmployerChatPanel is gone.

## Out of scope

- Billing/package UI for employers; the team handles pricing offline, package_notes is free text.
- Any extension change.
- New matcher algorithm; reuses v2.9.1 pipeline unchanged, only the entry point moves.

## Technical notes

- Migration adds profiles.role, employer_accounts table with RLS and grants, and a trigger seeding employer_accounts.status=pending_approval when a user signs up as employer.
- Chat edge function receives role from its existing session lookup; the branch is a single conditional around the system prompt and tool set.
- Candidate cards in chat use a new message part type (type: candidate_card) rendered by the dashboard chat renderer.
