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

function nl2br(str: string): string {
  if (!str) return '';
  return str.replace(/\n/g, '<br>');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

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
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('role', 'admin')
      .single();
    if (!roleData) throw new Error('Admin access required');

    const { ndaId } = await req.json();
    if (!ndaId) throw new Error('ndaId required');

    const { data: nda, error: ndaErr } = await supabase
      .from('nda_agreements')
      .select('*')
      .eq('id', ndaId)
      .single();
    if (ndaErr || !nda) throw new Error('NDA not found');

    const resendKey = Deno.env.get('RESEND_API_KEY');
    if (!resendKey) throw new Error('RESEND_API_KEY not configured');
    const resend = new Resend(resendKey);

    const ndaRef = `NDA-${nda.id.substring(0, 8).toUpperCase()}`;
    const signingUrl = `https://ayn-insight-forge.lovable.app/nda/sign/${nda.signing_token}`;

    const emailHtml = `<!DOCTYPE html>
<html lang="en" dir="ltr">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f5f5f0;font-family:'Helvetica Neue',Arial,sans-serif;">
  <div style="max-width:600px;margin:0 auto;background:#fff;">

    <!-- Header -->
    <div style="background:#000;padding:40px 36px 36px;">
      <div style="font-size:38px;font-weight:900;color:#fff;letter-spacing:-2px;line-height:1;">AYN</div>
      <div style="width:40px;height:2px;background:#fff;opacity:0.3;margin:12px 0;"></div>
      <div style="font-size:11px;font-weight:600;letter-spacing:3px;text-transform:uppercase;color:rgba(255,255,255,0.5);">Non-Disclosure Agreement</div>
    </div>

    <!-- Content -->
    <div style="padding:36px;">
      <div style="font-size:20px;font-weight:800;color:#1a1a1a;margin-bottom:6px;">Hello ${escapeHtml(nda.contact_person)},</div>
      <p style="font-size:14px;color:#666;line-height:1.7;margin:12px 0 24px;">
        <strong style="color:#1a1a1a;">AYN AI Technologies</strong> has prepared a Non-Disclosure Agreement for your review and signature. Please review the details below and click the link to sign digitally.
      </p>

      <!-- Reference Badge -->
      <div style="background:#f8f7f4;border:1px solid #e8e6e0;border-radius:8px;padding:16px 20px;margin:20px 0;">
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:#999;">Reference</td>
            <td style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:#999;text-align:right;">Company</td>
          </tr>
          <tr>
            <td style="font-size:15px;font-weight:800;color:#1a1a1a;padding-top:4px;">${ndaRef}</td>
            <td style="font-size:15px;font-weight:600;color:#1a1a1a;padding-top:4px;text-align:right;">${escapeHtml(nda.company_name)}</td>
          </tr>
        </table>
      </div>

      ${nda.nda_purpose ? `
      <div style="margin:20px 0;padding:16px 20px;background:#fafafa;border-radius:8px;border-left:3px solid #1a1a1a;">
        <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:#999;margin-bottom:8px;">Purpose</div>
        <div style="font-size:13px;color:#555;line-height:1.7;">${nl2br(escapeHtml(nda.nda_purpose))}</div>
      </div>` : ''}

      ${nda.duration ? `
      <div style="margin:16px 0;">
        <span style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:#999;">Duration:</span>
        <span style="font-size:13px;color:#1a1a1a;font-weight:600;margin-left:8px;">${escapeHtml(nda.duration)}</span>
      </div>` : ''}

      <!-- CTA -->
      <div style="text-align:center;margin:32px 0;">
        <a href="${signingUrl}" target="_blank" style="display:inline-block;background:#000;color:#fff;padding:16px 48px;border-radius:8px;font-weight:700;font-size:14px;text-decoration:none;letter-spacing:0.3px;">Review &amp; Sign Agreement →</a>
        <div style="font-size:11px;color:#999;margin-top:10px;">Secure digital signing portal</div>
      </div>

      <!-- What to expect -->
      <div style="background:#f8f7f4;border-radius:8px;padding:20px;margin:24px 0;">
        <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:#999;margin-bottom:12px;">What happens next</div>
        <table cellpadding="0" cellspacing="0" width="100%">
          <tr>
            <td style="padding:6px 0;font-size:13px;color:#555;">
              <span style="display:inline-block;width:20px;height:20px;background:#1a1a1a;color:#fff;border-radius:50%;text-align:center;line-height:20px;font-size:10px;font-weight:700;margin-right:10px;">1</span>
              Review the full agreement
            </td>
          </tr>
          <tr>
            <td style="padding:6px 0;font-size:13px;color:#555;">
              <span style="display:inline-block;width:20px;height:20px;background:#1a1a1a;color:#fff;border-radius:50%;text-align:center;line-height:20px;font-size:10px;font-weight:700;margin-right:10px;">2</span>
              Sign digitally using the signature pad
            </td>
          </tr>
          <tr>
            <td style="padding:6px 0;font-size:13px;color:#555;">
              <span style="display:inline-block;width:20px;height:20px;background:#1a1a1a;color:#fff;border-radius:50%;text-align:center;line-height:20px;font-size:10px;font-weight:700;margin-right:10px;">3</span>
              Both parties receive a signed copy automatically
            </td>
          </tr>
        </table>
      </div>

      <div style="margin-top:32px;padding-top:20px;border-top:1px solid #eee;">
        <p style="font-size:12px;color:#aaa;line-height:1.6;margin:0;">
          Questions? Contact us at <a href="mailto:ghazi@aynn.io" style="color:#666;">ghazi@aynn.io</a>
        </p>
      </div>
    </div>

    <!-- Footer -->
    <div style="background:#fafafa;padding:20px 36px;border-top:1px solid #eee;text-align:center;">
      <div style="font-size:10px;color:#bbb;letter-spacing:0.5px;">© ${new Date().getFullYear()} AYN AI Technologies · All rights reserved</div>
    </div>
  </div>
</body>
</html>`;

    const fromEmail = Deno.env.get('RESEND_FROM_EMAIL') || 'AYN <noreply@mail.aynn.io>';

    const { data: emailData, error: emailError } = await resend.emails.send({
      from: fromEmail,
      to: [nda.company_email],
      subject: `AYN NDA: Non-Disclosure Agreement for ${nda.company_name} — ${ndaRef}`,
      html: emailHtml,
    });

    if (emailError) {
      console.error('[send-nda-email] Resend error:', emailError);
      throw new Error(`Email send failed: ${emailError.message}`);
    }

    await supabase
      .from('nda_agreements')
      .update({
        status: 'sent',
        email_sent_at: new Date().toISOString(),
      })
      .eq('id', ndaId);

    console.log('[send-nda-email] Email sent:', emailData?.id);

    return new Response(JSON.stringify({ success: true, emailId: emailData?.id }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('[send-nda-email]', msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
