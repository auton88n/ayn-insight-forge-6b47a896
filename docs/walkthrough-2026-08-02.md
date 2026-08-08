# Full app walkthrough — 2 August 2026

Driven live against production (https://aynn.io) as a real signed-out visitor, a real job seeker, a real employer, and admin, each through the actual UI (signup forms, buttons, real AI calls), not shortcuts, except where noted. Three throwaway accounts were used and are now fully erased; the admin PIN was temporarily substituted with a test value I controlled and has been restored to the founder's original hash; the temporary admin role grant has been removed. The real production employer "Hoolet" and all other real data were left untouched, checked before and after.

This is a companion to `docs/audit-2026-08-02.md` (the dead-code audit). That one is about code nobody calls; this one is about code that runs and does the wrong thing.

## CRITICAL — broken right now, needs immediate attention

### 1. Employer signup silently creates a job seeker, not an employer

Signed up a real account through the actual signup form, selected "I am hiring," filled in company name, submitted. `auth.users.raw_user_meta_data.role` correctly recorded `"employer"`. After confirming the email and signing in, the account landed in the **seeker's Resume Hub**, not the employer flow — reproduced after a full page reload and in a brand new browser tab, so it is not a client cache artifact.

Root cause, in `src/components/auth/AuthModal.tsx` lines 385-403: after `supabase.auth.signUp()` returns, the code makes a client-side call to stamp `profiles.role` and insert an `employer_accounts` row. With email confirmation required (which is on, in production, confirmed by the "check your email to verify" message every signup shows), there is no session yet at that exact moment, so this update runs unauthenticated, RLS filters it to zero rows, and the surrounding `try/catch` swallows the failure with only a `console.warn`. Neither of the two DB triggers on `auth.users` (`handle_new_user`, `handle_new_user_profile`) sets `role` either — `handle_new_user_profile` only inserts `(user_id, created_at, updated_at)`.

Compounding it: even with a valid session, the `employer_accounts` insert would still fail, because it writes `website`, `contact_name`, `contact_email` — three columns that do not exist on that table (checked directly: the real columns are `company_name, company_size, hiring_need, phone, status, approved_at, approved_by, package_notes, internal_note`).

`employer_accounts` is not legacy — it is the live table `get_admin_employer_list`/`admin_employer_decide` (`supabase/functions/resume-hub/index.ts` lines 2323, 2382) and `useUserRole.ts`'s employer gating both depend on. So today, any real person who signs up as an employer becomes a job seeker with no company account, and the admin approval queue never even sees them. This is invisible for seeker signups only because `job_seeker` happens to be the column default.

This is the same architectural mistake `v3.33.0` already found and fixed once, for consent recording ("no session yet at signup") — just not fixed here. The durable fix is to move role-stamping and `employer_accounts` creation server side, into the trigger, the same way `v3.33.0` moved consent recording there.

### 2. Self-service and admin account deletion is broken for any account with AI usage history

`erase_account_core` (used by both `self_delete_account` and `admin_erase_account`) does `UPDATE public.llm_usage_logs SET user_id = NULL WHERE user_id = p_user_id`, but `llm_usage_logs.user_id` has a NOT NULL constraint. Reproduced live: erasing a real test employer account (which had `llm_usage_logs` rows from its `employer_spec_extract` intake call) threw `null value in column "user_id" of relation "llm_usage_logs" violates not-null constraint`, and — because Postgres functions run in an implicit transaction — the entire erasure rolled back. Confirmed after the error: the account was completely untouched, not partially erased.

A seeker test account erased cleanly earlier in this same session only because it happened to have zero `llm_usage_logs` rows — its tailor/cover-letter/score actions went through Resume Hub's Jobs tab, a code path that does not call `setAiCtx`/`logAiUsage` at all (consistent with the separately-flagged finding that this path is generally less instrumented than the extension's). Any account that used AI through a path that does log usage — which includes essentially all employer activity and all extension-based seeker activity — will hit this and fail to delete.

This directly undermines the v3.34.0 "account self service" work: the legally-promised Delete Account button will throw for a large fraction of real accounts, silently to the user (the frontend just shows a generic error toast), and the admin erase path fails identically.

Fix is small: change that one line from `SET user_id = NULL` to a `DELETE FROM public.llm_usage_logs WHERE user_id = p_user_id`, matching what the table's constraint actually requires, the same way `autofill_runs` etc. are deleted rather than nulled elsewhere in the same function.

## Real bugs, lower severity

### 3. Company profile form can silently discard unsaved fields

