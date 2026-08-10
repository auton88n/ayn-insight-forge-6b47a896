// v3.23.0 admin-broadcast — the admin panel's only outbound email path.
// Admin JWT is validated in code, the recipient list is resolved server side,
// and every send is written to email_logs.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders, handleCors } from '../_shared/cors.ts';

type Audience = 'all' | 'seekers' | 'employers' | 'discoverable' | 'test';

const FROM = 'AYN <hello@ayn.careers>';

// v3.40.0 — subject and message are admin-authored free text, inserted
// straight into the outgoing HTML email with no escaping. An admin typing
// `<a href="...">` into either field would ship as real, clickable markup
// in an email to every recipient in the audience, not visible page text.
// The envelope Subject header and email_logs stay on the raw string
// (neither renders HTML), only the HTML body is escaped.
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// v3.116.0 — the header used to spell out "AYN" as plain bold text. Now
// the real logo lockup, served from a stable public/ path since email
// clients cannot load a Vite-hashed bundle asset.
const LOGO_URL = 'https://ayn.careers/ayn-email-logo.png';

function wrap(subject: string, body: string) {
  const html = body
    .split(/\n{2,}/)
    .map(p => `<p style="margin:0 0 16px;line-height:1.6;color:#1a1a1a;font-size:15px">${escapeHtml(p).replace(/\n/g, '<br/>')}</p>`)
    .join('');
  return `<!doctype html><html><body style="margin:0;background:#faf7f2;padding:32px 16px;font-family:-apple-system,Segoe UI,Inter,Helvetica,Arial,sans-serif">
  <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:16px;padding:32px;border:1px solid #ece5da">
    <img src="${LOGO_URL}" alt="AYN" height="26" style="display:block;height:26px;width:auto;border:0;margin-bottom:24px">
    <h1 style="font-size:19px;margin:0 0 18px;color:#0b0b0c">${escapeHtml(subject)}</h1>
    ${html}
    <p style="color:#8a8178;line-height:1.7;margin:24px 0 8px;font-size:13px;">Sincerely,<br/>The AYN Team</p>
    <hr style="border:none;border-top:1px solid #ece5da;margin:28px 0 16px"/>
    <p style="font-size:12px;color:#8a8178;margin:0">You are receiving this because you have an AYN account. ayn.careers</p>
  </div></body></html>`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return handleCors(req);
  const headers = { ...corsHeaders(req), 'Content-Type': 'application/json' };

  try {
    const authHeader = req.headers.get('Authorization') ?? '';
    if (!authHeader.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers });
    }

    const url = Deno.env.get('SUPABASE_URL')!;
    const anon = Deno.env.get('SUPABASE_ANON_KEY')!;
    const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const asUser = createClient(url, anon, { global: { headers: { Authorization: authHeader } } });
    const { data: claimData, error: claimErr } = await asUser.auth.getClaims(authHeader.replace('Bearer ', ''));
    if (claimErr || !claimData?.claims?.sub) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers });
    }
    const callerId = claimData.claims.sub as string;

    const admin = createClient(url, service);
    const { data: isAdmin, error: roleErr } = await admin.rpc('has_role', { _user_id: callerId, _role: 'admin' });
    if (roleErr || !isAdmin) {
      return new Response(JSON.stringify({ error: 'Admin access required' }), { status: 403, headers });
    }

    const body = await req.json().catch(() => ({}));
    const audience = (body.audience ?? 'all') as Audience;
    const subject = String(body.subject ?? '').trim();
    const message = String(body.message ?? '').trim();
    const testTo = String(body.test_to ?? '').trim();

    if (!subject || subject.length > 200) {
      return new Response(JSON.stringify({ error: 'Subject is required and must be under 200 characters' }), { status: 400, headers });
    }
    if (!message || message.length > 20000) {
      return new Response(JSON.stringify({ error: 'Message is required and must be under 20000 characters' }), { status: 400, headers });
    }
    if (!['all', 'seekers', 'employers', 'discoverable', 'test'].includes(audience)) {
      return new Response(JSON.stringify({ error: 'Unknown audience' }), { status: 400, headers });
    }

    // ── resolve recipients server side ──
    let recipients: { user_id: string | null; email: string }[] = [];

    if (audience === 'test') {
      if (!testTo || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(testTo)) {
        return new Response(JSON.stringify({ error: 'A valid test address is required' }), { status: 400, headers });
      }
      recipients = [{ user_id: callerId, email: testTo }];
    } else {
      const { data: pool, error: poolErr } = await admin.rpc('get_broadcast_recipients', {
        p_admin_id: callerId,
        p_audience: audience,
      });
      if (poolErr) throw poolErr;
      const rows: any[] = Array.isArray(pool) ? pool : [];
      recipients = rows.filter(u => !!u?.email).map(u => ({ user_id: u.user_id ?? null, email: u.email }));
    }

    if (recipients.length === 0) {
      return new Response(JSON.stringify({ sent: 0, failed: 0, errors: [], recipients: 0 }), { headers });
    }

    const resendKey = Deno.env.get('RESEND_API_KEY');
    if (!resendKey) {
      return new Response(JSON.stringify({ error: 'RESEND_API_KEY is not configured' }), { status: 500, headers });
    }

    const html = wrap(subject, message);
    let sent = 0;
    let failed = 0;
    const errors: string[] = [];
    const logs: any[] = [];

    // Resend allows 2 requests per second on the default plan, so send in
    // small batches with a short pause between them.
    const BATCH = 5;
    for (let i = 0; i < recipients.length; i += BATCH) {
      const slice = recipients.slice(i, i + BATCH);
      const results = await Promise.all(slice.map(async r => {
        try {
          const res = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ from: FROM, to: [r.email], subject, html }),
          });
          if (!res.ok) {
            const text = await res.text();
            return { r, ok: false, error: `${res.status}: ${text.slice(0, 300)}` };
          }
          await res.json().catch(() => null);
          return { r, ok: true, error: null as string | null };
        } catch (e) {
          return { r, ok: false, error: (e as Error).message };
        }
      }));

      for (const out of results) {
        if (out.ok) sent++; else { failed++; if (errors.length < 5) errors.push(out.error!); }
        logs.push({
          user_id: out.r.user_id,
          email_type: audience === 'test' ? 'admin_broadcast_test' : `admin_broadcast_${audience}`,
          recipient_email: out.r.email,
          status: out.ok ? 'sent' : 'failed',
          error_message: out.error,
          metadata: { subject, audience, sent_by: callerId },
        });
      }
      if (i + BATCH < recipients.length) await new Promise(r => setTimeout(r, 600));
    }

    // Best effort logging, never fails the send.
    const { error: logErr } = await admin.from('email_logs').insert(logs);
    if (logErr) console.error('email_logs insert failed', logErr.message);

    return new Response(JSON.stringify({ sent, failed, errors, recipients: recipients.length }), { headers });
  } catch (e) {
    console.error('admin-broadcast failed', e);
    return new Response(JSON.stringify({ error: (e as Error).message || 'Broadcast failed' }), { status: 500, headers });
  }
});
