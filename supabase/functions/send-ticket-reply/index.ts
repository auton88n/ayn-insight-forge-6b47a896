// v3.118.0 — the admin Support pane's reply box called admin_insert_ticket_message
// directly, which only ever wrote a row into ticket_messages. Nothing reads that
// table back to the person who opened the ticket (there is no "my tickets" view
// anywhere in the app, guest or signed-in) and nothing ever emailed them either,
// so an admin's reply reached no one. The live send-ticket-reply this slug
// previously pointed to was old, undeployed-from-source code: SMTP instead of
// Resend, aynn.io instead of ayn.careers, the pre-rebrand black-and-white
// template, and zero real callers. Rewritten on the current shared branding
// (matching admin-inbox-reply's identity/signature shape) and wired to the
// actual reply button. Does the ticket_messages insert and the email send in
// one call so neither can silently succeed without the other.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders, handleCors } from '../_shared/cors.ts';
import { escapeHtml, wrapEmail, heading, para } from '../_shared/emailTemplate.ts';

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
    const ticketId = String(body.ticket_id ?? '').trim();
    const messageText = String(body.message ?? '').trim();

    if (!ticketId) return new Response(JSON.stringify({ error: 'ticket_id is required' }), { status: 400, headers });
    if (!messageText || messageText.length > 20000) {
      return new Response(JSON.stringify({ error: 'A message is required and must be under 20000 characters' }), { status: 400, headers });
    }

    const { data: ticket, error: fetchErr } = await admin
      .from('support_tickets')
      .select('id, subject, status, guest_email, guest_name')
      .eq('id', ticketId)
      .maybeSingle();
    if (fetchErr) throw fetchErr;
    if (!ticket) return new Response(JSON.stringify({ error: 'Ticket not found' }), { status: 404, headers });

    const { error: insertErr } = await admin.from('ticket_messages').insert({
      ticket_id: ticketId,
      sender_id: callerId,
      sender_type: 'admin',
      message: messageText,
    });
    if (insertErr) throw insertErr;

    if (ticket.status === 'open') {
      await admin.from('support_tickets').update({ status: 'in_progress', updated_at: new Date().toISOString() }).eq('id', ticketId);
    }

    if (!ticket.guest_email) {
      // Every real ticket carries an address here (TicketForm.tsx stores the
      // signed-in submitter's own account email into guest_email too, not
      // just a guest's), so this only fires for a hand-inserted/synthetic
      // row with no email at all. The reply is still saved; there's just no
      // one to notify.
      return new Response(JSON.stringify({ ok: true, emailed: false }), { headers });
    }

    const subject = ticket.subject && /^re:/i.test(ticket.subject) ? ticket.subject : `Re: ${ticket.subject || '(no subject)'}`;
    const greeting = ticket.guest_name ? `Hi ${escapeHtml(ticket.guest_name)},` : 'Hi,';
    const html = wrapEmail(
      `${heading(subject)}${para(greeting)}${para(escapeHtml(messageText).replace(/\n/g, '<br/>'))}`,
      ['The AYN Support Team'],
    );

    const resendKey = Deno.env.get('RESEND_API_KEY');
    if (!resendKey) {
      return new Response(JSON.stringify({ error: 'RESEND_API_KEY is not configured' }), { status: 500, headers });
    }

    const sendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: 'AYN Support <support@ayn.careers>', to: [ticket.guest_email], subject, html }),
    });

    await admin.from('email_logs').insert({
      user_id: null,
      email_type: 'ticket_reply',
      recipient_email: ticket.guest_email,
      status: sendRes.ok ? 'sent' : 'failed',
      error_message: sendRes.ok ? null : (await sendRes.text().catch(() => '')).slice(0, 300),
      metadata: { subject, ticket_id: ticketId, sent_by: callerId },
    });

    if (!sendRes.ok) {
      // The reply itself is already saved (matching this codebase's own
      // "never let a failed email undo a real, already-succeeded write"
      // rule) — surfaced as a partial success, not a hard failure.
      return new Response(JSON.stringify({ ok: true, emailed: false, error: 'Reply saved, but the email failed to send.' }), { headers });
    }

    return new Response(JSON.stringify({ ok: true, emailed: true }), { headers });
  } catch (e) {
    console.error('send-ticket-reply failed', e);
    return new Response(JSON.stringify({ error: (e as Error).message || 'Reply failed' }), { status: 500, headers });
  }
});
