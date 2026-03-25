import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { Resend } from "https://esm.sh/resend@2.0.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

function e(str: string): string {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) throw new Error('No authorization');
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !user) throw new Error('Unauthorized');

    const { data: roleData } = await supabase
      .from('user_roles').select('role').eq('user_id', user.id).eq('role', 'admin').single();
    if (!roleData) throw new Error('Admin access required');

    const { ndaId } = await req.json();
    if (!ndaId) throw new Error('ndaId required');

    const { data: nda, error: ndaErr } = await supabase
      .from('nda_agreements').select('*').eq('id', ndaId).single();
    if (ndaErr || !nda) throw new Error('NDA not found');

    const resendKey = Deno.env.get('RESEND_API_KEY');
    if (!resendKey) throw new Error('RESEND_API_KEY not configured');
    const resend = new Resend(resendKey);

    const ndaRef = `NDA-${nda.id.substring(0, 8).toUpperCase()}`;
    const signingUrl = `https://aynn.io/nda/sign/${nda.signing_token}`;
    const year = new Date().getFullYear();

    const emailHtml = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<meta name="color-scheme" content="dark">
</head>
<body style="margin:0;padding:0;background:#0f0f0f;font-family:-apple-system,BlinkMacSystemFont,'Helvetica Neue',Arial,sans-serif;">

