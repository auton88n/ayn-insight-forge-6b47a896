// v3.159.0 — npm: specifier, see job-board-sync's identical comment.
import { createClient } from "npm:@supabase/supabase-js@2.45.0";
import { corsHeaders as getCorsHeadersFn } from '../_shared/cors.ts';


// corsHeaders: static fallback using primary origin (from _shared/cors.ts)
const corsHeaders = getCorsHeadersFn({ headers: new Headers() } as Request);

// v3.131.0 — this endpoint had NO signature verification of any kind:
// anyone who knew the URL could POST a fake "inbound email" with any
// subject/body they chose (already exploited once for an HTML-injection
// finding in admin-inbox-reply, fixed at the render layer there, but the
// actual door — anyone can inject a fake inbound email at all — was left
// open, documented, and unfixed pending a signing secret from Resend's own
// dashboard). Resend signs inbound webhooks the same way Stripe does its
// own: Svix-style HMAC-SHA256 over "{id}.{timestamp}.{raw body}", with the
// signature and a replay-window timestamp in the svix-* headers.
async function verifySvixSignature(req: Request, rawBody: string, secret: string): Promise<boolean> {
  const svixId = req.headers.get("svix-id");
  const svixTimestamp = req.headers.get("svix-timestamp");
  const svixSignature = req.headers.get("svix-signature");
  if (!svixId || !svixTimestamp || !svixSignature) return false;

  // Reject anything older than 5 minutes — the same replay-window Stripe's
  // own SDK enforces, not something this endpoint had before at all.
  const tsSeconds = Number(svixTimestamp);
  if (!Number.isFinite(tsSeconds) || Math.abs(Date.now() / 1000 - tsSeconds) > 300) return false;

  const secretBytes = Uint8Array.from(atob(secret.replace(/^whsec_/, "")), c => c.charCodeAt(0));
  const key = await crypto.subtle.importKey("raw", secretBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signedContent = `${svixId}.${svixTimestamp}.${rawBody}`;
  const sigBytes = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(signedContent));
  const expected = btoa(String.fromCharCode(...new Uint8Array(sigBytes)));

  // svix-signature carries one or more space-separated "v1,<base64>" values.
  return svixSignature.split(" ").some(part => part.split(",")[1] === expected);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const rawBody = await req.text();

    // Fails closed once configured, fails open (with a loud warning) until
    // then — disabling inbound email processing outright before the
    // founder has actually generated a secret in Resend's dashboard would
    // be a worse regression than the gap this closes. Set
    // RESEND_WEBHOOK_SECRET (the "Signing Secret" on Resend's Webhooks
    // page, starts with whsec_) as a Supabase edge function secret to
    // switch this to real enforcement.
    const webhookSecret = Deno.env.get("RESEND_WEBHOOK_SECRET");
    if (webhookSecret) {
      const valid = await verifySvixSignature(req, rawBody, webhookSecret);
      if (!valid) {
        console.error("Rejected inbound webhook: bad or missing signature");
        return new Response(JSON.stringify({ error: "Invalid signature" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    } else {
      console.warn("RESEND_WEBHOOK_SECRET not configured — inbound webhook is UNVERIFIED, anyone with this URL can inject a fake email");
    }

    const payload = JSON.parse(rawBody);
    console.log('Resend inbound webhook received:', JSON.stringify(payload).slice(0, 500));

    // Resend wraps email fields inside payload.data
    const emailData = payload.data || payload;

    const {
      from: fromRaw,
      to: toRaw,
      subject,
      email_id,
    } = emailData;

    // Resend webhooks don't include body/headers — fetch via API
    let bodyText = '';
    let bodyHtml = '';
    let emailHeaders: Record<string, string> | null = null;

    if (email_id) {
      const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
      if (RESEND_API_KEY) {
        try {
          const emailRes = await fetch(`https://api.resend.com/emails/receiving/${email_id}`, {
            headers: { 'Authorization': `Bearer ${RESEND_API_KEY}` },
          });
          if (emailRes.ok) {
            const emailDetail = await emailRes.json();
            bodyText = emailDetail.text || '';
            bodyHtml = emailDetail.html || '';
            emailHeaders = emailDetail.headers || null;
            console.log('Fetched email body, text length:', bodyText.length, 'html length:', bodyHtml.length);
          } else {
            console.error('Failed to fetch email detail:', emailRes.status, await emailRes.text());
          }
        } catch (fetchErr) {
          console.error('Error fetching email detail:', fetchErr);
        }
      } else {
        console.warn('RESEND_API_KEY not configured, cannot fetch email body');
      }
    }

    // Parse from field - can be "Name <email>" or just "email"
    let fromEmail = '';
    let fromName = '';
    if (typeof fromRaw === 'string') {
      const match = fromRaw.match(/^(.+?)\s*<(.+?)>$/);
      if (match) {
        fromName = match[1].trim();
        fromEmail = match[2].trim();
      } else {
        fromEmail = fromRaw.trim();
      }
    } else if (Array.isArray(fromRaw) && fromRaw.length > 0) {
      fromEmail = fromRaw[0];
    }

    // Parse to field
    let toEmail = '';
    if (typeof toRaw === 'string') {
      toEmail = toRaw;
    } else if (Array.isArray(toRaw) && toRaw.length > 0) {
      toEmail = toRaw[0];
    }

    if (!fromEmail) {
      console.error('No from email found in payload');
      return new Response(JSON.stringify({ error: 'No from email' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Extract In-Reply-To and Message-ID from headers
    let inReplyTo = '';
    let messageId = '';
    if (emailHeaders) {
      if (typeof emailHeaders === 'object') {
        inReplyTo = emailHeaders['in-reply-to'] || emailHeaders['In-Reply-To'] || '';
        messageId = emailHeaders['message-id'] || emailHeaders['Message-ID'] || '';
      }
    }

    // Create supabase client with service role
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Try to match sender to a pipeline lead
    const { data: lead } = await supabase
      .from('ayn_sales_pipeline')
      .select('id, company_name, contact_name')
      .eq('contact_email', fromEmail)
      .limit(1)
      .maybeSingle();

    // Store the inbound reply
    const { error: insertError } = await supabase
      .from('inbound_email_replies')
      .insert({
        from_email: fromEmail,
        from_name: fromName || null,
        to_email: toEmail,
        subject: subject || null,
        body_text: bodyText || null,
        body_html: bodyHtml || null,
        in_reply_to: inReplyTo || null,
        message_id: messageId || null,
        pipeline_lead_id: lead?.id || null,
      });

    if (insertError) {
      console.error('Failed to store inbound reply:', insertError);
      return new Response(JSON.stringify({ error: 'Failed to store reply' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Notify AYN via Telegram
    const TELEGRAM_BOT_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN');
    const TELEGRAM_CHAT_ID = Deno.env.get('TELEGRAM_CHAT_ID');

    if (TELEGRAM_BOT_TOKEN && TELEGRAM_CHAT_ID) {
      const leadInfo = lead
        ? `🏢 Lead: ${lead.company_name}${lead.contact_name ? ` (${lead.contact_name})` : ''}`
        : '❓ Unknown sender (not in pipeline)';

      const preview = (bodyText || '').slice(0, 300);
      const telegramMsg = `📩 Email Reply Received!\n\nFrom: ${fromName ? `${fromName} <${fromEmail}>` : fromEmail}\nSubject: ${subject || '(no subject)'}\n${leadInfo}\n\n${preview}${preview.length >= 300 ? '...' : ''}`;

      await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: TELEGRAM_CHAT_ID,
          text: telegramMsg,
        }),
      });
    }

    // Log activity
    await supabase.from('ayn_activity_log').insert({
      action_type: 'email_reply_received',
      summary: `Email reply from ${fromName || fromEmail}: "${(subject || 'no subject').slice(0, 60)}"`,
      target_type: 'inbound_email',
      triggered_by: 'resend_webhook',
      details: {
        from_email: fromEmail,
        subject,
        pipeline_lead_id: lead?.id || null,
      },
    });

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('Inbound webhook error:', err);
    return new Response(JSON.stringify({ error: 'Internal error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