`src/components/employer/CompanyProfile.tsx` has `useEffect(() => { setForm(org); }, [org])`. Every field saves independently: text fields on blur (`blurSave`), but the company-size buttons save immediately on click (`onClick={() => { setForm(...); void save({ company_size: s }); }}`). Any save causes the parent to refresh its `org` object, which flows back through this effect and overwrites the *entire* local form — including any other fields the person had already typed into but not yet blurred away from.

Reproduced twice: filled all four required text fields (website, industry, headquarters, about) via direct value-setting, then clicked a company-size button before blurring the others — all four fields visibly reset to empty in the DOM, and the database confirmed only `company_size` had actually saved; the rest were `null`. Filling the same four fields one at a time, blurring after each, saved correctly. This is at the mandatory "company profile first" onboarding gate (v3.11.0) — a real employer who fills the form in a natural top-to-bottom rhythm without deliberately blurring each field before touching the size selector will lose their typed text with no warning.

### 4. Admin panel: Terms consent pane is dead

Clicking System → Terms consent shows "Could not load this section — permission denied for function get_admin_terms_consent" (403), reproduced from a real admin session. Checked directly: `get_admin_terms_consent` has `EXECUTE` granted only to `postgres` and `service_role` — every other admin RPC checked (`get_admin_employers`, `get_admin_overview`) also grants to `authenticated`, which this one is missing. One-line fix: `GRANT EXECUTE ON FUNCTION public.get_admin_terms_consent(...) TO authenticated;`.

### 5. Admin PIN entry UI silently caps at 4 digits

The backend (`admin-auth-pin`) accepts 4 to 6 digit PINs (`/^\d{4,6}$/`), but the PIN-entry screen in the admin app renders exactly four single-digit boxes. A 6-digit PIN (allowed by, and briefly set as a test value against, the real backend) has no way to be entered through the actual UI. Not tested end to end since the founder's real PIN was not touched, but the UI element count is a direct, checkable fact.

### 6. `erase_account_core` leaves `orgs` rows orphaned

The function deletes `employer_accounts` and `org_members` for the erased user but never touches `public.orgs` (which has no `user_id` column, only `created_by`). Erasing an employer leaves their company's `orgs` row behind indefinitely, pointing at a now-banned, scrubbed user id. Low severity (no PII in `orgs` beyond the company name/website the employer chose to publish anyway), but worth a decision: delete it, or reassign/orphan it deliberately.

## Confirmed working well, driven live end to end

- **Landing → signup → email confirm → sign in**, for both audiences, through the real form.
- **v3.33.0 consent recording**: real signup produced a correct `terms_consent_log` row (`terms_version 1.0, privacy_version 1.0, source signup`) via the actual form, no shortcuts.
- **Resume Hub**: credit pill (this session's work) correctly showed live balance; Profile autosave-on-blur genuinely persists (`user_profile_data`); Jobs tab manual-add, Score (90/100, correctly grounded, correct missing-keyword detection), Tailor, and Cover Letter all produced real, well-grounded AI output with no console errors.
- **The metering/credit-bypass bug already flagged this session** (Resume Hub's Jobs tab tailors for free while the extension charges) was reconfirmed live: balance stayed at 6 credits through a real tailor + cover letter generation from Jobs tab.
- **Discovery opt-in**: real confirmation dialog, real candidate indexing (`candidate_index.embedding_model = openai/text-embedding-3-small`, 5 real skills extracted).
- **Settings**: every tab (Account, Notifications, Privacy, Sessions, Memory) rendered without error; the already-known dead "Usage & Limits" card reconfirmed live (separately flagged, not re-litigated here); this session's Sessions fix reconfirmed live in production, not just locally.
- **Billing**: real plan, real 6-credit balance, real ledger entry, full tier grid, all matching the v3.34.0 work.
- **Employer flow end to end**: org creation → company profile (once filled correctly) → widget intake (free-text extraction worked well) → candidate match (87/100, correctly grounded, zero invented facts) → auto-drafted proposal (well-written, matches the documented v3.12.0 prompt exactly) → sent → seeker received it, read the correct company details, accepted → **employer correctly received the real name and email only after acceptance**. The entire core value-prop loop of the product works.
- **Admin panel**: PIN gate, Overview, Employers (approval correctly started a real 30-day free month), Candidates, Marketplace, Money, System → Accounts (correctly showed a previously-erased test account with scrubbed identity), Errors, Support, Kill switches — all rendered real, correct, live production data with no console errors, except finding #4 above.

## Not covered

The Chrome extension's actual runtime (chrome.* APIs) — this browser tooling cannot load an unpacked MV3 extension, so only its bundled build and static UI were checkable, not real sidepanel behavior. Payment/checkout (`create-checkout`) was not exercised — would require a real or test Stripe card. The ~30 edge functions with no local source (see the dead-code audit) were not functionally exercised, only checked for reachability.
