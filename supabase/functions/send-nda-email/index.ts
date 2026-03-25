import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { Resend } from "https://esm.sh/resend@2.0.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

function escapeHtml(str: string): string {
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
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f2f2ee;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f2f2ee;padding:0;">
<tr><td align="center" style="padding:40px 0;">
<table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:0;overflow:hidden;">

  <!-- HEADER -->
  <tr><td style="background:#0a0a0a;padding:44px 48px 40px;text-align:center;">
    <div style="font-size:42px;font-weight:900;color:#fff;letter-spacing:-2.5px;line-height:1;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">AYN AI</div>
    <div style="width:36px;height:2px;background:rgba(255,255,255,0.2);margin:14px 0 12px;"></div>
    <div style="font-size:10px;font-weight:600;letter-spacing:4px;text-transform:uppercase;color:rgba(255,255,255,0.4);">Non-Disclosure Agreement</div>
  </td></tr>

  <!-- GREETING -->
  <tr><td style="padding:44px 48px 0;">
    <div style="font-size:22px;font-weight:800;color:#111;margin-bottom:10px;">Hello ${escapeHtml(nda.contact_person)},</div>
    <p style="font-size:14px;color:#555;line-height:1.8;margin:0;">
      <strong style="color:#111;">AYN AI</strong> has prepared a Non-Disclosure Agreement for your review and signature.
      Please review the details below and sign digitally using the secure link.
    </p>
  </td></tr>

  <!-- REFERENCE CARD -->
  <tr><td style="padding:28px 48px 0;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9f9f9;border:1px solid #ebebeb;border-radius:10px;overflow:hidden;">
      <tr>
        <td style="padding:18px 24px;border-right:1px solid #ebebeb;width:50%;">
          <div style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:2px;color:#aaa;margin-bottom:6px;">Reference</div>
          <div style="font-size:16px;font-weight:800;color:#111;letter-spacing:0.5px;">${ndaRef}</div>
        </td>
        <td style="padding:18px 24px;width:50%;">
          <div style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:2px;color:#aaa;margin-bottom:6px;">Company</div>
          <div style="font-size:16px;font-weight:700;color:#111;">${escapeHtml(nda.company_name)}</div>
        </td>
      </tr>
    </table>
  </td></tr>

  <!-- PURPOSE -->
  ${nda.nda_purpose ? `<tr><td style="padding:20px 48px 0;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9f9f9;border:1px solid #ebebeb;border-radius:10px;border-left:3px solid #0a0a0a;">
      <tr><td style="padding:18px 22px;">
        <div style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:2px;color:#aaa;margin-bottom:8px;">Purpose</div>
        <div style="font-size:13px;color:#333;line-height:1.75;">${escapeHtml(nda.nda_purpose)}</div>
      </td></tr>
    </table>
  </td></tr>` : ''}

  <!-- DURATION -->
  ${nda.duration ? `<tr><td style="padding:16px 48px 0;">
    <table cellpadding="0" cellspacing="0">
      <tr>
        <td style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:2px;color:#aaa;padding-right:12px;">Duration</td>
        <td style="font-size:13px;font-weight:700;color:#111;">${escapeHtml(nda.duration)}</td>
      </tr>
    </table>
  </td></tr>` : ''}

  <!-- CTA -->
  <tr><td style="padding:36px 48px 0;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9f9f9;border:1px solid #ebebeb;border-radius:12px;">
      <tr><td style="padding:28px;text-align:center;">
        <div style="font-size:11px;color:#aaa;margin-bottom:16px;">Click below to review and sign</div>
        <a href="${signingUrl}" target="_blank"
          style="display:inline-block;background:#0a0a0a;color:#fff;padding:16px 52px;border-radius:100px;font-weight:700;font-size:14px;text-decoration:none;letter-spacing:0.3px;">
          Review &amp; Sign Agreement →
        </a>
        <div style="font-size:10px;color:#bbb;margin-top:12px;">Secure digital signing portal</div>
      </td></tr>
    </table>
  </td></tr>

  <!-- STEPS -->
  <tr><td style="padding:28px 48px 0;">
    <div style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:2px;color:#aaa;margin-bottom:16px;">What happens next</div>
    <table width="100%" cellpadding="0" cellspacing="0">
      ${['Review the full agreement', 'Sign digitally using the signature pad', 'Both parties receive a signed copy automatically'].map((step, i) => `
      <tr>
        <td style="padding:8px 0;vertical-align:top;width:32px;">
          <div style="width:24px;height:24px;background:#0a0a0a;color:#fff;border-radius:50%;text-align:center;line-height:24px;font-size:10px;font-weight:700;">${i + 1}</div>
        </td>
        <td style="padding:8px 0;font-size:13px;color:#444;vertical-align:middle;">${step}</td>
      </tr>`).join('')}
    </table>
  </td></tr>

  <!-- FOOTER CONTACT -->
  <tr><td style="padding:36px 48px 32px;">
    <div style="border-top:1px solid #f0f0f0;padding-top:22px;">
      <p style="font-size:12px;color:#bbb;margin:0;line-height:1.7;">
        Questions? <a href="mailto:info@aynn.io" style="color:#888;text-decoration:none;">info&#64;aynn.io</a>
      </p>
    </div>
  </td></tr>

  <!-- BOTTOM FOOTER -->
  <tr><td style="background:#f9f9f9;padding:16px 48px;border-top:1px solid #f0f0f0;text-align:center;">
    <span style="font-size:10px;color:#ccc;letter-spacing:0.5px;">© ${year} AYN AI · <a href="https://aynn.io" style="color:#ccc;text-decoration:none;">aynn.io</a></span>
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
