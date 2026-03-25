import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

function escapeHtml(str: string): string {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function formatText(text: string): string {
  if (!text) return '';
  return text
    .split('\n')
    .filter(line => !line.match(/^\s*[|\-]+\s*$/))
    .map(line => line.replace(/#{1,6}\s/g, '').replace(/\*\*/g, '').replace(/[\x60]/g, '').replace(/\|/g, ' · ').trim())
    .filter(line => line.length > 0)
    .join('<br>');
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

    const { orderId } = await req.json();
    if (!orderId) throw new Error('orderId required');

    const { data: order, error: orderErr } = await supabase
      .from('custom_orders')
      .select('*')
      .eq('id', orderId)
      .single();
    if (orderErr || !order) throw new Error('Order not found');

    const services = (order.services || []) as Array<{ name: string; description: string; price: number; quantity: number }>;
    const html = generateContractHTML(order, services);

    return new Response(JSON.stringify({ success: true, html, order }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('[generate-contract-pdf]', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

function generateContractHTML(order: any, services: any[]) {
  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('en-SA', { style: 'currency', currency: order.currency || 'SAR' }).format(amount);

  const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  const contractNum = order.id.substring(0, 8).toUpperCase();
  const isPaid = order.status === 'paid';

  const serviceRows = services.map((s, i) => `
    <tr style="${i % 2 === 1 ? 'background:#fafafa;' : ''}">
      <td style="padding:12px 16px;font-size:12px;color:#666;border-bottom:1px solid #eee;text-align:center;">${i + 1}</td>
      <td style="padding:12px 16px;font-size:12px;font-weight:600;color:#1a1a1a;border-bottom:1px solid #eee;">${escapeHtml(s.name)}${s.description ? `<div style="font-size:11px;font-weight:400;color:#888;margin-top:4px;line-height:1.5;">${formatText(s.description)}</div>` : ''}</td>
      <td style="padding:12px 16px;font-size:12px;color:#555;text-align:center;border-bottom:1px solid #eee;">${s.quantity || 1}</td>
      <td style="padding:12px 16px;font-size:12px;color:#555;text-align:right;border-bottom:1px solid #eee;">${formatCurrency(s.price)}</td>
      <td style="padding:12px 16px;font-size:12px;font-weight:600;color:#1a1a1a;text-align:right;border-bottom:1px solid #eee;">${formatCurrency(s.price * (s.quantity || 1))}</td>
    </tr>
  `).join('');

  return `<!DOCTYPE html>
<html lang="en" dir="ltr">
<head>
  <meta charset="UTF-8">
  <title>AYN Service Agreement — ${escapeHtml(order.order_title)}</title>
  <style>
    @page { size: A4; margin: 20mm 22mm; }
    @media print {
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .no-print { display: none !important; }
      .page-break { page-break-before: always; }
    }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Georgia', 'Times New Roman', serif; color: #1a1a1a; line-height: 1.6; background: #fff; }
    .page { max-width: 210mm; margin: 0 auto; padding: 40px 50px; position: relative; min-height: 297mm; }
    .sans { font-family: 'Helvetica Neue', Arial, sans-serif; }

    /* Header */
    .header { display: flex; justify-content: space-between; align-items: flex-start; padding-bottom: 24px; border-bottom: 3px solid #000; margin-bottom: 32px; }
    .brand-name { font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 48px; font-weight: 900; letter-spacing: -3px; color: #000; line-height: 1; }
    .brand-sub { font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 10px; font-weight: 600; letter-spacing: 3px; text-transform: uppercase; color: #999; margin-top: 6px; }
    .contract-meta { text-align: right; font-family: 'Helvetica Neue', Arial, sans-serif; }
    .contract-num { font-size: 13px; font-weight: 700; color: #000; margin-bottom: 4px; }
    .contract-detail { font-size: 11px; color: #888; margin-bottom: 2px; }

    /* Articles */
    .article { margin-bottom: 28px; break-inside: avoid; }
    .article-header { font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 2px; color: #000; margin-bottom: 14px; padding-bottom: 8px; border-bottom: 1px solid #e0e0e0; }
    .article-num { color: #999; margin-right: 6px; }

    /* Parties */
    .parties-grid { display: flex; gap: 32px; }
    .party-card { flex: 1; background: #f8f9fa; border-radius: 8px; padding: 20px; }
    .party-label { font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 1.5px; color: #999; margin-bottom: 10px; }
    .party-name { font-size: 17px; font-weight: 700; color: #000; margin-bottom: 4px; font-family: 'Helvetica Neue', Arial, sans-serif; }
    .party-info { font-size: 11px; color: #666; margin-bottom: 2px; font-family: 'Helvetica Neue', Arial, sans-serif; }

    /* Table */
    .services-table { width: 100%; border-collapse: collapse; margin: 16px 0; }
    .services-table th { font-family: 'Helvetica Neue', Arial, sans-serif; background: #000; color: #fff; padding: 10px 16px; font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; }

    /* Totals */
    .totals-row { display: flex; justify-content: space-between; padding: 6px 0; font-size: 12px; font-family: 'Helvetica Neue', Arial, sans-serif; }
    .totals-grand { font-size: 20px; font-weight: 900; border-top: 2px solid #000; padding-top: 12px; margin-top: 8px; }

    /* Text content */
    .content-text { font-size: 12px; color: #444; line-height: 1.8; }
    .content-box { background: #f8f9fa; border-radius: 8px; padding: 18px 20px; font-size: 12px; color: #444; line-height: 1.8; }
    .content-box.green { background: #f0fdf4; border: 1px solid #bbf7d0; color: #166534; }
    .content-box.blue { background: #eff6ff; border: 1px solid #bfdbfe; color: #1e40af; }

    /* Signatures */
    .sig-grid { display: flex; gap: 40px; padding-top: 28px; border-top: 2px solid #000; margin-top: 36px; }
    .sig-block { flex: 1; }
    .sig-label { font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 1.5px; color: #999; margin-bottom: 10px; }
    .sig-line { border-bottom: 1px solid #1a1a1a; height: 60px; margin-bottom: 8px; position: relative; }
    .sig-line img { position: absolute; bottom: 4px; left: 8px; max-height: 50px; max-width: 200px; }
    .sig-name { font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 11px; color: #666; }
    .sig-date { font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 10px; color: #aaa; margin-top: 4px; }

    /* Payment & Status */
    .paid-stamp { background: #f0fdf4; border: 2px solid #86efac; border-radius: 12px; padding: 24px; text-align: center; margin: 28px 0; }
    .paid-stamp .label { font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 10px; font-weight: 700; letter-spacing: 2px; text-transform: uppercase; color: #16a34a; margin-bottom: 4px; }
    .paid-stamp .amount { font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 28px; font-weight: 900; color: #16a34a; }
    .payment-cta { background: #000; border-radius: 12px; padding: 28px; text-align: center; margin: 28px 0; }
    .payment-cta h3 { font-family: 'Helvetica Neue', Arial, sans-serif; color: #fff; font-size: 13px; font-weight: 600; margin-bottom: 8px; }
    .payment-cta .amount { font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 28px; font-weight: 900; color: #fff; margin-bottom: 14px; }
    .payment-cta a { display: inline-block; background: #fff; color: #000; padding: 12px 36px; border-radius: 6px; font-weight: 700; text-decoration: none; font-size: 13px; font-family: 'Helvetica Neue', Arial, sans-serif; }

    .footer { position: absolute; bottom: 20px; left: 50px; right: 50px; text-align: center; font-size: 9px; color: #bbb; border-top: 1px solid #eee; padding-top: 12px; font-family: 'Helvetica Neue', Arial, sans-serif; }
  </style>
</head>
<body>
  <div class="page">

    <!-- Header -->
    <div class="header">
      <div>
        <div class="brand-name">AYN</div>
        <div class="brand-sub">Service Agreement</div>
      </div>
      <div class="contract-meta">
        <div class="contract-num">Contract #${contractNum}</div>
        <div class="contract-detail">Date: ${today}</div>
        <div class="contract-detail">Status: ${order.status.toUpperCase()}</div>
      </div>
    </div>

    <!-- Article 1: Parties -->
    <div class="article">
      <div class="article-header"><span class="article-num">Article 1</span>Parties</div>
      <div class="parties-grid">
        <div class="party-card">
          <div class="party-label">Service Provider</div>
          <div class="party-name">AYN AI</div>
          <div class="party-info">AI-Powered Business Solutions</div>
          <div class="party-info">info@aynn.io</div>
        </div>
        <div class="party-card">
          <div class="party-label">Client</div>
          <div class="party-name">${escapeHtml(order.company_name)}</div>
          <div class="party-info">${escapeHtml(order.contact_person)}</div>
          <div class="party-info">${escapeHtml(order.company_email)}</div>
          ${order.company_phone ? `<div class="party-info">${escapeHtml(order.company_phone)}</div>` : ''}
          ${order.company_address ? `<div class="party-info">${escapeHtml(order.company_address)}</div>` : ''}
        </div>
      </div>
    </div>

    <!-- Article 2: Scope of Work -->
    <div class="article">
      <div class="article-header"><span class="article-num">Article 2</span>Scope of Work — ${escapeHtml(order.order_title)}</div>
      ${order.order_description ? `<div class="content-text" style="margin-bottom:16px;">${formatText(order.order_description)}</div>` : ''}
    </div>

    <!-- Article 3: Services & Pricing -->
    <div class="article">
      <div class="article-header"><span class="article-num">Article 3</span>Services &amp; Pricing</div>
      <table class="services-table">
        <thead>
          <tr>
            <th style="width:6%;text-align:center;">#</th>
            <th style="width:44%;text-align:left;">Service</th>
            <th style="width:10%;text-align:center;">Qty</th>
            <th style="width:20%;text-align:right;">Unit Price</th>
            <th style="width:20%;text-align:right;">Total</th>
          </tr>
        </thead>
        <tbody>${serviceRows}</tbody>
      </table>

      <div style="display:flex;justify-content:flex-end;margin-top:16px;">
        <div style="width:260px;">
          <div class="totals-row"><span>Subtotal</span><span>${formatCurrency(order.subtotal)}</span></div>
          ${Number(order.discount_percent) > 0 ? `<div class="totals-row" style="color:#dc2626;"><span>Discount (${order.discount_percent}%)</span><span>-${formatCurrency(order.subtotal * order.discount_percent / 100)}</span></div>` : ''}
          ${Number(order.tax_percent) > 0 ? `<div class="totals-note"><span style="font-size:10px;color:#aaa;">Tax Included</span></div>` : ''}
          <div class="totals-row totals-grand"><span>Total</span><span>${formatCurrency(order.total_amount)}</span></div>
        </div>
      </div>
    </div>

    ${order.delivery_timeline ? `
    <div class="article">
      <div class="article-header"><span class="article-num">Article 4</span>Delivery Timeline</div>
      <div class="content-text">${formatText(order.delivery_timeline)}</div>
    </div>` : ''}

    ${order.after_sale_services ? `
    <div class="article">
      <div class="article-header"><span class="article-num">Article ${order.delivery_timeline ? '5' : '4'}</span>After-Sale Services</div>
      <div class="content-box green">${formatText(order.after_sale_services)}</div>
    </div>` : ''}

    ${order.terms_and_conditions ? `
    <div class="article">
      <div class="article-header"><span class="article-num">Article ${[order.delivery_timeline, order.after_sale_services].filter(Boolean).length + 4}</span>Terms &amp; Conditions</div>
      <div class="content-text">${formatText(order.terms_and_conditions)}</div>
    </div>` : ''}

    ${order.privacy_notes ? `
    <div class="article">
      <div class="article-header"><span class="article-num">Article ${[order.delivery_timeline, order.after_sale_services, order.terms_and_conditions].filter(Boolean).length + 4}</span>Privacy &amp; Data Protection</div>
      <div class="content-box blue">${formatText(order.privacy_notes)}</div>
    </div>` : ''}

    <!-- Signatures -->
    <div class="sig-grid">
      <div class="sig-block">
        <div class="sig-label">Service Provider (AYN)</div>
        <div class="sig-line">
          ${order.admin_signature_url ? `<img src="${order.admin_signature_url}" alt="Admin Signature" />` : ''}
        </div>
        <div class="sig-name">Authorized Representative</div>
        ${order.admin_signed_at ? `<div class="sig-date">Signed: ${new Date(order.admin_signed_at).toLocaleDateString()}</div>` : '<div class="sig-date">Pending signature</div>'}
      </div>
      <div class="sig-block">
        <div class="sig-label">Client (${escapeHtml(order.company_name)})</div>
        <div class="sig-line">
          ${order.client_signature_url ? `<img src="${order.client_signature_url}" alt="Client Signature" />` : ''}
        </div>
        <div class="sig-name">${escapeHtml(order.contact_person)}</div>
        ${order.client_signed_at ? `<div class="sig-date">Signed: ${new Date(order.client_signed_at).toLocaleDateString()}</div>` : '<div class="sig-date">Pending signature</div>'}
      </div>
    </div>

    <!-- Payment / Paid Status -->
    ${isPaid ? `
    <div class="paid-stamp">
      <div class="label">Payment Confirmed</div>
      <div class="amount">${formatCurrency(order.total_amount)}</div>
    </div>` : (order.stripe_payment_link ? `
    <div class="payment-cta no-print">
      <h3>Complete Your Payment</h3>
      <div class="amount">${formatCurrency(order.total_amount)}</div>
      <a href="${order.stripe_payment_link}" target="_blank">Pay Now →</a>
    </div>` : '')}

    <div class="footer">
      © ${new Date().getFullYear()} AYN AI. All rights reserved. This document constitutes a binding service agreement between the parties named herein.
    </div>
  </div>
</body>
</html>`;
}
