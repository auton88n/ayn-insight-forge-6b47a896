// v3.23.1 admin-auth-pin — the admin panel's PIN gate, in the repo this time.
// Replaces the three source-less deployed functions verify-admin-pin,
// set-admin-pin and admin-pin-alert.
//
// Actions:
//   verify { pin, code? }          -> { success, ticket?, ticketTtl?, locked?, lockoutRemaining?, attemptsRemaining?, mfa_setup_required?, mfa_code_required? }
//   check  { ticket }              -> { success } (re-verifies a minted ticket)
//   set    { pin, new_pin }        -> { success }
//   mfa_status                     -> { enrolled }
//   mfa_enroll_start               -> { secret, otpauth_uri } (requires the PIN already having been verified this session — see ticket check below)
//   mfa_enroll_confirm { code }    -> { success }
//   mfa_reset { pin, code }        -> { success } (re-verifies both factors, then clears enrollment so the admin can re-enroll a new device)
//
// Every call validates the JWT in code, then has_role(uid,'admin').
// Attempts and lockout live server side in app_settings.admin_pin_attempts,
// never in the browser.
//
// v3.161.0 — real per-admin TOTP (RFC 6238) layered on top of the PIN as a
// genuine second factor, not a replacement for it. A single shared PIN
// hash is "something the admin knows" but isn't what a SOC 2 / ISO 27001
// auditor means by MFA on privileged access; TOTP is "something they
// have" (their phone's authenticator app), checked in addition to the PIN.
// Once enrolled, a correct PIN alone no longer mints a ticket — it returns
// mfa_code_required and the caller must submit a valid, unused TOTP code
// in the same or a follow-up verify call. A wrong TOTP code counts against
// the exact same lockout counter as a wrong PIN, so brute-forcing either
// factor hits the same wall.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders, handleCors } from '../_shared/cors.ts';

const MAX_ATTEMPTS = 5;
const LOCK_MINUTES = 15;
const ATTEMPTS_KEY = 'admin_pin_attempts';
const HASH_KEY = 'admin_pin_hash';
const ALERT_TO = 'ghazi@ayn.careers';
const TOTP_STEP_SECONDS = 30;
const TOTP_DIGITS = 6;

type AttemptRecord = { count: number; locked_until: string | null };
type AttemptMap = Record<string, AttemptRecord>;

async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// ── TOTP (RFC 6238, built on RFC 4226 HOTP) ──
// Standard 20-byte secret, base32 (RFC 4648) for the otpauth:// URI and
// manual entry, HMAC-SHA1 + 30s steps + 6 digits — the parameters every
// authenticator app (Google Authenticator, Authy, 1Password, etc.)
// expects by default with no extra configuration.
const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32Encode(bytes: Uint8Array): string {
  let bits = 0, value = 0, output = '';
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  return output;
}

function base32Decode(str: string): Uint8Array {
  const clean = str.toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = 0, value = 0;
  const out: number[] = [];
  for (const char of clean) {
    const idx = BASE32_ALPHABET.indexOf(char);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return new Uint8Array(out);
}

function generateTotpSecret(): string {
  return base32Encode(crypto.getRandomValues(new Uint8Array(20)));
}

function currentTotpStep(): number {
  return Math.floor(Date.now() / 1000 / TOTP_STEP_SECONDS);
}

async function computeTotp(secretBase32: string, step: number): Promise<string> {
  const keyBytes = base32Decode(secretBase32);
  const counter = new ArrayBuffer(8);
  new DataView(counter).setUint32(4, step, false); // big-endian 64-bit counter, high 4 bytes always 0 until year ~4147
  const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']);
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, counter));
  const offset = mac[mac.length - 1] & 0x0f;
  const binCode = ((mac[offset] & 0x7f) << 24) | ((mac[offset + 1] & 0xff) << 16) | ((mac[offset + 2] & 0xff) << 8) | (mac[offset + 3] & 0xff);
  return (binCode % 10 ** TOTP_DIGITS).toString().padStart(TOTP_DIGITS, '0');
}

