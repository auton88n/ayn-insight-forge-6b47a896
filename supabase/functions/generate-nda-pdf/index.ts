import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { corsHeaders as getCorsHeadersFn } from '../_shared/cors.ts';


// corsHeaders: static fallback using primary origin (from _shared/cors.ts)
const corsHeaders = getCorsHeadersFn({ headers: new Headers() } as Request);

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

    const url = new URL(req.url);
    const token = url.searchParams.get('token');
    if (!token) throw new Error('Token required');

    const { data: nda, error: ndaErr } = await supabase
      .from('nda_agreements')
      .select('*')
      .eq('signing_token', token)
      .single();
    if (ndaErr || !nda) throw new Error('NDA not found');

    const ndaRef = `NDA-${nda.id.substring(0, 8).toUpperCase()}`;
    const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    const bothSigned = !!(nda.admin_signature_url && nda.client_signature_url);

    const sections: string[] = [];
    let articleNum = 1;

    // Parties section
    sections.push(`
      <div class="section">
        <div class="section-title">Article ${articleNum++} — Parties</div>
        <table width="100%" cellpadding="0" cellspacing="0" style="font-size:12px;">
          <tr>
            <td style="padding:8px 0;width:50%;vertical-align:top;">
              <div style="font-weight:700;margin-bottom:4px;">Disclosing Party</div>
              <div>AYN AI</div>
              <div style="color:#666;">info@aynn.io</div>
            </td>
            <td style="padding:8px 0;width:50%;vertical-align:top;">
              <div style="font-weight:700;margin-bottom:4px;">Receiving Party</div>
              <div>${escapeHtml(nda.company_name)}</div>
              <div style="color:#666;">${escapeHtml(nda.contact_person)}</div>
              <div style="color:#666;">${escapeHtml(nda.company_email)}</div>
              ${nda.company_phone ? `<div style="color:#666;">${escapeHtml(nda.company_phone)}</div>` : ''}
              ${nda.company_address ? `<div style="color:#666;">${escapeHtml(nda.company_address)}</div>` : ''}
            </td>
          </tr>
        </table>
      </div>`);

    if (nda.nda_purpose) {
      sections.push(`
        <div class="section">
          <div class="section-title">Article ${articleNum++} — Purpose</div>
          <div class="section-body">${nl2br(escapeHtml(nda.nda_purpose))}</div>
        </div>`);
    }

    if (nda.confidential_info) {
      sections.push(`
        <div class="section">
          <div class="section-title">Article ${articleNum++} — Confidential Information</div>
          <div class="section-body">${nl2br(escapeHtml(nda.confidential_info))}</div>
        </div>`);
    }

    if (nda.obligations) {
      sections.push(`
        <div class="section">
          <div class="section-title">Article ${articleNum++} — Obligations of Receiving Party</div>
          <div class="section-body">${nl2br(escapeHtml(nda.obligations))}</div>
        </div>`);
    }

    if (nda.exclusions) {
      sections.push(`
        <div class="section">
          <div class="section-title">Article ${articleNum++} — Exclusions from Confidentiality</div>
          <div class="section-body">${nl2br(escapeHtml(nda.exclusions))}</div>
        </div>`);
    }

    if (nda.duration || nda.governing_law) {
      let content = '';
      if (nda.duration) content += `<p style="margin:6px 0;"><strong>Duration of Agreement:</strong> ${escapeHtml(nda.duration)}</p>`;
      if (nda.governing_law) content += `<p style="margin:6px 0;"><strong>Governing Law:</strong> ${escapeHtml(nda.governing_law)}</p>`;
      sections.push(`
        <div class="section">
          <div class="section-title">Article ${articleNum++} — Term &amp; Governing Law</div>
          <div class="section-body">${content}</div>
        </div>`);
    }

    if (nda.additional_clauses) {
      sections.push(`
        <div class="section">
          <div class="section-title">Article ${articleNum++} — Additional Provisions</div>
          <div class="section-body">${nl2br(escapeHtml(nda.additional_clauses))}</div>
        </div>`);
    }

    // Signature blocks
    const adminSig = nda.admin_signature_url
      ? `<img src="${nda.admin_signature_url}" alt="Admin Signature" style="max-height:56px;max-width:200px;object-fit:contain;margin-bottom:4px;display:block;"/>
         <div style="font-size:10px;color:#666;">Signed: ${nda.admin_signed_at ? new Date(nda.admin_signed_at).toLocaleDateString('en-US', { year:'numeric', month:'long', day:'numeric' }) : ''}</div>`
      : '<div style="height:60px;border-bottom:1px solid #ccc;margin-bottom:4px;"></div><div style="font-size:10px;color:#aaa;font-style:italic;">Awaiting signature</div>';

    const clientSig = nda.client_signature_url
      ? `<img src="${nda.client_signature_url}" alt="Client Signature" style="max-height:56px;max-width:200px;object-fit:contain;margin-bottom:4px;display:block;"/>
         <div style="font-size:10px;color:#666;">Signed: ${nda.client_signed_at ? new Date(nda.client_signed_at).toLocaleDateString('en-US', { year:'numeric', month:'long', day:'numeric' }) : ''}</div>`
      : '<div style="height:60px;border-bottom:1px solid #ccc;margin-bottom:4px;"></div><div style="font-size:10px;color:#aaa;font-style:italic;">Awaiting signature</div>';

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>${ndaRef} — Non-Disclosure Agreement</title>
<style>
  @page { size: A4; margin: 18mm 22mm; }
  @media print {
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .no-print { display: none !important; }
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; padding: 0;
    font-family: 'Georgia', 'Times New Roman', serif;
    color: #1a1a1a; background: #f0ede8;
    line-height: 1.7; font-size: 12px;
  }
  .page {
    max-width: 750px; margin: 20px auto;
    background: #fff; padding: 56px 56px 48px;
    box-shadow: 0 4px 24px rgba(0,0,0,0.12);
  }
  .header {
    text-align: center; margin-bottom: 36px;
    border-bottom: 3px double #1a1a1a; padding-bottom: 28px;
  }
  .header .logo {
    font-size: 48px; font-weight: 900; letter-spacing: -3px;
    line-height: 1; font-family: 'Helvetica Neue', Arial, sans-serif; color: #000;
  }
  .header .subtitle {
    font-size: 10px; font-weight: 600; letter-spacing: 5px;
    text-transform: uppercase; color: #999; margin-top: 6px;
    font-family: 'Helvetica Neue', Arial, sans-serif;
  }
  .header .doc-title {
    font-size: 24px; font-weight: 700; letter-spacing: -0.5px;
    margin-top: 20px;
  }
  .header .doc-ref {
    font-size: 11px; color: #888; margin-top: 4px;
  }
  .section { margin: 28px 0; page-break-inside: avoid; }
  .section-title {
    font-size: 13px; font-weight: 800; text-transform: uppercase;
    letter-spacing: 1px; color: #1a1a1a; margin-bottom: 10px;
    border-bottom: 1px solid #e0e0e0; padding-bottom: 6px;
    font-family: 'Helvetica Neue', Arial, sans-serif;
  }
  .section-body {
    font-size: 12px; color: #333; line-height: 1.85;
  }
  .executed-badge {
    background: #f0fdf4; border: 2px solid #86efac;
    border-radius: 10px; padding: 18px; text-align: center;
    margin: 32px 0;
  }
  .executed-badge .label {
    font-size: 11px; font-weight: 700; letter-spacing: 2px;
    text-transform: uppercase; color: #16a34a;
  }
  .sig-block {
    width: 48%; display: inline-block; vertical-align: top;
    padding: 14px; border: 1px solid #eee; border-radius: 6px;
  }
  .sig-label {
    font-size: 10px; font-weight: 700; text-transform: uppercase;
    letter-spacing: 1.5px; color: #999; margin-bottom: 10px;
    font-family: 'Helvetica Neue', Arial, sans-serif;
  }
  .footer {
    text-align: center; margin-top: 40px; padding-top: 16px;
    border-top: 1px solid #eee;
    font-size: 10px; color: #bbb; letter-spacing: 0.5px;
  }
  .print-hint {
    text-align: center; margin: 16px auto; max-width: 750px;
    font-family: 'Helvetica Neue', Arial, sans-serif;
    font-size: 12px; color: #888; background: #fff;
    padding: 12px 20px; border-radius: 8px;
    box-shadow: 0 2px 8px rgba(0,0,0,0.08);
  }
  .print-hint kbd {
    background: #f0f0f0; padding: 2px 8px; border-radius: 4px;
    font-family: monospace; font-size: 11px; border: 1px solid #ddd;
  }
