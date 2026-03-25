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

    const formatCurrency = (amount: number) =>
      new Intl.NumberFormat('en-SA', { style: 'currency', currency: order.currency || 'SAR' }).format(amount);

    const services = (order.services || []) as Array<{ name: string; price: number; quantity: number; description?: string }>;
    const isPaid = order.status === 'paid';

    const serviceRows = services.map((s) => `
      <tr>
        <td style="padding:14px 18px;font-size:13px;color:#1a1a1a;border-bottom:1px solid #f0f0f0;">${escapeHtml(s.name)}</td>
        <td style="padding:14px 18px;font-size:13px;color:#666;text-align:center;border-bottom:1px solid #f0f0f0;">${s.quantity || 1}</td>
        <td style="padding:14px 18px;font-size:13px;font-weight:600;color:#1a1a1a;text-align:right;border-bottom:1px solid #f0f0f0;">${formatCurrency(s.price * (s.quantity || 1))}</td>
      </tr>
    `).join('');

    const paymentSection = isPaid ? `
      <div style="background:#f0fdf4;border:2px solid #86efac;border-radius:12px;padding:24px;text-align:center;margin:28px 0;">
        <div style="font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#16a34a;margin-bottom:6px;">Payment Status</div>
        <div style="font-size:28px;font-weight:900;color:#16a34a;letter-spacing:-1px;">PAID IN FULL</div>
        <div style="font-size:12px;color:#15803d;margin-top:6px;">Thank you for your payment</div>
      </div>
    ` : (order.stripe_payment_link ? `
      <div style="text-align:center;margin:28px 0;">
        <a href="${order.stripe_payment_link}" target="_blank" style="display:inline-block;background:#000;color:#fff;padding:16px 48px;border-radius:8px;font-weight:700;font-size:14px;text-decoration:none;letter-spacing:0.3px;">Complete Payment →</a>
        <div style="font-size:11px;color:#999;margin-top:10px;">Secure payment via Stripe</div>
      </div>
    ` : '');

    const descriptionBlock = order.order_description ? `
      <div style="margin:20px 0;padding:16px 20px;background:#fafafa;border-radius:8px;border-left:3px solid #e0e0e0;">
        <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:#999;margin-bottom:8px;">Project Description</div>
        <div style="font-size:13px;color:#555;line-height:1.7;">${formatDescription(order.order_description)}</div>
      </div>
    ` : '';

    const emailHtml = `<!DOCTYPE html>
<html lang="en" dir="ltr">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f5f5f0;font-family:'Helvetica Neue',Arial,sans-serif;">
  <div style="max-width:600px;margin:0 auto;background:#fff;">

    <!-- Header -->
    <div style="background:#000;padding:40px 36px 36px;">
      <div style="font-size:38px;font-weight:900;color:#fff;letter-spacing:-2px;line-height:1;">AYN</div>
      <div style="width:40px;height:2px;background:#fff;opacity:0.3;margin:12px 0;"></div>
      <div style="font-size:11px;font-weight:600;letter-spacing:3px;text-transform:uppercase;color:rgba(255,255,255,0.5);">Service Agreement</div>
    </div>

    <!-- Content -->
    <div style="padding:36px;">
      <div style="font-size:20px;font-weight:800;color:#1a1a1a;margin-bottom:6px;">Hello ${escapeHtml(order.contact_person)},</div>
      <p style="font-size:14px;color:#666;line-height:1.7;margin:12px 0 24px;">
        Thank you for choosing AYN. We're pleased to present the service agreement for <strong style="color:#1a1a1a;">${escapeHtml(order.company_name)}</strong>.
      </p>

      <!-- Project Title -->
      <div style="border-bottom:2px solid #000;padding-bottom:8px;margin-bottom:16px;">
        <div style="font-size:16px;font-weight:800;color:#000;letter-spacing:-0.3px;">${escapeHtml(order.order_title)}</div>
      </div>

      ${descriptionBlock}

      <!-- Services Table -->
      <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:24px 0;">
        <thead>
          <tr style="background:#fafafa;">
            <th style="padding:12px 18px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#999;text-align:left;border-bottom:2px solid #eee;">Service</th>
            <th style="padding:12px 18px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#999;text-align:center;border-bottom:2px solid #eee;">Qty</th>
            <th style="padding:12px 18px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#999;text-align:right;border-bottom:2px solid #eee;">Amount</th>
          </tr>
        </thead>
        <tbody>${serviceRows}</tbody>
      </table>

      <!-- Total -->
      <div style="background:#000;border-radius:10px;padding:24px 28px;margin:24px 0;">
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <div style="font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:rgba(255,255,255,0.5);">Total Amount</div>
          <div style="font-size:28px;font-weight:900;color:#fff;letter-spacing:-1px;">${formatCurrency(order.total_amount)}</div>
        </div>
      </div>

      ${paymentSection}

      ${contractPdfUrl ? `
      <div style="text-align:center;margin:20px 0;">
        <a href="${contractPdfUrl}" target="_blank" style="display:inline-block;background:#f5f5f5;color:#333;padding:12px 28px;border-radius:6px;font-weight:600;font-size:12px;text-decoration:none;">📄 View Contract PDF</a>
      </div>` : ''}

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
      to: [order.company_email],
      subject: `AYN Service Agreement: ${order.order_title} — ${formatCurrency(order.total_amount)}`,
      html: emailHtml,
    });

    if (emailError) {
      console.error('[send-contract-email] Resend error:', emailError);
      throw new Error(`Email send failed: ${emailError.message}`);
    }

    await supabase
      .from('custom_orders')
      .update({
        status: 'sent',
        email_sent_at: new Date().toISOString(),
        contract_pdf_url: contractPdfUrl || null,
      })
      .eq('id', orderId);

    console.log('[send-contract-email] Email sent:', emailData?.id);

    return new Response(JSON.stringify({ success: true, emailId: emailData?.id }), {
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
