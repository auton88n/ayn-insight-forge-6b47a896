// v3.160.0 — rewritten off the old SMTP/denomailer path (SMTP_HOST/PORT/
// USER/PASS are configured for GoTrue's own mailer, per the docker-compose
// environment block, but were never passed through to the edge-functions
// container — so on self-hosted this always threw "SMTP configuration
// missing" and no ticket ever got a notification or confirmation email,
// silently, since TicketForm.tsx already treats this call as best-effort).
// Now uses the same Resend HTTP API + shared branding every sibling
// ticket/admin email function already uses, sending from
// support@support.ayn.careers (see send-ticket-reply's own note on why
// support.ayn.careers, not the root domain). Also drops a dead trigger to
// a function named "ayn-auto-reply" that doesn't exist anywhere in this
// codebase and pointed at the retired Lovable Cloud project URL as its
// fallback — harmless (wrapped in try/catch) but pure dead weight.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders, handleCors } from '../_shared/cors.ts';
import { escapeHtml, wrapEmail, heading, para, sendBrandedEmail } from '../_shared/emailTemplate.ts';

interface TicketNotificationRequest {
  ticketId: string;
  subject: string;
  message: string;
  category: string;
  priority: string;
  userName?: string;
  userEmail?: string;
}

const getCategoryLabel = (category: string): string =>
  category.replace('_', ' ').replace(/\b\w/g, (l) => l.toUpperCase());

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return handleCors(req);
  const headers = { ...corsHeaders(req), 'Content-Type': 'application/json' };

  try {
    const body: TicketNotificationRequest = await req.json().catch(() => ({} as TicketNotificationRequest));
    const ticketId = String(body.ticketId ?? '').trim();
    const rawSubject = String(body.subject ?? '(no subject)');
    const rawMessage = String(body.message ?? '');
    const category = String(body.category ?? 'general');
    const priority = String(body.priority ?? 'low');
    const rawUserName = body.userName ? String(body.userName) : undefined;
    const rawUserEmail = body.userEmail ? String(body.userEmail) : undefined;

    if (!ticketId) return new Response(JSON.stringify({ error: 'ticketId is required' }), { status: 400, headers });

    const ticketRef = ticketId.slice(0, 8).toUpperCase();
    const userName = rawUserName ? escapeHtml(rawUserName) : 'Anonymous';
    const categoryLabel = getCategoryLabel(category);

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const admin = supabaseUrl && serviceKey ? createClient(supabaseUrl, serviceKey) : null;

    let confirmationSent = false;
    let confirmationError: string | undefined;
    if (rawUserEmail) {
      const html = wrapEmail(
        `${heading(`Ticket #${ticketRef} received`)}` +
        `${para(`Hi ${userName},`)}` +
        `${para("Thanks for reaching out. We've received your ticket and will get back to you as soon as possible.")}` +
        `${para(`<strong>Reference:</strong> #${ticketRef}`, { marginTop: 16 })}` +
        `${para(`<strong>Subject:</strong> ${escapeHtml(rawSubject)}`)}` +
        `${para(`<strong>Category:</strong> ${escapeHtml(categoryLabel)}`)}` +
        `${para('Keep this reference number handy if you contact us again about this issue. We typically respond within 24 to 48 hours.', { muted: true, marginTop: 16 })}`,
        ['Sincerely,', 'The AYN Support Team'],
      );
      const res = await sendBrandedEmail(rawUserEmail, `Ticket #${ticketRef} received: ${rawSubject}`, html);
      confirmationSent = res.ok;
      confirmationError = res.error;
    }

    const notificationEmail = Deno.env.get('NOTIFICATION_EMAIL') || 'info@support.ayn.careers';
    const adminHtml = wrapEmail(
      `${heading(`New support ticket #${ticketRef}`)}` +
      `${para(`<strong>${escapeHtml(priority.toUpperCase())} priority</strong> &middot; ${escapeHtml(categoryLabel)}`)}` +
      `${para(`<strong>Subject:</strong> ${escapeHtml(rawSubject)}`, { marginTop: 16 })}` +
      `${para(`<strong>From:</strong> ${userName}${rawUserEmail ? ` (${escapeHtml(rawUserEmail)})` : ''}`)}` +
      `${para('<strong>Message:</strong>', { marginTop: 16 })}` +
      `${para(escapeHtml(rawMessage).replace(/\n/g, '<br/>'))}`,
      ['Sincerely,', 'AYN'],
    );
    const adminRes = await sendBrandedEmail(
      notificationEmail,
      `[${priority.toUpperCase()}] New support ticket #${ticketRef}: ${rawSubject}`,
      adminHtml,
    );

    if (admin) {
      await admin.from('email_logs').insert([
        rawUserEmail ? {
          user_id: null,
          email_type: 'ticket_confirmation',
          recipient_email: rawUserEmail,
          status: confirmationSent ? 'sent' : 'failed',
          error_message: confirmationSent ? null : (confirmationError ?? null),
          metadata: { subject: rawSubject, ticket_id: ticketId },
        } : null,
        {
          user_id: null,
          email_type: 'ticket_notification',
          recipient_email: notificationEmail,
          status: adminRes.ok ? 'sent' : 'failed',
          error_message: adminRes.ok ? null : (adminRes.error ?? null),
          metadata: { subject: rawSubject, ticket_id: ticketId },
        },
      ].filter(Boolean) as Record<string, unknown>[]);
    }

    return new Response(
      JSON.stringify({ success: true, ticketRef, confirmationSent, adminNotified: adminRes.ok }),
      { status: 200, headers },
    );
  } catch (error) {
    console.error('Error sending ticket notification:', error);
    return new Response(JSON.stringify({ error: (error as Error).message }), { status: 500, headers });
  }
});
