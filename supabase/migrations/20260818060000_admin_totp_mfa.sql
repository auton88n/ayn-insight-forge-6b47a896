-- v3.161.0 — real per-admin TOTP (RFC 6238) as a genuine second factor on
-- top of the existing admin PIN, not a replacement for it. The PIN alone
-- (a single shared secret checked in admin-auth-pin) doesn't meet what a
-- SOC 2 / ISO 27001 auditor means by MFA on privileged access — this closes
-- that specific, real gap. One row per admin (not the PIN's single global
-- secret), so enrollment and lockout are genuinely per-person.
create table if not exists public.admin_totp_secrets (
  user_id uuid primary key references auth.users(id) on delete cascade,
  secret_base32 text not null,
  enrolled boolean not null default false,
  created_at timestamptz not null default now(),
  confirmed_at timestamptz,
  last_used_at timestamptz,
  last_used_step bigint
);

-- Same deny-by-default shape as assessment_rubrics/assessment_results/
-- cookie_consent_log/error_alert_state/job_cache (see this session's own
-- security-definer-sweep fix): RLS on, zero policies, and an explicit
-- REVOKE so a default schema-wide grant can never quietly reopen it.
-- Every read and write goes through admin-auth-pin's own service-role
-- client, which already re-checks has_role(caller,'admin') before touching
-- this table at all.
alter table public.admin_totp_secrets enable row level security;
revoke all on public.admin_totp_secrets from anon, authenticated;
