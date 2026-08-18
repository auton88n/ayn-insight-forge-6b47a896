// v3.23.1 admin-auth-pin — the admin panel's PIN gate, in the repo this time.
// Replaces the three source-less deployed functions verify-admin-pin,
// set-admin-pin and admin-pin-alert.
//
// Actions:
//   verify { pin }                 -> { success, ticket?, ticketTtl?, locked?, lockoutRemaining?, attemptsRemaining? }
//   check  { ticket }              -> { success } (re-verifies a minted ticket)
//   set    { pin, new_pin }        -> { success }

//
// Every call validates the JWT in code, then has_role(uid,'admin').
// Attempts and lockout live server side in app_settings.admin_pin_attempts,
// never in the browser.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders, handleCors } from '../_shared/cors.ts';

const MAX_ATTEMPTS = 5;
const LOCK_MINUTES = 15;
const ATTEMPTS_KEY = 'admin_pin_attempts';
const HASH_KEY = 'admin_pin_hash';
const ALERT_TO = 'ghazi@ayn.careers';

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
