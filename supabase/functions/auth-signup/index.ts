// Sept 2026, pentest finding 3 (account enumeration): calling GoTrue's own
// /auth/v1/signup directly, as the frontend used to, told an attacker
// exactly which emails already have an account. GoTrue self-hosted has no
// config to suppress this — grepping the actual binary found the error
// code (user_already_exists) hardcoded with no toggle, and read its real
// source (internal/tokens/service.go-adjacent handlers) confirming the
// "identities: []" soft signal Supabase's hosted platform documents only
// covers an existing-but-unconfirmed account, not a real, confirmed one,
// which genuinely returns a distinct 422. AuthModal.tsx's own comment
// ("Supabase doesn't return error for security") was only half true.
//
// This wrapper is the one thing that changes: the frontend now calls this
// instead of supabase.auth.signUp() directly. It proxies the identical
// signup call to GoTrue with the anon key (the same call the client used
// to make itself, same metadata, same trigger path in
// handle_new_user_profile -- nothing about account creation changes), then
// normalizes the two outcomes an attacker could otherwise tell apart:
// a genuinely new account and an already-registered one both get back the
// exact same { ok: true } shape, no session, no extra email sent (sending
// an unsolicited "reset your password" as a side effect would just trade
// one enumeration oracle for a different one -- "did a reset email land").
// A real signed-in session was never returned on this path anyway --
// email confirmation is on, so a fresh account has no session until the
// confirmation link is clicked, and the UI has only ever shown a toast
// here, never navigated on the strength of a session -- so collapsing
// both outcomes to the same toast costs the legitimate case nothing.
//
// Genuine validation errors (weak_password, over_email_send_rate_limit, a
// malformed email) are NOT an enumeration oracle -- they fire identically
// whether the email is taken or not -- and are forwarded as-is so the
// person still learns their password is too short, same as before.
import { corsHeaders, handleCors } from '../_shared/cors.ts';

const ENUMERATION_ERROR_CODES = new Set(['user_already_exists', 'email_exists']);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return handleCors(req);
  const headers = { ...corsHeaders(req), 'Content-Type': 'application/json' };

  try {
    const body = await req.json().catch(() => ({}));
    const email = String(body.email ?? '').trim();
    const password = String(body.password ?? '');
    const options = (body.options ?? {}) as { emailRedirectTo?: string; data?: Record<string, unknown> };

    if (!email || !password) {
      return new Response(JSON.stringify({ ok: false, error: 'email and password are required' }), { status: 400, headers });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

    const gotrueRes = await fetch(`${supabaseUrl}/auth/v1/signup`, {
      method: 'POST',
      headers: { apikey: anonKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        password,
        data: options.data ?? {},
        options: { email_redirect_to: options.emailRedirectTo },
      }),
    });

    const payload = await gotrueRes.json().catch(() => ({}));

    if (gotrueRes.ok) {
      // A real new account (identities present) and an existing-but-
      // unconfirmed one (identities: [], GoTrue's own soft signal) both
      // land here as a plain 2xx -- both normalize to the same response.
      return new Response(JSON.stringify({ ok: true }), { headers });
    }

    // GoTrue also answers 422 for weak_password and other validation
    // failures -- 422 alone is not a safe proxy for "this account already
    // exists" (confirmed live: a plain 422-status check silently swallowed
    // a real weak-password rejection into a fake success). Only the actual
    // error_code decides whether this gets masked.
    const errorCode = String(payload?.error_code ?? payload?.code ?? '');
    if (ENUMERATION_ERROR_CODES.has(errorCode)) {
      // A real, confirmed account already owns this email. Same shape as
      // success -- an attacker learns nothing; a legitimate owner who
      // mistyped their way into signing up again just sees the same
      // "check your email" toast and can use Forgot password on their own.
      return new Response(JSON.stringify({ ok: true }), { headers });
    }

    // Any other failure (weak password, rate limited, malformed email) is
    // genuine input feedback, not an existence oracle -- forward it.
    return new Response(JSON.stringify({
      ok: false,
      error: String(payload?.msg ?? payload?.message ?? payload?.error_description ?? 'Sign up failed'),
      error_code: errorCode || undefined,
    }), { status: gotrueRes.status, headers });
  } catch (e) {
    console.error('auth-signup failed', e);
    return new Response(JSON.stringify({ ok: false, error: 'Sign up failed. Please try again.' }), { status: 500, headers });
  }
});
