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

function formatDescription(text: string): string {
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

    const { orderId, contractPdfUrl } = await req.json();
    if (!orderId) throw new Error('orderId required');

    const { data: order, error: orderErr } = await supabase
      .from('custom_orders')
      .select('*')
      .eq('id', orderId)
      .single();
    if (orderErr || !order) throw new Error('Order not found');

    const resendKey = Deno.env.get('RESEND_API_KEY');
    if (!resendKey) throw new Error('RESEND_API_KEY not configured');
    const resend = new Resend(resendKey);

    const currency = order.currency || 'USD';
    const locale = currency === 'SAR' ? 'en-SA' : 'en-US';
    const formatCurrency = (amount: number) =>
      new Intl.NumberFormat(locale, { style: 'currency', currency }).format(amount);

    const services = (order.services || []) as Array<{ name: string; price: number; quantity: number; description?: string }>;

    // Tax included — total is what client pays, no separate tax line
    const totalAmount = order.total_amount;

    const clientSignUrl = `https://aynn.io/sign/${order.signing_token}`;
    const adminSignUrl  = `https://aynn.io/sign/${order.signing_token}?role=admin`;

    const serviceRows = services.map((s) => `
      <tr>
        <td style="padding:14px 20px;font-size:13px;color:#fff !important;border-bottom:1px solid rgba(255,255,255,0.08);">${escapeHtml(s.name)}</td>
        <td style="padding:14px 20px;font-size:13px;color:rgba(255,255,255,0.5);text-align:center;border-bottom:1px solid rgba(255,255,255,0.08);">${s.quantity || 1}</td>
        <td style="padding:14px 20px;font-size:13px;font-weight:700;color:#fff !important;text-align:right;border-bottom:1px solid rgba(255,255,255,0.08);">${formatCurrency(s.price * (s.quantity || 1))}</td>
      </tr>
    `).join('');

    const paymentSection = order.status === 'paid'
      ? `<div style="background:#f0fdf4;border:2px solid #86efac;border-radius:12px;padding:24px;text-align:center;margin:32px 0;">
           <div style="font-size:10px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#16a34a;margin-bottom:6px;">Payment Status</div>
           <div style="font-size:26px;font-weight:900;color:#16a34a;">PAID IN FULL</div>
         </div>`
      : (order.stripe_payment_link
          ? `<div style="text-align:center;margin:32px 0;">
               <a href="${order.stripe_payment_link}" target="_blank"
                 style="display:inline-block;background:#111;color:#fff !important;padding:15px 44px;border-radius:8px;font-weight:700;font-size:14px;text-decoration:none;letter-spacing:0.5px;">
                 Complete Payment →
               </a>
               <div style="font-size:11px;color:rgba(255,255,255,0.3);margin-top:10px;">Secure payment via Stripe</div>
             </div>`
          : '');

    const descriptionBlock = order.order_description
      ? `<div style="margin:20px 0;padding:16px 20px;background:#f9f9f9;border-radius:8px;border-left:3px solid #ddd;">
           <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:rgba(255,255,255,0.3);margin-bottom:8px;">Project Description</div>
           <div style="font-size:13px;color:rgba(255,255,255,0.6);line-height:1.8;">${formatDescription(order.order_description)}</div>
         </div>`
      : '';

    // ─── Shared HTML structure ────────────────────────────────────────────────
    const buildEmail = (recipientName: string, signUrl: string, isAdmin: boolean) => `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="color-scheme" content="light dark">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>AYN AI — Service Agreement</title></head>
<body bgcolor="#0f0f0f" style="margin:0;padding:0;background:#0f0f0f !important;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
<table bgcolor="#0f0f0f" width="100%" cellpadding="0" cellspacing="0" style="background:#0f0f0f !important;padding:0;">
<tr><td align="center" style="padding:40px 0;">
<table width="600" cellpadding="0" cellspacing="0" style="background:#0f0f0f !important;">

  <!-- ── HEADER ── -->
  <tr><td style="background:#0a0a0a;padding:44px 48px 40px;text-align:center;">
    <div style="font-size:42px;font-weight:900;color:#fff !important;letter-spacing:-2.5px;line-height:1;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">AYN AI</div>
    <div style="width:40px;height:3px;background:#6366f1;margin:14px auto;border-radius:2px;"></div>
    <div style="font-size:10px;font-weight:600;letter-spacing:4px;text-transform:uppercase;color:rgba(255,255,255,0.4);">Service Agreement</div>
  </td></tr>

  <!-- ── GREETING ── -->
  <tr><td style="padding:44px 48px 0;">
    <div style="font-size:22px;font-weight:800;color:#fff !important;margin-bottom:10px;">Hello ${escapeHtml(recipientName)},</div>
    <p style="font-size:14px;color:rgba(255,255,255,0.5);line-height:1.8;margin:0;">
      ${isAdmin
        ? `A service agreement has been sent to <strong style="color:#fff !important;">${escapeHtml(order.company_name)}</strong>. Please review and add your signature below.`
        : `Please review and sign your service agreement with <strong style="color:#fff !important;">AYN AI</strong>.`}
    </p>
  </td></tr>

  <!-- ── PROJECT CARD ── -->
  <tr><td style="padding:28px 48px 0;">
    <div style="background:#f9f9f9;border-radius:10px;padding:24px 28px;border:1px solid #ebebeb;">
      <div style="font-size:9px;font-weight:700;letter-spacing:3px;text-transform:uppercase;color:rgba(255,255,255,0.25);margin-bottom:10px;">Project</div>
      <div style="font-size:17px;font-weight:800;color:#fff !important;margin-bottom:${descriptionBlock ? '16px' : '0'};">${escapeHtml(order.order_title)}</div>
      ${descriptionBlock}
    </div>
  </td></tr>

  <!-- ── SERVICES TABLE ── -->
  <tr><td style="padding:28px 48px 0;">
    <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border:1px solid #ebebeb;border-radius:8px;overflow:hidden;">
      <thead>
        <tr style="background:#f4f4f4;">
          <th style="padding:12px 20px;font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:rgba(255,255,255,0.3);text-align:left;">Service</th>
          <th style="padding:12px 20px;font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:rgba(255,255,255,0.3);text-align:center;">Qty</th>
          <th style="padding:12px 20px;font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:rgba(255,255,255,0.3);text-align:right;">Amount</th>
        </tr>
      </thead>
      <tbody>${serviceRows}</tbody>
    </table>
  </td></tr>

  <!-- ── TOTAL ── -->
  <tr><td style="padding:16px 48px 0;">
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td style="text-align:right;padding:6px 0;">
          <span style="font-size:11px;color:rgba(255,255,255,0.3);margin-right:16px;">Tax Included</span>
        </td>
      </tr>
      <tr>
        <td style="background:#0a0a0a;border-radius:10px;padding:22px 28px;">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td style="font-size:10px;font-weight:700;letter-spacing:2.5px;text-transform:uppercase;color:rgba(255,255,255,0.4);">Total Due</td>
              <td style="font-size:30px;font-weight:900;color:#fff !important;letter-spacing:-1.5px;text-align:right;">${formatCurrency(totalAmount)}</td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </td></tr>

  <!-- ── PAYMENT BUTTON ── -->
  ${paymentSection ? `<tr><td style="padding:0 48px;">${paymentSection}</td></tr>` : ''}

  <!-- ── SIGN BUTTON ── -->
  <tr><td style="padding:28px 48px 0;">
    <div style="background:#1a1a1a !important;border:1px solid rgba(255,255,255,0.08);border-radius:12px;padding:28px;text-align:center;">
      <div style="font-size:11px;color:rgba(255,255,255,0.3);margin-bottom:16px;">Please review and sign this agreement</div>
      <a href="${signUrl}" target="_blank"
        style="display:inline-block;background:#fff;color:#0f0f0f;padding:16px 52px;border-radius:100px;font-weight:700;font-size:14px;text-decoration:none;letter-spacing:0.3px;">
        ${isAdmin ? 'Sign as AYN AI →' : 'Review &amp; Sign →'}
      </a>
    </div>
  </td></tr>

  <!-- ── FOOTER ── -->
  <tr><td style="padding:40px 48px 36px;">
    <div style="border-top:1px solid rgba(255,255,255,0.08);padding-top:24px;">
      <p style="font-size:12px;color:rgba(255,255,255,0.25);margin:0;line-height:1.7;">
        Questions? <a href="mailto:info@aynn.io" style="color:#888;text-decoration:none;">info@aynn.io</a>
      </p>
    </div>
  </td></tr>

  <tr><td style="background:#f9f9f9;padding:18px 48px;border-top:1px solid rgba(255,255,255,0.08);text-align:center;">
    <span style="font-size:10px;color:rgba(255,255,255,0.3);letter-spacing:0.5px;">© ${new Date().getFullYear()} AYN AI · <a href="https://aynn.io" style="color:rgba(255,255,255,0.3);text-decoration:none;">aynn.io</a></span>
  </td></tr>

</table>
</td></tr>
</table>
</body>
</html>`;

    const fromEmail = Deno.env.get('RESEND_FROM_EMAIL') || 'AYN AI <noreply@mail.aynn.io>';
    const subject = `AYN AI Service Agreement: ${order.order_title}`;

    // Send to client
    const { error: clientErr } = await resend.emails.send({
      from: fromEmail,
      to: [order.company_email],
      subject,
      html: buildEmail(order.contact_person, clientSignUrl, false),
    });
    if (clientErr) throw new Error(`Client email failed: ${clientErr.message}`);

    // Send to admin (Ghazi) with admin signing link
    const { error: adminErr } = await resend.emails.send({
      from: fromEmail,
      to: ['info@aynn.io'],
      subject: `[Sign Required] ${subject}`,
      html: buildEmail('Ghazi', adminSignUrl, true),
    });
    if (adminErr) console.error('[send-contract-email] Admin email failed:', adminErr);

    await supabase
      .from('custom_orders')
      .update({
        status: 'sent',
        email_sent_at: new Date().toISOString(),
        contract_pdf_url: contractPdfUrl || null,
      })
      .eq('id', orderId);

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('[send-contract-email]', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