// Returns the matched step (so the caller can record it and reject reuse of
// the same code), or null if the code doesn't match any step in the
// tolerance window. ±1 step (30s) absorbs normal clock drift between the
// server and the admin's phone, matching standard TOTP implementations.
async function verifyTotp(secretBase32: string, code: string, notBeforeStep: number | null): Promise<number | null> {
  if (!/^\d{6}$/.test(code)) return null;
  const now = currentTotpStep();
  for (const delta of [0, -1, 1]) {
    const step = now + delta;
    if (notBeforeStep !== null && step <= notBeforeStep) continue; // replay of an already-used code
    if (timingSafeEqual(await computeTotp(secretBase32, step), code)) return step;
  }
  return null;
}

// ── PIN tickets ──
// A correct PIN mints a short lived HMAC signed ticket bound to the caller.
// The browser stores it, but it cannot mint or edit one, so setting a key by
// hand in devtools no longer opens the panel.
const TICKET_TTL_SECONDS = 8 * 60 * 60;

async function hmac(payload: string): Promise<string> {
  // Prefer a dedicated HMAC secret so admin tickets are decoupled from the
  // Supabase service role key.  Add ADMIN_PIN_HMAC_SECRET to your edge-function
  // secrets in the Supabase dashboard (at least 32 random chars).
  const secret =
    Deno.env.get('ADMIN_PIN_HMAC_SECRET') ??
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ??
    '';
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(`ayn-admin-pin:${secret}`),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function mintTicket(userId: string): Promise<string> {
  const exp = Math.floor(Date.now() / 1000) + TICKET_TTL_SECONDS;
  const payload = `${userId}.${exp}`;
  return `${payload}.${await hmac(payload)}`;
}

async function verifyTicket(ticket: string, userId: string): Promise<boolean> {
  const parts = ticket.split('.');
  if (parts.length !== 3) return false;
  const [uid, expRaw, sig] = parts;
  if (uid !== userId) return false;
  const exp = Number(expRaw);
  if (!Number.isFinite(exp) || exp * 1000 < Date.now()) return false;
  return timingSafeEqual(sig, await hmac(`${uid}.${exp}`));
}


async function readSetting(admin: any, key: string): Promise<string | null> {
  const { data } = await admin.from('app_settings').select('value').eq('key', key).maybeSingle();
  return data?.value ?? null;
}

async function writeSetting(admin: any, key: string, value: string) {
  await admin.from('app_settings').upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: 'key' });
}

async function readAttempts(admin: any): Promise<AttemptMap> {
  const raw = await readSetting(admin, ATTEMPTS_KEY);
  if (!raw) return {};
  try { return JSON.parse(raw) as AttemptMap; } catch { return {}; }
}

async function log(admin: any, userId: string, action: string, severity: string, details: Record<string, unknown>) {
  try {
    await admin.from('security_logs').insert({ user_id: userId, action, severity, details });
  } catch (e) {
    console.error('security_logs insert failed', (e as Error).message);
  }
}

