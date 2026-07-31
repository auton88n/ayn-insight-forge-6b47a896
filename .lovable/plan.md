## Goal

The admin panel keeps a legacy look and legacy panes, and at least one section is broken (Candidates fails with `column f.consented_at does not exist`). Rebuild it so every section is AYN branded and every button, stat and action reads or writes real data.

## Confirmed problems (verified by reading the code and the database)

- `get_admin_candidates` orders by `f.consented_at`, but the inner subselect aliased `f` does not select that column, so the whole Candidates section 500s. This is the error in the screenshot.
- The System section still mounts eight legacy components (`UserManagement`, `SupportManagement`, `ErrorMonitoring`, `RateLimitMonitoring`, `AICostDashboard`, `EmailBroadcast`, `TermsConsentViewer`, `SystemSettings`) written for the old platform-era admin. They carry the old visual language and some read RPCs tied to retired products.
- `useAdminQuery.ts` still declares hooks for ~25 retired RPCs (test results, visitor analytics, NDAs, custom orders, credit gifts, LLM management, beta feedback, message ratings, conversations, applications). Dead surface area.
- `AdminPanel.tsx` header has a Sun/Moon `next-themes` toggle to remove.
- The admin PIN screen and loader use raw black/white and a generic spinner rather than the AYN mark.

## Plan

### 1. Fix the data layer, one RPC at a time
One migration that recreates the six section RPCs plus the mutations, each one checked against the real schema before shipping:
- `get_admin_candidates`: carry `consented_at` into the ordered subselect (fixes the current crash).
- Re-verify `get_admin_overview`, `_employers`, `_marketplace`, `_money`, `admin_employer_approve/_decline/_override`, `admin_mark_candidates_stale`, `admin_upsert_system_config`, `admin_unblock_user` by executing each body's inner query directly against the database first, so no section can fail on a missing column again.
- Keep the `has_role(auth.uid(),'admin')` guard and SECURITY DEFINER on every one.

### 2. Rebuild System as native AYN panes
Replace the eight legacy imports with panes written in the same language as the other five sections (`SectionHeader`, `Stat`, `Card`, `EmptyRow`):
- **Accounts** — real users list with search, role, plan, credits, block/unblock.
- **Support** — real tickets with status change and reply.
- **Errors** — real error log with resolve.
- **Rate limits** — real counters and unblock.
- **AI cost** — real `llm_usage_logs` spend by model and by day.
- **Email** — kept only if a real send path exists; otherwise the pane is removed rather than left as a non-working form.
- **Terms consent** — real consent log.
- **Settings** — real `app_settings` writes, including changing the admin PIN.
Any pane whose backing data or action does not actually exist gets deleted instead of shipped as a stub. I will report which ones, if any, fall in that bucket.

### 3. Delete the dead layer
- Remove retired hooks and query keys from `useAdminQuery.ts`.
- Delete the legacy components under `src/components/admin/` that are no longer mounted.
- Leave database tables alone; I will list any that are now unreferenced.

### 4. AYN branding pass
- Remove the Sun/Moon theme toggle and the `next-themes` dependency from `AdminPanel.tsx`; the admin is a single light Ember surface.
- Header: AYN mark, Syne headings, Inter body, JetBrains Mono for numeric stats, consistent icon weight and size across the rail and section headers.
- PIN and login screens rebranded onto the AYN paper surface with the `AynLoader` mark instead of the black screen and generic spinner.
- Section loading and error states use `AynLoader` and Ember accents.

### 5. Verify
- Typecheck and build.
- Sign in as admin through `/manage-bae76e99d97e188b` with the PIN and open all six sections plus every System pane in the browser, confirming each one renders real data with no console error, and exercise one write action (employer approve, mark stale, settings save).

## Technical notes
- Access control is unchanged: login, `user_roles` admin check, then the server-side PIN.
- Ember tokens continue to come from `.admin-surface` on `<body>` so Radix portals inherit them.
- No changes to the seeker or employer surfaces.
