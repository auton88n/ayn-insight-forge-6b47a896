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

    const ndaRef = `NDA-${nda.id.substring(0,8).toUpperCase()}`;
    const signingUrl = `https://aynn.io/nda/sign/${nda.signing_token}`;
    const year = new Date().getFullYear();

    const html = `<!DOCTYPE html>
<html lang="en" xmlns:v="urn:schemas-microsoft-com:vml">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>AYN AI — NDA</title>
<style>
  :root { color-scheme: light dark; }
  body, table, td, div, p, a { -webkit-text-size-adjust: 100%; }
  /* ── Force dark on ALL clients that support it ── */
  body { background-color: #0f0f0f !important; }
  .bg-dark { background-color: #0f0f0f !important; }
  .bg-card { background-color: #1c1c1e !important; }
  .bg-card2 { background-color: #1c1c1e !important; border-left: 3px solid #6366f1 !important; }
  .text-white { color: #ffffff !important; }
  .text-muted { color: rgba(255,255,255,0.45) !important; }
  .text-dim { color: rgba(255,255,255,0.25) !important; }
  .border-subtle { border-color: rgba(255,255,255,0.09) !important; }
  /* ── Apple Mail dark mode override ── */
  @media (prefers-color-scheme: dark) {
    body, .bg-dark { background-color: #0f0f0f !important; }
    .bg-card { background-color: #1c1c1e !important; }
    .text-white { color: #ffffff !important; }
    .text-muted { color: rgba(255,255,255,0.5) !important; }
    .text-dim { color: rgba(255,255,255,0.28) !important; }
  }
  /* ── Gmail / Outlook dark mode ── */
  [data-ogsc] body, [data-ogsc] .bg-dark { background-color: #0f0f0f !important; }
  [data-ogsc] .bg-card { background-color: #1c1c1e !important; }
  [data-ogsc] .text-white { color: #ffffff !important; }
</style>
</head>
<body bgcolor="#0f0f0f" style="margin:0;padding:0;background-color:#0f0f0f !important;-webkit-text-size-adjust:100%;">

<!-- Outer wrapper -->
<table class="bg-dark" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#0f0f0f"
  style="background-color:#0f0f0f !important;min-width:100%;">
<tr><td class="bg-dark" align="center" bgcolor="#0f0f0f"
  style="background-color:#0f0f0f !important;padding:48px 16px;">

<!-- Email card (no shadow, no white) -->
<table width="580" cellpadding="0" cellspacing="0" border="0"
  style="max-width:580px;width:100%;">

  <!-- ══ LOGO ══ -->
  <tr>
    <td class="bg-dark" align="center" bgcolor="#0f0f0f"
      style="background-color:#0f0f0f !important;padding:0 0 32px;">
      <div class="text-white" style="font-size:46px;font-weight:900;letter-spacing:-2px;line-height:1;color:#ffffff !important;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">AYN AI</div>
      <div style="width:44px;height:3px;background:#6366f1;border-radius:2px;margin:14px auto 0;"></div>
    </td>
  </tr>

  <!-- ══ DIVIDER ══ -->
  <tr>
    <td class="bg-dark" bgcolor="#0f0f0f" style="background-color:#0f0f0f !important;padding:0 0 36px;">
      <div style="height:1px;background:rgba(255,255,255,0.07);"></div>
    </td>
  </tr>

  <!-- ══ GREETING ══ -->
  <tr>
    <td class="bg-dark" bgcolor="#0f0f0f" style="background-color:#0f0f0f !important;padding:0 0 28px;">
      <div class="text-white" style="font-size:26px;font-weight:700;color:#ffffff !important;margin-bottom:12px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">Hello ${e(nda.contact_person)},</div>
      <p class="text-muted" style="font-size:15px;color:rgba(255,255,255,0.5) !important;line-height:1.8;margin:0;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
        <span class="text-white" style="color:#ffffff !important;font-weight:700;">AYN AI</span>
        has prepared a Non-Disclosure Agreement for your review and signature.
        Please review the details below and sign digitally using the secure link.
      </p>
    </td>
  </tr>

  <!-- ══ REFERENCE + COMPANY ══ -->
  <tr>
    <td class="bg-dark" bgcolor="#0f0f0f" style="background-color:#0f0f0f !important;padding:0 0 16px;">
      <table width="100%" cellpadding="0" cellspacing="0" border="0"
        class="bg-card" bgcolor="#1c1c1e"
        style="background-color:#1c1c1e !important;border-radius:14px;border:1px solid rgba(255,255,255,0.09);">
        <tr>
          <td width="50%" style="padding:22px 26px;border-right:1px solid rgba(255,255,255,0.09);vertical-align:top;">
            <div class="text-dim" style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:2.5px;color:rgba(255,255,255,0.3) !important;margin-bottom:8px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">Reference</div>
            <div class="text-white" style="font-size:18px;font-weight:800;color:#ffffff !important;letter-spacing:0.3px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">${ndaRef}</div>
          </td>
          <td width="50%" style="padding:22px 26px;vertical-align:top;">
            <div class="text-dim" style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:2.5px;color:rgba(255,255,255,0.3) !important;margin-bottom:8px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">Company</div>
            <div class="text-white" style="font-size:18px;font-weight:700;color:#ffffff !important;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">${e(nda.company_name)}</div>
          </td>
        </tr>
      </table>
    </td>
  </tr>

  ${nda.nda_purpose ? `<!-- ══ PURPOSE ══ -->
  <tr>
    <td class="bg-dark" bgcolor="#0f0f0f" style="background-color:#0f0f0f !important;padding:0 0 16px;">
      <table width="100%" cellpadding="0" cellspacing="0" border="0"
        class="bg-card" bgcolor="#1c1c1e"
        style="background-color:#1c1c1e !important;border-radius:14px;border:1px solid rgba(255,255,255,0.09);border-left:3px solid #6366f1;">
        <tr>
          <td style="padding:22px 26px;">
            <div class="text-dim" style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:2.5px;color:rgba(255,255,255,0.3) !important;margin-bottom:10px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">Purpose</div>
            <div class="text-muted" style="font-size:14px;color:rgba(255,255,255,0.6) !important;line-height:1.75;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">${e(nda.nda_purpose)}</div>
          </td>
        </tr>
      </table>
    </td>
  </tr>` : ''}

  ${nda.duration ? `<!-- ══ DURATION ══ -->
  <tr>
    <td class="bg-dark" bgcolor="#0f0f0f" style="background-color:#0f0f0f !important;padding:0 0 28px;">
      <table cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td class="text-dim" style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:2.5px;color:rgba(255,255,255,0.3) !important;padding-right:14px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">Duration</td>
          <td class="text-white" style="font-size:14px;font-weight:700;color:#ffffff !important;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">${e(nda.duration)}</td>
        </tr>
      </table>
    </td>
  </tr>` : ''}

  <!-- ══ CTA ══ -->
  <tr>
    <td class="bg-dark" bgcolor="#0f0f0f" style="background-color:#0f0f0f !important;padding:0 0 28px;">
      <table width="100%" cellpadding="0" cellspacing="0" border="0"
        class="bg-card" bgcolor="#1c1c1e"
        style="background-color:#1c1c1e !important;border-radius:14px;border:1px solid rgba(255,255,255,0.09);">
        <tr>
          <td align="center" style="padding:32px 24px;">
            <div class="text-dim" style="font-size:11px;color:rgba(255,255,255,0.3) !important;margin-bottom:20px;letter-spacing:0.5px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">Click below to review and sign</div>
            <a href="${signingUrl}" target="_blank"
              style="display:inline-block;background:#ffffff;color:#0f0f0f;padding:17px 56px;border-radius:100px;font-weight:800;font-size:15px;text-decoration:none;letter-spacing:0.2px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
              Review &amp; Sign Agreement →
            </a>
            <div class="text-dim" style="font-size:10px;color:rgba(255,255,255,0.22) !important;margin-top:14px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">Secure digital signing portal</div>
          </td>
        </tr>
      </table>
    </td>
  </tr>

  <!-- ══ STEPS ══ -->
  <tr>
    <td class="bg-dark" bgcolor="#0f0f0f" style="background-color:#0f0f0f !important;padding:0 0 40px;">
      <table width="100%" cellpadding="0" cellspacing="0" border="0"
        class="bg-card" bgcolor="#1c1c1e"
        style="background-color:#1c1c1e !important;border-radius:14px;border:1px solid rgba(255,255,255,0.09);">
        <tr>
          <td style="padding:24px 26px 10px;">
            <div class="text-dim" style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:2.5px;color:rgba(255,255,255,0.3) !important;margin-bottom:18px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">What happens next</div>
            ${[
              ['Review the full agreement','Read through all terms carefully'],
              ['Sign digitally','Use the signature pad on the signing page'],
              ['Both parties receive a copy','Signed PDF delivered automatically']
            ].map(([title, sub], i) => `
            <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:16px;">
              <tr>
                <td width="32" valign="top" style="padding-top:1px;">
                  <div style="width:24px;height:24px;background:#6366f1;border-radius:50%;text-align:center;line-height:24px;font-size:11px;font-weight:800;color:#ffffff;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">${i+1}</div>
                </td>
                <td valign="top" style="padding-left:12px;">
                  <div class="text-white" style="font-size:13px;font-weight:700;color:#ffffff !important;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">${title}</div>
                  <div class="text-muted" style="font-size:12px;color:rgba(255,255,255,0.4) !important;margin-top:2px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">${sub}</div>
                </td>
              </tr>
            </table>`).join('')}
          </td>
        </tr>
      </table>
    </td>
  </tr>

  <!-- ══ FOOTER ══ -->
  <tr>
    <td class="bg-dark" bgcolor="#0f0f0f" style="background-color:#0f0f0f !important;padding:0 0 48px;text-align:center;">
      <div style="height:1px;background:rgba(255,255,255,0.07);margin-bottom:24px;"></div>
      <div class="text-dim" style="font-size:11px;color:rgba(255,255,255,0.25) !important;line-height:1.8;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
        Questions? <a href="mailto:info@aynn.io" style="color:rgba(255,255,255,0.45) !important;text-decoration:none;">info&#64;aynn.io</a>
        &nbsp;&middot;&nbsp; © ${year} AYN AI &nbsp;&middot;&nbsp;
        <a href="https://aynn.io" style="color:rgba(255,255,255,0.45) !important;text-decoration:none;">aynn.io</a>
      </div>
    </td>
  </tr>

</table><!-- /card -->
</td></tr>
</table><!-- /outer -->
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