<table width="100%" cellpadding="0" cellspacing="0" style="background:#0f0f0f;padding:40px 20px;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#0f0f0f;max-width:600px;width:100%;">

  <!-- ── LOGO ── -->
  <tr><td style="text-align:center;padding:40px 32px 32px;">
    <div style="font-size:44px;font-weight:900;color:#fff;letter-spacing:-2px;line-height:1;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">AYN AI</div>
    <div style="width:40px;height:3px;background:#6366f1;margin:14px auto 0;border-radius:2px;"></div>
  </td></tr>

  <!-- ── DIVIDER ── -->
  <tr><td style="padding:0 32px;">
    <div style="height:1px;background:rgba(255,255,255,0.08);"></div>
  </td></tr>

  <!-- ── GREETING ── -->
  <tr><td style="padding:36px 32px 0;">
    <div style="font-size:24px;font-weight:700;color:#fff;margin-bottom:12px;">Hello ${e(nda.contact_person)},</div>
    <p style="font-size:14px;color:rgba(255,255,255,0.55);line-height:1.8;margin:0;">
      <span style="color:#fff;font-weight:600;">AYN AI</span> has prepared a Non-Disclosure Agreement for your review and signature.
      Please review the details below and sign digitally using the secure link.
    </p>
  </td></tr>

  <!-- ── REFERENCE CARD ── -->
  <tr><td style="padding:24px 32px 0;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#1a1a1a;border:1px solid rgba(255,255,255,0.08);border-radius:12px;overflow:hidden;">
      <tr>
        <td style="padding:20px 24px;border-right:1px solid rgba(255,255,255,0.08);width:50%;">
          <div style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:2.5px;color:rgba(255,255,255,0.3);margin-bottom:8px;">Reference</div>
          <div style="font-size:17px;font-weight:800;color:#fff;letter-spacing:0.5px;">${ndaRef}</div>
        </td>
        <td style="padding:20px 24px;width:50%;">
          <div style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:2.5px;color:rgba(255,255,255,0.3);margin-bottom:8px;">Company</div>
          <div style="font-size:17px;font-weight:700;color:#fff;">${e(nda.company_name)}</div>
        </td>
      </tr>
    </table>
  </td></tr>

  <!-- ── PURPOSE ── -->
  ${nda.nda_purpose ? `<tr><td style="padding:16px 32px 0;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#1a1a1a;border:1px solid rgba(255,255,255,0.08);border-radius:12px;border-left:3px solid #6366f1;">
      <tr><td style="padding:20px 22px;">
        <div style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:2.5px;color:rgba(255,255,255,0.3);margin-bottom:10px;">Purpose</div>
        <div style="font-size:13px;color:rgba(255,255,255,0.7);line-height:1.8;">${e(nda.nda_purpose)}</div>
      </td></tr>
    </table>
  </td></tr>` : ''}

  <!-- ── DURATION ── -->
  ${nda.duration ? `<tr><td style="padding:14px 32px 0;">
    <table cellpadding="0" cellspacing="0">
      <tr>
        <td style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:2.5px;color:rgba(255,255,255,0.3);padding-right:14px;">Duration</td>
        <td style="font-size:13px;font-weight:700;color:#fff;">${e(nda.duration)}</td>
      </tr>
    </table>
  </td></tr>` : ''}

  <!-- ── CTA ── -->
  <tr><td style="padding:32px 32px 0;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#1a1a1a;border:1px solid rgba(255,255,255,0.08);border-radius:14px;">
      <tr><td style="padding:28px;text-align:center;">
        <div style="font-size:11px;color:rgba(255,255,255,0.3);margin-bottom:18px;letter-spacing:0.5px;">Click below to review and sign</div>
        <a href="${signingUrl}" target="_blank"
          style="display:inline-block;background:#fff;color:#0f0f0f;padding:16px 52px;border-radius:100px;font-weight:800;font-size:14px;text-decoration:none;letter-spacing:0.3px;">
          Review &amp; Sign Agreement →
        </a>
        <div style="font-size:10px;color:rgba(255,255,255,0.2);margin-top:14px;">Secure digital signing portal</div>
      </td></tr>
    </table>
  </td></tr>

  <!-- ── STEPS ── -->
  <tr><td style="padding:24px 32px 0;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#1a1a1a;border:1px solid rgba(255,255,255,0.08);border-radius:12px;">
      <tr><td style="padding:20px 24px 8px;">
        <div style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:2.5px;color:rgba(255,255,255,0.3);margin-bottom:16px;">What happens next</div>
        ${['Review the full agreement', 'Sign digitally using the signature pad', 'Both parties receive a signed copy automatically'].map((step, i) => `
        <table cellpadding="0" cellspacing="0" style="margin-bottom:14px;">
          <tr>
            <td style="width:28px;vertical-align:top;">
              <div style="width:22px;height:22px;background:#6366f1;color:#fff;border-radius:50%;text-align:center;line-height:22px;font-size:10px;font-weight:700;">${i + 1}</div>
            </td>
            <td style="font-size:13px;color:rgba(255,255,255,0.65);padding-left:10px;vertical-align:middle;">${step}</td>
          </tr>
        </table>`).join('')}
      </td></tr>
    </table>
  </td></tr>

  <!-- ── FOOTER ── -->
  <tr><td style="padding:32px 32px 16px;">
    <div style="height:1px;background:rgba(255,255,255,0.08);margin-bottom:24px;"></div>
    <p style="font-size:11px;color:rgba(255,255,255,0.25);margin:0;text-align:center;line-height:1.7;">
      Questions? <a href="mailto:info@aynn.io" style="color:rgba(255,255,255,0.45);text-decoration:none;">info&#64;aynn.io</a>
      &nbsp;&middot;&nbsp; © ${year} AYN AI &nbsp;&middot;&nbsp;
      <a href="https://aynn.io" style="color:rgba(255,255,255,0.45);text-decoration:none;">aynn.io</a>
    </p>
  </td></tr>

</table>
</td></tr>
</table>
</body>
</html>`;

    const fromEmail = Deno.env.get('RESEND_FROM_EMAIL') || 'AYN AI <noreply@mail.aynn.io>';

    const { data: emailData, error: emailError } = await resend.emails.send({
      from: fromEmail,
      to: [nda.company_email],
      subject: `AYN AI — Non-Disclosure Agreement: ${ndaRef}`,
      html: emailHtml,
    });

    if (emailError) throw new Error(`Email send failed: ${emailError.message}`);

    await supabase.from('nda_agreements')
      .update({ status: 'sent', email_sent_at: new Date().toISOString() })
      .eq('id', ndaId);

    return new Response(JSON.stringify({ success: true, emailId: emailData?.id }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('[send-nda-email]', msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
