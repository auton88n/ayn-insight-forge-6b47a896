-- Sept 2026, pentest finding 4 (weak password policy / no login rate
-- limiting), confirmed live: 40 wrong passwords against a real account
-- produced zero lockout, zero 429, zero backoff of any kind. GoTrue
-- supports a real Password Verification Attempt hook for exactly this
-- (pg-functions://postgres/public/password_verification_attempt), and this
-- deployment already had it wired in the compose file, commented out, the
-- target function never built. This is that function.
--
-- Same shape as admin-auth-pin's own already-proven PIN lockout (a fixed
-- window, a timed lock), scaled to a friendlier threshold since this
-- gates every real seeker/employer sign-in, not just the founder's own
-- admin panel. A lockout also writes to security_logs at 'high' severity,
-- so it reaches the real-time alert trigger restored earlier this pass --
-- a real credential-stuffing attempt against a real account is exactly
-- what that alert exists for.
create table if not exists public.password_attempt_lockout (
  user_id uuid primary key references auth.users(id) on delete cascade,
  fail_count integer not null default 0,
  window_start timestamptz not null default now(),
  locked_until timestamptz
);

alter table public.password_attempt_lockout enable row level security;
-- Zero policies, deny-by-default -- this hook runs as the postgres
-- superuser via pg-functions://, the same trust level as any other
-- SECURITY DEFINER function in this app; no client role should ever
-- touch this table directly.

create or replace function public.password_verification_attempt(event jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  target_user uuid := (event->>'user_id')::uuid;
  was_valid boolean := (event->>'valid')::boolean;
  row_rec public.password_attempt_lockout;
  max_attempts constant integer := 10;
  window_minutes constant integer := 15;
  lock_minutes constant integer := 15;
begin
  select * into row_rec from public.password_attempt_lockout where user_id = target_user for update;

  -- Already locked: refuse regardless of whether this specific attempt's
  -- password happened to be correct -- a lockout that a correct guess can
  -- walk straight through defeats the point of having one.
  if row_rec.locked_until is not null and row_rec.locked_until > now() then
    return jsonb_build_object(
      'decision', 'reject',
      'message', 'Too many failed sign-in attempts. Try again in a few minutes.'
    );
  end if;

  if was_valid then
    -- A genuine correct password clears the slate.
    delete from public.password_attempt_lockout where user_id = target_user;
    return jsonb_build_object('decision', 'continue');
  end if;

  if row_rec.user_id is null then
    insert into public.password_attempt_lockout (user_id, fail_count, window_start)
    values (target_user, 1, now());
    return jsonb_build_object('decision', 'continue');
  end if;

  -- Old, expired window: start counting fresh rather than compounding a
  -- stale count from long ago.
  if row_rec.window_start < now() - (window_minutes || ' minutes')::interval then
    update public.password_attempt_lockout
      set fail_count = 1, window_start = now(), locked_until = null
      where user_id = target_user;
    return jsonb_build_object('decision', 'continue');
  end if;

  if row_rec.fail_count + 1 >= max_attempts then
    update public.password_attempt_lockout
      set fail_count = 0, window_start = now(), locked_until = now() + (lock_minutes || ' minutes')::interval
      where user_id = target_user;
    insert into public.security_logs (user_id, action, severity, details)
      values (target_user, 'password_lockout', 'high', jsonb_build_object('max_attempts', max_attempts, 'lock_minutes', lock_minutes));
    return jsonb_build_object(
      'decision', 'reject',
      'message', 'Too many failed sign-in attempts. Try again in a few minutes.'
    );
  end if;

  update public.password_attempt_lockout set fail_count = fail_count + 1 where user_id = target_user;
  return jsonb_build_object('decision', 'continue');
end;
$function$;

revoke all on function public.password_verification_attempt(jsonb) from public, anon, authenticated;
grant execute on function public.password_verification_attempt(jsonb) to supabase_auth_admin;
revoke all on public.password_attempt_lockout from public, anon, authenticated;
grant all on public.password_attempt_lockout to supabase_auth_admin;