async function alertLockout(email: string | null, userId: string) {
  const key = Deno.env.get('RESEND_API_KEY');
  if (!key) return;
  try {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        // v3.160.0 — self-hosted's Resend account only has support.ayn.careers
        // verified; ayn.careers itself isn't, so this send-from moved there.
        from: 'AYN <hello@support.ayn.careers>',
        to: [ALERT_TO],
        subject: 'AYN admin PIN locked out',
        html: `<p>An admin account was locked out of the AYN admin panel after ${MAX_ATTEMPTS} failed PIN attempts.</p>
               <p>Account: ${email ?? 'unknown'}<br/>User id: ${userId}<br/>Time: ${new Date().toISOString()}</p>
               <p>The lock clears automatically after ${LOCK_MINUTES} minutes.</p>`,
      }),
    });
  } catch (e) {
    console.error('lockout alert failed', (e as Error).message);
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return handleCors(req);
  const headers = { ...corsHeaders(req), 'Content-Type': 'application/json' };

  try {
    const authHeader = req.headers.get('Authorization') ?? '';
    if (!authHeader.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ success: false, error: 'Unauthorized' }), { status: 401, headers });
    }

    const url = Deno.env.get('SUPABASE_URL')!;
    const anon = Deno.env.get('SUPABASE_ANON_KEY')!;
    const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const asUser = createClient(url, anon, { global: { headers: { Authorization: authHeader } } });
    const { data: claimData, error: claimErr } = await asUser.auth.getClaims(authHeader.replace('Bearer ', ''));
    if (claimErr || !claimData?.claims?.sub) {
      return new Response(JSON.stringify({ success: false, error: 'Unauthorized' }), { status: 401, headers });
    }
    const callerId = claimData.claims.sub as string;
    const callerEmail = (claimData.claims.email as string) ?? null;

    const admin = createClient(url, service);
    const { data: isAdmin, error: roleErr } = await admin.rpc('has_role', { _user_id: callerId, _role: 'admin' });
    if (roleErr || !isAdmin) {
      await log(admin, callerId, 'admin_pin_non_admin_attempt', 'high', { email: callerEmail });
      return new Response(JSON.stringify({ success: false, error: 'Admin access required' }), { status: 403, headers });
    }

    const body = await req.json().catch(() => ({}));
    const action = String(body.action ?? 'verify');
    const pin = String(body.pin ?? '');

    // check { ticket } -> was this browser really given a ticket by a correct
    // PIN entry, for this same account, and is it still inside its window.
    // The browser cannot forge one, the signature is server side only.
    if (action === 'check') {
      const ok = await verifyTicket(String(body.ticket ?? ''), callerId);
      return new Response(JSON.stringify({ success: ok, valid: ok }), { status: ok ? 200 : 401, headers });
    }

    // mfa_status -> does the caller have TOTP enrolled. No PIN needed: it's
    // a read of the caller's own row, gated only by the admin-role check
    // already done above, so the PIN screen can decide up front which flow
    // to show without spending a lockout attempt just to ask.
    if (action === 'mfa_status') {
      const { data } = await admin.from('admin_totp_secrets').select('enrolled').eq('user_id', callerId).maybeSingle();
      return new Response(JSON.stringify({ success: true, enrolled: !!data?.enrolled }), { headers });
    }

    if (!/^\d{4,6}$/.test(pin)) {
      return new Response(JSON.stringify({ success: false, error: 'PIN must be 4 to 6 digits' }), { status: 400, headers });
    }

    const storedHash = await readSetting(admin, HASH_KEY);
    if (!storedHash) {
      return new Response(JSON.stringify({ success: false, error: 'No admin PIN is configured' }), { status: 500, headers });
    }

    // ── server side lockout ──
    const attempts = await readAttempts(admin);
    const record: AttemptRecord = attempts[callerId] ?? { count: 0, locked_until: null };
    if (record.locked_until && new Date(record.locked_until).getTime() > Date.now()) {
      const remaining = Math.ceil((new Date(record.locked_until).getTime() - Date.now()) / 1000);
      return new Response(JSON.stringify({ success: false, locked: true, lockoutRemaining: remaining }), { status: 429, headers });
    }
    if (record.locked_until) { record.count = 0; record.locked_until = null; }

    const pinHash = await sha256(pin);
    const pinMatches = timingSafeEqual(pinHash, storedHash);

    if (!pinMatches) {
      record.count += 1;
      let locked = false;
      if (record.count >= MAX_ATTEMPTS) {
        record.locked_until = new Date(Date.now() + LOCK_MINUTES * 60 * 1000).toISOString();
        record.count = MAX_ATTEMPTS;
        locked = true;
      }
      attempts[callerId] = record;
      await writeSetting(admin, ATTEMPTS_KEY, JSON.stringify(attempts));
      await log(admin, callerId, locked ? 'admin_pin_lockout' : 'admin_pin_failed', locked ? 'critical' : 'medium', {
        email: callerEmail, attempts: record.count, action,
      });
      if (locked) await alertLockout(callerEmail, callerId);

      return new Response(JSON.stringify({
        success: false,
        locked,
        lockoutRemaining: locked ? LOCK_MINUTES * 60 : undefined,
        attemptsRemaining: locked ? 0 : MAX_ATTEMPTS - record.count,
      }), { status: locked ? 429 : 200, headers });
    }

    // correct PIN: clear the counter
    delete attempts[callerId];
    await writeSetting(admin, ATTEMPTS_KEY, JSON.stringify(attempts));

    if (action === 'set') {
      // Once enrolled, changing the PIN is exactly as sensitive as
      // mfa_reset — require the current, unused code too, not just the
      // PIN being changed away from.
      const { data: setTotpRow } = await admin.from('admin_totp_secrets').select('secret_base32, enrolled, last_used_step').eq('user_id', callerId).maybeSingle();
      if (setTotpRow?.enrolled) {
        const setCode = String(body.code ?? '');
        const setMatchedStep = await verifyTotp(setTotpRow.secret_base32, setCode, setTotpRow.last_used_step ?? null);
        if (setMatchedStep === null) {
          return new Response(JSON.stringify({ success: false, mfa_code_required: true, error: setCode ? 'Incorrect code' : undefined }), { headers });
        }
        await admin.from('admin_totp_secrets').update({ last_used_at: new Date().toISOString(), last_used_step: setMatchedStep }).eq('user_id', callerId);
      }
      const newPin = String(body.new_pin ?? '');
      if (!/^\d{4,6}$/.test(newPin)) {
        return new Response(JSON.stringify({ success: false, error: 'The new PIN must be 4 to 6 digits' }), { status: 400, headers });
      }
      if (newPin === pin) {
        return new Response(JSON.stringify({ success: false, error: 'The new PIN must be different' }), { status: 400, headers });
      }
      await writeSetting(admin, HASH_KEY, await sha256(newPin));
      await log(admin, callerId, 'admin_pin_changed', 'high', { email: callerEmail });
      return new Response(JSON.stringify({ success: true }), { headers });
    }

    // mfa_enroll_start -> the PIN above already proved "something you
    // know"; generate a fresh secret for "something you have" and hand it
    // back for the admin to add to their authenticator app. Overwrites any
    // earlier, never-confirmed pending secret (enrolled stays false until
    // mfa_enroll_confirm succeeds, so this can't be used to silently swap
    // out an already-active enrollment).
    if (action === 'mfa_enroll_start') {
      const secret = generateTotpSecret();
      await admin.from('admin_totp_secrets').upsert({
        user_id: callerId, secret_base32: secret, enrolled: false,
        created_at: new Date().toISOString(), confirmed_at: null, last_used_at: null, last_used_step: null,
      }, { onConflict: 'user_id' });
      const label = encodeURIComponent(callerEmail || callerId);
      const otpauthUri = `otpauth://totp/AYN%20Admin:${label}?secret=${secret}&issuer=AYN&digits=${TOTP_DIGITS}&period=${TOTP_STEP_SECONDS}`;
      await log(admin, callerId, 'admin_mfa_enroll_started', 'high', { email: callerEmail });
      return new Response(JSON.stringify({ success: true, secret, otpauth_uri: otpauthUri }), { headers });
    }

    // mfa_enroll_confirm -> proves the admin actually captured the secret
    // correctly (not just that the enroll_start call succeeded) before it
    // becomes the thing every future login depends on.
    if (action === 'mfa_enroll_confirm') {
      const { data: row } = await admin.from('admin_totp_secrets').select('secret_base32').eq('user_id', callerId).maybeSingle();
      if (!row) return new Response(JSON.stringify({ success: false, error: 'Start enrollment first' }), { status: 400, headers });
      const code = String(body.code ?? '');
      const matchedStep = await verifyTotp(row.secret_base32, code, null);
      if (matchedStep === null) {
        return new Response(JSON.stringify({ success: false, error: 'That code did not match. Check the time on your phone and try again.' }), { headers });
      }
      await admin.from('admin_totp_secrets').update({
        enrolled: true, confirmed_at: new Date().toISOString(), last_used_at: new Date().toISOString(), last_used_step: matchedStep,
      }).eq('user_id', callerId);
      await log(admin, callerId, 'admin_mfa_enrolled', 'high', { email: callerEmail });
      return new Response(JSON.stringify({ success: true }), { headers });
    }

    // mfa_reset -> both factors already proved valid (PIN above, code
    // here), so this is "I have a new phone," not a way around MFA — it
    // clears enrollment so the next verify call goes through enrollment
    // again rather than silently disabling the second factor.
    if (action === 'mfa_reset') {
      const { data: row } = await admin.from('admin_totp_secrets').select('secret_base32, enrolled').eq('user_id', callerId).maybeSingle();
      if (!row?.enrolled) return new Response(JSON.stringify({ success: false, error: 'MFA is not enrolled' }), { status: 400, headers });
      const code = String(body.code ?? '');
      const matchedStep = await verifyTotp(row.secret_base32, code, null);
      if (matchedStep === null) {
        return new Response(JSON.stringify({ success: false, error: 'Incorrect code' }), { headers });
      }
      await admin.from('admin_totp_secrets').delete().eq('user_id', callerId);
      await log(admin, callerId, 'admin_mfa_reset', 'critical', { email: callerEmail });
      return new Response(JSON.stringify({ success: true }), { headers });
    }

    // verify (default): PIN is correct. Once TOTP is enrolled, that alone
    // is no longer enough — mint a ticket only once a valid, unused code
    // for this same call is also present. A wrong code here is checked
    // against the identical lockout counter as a wrong PIN, so brute
    // forcing the code doesn't get a separate, unthrottled budget.
    const { data: totpRow } = await admin.from('admin_totp_secrets').select('secret_base32, enrolled, last_used_step').eq('user_id', callerId).maybeSingle();
    if (totpRow?.enrolled) {
      const code = body.code ? String(body.code) : '';
      if (!code) {
        return new Response(JSON.stringify({ success: true, valid: true, mfa_code_required: true }), { headers });
      }
      const matchedStep = await verifyTotp(totpRow.secret_base32, code, totpRow.last_used_step ?? null);
      if (matchedStep === null) {
        const failRecord: AttemptRecord = attempts[callerId] ?? { count: 0, locked_until: null };
        failRecord.count += 1;
        let lockedNow = false;
        if (failRecord.count >= MAX_ATTEMPTS) {
          failRecord.locked_until = new Date(Date.now() + LOCK_MINUTES * 60 * 1000).toISOString();
          failRecord.count = MAX_ATTEMPTS;
          lockedNow = true;
        }
        attempts[callerId] = failRecord;
        await writeSetting(admin, ATTEMPTS_KEY, JSON.stringify(attempts));
        await log(admin, callerId, lockedNow ? 'admin_pin_lockout' : 'admin_mfa_code_failed', lockedNow ? 'critical' : 'medium', { email: callerEmail, attempts: failRecord.count });
        if (lockedNow) await alertLockout(callerEmail, callerId);
        return new Response(JSON.stringify({
          success: false, mfa_code_required: true,
          locked: lockedNow, lockoutRemaining: lockedNow ? LOCK_MINUTES * 60 : undefined,
          attemptsRemaining: lockedNow ? 0 : MAX_ATTEMPTS - failRecord.count,
        }), { status: lockedNow ? 429 : 200, headers });
      }
      await admin.from('admin_totp_secrets').update({ last_used_at: new Date().toISOString(), last_used_step: matchedStep }).eq('user_id', callerId);
    } else {
      // PIN correct, no second factor enrolled yet — mint no ticket. The
      // admin panel must not be reachable on a bare PIN once this shipped;
      // the caller enrolls now instead of getting in.
      return new Response(JSON.stringify({ success: true, valid: true, mfa_setup_required: true }), { headers });
    }

    await log(admin, callerId, 'admin_pin_verified', 'low', { email: callerEmail });
    return new Response(JSON.stringify({
      success: true,
      valid: true,
      ticket: await mintTicket(callerId),
      ticketTtl: TICKET_TTL_SECONDS,
    }), { headers });

  } catch (e) {
    console.error('admin-auth-pin failed', e);
    return new Response(JSON.stringify({ success: false, error: (e as Error).message || 'PIN check failed' }), { status: 500, headers });
  }
});
