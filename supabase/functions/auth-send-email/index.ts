// v3.43.0 — the Supabase Auth "Send Email" hook target. Every signup
// confirmation, password reset, magic link and email-change email a user
// receives goes through here. Rewritten from the old dark theme (#0f0f0f
// bg, white-on-dark CTA) to match the product's actual "Charcoal & Ember"
// branding used everywhere else (landing page, admin-broadcast): warm
// paper card, near-black ink, ember accent on the call to action. This
// file previously existed only as live, undeployed-from-source code with
// no local copy anywhere in the repo; it is now tracked here.
import { Webhook } from "https://esm.sh/standardwebhooks@1.0.0";
import { Resend } from "https://esm.sh/resend@2.0.0";
import { createClient } from "npm:@supabase/supabase-js@2.45.0";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));
// v3.47.0 — only used to write email_logs so the admin panel can see
// whether these sends actually succeeded. Never used to read/gate anything.
const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

// The secret comes as "v1,whsec_BASE64SECRET" - extract just the base64 part
const rawSecret = Deno.env.get("SEND_EMAIL_HOOK_SECRET") || "";
const hookSecret = rawSecret.includes("whsec_")
  ? rawSecret.split("whsec_").pop() || ""
  : rawSecret;

const FONT_STACK = "-apple-system,Segoe UI,Inter,Helvetica,Arial,sans-serif";
const EMBER = "#e85d3a";
const INK = "#0b0b0c";
const BODY_TEXT = "#3d3733";
const MUTED = "#8a8178";
const BORDER = "#ece5da";
const PAGE_BG = "#faf7f2";

// v3.116.0 — the header used to spell out "AYN" as plain bold text with a
// manual ember underline. Now the real logo lockup, served from a stable
// public/ path since email clients cannot load a Vite-hashed bundle asset.
const LOGO_URL = "https://ayn.careers/ayn-email-logo.png";

// The signature line used to sit after the CTA button (content already
// included the button as its last line). Now a dedicated ctaHtml parameter
// so the signature renders before the button, not after it.
const SIGNATURE = `<p style="color:${MUTED};line-height:1.7;margin:24px 0 8px;font-size:13px;">Sincerely,<br/>The AYN Team</p>`;

// Wraps the per-type content block in the shared card shell.
const wrapEmail = (content: string, ctaHtml: string = ""): string => `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background:${PAGE_BG};font-family:${FONT_STACK}">
  <div style="max-width:560px;margin:0 auto;padding:32px 16px;">
    <div style="background:#ffffff;border-radius:16px;border:1px solid ${BORDER};padding:36px 32px;">
      <div style="margin-bottom:28px;">
        <img src="${LOGO_URL}" alt="AYN" height="30" style="display:block;height:30px;width:auto;border:0;">
      </div>
      ${content}
      ${SIGNATURE}
      ${ctaHtml}
    </div>
    <p style="font-size:12px;color:${MUTED};margin:20px 4px 0;text-align:center;">
      © ${new Date().getFullYear()} AYN AI. All rights reserved.
    </p>
  </div>
</body>
</html>
`;

// CTA button, ember on white — matches the landing page's primary action.
const ctaButton = (url: string, text: string): string => `
<div style="text-align:center;margin:32px 0 8px;">
  <a href="${url}" style="display:inline-block;background:${EMBER};color:#ffffff;padding:14px 40px;border-radius:10px;text-decoration:none;font-weight:600;font-size:15px;">
    ${text}
  </a>
</div>
`;

// Generate templates based on email type
function getTemplate(
  emailType: string,
  user: { email: string; user_metadata?: { full_name?: string } },
  confirmationUrl: string
): { subject: string; html: string } {
  const userName = user.user_metadata?.full_name || user.email.split('@')[0];

  switch (emailType) {
    case 'signup':
      return {
        subject: 'Confirm your AYN account',
        html: wrapEmail(`
          <h1 style="color:${INK};font-size:22px;margin:0 0 20px;font-weight:600;">
            Welcome to AYN
          </h1>
          <p style="color:${BODY_TEXT};line-height:1.7;margin:0 0 8px;font-size:15px;">
            Hi ${userName},
          </p>
          <p style="color:${BODY_TEXT};line-height:1.7;margin:0;font-size:15px;">
            Thank you for signing up. Please confirm your email address to get started.
          </p>
          <p style="color:${MUTED};font-size:13px;line-height:1.7;margin-top:32px;">
            This link expires in 24 hours. If you didn't create an account, you can safely ignore this email.
          </p>
        `, ctaButton(confirmationUrl, 'Verify email'))
      };

    case 'recovery':
      return {
        subject: 'Reset your password | AYN',
        html: wrapEmail(`
          <h1 style="color:${INK};font-size:22px;margin:0 0 20px;font-weight:600;">
            Reset your password
          </h1>
          <p style="color:${BODY_TEXT};line-height:1.7;margin:0 0 8px;font-size:15px;">
            Hi ${userName},
          </p>
          <p style="color:${BODY_TEXT};line-height:1.7;margin:0;font-size:15px;">
            We received a request to reset your password. Click the button below to create a new one.
          </p>
          <p style="color:${MUTED};font-size:13px;line-height:1.7;margin-top:32px;">
            This link expires in 1 hour. If you didn't request a password reset, you can safely ignore this email.
          </p>
        `, ctaButton(confirmationUrl, 'Reset password'))
      };

    case 'magiclink':
      return {
        subject: 'Your login link | AYN',
        html: wrapEmail(`
          <h1 style="color:${INK};font-size:22px;margin:0 0 20px;font-weight:600;">
            Your login link
          </h1>
          <p style="color:${BODY_TEXT};line-height:1.7;margin:0 0 8px;font-size:15px;">
            Hi ${userName},
          </p>
          <p style="color:${BODY_TEXT};line-height:1.7;margin:0;font-size:15px;">
            Click the button below to securely log in to your AYN account.
          </p>
          <p style="color:${MUTED};font-size:13px;line-height:1.7;margin-top:32px;">
            This link expires in 1 hour and can only be used once.
          </p>
        `, ctaButton(confirmationUrl, 'Log in'))
      };

    case 'email_change':
      return {
        subject: 'Confirm your new email | AYN',
        html: wrapEmail(`
          <h1 style="color:${INK};font-size:22px;margin:0 0 20px;font-weight:600;">
            Confirm your new email
          </h1>
          <p style="color:${BODY_TEXT};line-height:1.7;margin:0 0 8px;font-size:15px;">
            Hi ${userName},
          </p>
          <p style="color:${BODY_TEXT};line-height:1.7;margin:0;font-size:15px;">
            You requested to change your email address. Please confirm this change by clicking the button below.
          </p>
          <p style="color:${MUTED};font-size:13px;line-height:1.7;margin-top:32px;">
            If you didn't request this change, please contact support immediately.
          </p>
        `, ctaButton(confirmationUrl, 'Confirm email change'))
      };

    default:
      return {
        subject: 'AYN Authentication',
        html: wrapEmail(`
          <h1 style="color:${INK};font-size:22px;margin:0 0 20px;font-weight:600;">
            Complete your action
          </h1>
          <p style="color:${BODY_TEXT};line-height:1.7;margin:0;font-size:15px;">
            Click the button below to continue.
          </p>
        `, ctaButton(confirmationUrl, 'Continue'))
      };
  }
}

