import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { Resend } from "https://esm.sh/resend@2.0.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

function e(s: string): string {
  if (!s) return '';
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  try {
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) throw new Error('No authorization');
    const { data: { user }, error: authErr } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''));
    if (authErr || !user) throw new Error('Unauthorized');
    const { data: roleData } = await supabase.from('user_roles').select('role').eq('user_id', user.id).eq('role', 'admin').single();
    if (!roleData) throw new Error('Admin access required');
    const { ndaId } = await req.json();
    if (!ndaId) throw new Error('ndaId required');
    const { data: nda, error: ndaErr } = await supabase.from('nda_agreements').select('*').eq('id', ndaId).single();
    if (ndaErr || !nda) throw new Error('NDA not found');
    const resendKey = Deno.env.get('RESEND_API_KEY');
    if (!resendKey) throw new Error('RESEND_API_KEY not configured');
    const resend = new Resend(resendKey);

    const ndaRef  = `NDA-${nda.id.substring(0,8).toUpperCase()}`;

    // Ensure signing_token exists — generate and save if missing
    let signingToken = nda.signing_token;
    if (!signingToken) {
      signingToken = crypto.randomUUID();
      await supabase.from('nda_agreements')
        .update({ signing_token: signingToken })
        .eq('id', ndaId);
    }

    const signUrl = `https://aynn.io/nda/${signingToken}`;
    const year    = new Date().getFullYear();

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>AYN AI — NDA</title>
<style>
  :root { color-scheme: light dark; }
  body { margin:0; padding:0; font-family:-apple-system,BlinkMacSystemFont,'Helvetica Neue',Arial,sans-serif; }

  /* ── Light defaults ── */
  .wrap     { background-color:#f0f0f0; }
  .card     { background-color:#ffffff; border:1px solid #e8e8e8; border-radius:16px; }
  .sect     { background-color:#f7f7f7; border:1px solid #ebebeb; border-radius:12px; }
  .sect-acc { background-color:#f7f7f7; border:1px solid #ebebeb; border-radius:12px; border-left:3px solid #6366f1; }
  .logo-txt { color:#0a0a0a; }
  .head-txt { color:#111111; }
  .body-txt { color:#444444; }
  .label    { color:#999999; }
  .val      { color:#111111; }
  .muted    { color:#bbbbbb; }
  .div-line { background-color:#ebebeb; }
  .step-txt { color:#333333; }
  .step-sub { color:#888888; }

  /* ── Dark mode (iOS Mail, Apple Mail, Outlook iOS) ── */
  @media (prefers-color-scheme: dark) {
    .wrap     { background-color:#0f0f0f !important; }
    .card     { background-color:#0f0f0f !important; border-color:#0f0f0f !important; }
    .sect     { background-color:#1c1c1e !important; border-color:rgba(255,255,255,0.09) !important; }
    .sect-acc { background-color:#1c1c1e !important; border-color:rgba(255,255,255,0.09) !important; border-left-color:#6366f1 !important; }
    .logo-txt { color:#ffffff !important; }
    .head-txt { color:#ffffff !important; }
    .body-txt { color:rgba(255,255,255,0.55) !important; }
    .label    { color:rgba(255,255,255,0.3) !important; }
    .val      { color:#ffffff !important; }
    .muted    { color:rgba(255,255,255,0.22) !important; }
    .div-line { background-color:rgba(255,255,255,0.08) !important; }
    .step-txt { color:#ffffff !important; }
    .step-sub { color:rgba(255,255,255,0.4) !important; }
    .cta-btn  { background-color:#ffffff !important; color:#0f0f0f !important; }
  }
</style>
</head>
<body>
<div class="wrap" style="background-color:#f0f0f0;padding:48px 16px;">
<table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center">
<table width="580" cellpadding="0" cellspacing="0" border="0" style="max-width:580px;width:100%;">

  <!-- ══ LOGO ══ -->
  <tr><td class="card" style="background-color:#ffffff;border:1px solid #e8e8e8;border-radius:16px;text-align:center;padding:40px 32px 36px;">
    <div class="logo-txt" style="font-size:48px;font-weight:900;letter-spacing:-2px;line-height:1;color:#0a0a0a;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">AYN AI</div>
    <div style="width:44px;height:3px;background:#6366f1;border-radius:2px;margin:16px auto 20px;"></div>
    <div class="label" style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:3px;color:#999;">Non-Disclosure Agreement</div>
  </td></tr>

  <tr><td style="height:16px;"></td></tr>

  <!-- ══ GREETING ══ -->
  <tr><td class="card" style="background-color:#ffffff;border:1px solid #e8e8e8;border-radius:16px;padding:36px 36px 32px;">

    <div class="head-txt" style="font-size:26px;font-weight:800;color:#111;margin-bottom:14px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">Hello ${e(nda.contact_person)},</div>
    <p class="body-txt" style="font-size:15px;color:#444;line-height:1.8;margin:0 0 28px;">
      <strong class="val" style="color:#111;font-weight:700;">AYN AI</strong>
      has prepared a Non-Disclosure Agreement for your review and signature.
      Please review the details below and sign digitally using the secure link.
    </p>

    <!-- Reference card -->
    <table width="100%" cellpadding="0" cellspacing="0" border="0" class="sect" style="background-color:#f7f7f7;border:1px solid #ebebeb;border-radius:12px;margin-bottom:14px;">
      <tr>
        <td width="50%" style="padding:20px 22px;border-right:1px solid #ebebeb;vertical-align:top;">
          <div class="label" style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:2.5px;color:#999;margin-bottom:8px;">Reference</div>
          <div class="val" style="font-size:17px;font-weight:800;color:#111;letter-spacing:0.3px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">${ndaRef}</div>
        </td>
        <td width="50%" style="padding:20px 22px;vertical-align:top;">
          <div class="label" style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:2.5px;color:#999;margin-bottom:8px;">Company</div>
          <div class="val" style="font-size:17px;font-weight:700;color:#111;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">${e(nda.company_name)}</div>
        </td>
      </tr>
    </table>

    ${nda.nda_purpose ? `<!-- Purpose -->
    <table width="100%" cellpadding="0" cellspacing="0" border="0" class="sect-acc" style="background-color:#f7f7f7;border:1px solid #ebebeb;border-radius:12px;border-left:3px solid #6366f1;margin-bottom:14px;">
      <tr><td style="padding:20px 22px;">
        <div class="label" style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:2.5px;color:#999;margin-bottom:10px;">Purpose</div>
        <div class="body-txt" style="font-size:14px;color:#444;line-height:1.8;">${e(nda.nda_purpose)}</div>
      </td></tr>
    </table>` : ''}

    ${nda.duration ? `<!-- Duration -->
    <table cellpadding="0" cellspacing="0" border="0" style="margin-bottom:4px;">
      <tr>
        <td class="label" style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:2.5px;color:#999;padding-right:12px;">Duration</td>
        <td class="val" style="font-size:14px;font-weight:700;color:#111;">${e(nda.duration)}</td>
      </tr>
    </table>` : ''}

  </td></tr>

  <tr><td style="height:16px;"></td></tr>

  <!-- ══ CTA ══ -->
  <tr><td class="card" style="background-color:#ffffff;border:1px solid #e8e8e8;border-radius:16px;text-align:center;padding:36px 32px;">
    <div class="label" style="font-size:11px;color:#999;margin-bottom:20px;letter-spacing:0.5px;">Click below to review and sign</div>
    <a href="${signUrl}" class="cta-btn" target="_blank"
      style="display:inline-block;background-color:#0a0a0a;color:#ffffff;padding:17px 56px;border-radius:100px;font-weight:800;font-size:15px;text-decoration:none;letter-spacing:0.2px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
      Review &amp; Sign Agreement →
    </a>
    <div class="muted" style="font-size:10px;color:#bbb;margin-top:14px;">Secure digital signing portal · aynn.io</div>
  </td></tr>

  <tr><td style="height:16px;"></td></tr>

  <!-- ══ STEPS ══ -->
  <tr><td class="card" style="background-color:#ffffff;border:1px solid #e8e8e8;border-radius:16px;padding:28px 32px;">
    <div class="label" style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:2.5px;color:#999;margin-bottom:20px;">What happens next</div>
    ${[
      ['Review the agreement','Read through all terms carefully before signing'],
      ['Sign digitally','Use the signature pad on the secure signing page'],
      ['Receive your copy','Signed PDF is delivered to both parties automatically']
    ].map(([title, sub], i) => `
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:18px;">
      <tr>
        <td width="32" valign="top" style="padding-top:1px;">
          <div style="width:26px;height:26px;background:#6366f1;border-radius:50%;text-align:center;line-height:26px;font-size:11px;font-weight:800;color:#ffffff;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">${i+1}</div>
        </td>
        <td valign="top" style="padding-left:14px;">
          <div class="step-txt" style="font-size:14px;font-weight:700;color:#222;margin-bottom:2px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">${title}</div>
          <div class="step-sub" style="font-size:12px;color:#888;line-height:1.5;">${sub}</div>
        </td>
      </tr>
    </table>`).join('')}
  </td></tr>

  <tr><td style="height:32px;"></td></tr>

  <!-- ══ FOOTER ══ -->
  <tr><td style="text-align:center;">
    <p class="muted" style="font-size:11px;color:#bbb;margin:0;line-height:1.8;">
      Questions? <a href="mailto:info@aynn.io" style="color:#888;text-decoration:none;">info&#64;aynn.io</a>
      &nbsp;&middot;&nbsp; © ${year} AYN AI &nbsp;&middot;&nbsp;
      <a href="https://aynn.io" style="color:#888;text-decoration:none;">aynn.io</a>
    </p>
  </td></tr>

</table>
</td></tr></table>
</div>
</body>
</html>`;

    const fromEmail = Deno.env.get('RESEND_FROM_EMAIL') || 'AYN AI <noreply@mail.aynn.io>';
    const { data: emailData, error: emailError } = await resend.emails.send({
      from: fromEmail,
      to: [nda.company_email],
      subject: `AYN AI — Non-Disclosure Agreement: ${ndaRef}`,
      html,
    });
    if (emailError) throw new Error(`Email send failed: ${emailError.message}`);
    await supabase.from('nda_agreements')
      .update({ status: 'sent', email_sent_at: new Date().toISOString() }).eq('id', ndaId);
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