</style>
</head>
<body>

<div class="print-hint no-print">
  Press <kbd>Ctrl</kbd>+<kbd>P</kbd> or <kbd>⌘</kbd>+<kbd>P</kbd> to save as PDF
</div>

<div class="page">
  <div class="header">
    <div class="logo">AYN</div>
    <div class="subtitle">AI Technologies</div>
    <div class="doc-title">NON-DISCLOSURE AGREEMENT</div>
    <div class="doc-ref">${ndaRef} · ${today}</div>
  </div>

  ${sections.join('')}

  ${bothSigned ? `
  <div class="executed-badge">
    <div class="label">✓ FULLY EXECUTED — BOTH PARTIES HAVE SIGNED</div>
  </div>` : ''}

  <!-- Signatures -->
  <div class="section" style="page-break-inside:avoid;">
    <div class="section-title">Signatures</div>
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td style="width:48%;vertical-align:top;padding:14px;border:1px solid #eee;border-radius:6px;">
          <div class="sig-label">AYN AI</div>
          ${adminSig}
        </td>
        <td style="width:4%;"></td>
        <td style="width:48%;vertical-align:top;padding:14px;border:1px solid #eee;border-radius:6px;">
          <div class="sig-label">${escapeHtml(nda.company_name)}</div>
          ${clientSig}
        </td>
      </tr>
    </table>
  </div>

  <div class="footer">
    © ${new Date().getFullYear()} AYN AI · This document is confidential
  </div>
</div>

</body>
</html>`;

    return new Response(html, {
      headers: { ...corsHeaders, 'Content-Type': 'text/html; charset=utf-8' },
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return new Response(`<h1>Error</h1><p>${msg}</p>`, {
      status: 400,
      headers: { 'Content-Type': 'text/html' },
    });
  }
});