Deno.serve(async (req) => {
  // Only accept POST
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    // Get the raw payload for signature verification
    const payload = await req.text();

    console.log('[auth-send-email] Received request, hookSecret configured:', !!hookSecret);

    // Verify webhook signature
    if (!hookSecret) {
      console.error('[auth-send-email] SEND_EMAIL_HOOK_SECRET not configured');
      return new Response(
        JSON.stringify({ error: 'Webhook secret not configured' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const headers = Object.fromEntries(req.headers);
    const wh = new Webhook(hookSecret);

    let webhookData: {
      user: { id: string; email: string; user_metadata?: { full_name?: string } };
      email_data: {
        email_action_type: string;
        token_hash: string;
        token: string;
        redirect_to: string;
        site_url: string;
      };
    };

    try {
      webhookData = wh.verify(payload, headers) as typeof webhookData;
    } catch (verifyError) {
      console.error('[auth-send-email] Webhook verification failed:', verifyError);
      console.error('[auth-send-email] Secret length:', hookSecret.length);
      return new Response(
        JSON.stringify({ error: 'Invalid webhook signature' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const { user, email_data } = webhookData;

    console.log(`[auth-send-email] Processing ${email_data.email_action_type} for ${user.email}`);

    // Build the confirmation URL
    // For recovery emails, ensure redirect goes to /reset-password
    let redirectTo = email_data.redirect_to || email_data.site_url;
    if (email_data.email_action_type === 'recovery' && !redirectTo.includes('/reset-password')) {
      const baseUrl = redirectTo.replace(/\/$/, '');
      redirectTo = `${baseUrl}/reset-password`;
    }
    const confirmationUrl = `https://dfkoxuokfkttjhfjcecx.supabase.co/auth/v1/verify?token=${email_data.token_hash}&type=${email_data.email_action_type}&redirect_to=${encodeURIComponent(redirectTo)}`;

    // Get the appropriate template
    const { subject, html } = getTemplate(email_data.email_action_type, user, confirmationUrl);

    // Send via Resend
    let emailResult;
    try {
      emailResult = await resend.emails.send({
        from: 'AYN <noreply@ayn.careers>',
        to: [user.email],
        subject,
        html
      });
    } catch (sendError) {
      // v3.47.0 — record the failed attempt before it propagates to the
      // outer catch (which returns 500 so Supabase retries the hook).
      // user_id is deliberately omitted: for a fresh 'signup' event the
      // GoTrue Send Email hook fires before the new auth.users row is
      // visible to this connection, so email_logs.user_id's FK to
      // auth.users would fail every single signup silently (confirmed
      // live: 23503 foreign key violation on every attempt). recipient_email
      // already identifies who this was for.
      await admin.from('email_logs').insert({
        email_type: email_data.email_action_type, recipient_email: user.email,
        status: 'failed', error_message: sendError instanceof Error ? sendError.message : String(sendError),
      }).then(({ error }) => { if (error) console.error('[auth-send-email] email_logs insert failed', error.message); });
      throw sendError;
    }

    console.log(`[auth-send-email] Email sent successfully:`, emailResult);

    // v3.47.0 — best effort, never blocks the response Supabase is waiting on.
    await admin.from('email_logs').insert({
      email_type: email_data.email_action_type, recipient_email: user.email,
      status: 'sent',
    }).then(({ error }) => { if (error) console.error('[auth-send-email] email_logs insert failed', error.message); });

    // Return success - Supabase expects empty object on success
    return new Response(JSON.stringify({}), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('[auth-send-email] Error:', error);

    // Return error so Supabase can retry
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
});
