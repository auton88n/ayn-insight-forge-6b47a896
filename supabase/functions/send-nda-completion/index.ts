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

function buildNdaPdfHtml(nda: Record<string, unknown>): string {
  const ndaRef = `NDA-${(nda.id as string).substring(0, 8).toUpperCase()}`;
  const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  const sections: string[] = [];

  if (nda.nda_purpose) {
    sections.push(`
      <div style="margin:24px 0;">
        <div style="font-size:13px;font-weight:800;text-transform:uppercase;letter-spacing:1px;color:#1a1a1a;margin-bottom:8px;border-bottom:1px solid #e0e0e0;padding-bottom:6px;">Article 1 — Purpose</div>
        <div style="font-size:12px;color:#333;line-height:1.8;">${nl2br(escapeHtml(nda.nda_purpose as string))}</div>
      </div>`);
  }
  if (nda.confidential_info) {
    sections.push(`
      <div style="margin:24px 0;">
        <div style="font-size:13px;font-weight:800;text-transform:uppercase;letter-spacing:1px;color:#1a1a1a;margin-bottom:8px;border-bottom:1px solid #e0e0e0;padding-bottom:6px;">Article 2 — Confidential Information</div>
        <div style="font-size:12px;color:#333;line-height:1.8;">${nl2br(escapeHtml(nda.confidential_info as string))}</div>
      </div>`);
  }
  if (nda.obligations) {
    sections.push(`
      <div style="margin:24px 0;">
        <div style="font-size:13px;font-weight:800;text-transform:uppercase;letter-spacing:1px;color:#1a1a1a;margin-bottom:8px;border-bottom:1px solid #e0e0e0;padding-bottom:6px;">Article 3 — Obligations</div>
        <div style="font-size:12px;color:#333;line-height:1.8;">${nl2br(escapeHtml(nda.obligations as string))}</div>
      </div>`);
  }
  if (nda.exclusions) {
    sections.push(`
      <div style="margin:24px 0;">
        <div style="font-size:13px;font-weight:800;text-transform:uppercase;letter-spacing:1px;color:#1a1a1a;margin-bottom:8px;border-bottom:1px solid #e0e0e0;padding-bottom:6px;">Article 4 — Exclusions</div>
        <div style="font-size:12px;color:#333;line-height:1.8;">${nl2br(escapeHtml(nda.exclusions as string))}</div>
      </div>`);
  }
  if (nda.duration || nda.governing_law) {
    let content = '';
    if (nda.duration) content += `<p style="margin:4px 0;"><strong>Duration:</strong> ${escapeHtml(nda.duration as string)}</p>`;
    if (nda.governing_law) content += `<p style="margin:4px 0;"><strong>Governing Law:</strong> ${escapeHtml(nda.governing_law as string)}</p>`;
    sections.push(`
      <div style="margin:24px 0;">
        <div style="font-size:13px;font-weight:800;text-transform:uppercase;letter-spacing:1px;color:#1a1a1a;margin-bottom:8px;border-bottom:1px solid #e0e0e0;padding-bottom:6px;">Article 5 — Term &amp; Governing Law</div>
        <div style="font-size:12px;color:#333;line-height:1.8;">${content}</div>
      </div>`);
  }
  if (nda.additional_clauses) {
    sections.push(`
      <div style="margin:24px 0;">
        <div style="font-size:13px;font-weight:800;text-transform:uppercase;letter-spacing:1px;color:#1a1a1a;margin-bottom:8px;border-bottom:1px solid #e0e0e0;padding-bottom:6px;">Additional Clauses</div>
        <div style="font-size:12px;color:#333;line-height:1.8;">${nl2br(escapeHtml(nda.additional_clauses as string))}</div>
      </div>`);
  }

  const adminSigBlock = nda.admin_signature_url
    ? `<img src="${nda.admin_signature_url}" alt="Admin Signature" style="max-height:50px;max-width:180px;object-fit:contain;"/><div style="font-size:10px;color:#666;margin-top:4px;">Signed ${nda.admin_signed_at ? new Date(nda.admin_signed_at as string).toLocaleDateString('en-US', { year:'numeric', month:'long', day:'numeric' }) : ''}</div>`
    : '<div style="font-size:10px;color:#aaa;font-style:italic;">Pending</div>';

  const clientSigBlock = nda.client_signature_url
    ? `<img src="${nda.client_signature_url}" alt="Client Signature" style="max-height:50px;max-width:180px;object-fit:contain;"/><div style="font-size:10px;color:#666;margin-top:4px;">Signed ${nda.client_signed_at ? new Date(nda.client_signed_at as string).toLocaleDateString('en-US', { year:'numeric', month:'long', day:'numeric' }) : ''}</div>`
    : '<div style="font-size:10px;color:#aaa;font-style:italic;">Pending</div>';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<style>
  @page { size: A4; margin: 20mm 24mm; }
  @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
  body { margin:0; padding:0; font-family: 'Georgia', 'Times New Roman', serif; color:#1a1a1a; background:#fff; }
</style>
</head>
<body>
<div style="max-width:700px;margin:0 auto;padding:40px;">

  <!-- Header -->
  <div style="text-align:center;margin-bottom:32px;border-bottom:3px double #1a1a1a;padding-bottom:24px;">
    <div style="font-size:42px;font-weight:900;letter-spacing:-2px;line-height:1;font-family:'Helvetica Neue',Arial,sans-serif;color:#000;">AYN</div>
    <div style="font-size:10px;font-weight:600;letter-spacing:4px;text-transform:uppercase;color:#999;margin-top:8px;font-family:'Helvetica Neue',Arial,sans-serif;">AI</div>
    <div style="margin-top:20px;font-size:22px;font-weight:700;letter-spacing:-0.5px;">NON-DISCLOSURE AGREEMENT</div>
    <div style="font-size:11px;color:#888;margin-top:4px;">${ndaRef} · ${today}</div>
  </div>

  <!-- Parties -->
  <div style="margin:24px 0;">
    <div style="font-size:13px;font-weight:800;text-transform:uppercase;letter-spacing:1px;color:#1a1a1a;margin-bottom:8px;border-bottom:1px solid #e0e0e0;padding-bottom:6px;">Parties</div>
    <table width="100%" cellpadding="0" cellspacing="0" style="font-size:12px;color:#333;">
      <tr>
        <td style="padding:6px 0;width:50%;vertical-align:top;">
          <div style="font-weight:700;">Disclosing Party</div>
          <div>AYN AI</div>
          <div style="color:#666;">info@aynn.io</div>
        </td>
        <td style="padding:6px 0;width:50%;vertical-align:top;">
          <div style="font-weight:700;">Receiving Party</div>
          <div>${escapeHtml(nda.company_name as string)}</div>
          <div style="color:#666;">${escapeHtml(nda.contact_person as string)}</div>
          <div style="color:#666;">${escapeHtml(nda.company_email as string)}</div>
        </td>
      </tr>
    </table>
  </div>

  ${sections.join('')}

  <!-- Executed Badge -->
  ${(nda.admin_signature_url && nda.client_signature_url) ? `
  <div style="background:#f0fdf4;border:2px solid #86efac;border-radius:10px;padding:16px;text-align:center;margin:32px 0;">
    <div style="font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#16a34a;">✓ FULLY EXECUTED</div>
  </div>` : ''}

  <!-- Signatures -->
  <div style="margin:32px 0;page-break-inside:avoid;">
    <div style="font-size:13px;font-weight:800;text-transform:uppercase;letter-spacing:1px;color:#1a1a1a;margin-bottom:16px;border-bottom:1px solid #e0e0e0;padding-bottom:6px;">Signatures</div>
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td style="width:48%;vertical-align:top;padding:12px;border:1px solid #eee;border-radius:6px;">
          <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#999;margin-bottom:8px;">AYN AI</div>
          ${adminSigBlock}
        </td>
        <td style="width:4%;"></td>
        <td style="width:48%;vertical-align:top;padding:12px;border:1px solid #eee;border-radius:6px;">
          <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#999;margin-bottom:8px;">${escapeHtml(nda.company_name as string)}</div>
          ${clientSigBlock}
        </td>
      </tr>
    </table>
  </div>

  <!-- Footer -->
  <div style="text-align:center;margin-top:40px;padding-top:16px;border-top:1px solid #eee;">
    <div style="font-size:10px;color:#bbb;letter-spacing:0.5px;">© ${new Date().getFullYear()} AYN AI · Confidential</div>
  </div>
</div>
</body>
</html>`;
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

    const { ndaId } = await req.json();
    if (!ndaId) throw new Error('ndaId required');

    const { data: nda, error: ndaErr } = await supabase
      .from('nda_agreements')
      .select('*')
      .eq('id', ndaId)
      .single();
    if (ndaErr || !nda) throw new Error('NDA not found');

    if (!nda.admin_signature_url || !nda.client_signature_url) {
      throw new Error('Both parties must sign before sending completion email');
    }

    const resendKey = Deno.env.get('RESEND_API_KEY');
    if (!resendKey) throw new Error('RESEND_API_KEY not configured');
    const resend = new Resend(resendKey);

    const ndaRef = `NDA-${nda.id.substring(0, 8).toUpperCase()}`;
    const pdfUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/generate-nda-pdf?token=${nda.signing_token}`;

    // Build the completion email
    const emailHtml = `<!DOCTYPE html>
<html lang="en" dir="ltr">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f5f5f0;font-family:'Helvetica Neue',Arial,sans-serif;">
  <div style="max-width:600px;margin:0 auto;background:#fff;">

    <!-- Header -->
    <div style="background:#000;padding:40px 36px 36px;">
      <div style="font-size:38px;font-weight:900;color:#fff;letter-spacing:-2px;line-height:1;">AYN</div>
      <div style="width:40px;height:2px;background:#fff;opacity:0.3;margin:12px 0;"></div>
      <div style="font-size:11px;font-weight:600;letter-spacing:3px;text-transform:uppercase;color:rgba(255,255,255,0.5);">NDA Fully Executed</div>
    </div>

    <!-- Content -->
    <div style="padding:36px;">
      <div style="font-size:20px;font-weight:800;color:#1a1a1a;margin-bottom:6px;">Agreement Complete!</div>
      <p style="font-size:14px;color:#666;line-height:1.7;margin:12px 0 24px;">
        The Non-Disclosure Agreement between <strong style="color:#1a1a1a;">AYN AI</strong> and <strong style="color:#1a1a1a;">${escapeHtml(nda.company_name)}</strong> has been signed by both parties and is now in full effect.
      </p>

      <!-- Executed Badge -->
      <div style="background:#f0fdf4;border:2px solid #86efac;border-radius:12px;padding:24px;text-align:center;margin:24px 0;">
        <div style="font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#16a34a;margin-bottom:6px;">Fully Executed</div>
        <div style="font-size:22px;font-weight:900;color:#16a34a;letter-spacing:-0.5px;">${ndaRef}</div>
      </div>

      <!-- Details -->
      <div style="background:#f8f7f4;border-radius:8px;padding:20px;margin:24px 0;">
        <table width="100%" cellpadding="0" cellspacing="0" style="font-size:12px;">
          <tr>
            <td style="padding:6px 0;color:#999;font-weight:600;">Company</td>
            <td style="padding:6px 0;color:#1a1a1a;text-align:right;">${escapeHtml(nda.company_name)}</td>
          </tr>
          <tr>
            <td style="padding:6px 0;color:#999;font-weight:600;">Contact</td>
            <td style="padding:6px 0;color:#1a1a1a;text-align:right;">${escapeHtml(nda.contact_person)}</td>
          </tr>
          ${nda.duration ? `<tr>
            <td style="padding:6px 0;color:#999;font-weight:600;">Duration</td>
            <td style="padding:6px 0;color:#1a1a1a;text-align:right;">${escapeHtml(nda.duration)}</td>
          </tr>` : ''}
          ${nda.governing_law ? `<tr>
            <td style="padding:6px 0;color:#999;font-weight:600;">Governing Law</td>
            <td style="padding:6px 0;color:#1a1a1a;text-align:right;">${escapeHtml(nda.governing_law)}</td>
          </tr>` : ''}
        </table>
      </div>

      <!-- Download CTA -->
      <div style="text-align:center;margin:28px 0;">
        <a href="${pdfUrl}" target="_blank" style="display:inline-block;background:#000;color:#fff;padding:14px 40px;border-radius:8px;font-weight:700;font-size:14px;text-decoration:none;">📄 Download Signed NDA</a>
        <div style="font-size:11px;color:#999;margin-top:10px;">Opens as a printable document — use Ctrl+P / ⌘+P to save as PDF</div>
      </div>

      <div style="margin-top:32px;padding-top:20px;border-top:1px solid #eee;">
        <p style="font-size:12px;color:#aaa;line-height:1.6;margin:0;">
          This is an automated notification. Both parties have been sent a copy. For questions, contact <a href="mailto:info@aynn.io" style="color:#666;">info@aynn.io</a>
        </p>
      </div>
    </div>

    <!-- Footer -->
    <div style="background:#fafafa;padding:20px 36px;border-top:1px solid #eee;text-align:center;">
      <div style="font-size:10px;color:#bbb;letter-spacing:0.5px;">© ${new Date().getFullYear()} AYN AI · All rights reserved</div>
    </div>
  </div>
</body>
</html>`;

    const fromEmail = Deno.env.get('RESEND_FROM_EMAIL') || 'AYN <noreply@mail.aynn.io>';

    // Send to client
    const { error: clientErr } = await resend.emails.send({
      from: fromEmail,
      to: [nda.company_email],
      subject: `✅ NDA Fully Executed: ${nda.company_name} — ${ndaRef}`,
      html: emailHtml,
    });
    if (clientErr) console.error('[send-nda-completion] Client email error:', clientErr);

    // Send to admin
    const adminEmail = Deno.env.get('ADMIN_EMAIL') || 'info@aynn.io';
    const { error: adminErr } = await resend.emails.send({
      from: fromEmail,
      to: [adminEmail],
      subject: `✅ NDA Fully Executed: ${nda.company_name} — ${ndaRef}`,
      html: emailHtml,
    });
    if (adminErr) console.error('[send-nda-completion] Admin email error:', adminErr);

    // Update NDA status
    await supabase
      .from('nda_agreements')
      .update({ status: 'completed' })
      .eq('id', ndaId);

    console.log('[send-nda-completion] Completion emails sent for', ndaRef);

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('[send-nda-completion]', msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
