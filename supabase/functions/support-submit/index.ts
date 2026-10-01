import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders, handleCors } from '../_shared/cors.ts';
import { escapeHtml, heading, para, sendBrandedEmail, wrapEmail } from '../_shared/emailTemplate.ts';

const CATEGORIES = new Set(['general', 'billing', 'technical', 'feature_request', 'bug_report']);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type SupportSubmission = {
  name?: unknown;
  email?: unknown;
  subject?: unknown;
  category?: unknown;
  message?: unknown;
};

const text = (value: unknown) => typeof value === 'string' ? value.trim() : '';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return handleCors(req);
  const headers = { ...corsHeaders(req), 'Content-Type': 'application/json' };
  if (req.method !== 'POST') return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers });

  try {
    const body = await req.json().catch(() => ({} as SupportSubmission)) as SupportSubmission;
    let name = text(body.name);
    let email = text(body.email).toLowerCase();
    const subject = text(body.subject);
    const message = text(body.message);
    const category = text(body.category) || 'general';

    const url = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const authorization = req.headers.get('Authorization') ?? '';
    const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
    let userId: string | null = null;

    // An authenticated request may never choose its own email or user id.
    // The browser SDK sends the anon key for guests; any other invalid bearer
    // is rejected rather than silently being treated as a guest request.
    if (token && token !== anonKey) {
      const asUser = createClient(url, anonKey, { global: { headers: { Authorization: authorization } } });
      const { data: { user }, error } = await asUser.auth.getUser();
      if (error || !user?.id || !user.email) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers });
      }
      userId = user.id;
      email = user.email.toLowerCase();
      name = name || text(user.user_metadata?.full_name) || email.split('@')[0];
    }

    if (!EMAIL_RE.test(email) || email.length > 254) {
      return new Response(JSON.stringify({ error: 'A valid email address is required' }), { status: 400, headers });
    }
    if (!subject || subject.length > 200 || !message || message.length > 10000 || name.length > 120 || !CATEGORIES.has(category)) {
      return new Response(JSON.stringify({ error: 'Invalid support request' }), { status: 400, headers });
    }

    const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
    const { data: ticketId, error: submitError } = await admin.rpc('submit_support_ticket', {
      p_user_id: userId,
      p_name: name || null,
      p_email: email,
      p_subject: subject,
      p_category: category,
      p_message: message,
    });
    if (submitError) {
      const status = submitError.message.includes('rate limit') ? 429 : 500;
      console.error('support-submit database failure', submitError);
      return new Response(JSON.stringify({ error: status === 429 ? 'Please wait before sending another message.' : 'Unable to submit support request' }), { status, headers });
    }

    const ticketRef = String(ticketId).slice(0, 8).toUpperCase();
    const categoryLabel = category.replace('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
    const safeName = escapeHtml(name || 'there');
    const confirmationHtml = wrapEmail(
      `${heading(`Ticket #${ticketRef} received`)}` +
      `${para(`Hi ${safeName},`)}` +
      `${para("Thanks for reaching out. We've received your ticket and will get back to you as soon as possible.")}` +
      `${para(`<strong>Reference:</strong> #${ticketRef}`, { marginTop: 16 })}` +
      `${para(`<strong>Subject:</strong> ${escapeHtml(subject)}`)}` +
      `${para(`<strong>Category:</strong> ${escapeHtml(categoryLabel)}`)}`,
      ['Sincerely,', 'The AYN Support Team'],
    );
    const notificationEmail = Deno.env.get('NOTIFICATION_EMAIL') || 'info@support.ayn.careers';
    const adminHtml = wrapEmail(
      `${heading(`New support ticket #${ticketRef}`)}` +
      `${para(`<strong>MEDIUM priority</strong> &middot; ${escapeHtml(categoryLabel)}`)}` +
      `${para(`<strong>Subject:</strong> ${escapeHtml(subject)}`, { marginTop: 16 })}` +
      `${para(`<strong>From:</strong> ${safeName} (${escapeHtml(email)})`)}` +
      `${para('<strong>Message:</strong>', { marginTop: 16 })}` +
      `${para(escapeHtml(message).replace(/\n/g, '<br/>'))}`,
      ['Sincerely,', 'AYN'],
    );
    const [confirmation, notification] = await Promise.all([
      sendBrandedEmail(email, `Ticket #${ticketRef} received: ${subject}`, confirmationHtml),
      sendBrandedEmail(notificationEmail, `[MEDIUM] New support ticket #${ticketRef}: ${subject}`, adminHtml),
    ]);
    await admin.from('email_logs').insert([
      {
        user_id: userId,
        email_type: 'ticket_confirmation',
        recipient_email: email,
        status: confirmation.ok ? 'sent' : 'failed',
        error_message: confirmation.ok ? null : confirmation.error ?? null,
        metadata: { subject, ticket_id: ticketId },
      },
      {
        user_id: null,
        email_type: 'ticket_notification',
        recipient_email: notificationEmail,
        status: notification.ok ? 'sent' : 'failed',
        error_message: notification.ok ? null : notification.error ?? null,
        metadata: { subject, ticket_id: ticketId },
      },
    ]);

    return new Response(JSON.stringify({ ok: true, ticketRef, confirmationSent: confirmation.ok, adminNotified: notification.ok }), { headers });
  } catch (error) {
    console.error('support-submit failed', error);
    return new Response(JSON.stringify({ error: 'Unable to submit support request' }), { status: 500, headers });
  }
});
