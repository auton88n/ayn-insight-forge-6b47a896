import { Resend } from "https://esm.sh/resend@2.0.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { corsHeaders as getCorsHeadersFn } from '../_shared/cors.ts';


// corsHeaders: static fallback using primary origin (from _shared/cors.ts)
const corsHeaders = getCorsHeadersFn({ headers: new Headers() } as Request);

interface UsageAlertRequest {
  userId: string;
  userEmail: string;
  userName?: string;
  currentUsage: number;
  monthlyLimit: number;
  percentageUsed: number;
  alertType: '75_percent' | '90_percent' | '100_percent';
  resetDate: string;
}

const escapeHtml = (str: string): string => {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
};

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const {
      userId,
      userEmail,
      userName,
      currentUsage,
      monthlyLimit,
      percentageUsed,
      alertType,
      resetDate
    }: UsageAlertRequest = await req.json();

    if (!userEmail) {
      console.log('No user email provided, skipping usage alert');
      return new Response(
        JSON.stringify({ success: true, message: "No email to send to" }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Check if we already sent this alert type this billing period
    const { data: existingAlert } = await supabase
      .from('alert_history')
      .select('id')
      .eq('user_id', userId)
      .eq('alert_type', `usage_${alertType}`)
      .gte('created_at', resetDate.replace(/\+.*$/, '').split('T')[0])
      .maybeSingle();

    if (existingAlert) {
      console.log(`Alert ${alertType} already sent for user ${userId} this period`);
      return new Response(
        JSON.stringify({ success: true, message: "Alert already sent" }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    console.log(`Sending usage alert (${alertType}) to ${userEmail} for user ${userId}`);

    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    if (!resendApiKey) {
      console.error("RESEND_API_KEY not configured");
      throw new Error("RESEND_API_KEY not configured");
    }

    const resend = new Resend(resendApiKey);

    const displayName = userName ? escapeHtml(userName) : 'there';
    const remaining = monthlyLimit - currentUsage;
    const resetDateFormatted = new Date(resetDate).toLocaleDateString('en-US', { 
      month: 'long', 
      day: 'numeric', 
      year: 'numeric' 
    });

    // Determine alert styling based on type
    const alertConfig = {
      '75_percent': {
        color: '#f59e0b',
        bgColor: '#fef3c7',
        borderColor: '#f59e0b',
        textColor: '#92400e',
        icon: '⚠️',
        title: 'Usage at 75%',
        urgency: 'You still have some messages remaining.'
      },
      '90_percent': {
        color: '#ef4444',
        bgColor: '#fee2e2',
        borderColor: '#ef4444',
        textColor: '#991b1b',
        icon: '🚨',
        title: 'Usage at 90%',
        urgency: 'You are almost at your limit!'
      },
      '100_percent': {
        color: '#dc2626',
        bgColor: '#fecaca',
        borderColor: '#dc2626',
        textColor: '#7f1d1d',
        icon: '🛑',
        title: 'Limit Reached',
        urgency: 'You have reached your monthly message limit.'
      }
    };

    const config = alertConfig[alertType];

    const emailHtml = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<div style="max-width:600px;margin:0 auto;padding:40px 20px;">
<div style="text-align:center;margin-bottom:32px;">
<h1 style="font-size:56px;font-weight:900;letter-spacing:-2px;margin:0;">AYN</h1>
<div style="width:40px;height:4px;background:#000;margin:16px auto;"></div>
</div>

<div style="background:${config.bgColor};border-left:4px solid ${config.borderColor};padding:16px 20px;margin-bottom:32px;">
<p style="font-size:16px;color:${config.textColor};margin:0;font-weight:600;">${config.icon} ${config.title}</p>
</div>

<p style="font-size:18px;color:#333;margin-bottom:24px;">Hi ${displayName},</p>

<p style="font-size:16px;color:#666;line-height:1.6;margin-bottom:24px;">${config.urgency}</p>

<div style="background:#f9f9f9;border-radius:12px;padding:24px;margin-bottom:24px;">
<p style="font-size:14px;color:#999;margin:0 0 8px;text-transform:uppercase;font-weight:600;">CURRENT USAGE</p>
<div style="margin-bottom:16px;">
<div style="display:flex;justify-content:space-between;margin-bottom:8px;">
<span style="font-size:32px;font-weight:900;color:${config.color};">${percentageUsed}%</span>
<span style="font-size:16px;color:#666;align-self:flex-end;">${currentUsage} / ${monthlyLimit} messages</span>
</div>
<div style="background:#e5e5e5;border-radius:10px;height:12px;overflow:hidden;">
<div style="background:linear-gradient(90deg, ${config.color}, ${config.borderColor});height:100%;width:${Math.min(percentageUsed, 100)}%;border-radius:10px;"></div>
</div>
</div>
<p style="font-size:14px;color:#999;margin:0 0 8px;text-transform:uppercase;font-weight:600;">REMAINING</p>
<p style="font-size:24px;color:#333;margin:0;font-weight:700;">${remaining > 0 ? remaining : 0} messages</p>
</div>

<div style="background:#f0f9ff;border-radius:8px;padding:16px;margin-bottom:24px;">
<p style="font-size:14px;color:#0369a1;margin:0;">📅 Your usage will reset on <strong>${resetDateFormatted}</strong></p>
</div>

${alertType === '100_percent' ? `
<div style="background:#fef3c7;border-radius:8px;padding:16px;margin-bottom:24px;">
<p style="font-size:14px;color:#92400e;margin:0;">💡 <strong>Need more messages?</strong> Contact our team to discuss upgrading your plan.</p>
</div>
` : ''}

<div style="margin-top:40px;padding-top:24px;border-top:1px solid #eee;">
<p style="font-size:14px;color:#333;margin:0 0 4px;font-weight:600;">Best regards,</p>
<p style="font-size:14px;color:#666;margin:0;">The AYN Team</p>
</div>

<div style="margin-top:32px;padding-top:24px;border-top:1px solid #eee;text-align:center;">
<p style="font-size:12px;color:#999;margin:0;">AYN AI - Your Intelligent Companion</p>
<p style="font-size:11px;color:#bbb;margin:8px 0 0;">You received this email because usage notifications are enabled for your account.</p>
</div>
</div>
</body>
</html>`;

    const { data: emailData, error: emailError } = await resend.emails.send({
      from: "AYN <noreply@mail.aynn.io>",
      to: userEmail,
      subject: `${config.icon} AYN Usage Alert: ${config.title}`,
      html: emailHtml,
    });

    if (emailError) {
      console.error("Resend error:", emailError);
      throw new Error(emailError.message || "Failed to send email");
    }

    console.log(`Usage alert sent successfully to ${userEmail}, id: ${emailData?.id}`);

    // Record the alert in history
    await supabase.from('alert_history').insert({
      user_id: userId,
      alert_type: `usage_${alertType}`,
      subject: `Usage Alert: ${config.title}`,
      content: `User reached ${percentageUsed}% of their monthly limit (${currentUsage}/${monthlyLimit})`,
      status: 'sent',
      sent_at: new Date().toISOString(),
      metadata: { percentageUsed, currentUsage, monthlyLimit, resetDate, resendId: emailData?.id }
    });

    return new Response(
      JSON.stringify({ success: true, message: "Usage alert sent successfully" }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (error) {
    console.error("Error in send-usage-alert:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
};

Deno.serve(handler);
