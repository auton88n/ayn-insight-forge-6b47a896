// v3.111.0 admin-inbox-reply — sends a real reply to an inbound email shown
// in the admin System > Inbox pane, from one of a small set of AYN sending
// identities, each with its own signature appended automatically. Threads
// the reply via In-Reply-To/References when the original carried a
// Message-ID. Every send is logged to email_logs, same as admin-broadcast.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders, handleCors } from '../_shared/cors.ts';
import { escapeHtml, wrapEmail, heading, para } from '../_shared/emailTemplate.ts';

type IdentityKey = 'support' | 'hello' | 'ghazi';

const IDENTITIES: Record<IdentityKey, { label: string; from: string; signature: string[] }> = {
  support: {
    label: 'Support',
    from: 'AYN Support <support@ayn.careers>',
    signature: ['The AYN Support Team'],
  },
  hello: {
    label: 'Hello / General',
    from: 'AYN <hello@ayn.careers>',
    signature: ['AYN'],
  },
  ghazi: {
    label: 'Ghazi (Founder)',
    from: 'Ghazi at AYN <ghazi@ayn.careers>',
    signature: ['Ghazi', 'Founder, AYN'],
  },
};

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
    const emailId = String(body.email_id ?? '').trim();
    const identityKey = String(body.identity_key ?? '') as IdentityKey;
    const messageText = String(body.message ?? '').trim();

    if (!emailId) return new Response(JSON.stringify({ error: 'email_id is required' }), { status: 400, headers });
    if (!IDENTITIES[identityKey]) {
      return new Response(JSON.stringify({ error: 'Unknown identity' }), { status: 400, headers });
    }
    if (!messageText || messageText.length > 20000) {
      return new Response(JSON.stringify({ error: 'A message is required and must be under 20000 characters' }), { status: 400, headers });
    }

    const { data: original, error: fetchErr } = await admin
      .from('inbound_email_replies')
      .select('id, from_email, from_name, subject, message_id')
      .eq('id', emailId)
      .maybeSingle();
    if (fetchErr) throw fetchErr;
    if (!original) return new Response(JSON.stringify({ error: 'Email not found' }), { status: 404, headers });
    if (!original.from_email) {
      return new Response(JSON.stringify({ error: 'This email has no sender address to reply to' }), { status: 400, headers });
    }

    const identity = IDENTITIES[identityKey];
    const subject = original.subject && /^re:/i.test(original.subject)
      ? original.subject
      : `Re: ${original.subject || '(no subject)'}`;

    const paragraphs = messageText
      .split(/\n{2,}/)
      .map((p) => para(escapeHtml(p).replace(/\n/g, '<br/>')))
      .join('');
    const signatureHtml = para(identity.signature.map(escapeHtml).join('<br/>'), { muted: true, marginTop: 24 });
    const html = wrapEmail(`${heading(subject)}${paragraphs}${signatureHtml}`);

    const resendKey = Deno.env.get('RESEND_API_KEY');
    if (!resendKey) {
      return new Response(JSON.stringify({ error: 'RESEND_API_KEY is not configured' }), { status: 500, headers });
    }

    const resendHeaders: Record<string, string> = {};
    if (original.message_id) {
      resendHeaders['In-Reply-To'] = original.message_id;
      resendHeaders['References'] = original.message_id;
    }

    const sendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: identity.from,
        to: [original.from_email],
        subject,
        html,
        ...(Object.keys(resendHeaders).length ? { headers: resendHeaders } : {}),
      }),
    });

    const logRow = {
      user_id: null as string | null,
      email_type: 'admin_inbox_reply',
      recipient_email: original.from_email,
      status: sendRes.ok ? 'sent' : 'failed',
      error_message: sendRes.ok ? null : (await sendRes.text().catch(() => '')).slice(0, 300),
      metadata: { subject, identity: identityKey, sent_by: callerId, original_email_id: emailId },
    };
    await admin.from('email_logs').insert(logRow);

    if (!sendRes.ok) {
      return new Response(JSON.stringify({ error: logRow.error_message || 'Send failed' }), { status: 502, headers });
    }

    await admin
      .from('inbound_email_replies')
      .update({ is_read: true, replied_at: new Date().toISOString(), replied_by: callerId, reply_identity: identityKey })
      .eq('id', emailId);

    return new Response(JSON.stringify({ ok: true }), { headers });
  } catch (e) {
    console.error('admin-inbox-reply failed', e);
    return new Response(JSON.stringify({ error: (e as Error).message || 'Reply failed' }), { status: 500, headers });
  }
});
